import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import { detectFileType, safeFileName } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeMetaError, describeSendFailure } from "./errors";
import { downloadMedia, getMediaInfo, markAsRead, sendMessage, uploadMedia, type OutboundContent, type Recipient } from "./graph";
import { buildTemplateComponents, describeTemplate } from "./templates";
import { dedupeKey, serviceWindow, type InboundMessageEvent, type StatusEvent, type WebhookEvent } from "./webhook";

/**
 * Regras de envio e recebimento do WhatsApp, usadas pela central de
 * atendimento, pelas automações e pelas campanhas. Roda com service_role:
 * TODA consulta filtra organization_id explicitamente.
 */

export type MessageOrigin = "manual" | "automation" | "campaign";

export type OutboundRequest =
  | { kind: "text"; body: string }
  | { kind: "template"; templateId: string; values: Record<string, string> }
  | { kind: "media"; storagePath: string; caption: string | null };

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; code: string | null; retryable: boolean; messageId: string | null };

type StoredPayload = OutboundRequest & { rendered?: string; components?: unknown[]; templateName?: string; language?: string; mediaType?: string };

const refuse = (error: string, code: string | null = null): SendResult => ({ ok: false, error, code, retryable: false, messageId: null });

// Limites de mídia da Cloud API (documentação oficial), restritos ao limite do bucket (16 MB).
export const MEDIA_RULES: Record<string, { type: "image" | "audio" | "document" | "video"; maxBytes: number }> = {
  "image/jpeg": { type: "image", maxBytes: 5 * 1024 * 1024 },
  "image/png": { type: "image", maxBytes: 5 * 1024 * 1024 },
  "audio/ogg": { type: "audio", maxBytes: 16 * 1024 * 1024 },
  "audio/mpeg": { type: "audio", maxBytes: 16 * 1024 * 1024 },
  "audio/mp4": { type: "audio", maxBytes: 16 * 1024 * 1024 },
  "audio/amr": { type: "audio", maxBytes: 16 * 1024 * 1024 },
  "video/mp4": { type: "video", maxBytes: 16 * 1024 * 1024 },
  "application/pdf": { type: "document", maxBytes: 16 * 1024 * 1024 },
};
const OFFICE_BY_EXT: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
};
export const INBOUND_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/** Identifica um arquivo a enviar pela assinatura dos bytes; documentos do Office também pela extensão. */
export function classifyOutboundFile(bytes: Uint8Array, filename: string): { ok: true; mime: string; type: "image" | "audio" | "document" | "video" } | { ok: false; error: string } {
  const detected = detectFileType(bytes);
  if (!detected) return { ok: false, error: "Tipo de arquivo não permitido." };
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  let mime = detected.mime;
  if (detected.mime === "application/zip" && (ext === "docx" || ext === "xlsx")) mime = OFFICE_BY_EXT[ext]!;
  else if (detected.mime === "application/x-ole-storage" && (ext === "doc" || ext === "xls")) mime = OFFICE_BY_EXT[ext]!;
  const rule = MEDIA_RULES[mime] ?? (Object.values(OFFICE_BY_EXT).includes(mime) ? { type: "document" as const, maxBytes: 16 * 1024 * 1024 } : null);
  if (!rule) return { ok: false, error: "Tipo de arquivo não permitido. Envie JPG, PNG, PDF, DOC, DOCX, XLS, XLSX, MP3, OGG, M4A ou MP4." };
  if (bytes.byteLength > rule.maxBytes) return { ok: false, error: `O arquivo excede o limite de ${Math.round(rule.maxBytes / 1048576)} MB para este tipo.` };
  return { ok: true, mime, type: rule.type };
}

type ChannelAccess = { id: string; phoneNumberId: string; wabaId: string; token: string };

export async function loadChannelAccess(admin: SupabaseClient, orgId: string, channelId: string): Promise<ChannelAccess | null> {
  const { data: channel } = await admin
    .from("whatsapp_channels")
    .select("id, phone_number_id, waba_id, status")
    .eq("organization_id", orgId)
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.status !== "connected") return null;
  const { data: cred } = await admin
    .from("whatsapp_credentials")
    .select("token_ciphertext")
    .eq("organization_id", orgId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!cred) return null;
  return { id: channel.id as string, phoneNumberId: channel.phone_number_id as string, wabaId: channel.waba_id as string, token: decryptSecret(cred.token_ciphertext as string) };
}

type ConversationRow = {
  id: string;
  channel_id: string;
  contact_id: string;
  wa_id: string | null;
  wa_user_id: string | null;
  status: string;
  assignee_id: string | null;
  last_inbound_at: string | null;
  cycle_started_at: string;
  first_response_at: string | null;
  contact: { name: string; marketing_consent: string; is_demo: boolean } | null;
};

async function loadConversation(admin: SupabaseClient, orgId: string, conversationId: string): Promise<ConversationRow | null> {
  const { data } = await admin
    .from("conversations")
    .select("id, channel_id, contact_id, wa_id, wa_user_id, status, assignee_id, last_inbound_at, cycle_started_at, first_response_at, contact:contacts (name, marketing_consent, is_demo)")
    .eq("organization_id", orgId)
    .eq("id", conversationId)
    .maybeSingle();
  return (data as unknown as ConversationRow | null) ?? null;
}

/**
 * Valida as regras da Meta e de consentimento, registra a mensagem como
 * "na fila" e tenta entregá-la. Nada é enviado fora da janela de 24 h sem
 * template aprovado, nem para quem pediu descadastro.
 */
export async function sendToConversation(input: {
  orgId: string;
  conversationId: string;
  senderId: string | null;
  origin: MessageOrigin;
  request: OutboundRequest;
  now?: number;
}): Promise<SendResult> {
  const admin = createAdminClient();
  const conv = await loadConversation(admin, input.orgId, input.conversationId);
  if (!conv || !conv.contact) return refuse("Conversa não encontrada.");
  if (!conv.wa_id && !conv.wa_user_id) return refuse("Esta conversa não tem um destinatário do WhatsApp.");
  if (conv.contact.is_demo) return refuse("Contatos de demonstração não recebem mensagens.");

  const automated = input.origin !== "manual";
  const consent = conv.contact.marketing_consent;
  // Mensagens automáticas (automações e campanhas) exigem consentimento registrado.
  if (automated && consent === "revoked") return refuse("O contato pediu para não receber mensagens automáticas.", "opt_out");
  if (automated && consent !== "granted") return refuse("O contato não tem consentimento registrado para mensagens automáticas.", "no_consent");

  const window = serviceWindow(conv.last_inbound_at, input.now);
  let payload: StoredPayload;
  let type: string;
  let body: string | null;
  let templateName: string | null = null;

  if (input.request.kind === "template") {
    const { data: template } = await admin
      .from("whatsapp_templates")
      .select("id, name, language, category, status, components, channel_id")
      .eq("organization_id", input.orgId)
      .eq("id", input.request.templateId)
      .maybeSingle();
    if (!template || template.channel_id !== conv.channel_id) return refuse("Template não encontrado para este canal.");
    if (template.status !== "APPROVED") return refuse("Este template não está aprovado na Meta. Sincronize os templates.", "template_not_approved");
    if (template.category === "MARKETING" && consent !== "granted") {
      return refuse(
        consent === "revoked"
          ? "O contato pediu descadastro: templates de marketing não podem ser enviados."
          : "Templates de marketing só podem ser enviados a contatos com consentimento registrado.",
        "no_consent",
      );
    }
    const built = buildTemplateComponents(describeTemplate(template.components), input.request.values);
    if (!built.ok) return refuse(built.error);
    payload = { ...input.request, components: built.components, rendered: built.rendered, templateName: template.name as string, language: template.language as string };
    type = "template";
    body = built.rendered;
    templateName = template.name as string;
  } else {
    if (!window.open) {
      return refuse("Fora da janela de 24 horas: a Meta só permite templates aprovados até o cliente escrever novamente.", "outside_window");
    }
    if (input.request.kind === "text") {
      const text = input.request.body.trim();
      if (text === "" || text.length > 4096) return refuse("A mensagem precisa ter entre 1 e 4.096 caracteres.");
      payload = { kind: "text", body: text };
      type = "text";
      body = text;
    } else {
      if (!input.request.storagePath.startsWith(`${input.orgId}/whatsapp/`)) return refuse("Arquivo inválido.");
      const { data: file, error } = await admin.storage.from("media").download(input.request.storagePath);
      if (error || !file) return refuse("Arquivo não encontrado. Envie novamente.");
      const check = classifyOutboundFile(new Uint8Array(await file.arrayBuffer()), input.request.storagePath);
      if (!check.ok) {
        await admin.storage.from("media").remove([input.request.storagePath]);
        return refuse(check.error);
      }
      payload = { ...input.request, mediaType: check.type };
      type = check.type;
      body = input.request.caption?.trim().slice(0, 1024) || null;
    }
  }

  const { data: row, error: insertError } = await admin
    .from("messages")
    .insert({
      organization_id: input.orgId,
      conversation_id: conv.id,
      direction: "out",
      type,
      body,
      media_path: input.request.kind === "media" ? input.request.storagePath : null,
      media_name: input.request.kind === "media" ? safeFileName(input.request.storagePath.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "")) : null,
      media_status: input.request.kind === "media" ? "stored" : null,
      status: "queued",
      template_name: templateName,
      payload,
      sender_id: input.senderId,
      origin: input.origin,
    })
    .select("id")
    .single();
  if (insertError || !row) return refuse("Não foi possível registrar a mensagem.");

  return deliverMessage(admin, input.orgId, row.id as string, conv);
}

/** Entrega (ou reentrega) uma mensagem já registrada. Usada também no reprocessamento. */
export async function deliverMessage(admin: SupabaseClient, orgId: string, messageId: string, loaded?: ConversationRow): Promise<SendResult> {
  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, direction, type, body, status, payload, media_path, media_name, origin, attempts, sender_id")
    .eq("organization_id", orgId)
    .eq("id", messageId)
    .maybeSingle();
  if (!message || message.direction !== "out" || !["queued", "failed"].includes(message.status as string)) {
    return refuse("Esta mensagem não pode ser reenviada.");
  }
  const conv = loaded ?? (await loadConversation(admin, orgId, message.conversation_id as string));
  if (!conv) return refuse("Conversa não encontrada.");
  const payload = message.payload as StoredPayload | null;
  if (!payload) return refuse("Mensagem sem conteúdo para reenviar.");

  // No reenvio as regras são conferidas de novo: a janela pode ter fechado.
  if (payload.kind !== "template" && !serviceWindow(conv.last_inbound_at).open) {
    await admin.from("messages").update({ status: "failed", error_code: "outside_window", error_message: "Fora da janela de 24 horas." }).eq("id", messageId).eq("organization_id", orgId);
    return { ok: false, error: "Fora da janela de 24 horas: envie um template aprovado.", code: "outside_window", retryable: false, messageId };
  }

  const channel = await loadChannelAccess(admin, orgId, conv.channel_id);
  if (!channel) {
    await admin.from("messages").update({ status: "failed", error_code: "channel", error_message: "Canal do WhatsApp não conectado." }).eq("id", messageId).eq("organization_id", orgId);
    return { ok: false, error: "O canal do WhatsApp não está conectado. Verifique em Configurações › Canais.", code: "channel", retryable: false, messageId };
  }

  const recipient: Recipient = { waId: conv.wa_id, userId: conv.wa_user_id };
  const attempts = ((message.attempts as number) ?? 0) + 1;
  try {
    let content: OutboundContent;
    if (payload.kind === "text") {
      content = { type: "text", body: payload.body };
    } else if (payload.kind === "template") {
      content = { type: "template", name: payload.templateName!, language: payload.language!, components: payload.components ?? [] };
    } else {
      const { data: file, error } = await admin.storage.from("media").download(payload.storagePath);
      if (error || !file) throw new Error("arquivo ausente");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = classifyOutboundFile(bytes, payload.storagePath);
      if (!check.ok) throw new Error(check.error);
      const filename = (message.media_name as string | null) ?? "arquivo";
      const mediaId = await uploadMedia(channel.token, channel.phoneNumberId, bytes, check.mime, filename);
      content = { type: check.type, mediaId, caption: payload.caption, filename };
      await admin.from("messages").update({ media_mime: check.mime }).eq("id", messageId).eq("organization_id", orgId);
    }

    const waMessageId = await sendMessage(channel.token, channel.phoneNumberId, recipient, content);
    const now = new Date().toISOString();
    await admin
      .from("messages")
      .update({ status: "sent", wa_message_id: waMessageId, error_code: null, error_message: null, attempts })
      .eq("id", messageId)
      .eq("organization_id", orgId);

    const patch: Record<string, unknown> = {
      last_message_at: now,
      last_message_preview: ((message.body as string | null) ?? (payload.kind === "media" ? "Arquivo enviado" : "Mensagem")).slice(0, 200),
    };
    // Primeira resposta humana do ciclo de atendimento (para o tempo médio de resposta).
    if (message.origin === "manual" && !conv.first_response_at && conv.last_inbound_at && conv.last_inbound_at >= conv.cycle_started_at) {
      patch.first_response_at = now;
      await admin.from("conversation_events").insert({
        organization_id: orgId,
        conversation_id: conv.id,
        type: "first_response",
        actor_id: message.sender_id,
        metadata: { seconds: Math.max(0, Math.round((Date.parse(now) - Date.parse(conv.cycle_started_at)) / 1000)) },
      });
    }
    await admin.from("conversations").update(patch).eq("id", conv.id).eq("organization_id", orgId);
    return { ok: true, messageId };
  } catch (error) {
    const failure = describeSendFailure(error);
    await admin
      .from("messages")
      .update({ status: "failed", error_code: failure.code, error_message: failure.message, attempts })
      .eq("id", messageId)
      .eq("organization_id", orgId);
    if (failure.channelIssue) {
      await admin.from("whatsapp_channels").update({ status: "error", last_error: failure.message }).eq("id", channel.id).eq("organization_id", orgId);
    }
    console.error("[whatsapp] falha de envio", { orgId, code: failure.code, retryable: failure.retryable });
    return { ok: false, error: failure.message, code: failure.code, retryable: failure.retryable, messageId };
  }
}

// --- Recebimento ------------------------------------------------------------

type IngestRow = { message_id: string; organization_id: string; conversation_id: string; duplicate: boolean };

/**
 * Processa os eventos de um webhook já autenticado. Idempotente: cada evento é
 * registrado por chave única e as funções do banco ignoram repetições.
 * Devolve as mídias pendentes de download.
 */
export async function processWebhookEvents(events: WebhookEvent[]): Promise<Array<{ orgId: string; messageId: string }>> {
  const admin = createAdminClient();
  const pendingMedia: Array<{ orgId: string; messageId: string }> = [];

  for (const event of events) {
    let orgId: string | null = null;
    let outcome = "processed";
    let failure: string | null = null;
    try {
      if (event.kind === "message") {
        const row = await ingestMessage(admin, event);
        orgId = row?.organization_id ?? null;
        outcome = !row ? "ignored" : row.duplicate ? "duplicate" : "processed";
        if (row && !row.duplicate && event.mediaId) pendingMedia.push({ orgId: row.organization_id, messageId: row.message_id });
      } else {
        orgId = await applyStatus(admin, event);
        outcome = orgId ? "processed" : "ignored";
      }
    } catch (error) {
      outcome = "error";
      failure = ((error as { code?: string }).code ?? "erro").slice(0, 300);
      console.error("[webhook] falha ao processar evento", { kind: event.kind, code: failure });
    }
    // Registro técnico (sem conteúdo). A chave única absorve reentregas da Meta.
    await admin
      .from("webhook_events")
      .upsert(
        { dedupe_key: dedupeKey(event), organization_id: orgId, kind: event.kind, phone_number_id: event.phoneNumberId, outcome, error: failure },
        { onConflict: "dedupe_key", ignoreDuplicates: outcome !== "error" },
      );
    if (outcome === "error") throw new Error("Falha ao processar evento do webhook.");
  }
  return pendingMedia;
}

async function ingestMessage(admin: SupabaseClient, event: InboundMessageEvent): Promise<IngestRow | null> {
  const { data, error } = await admin.rpc("ingest_whatsapp_message", {
    p_phone_number_id: event.phoneNumberId,
    p_wa_id: event.waId,
    p_phone_e164: event.phoneE164,
    p_wa_user_id: event.waUserId,
    p_profile_name: event.profileName,
    p_wa_message_id: event.waMessageId,
    p_type: event.type,
    p_body: event.body,
    p_wa_media_id: event.mediaId,
    p_media_mime: event.mediaMime,
    p_media_name: event.mediaName ? safeFileName(event.mediaName) : null,
    p_sent_at: event.sentAt,
  });
  if (error) throw error;
  return ((data as IngestRow[] | null) ?? [])[0] ?? null;
}

async function applyStatus(admin: SupabaseClient, event: StatusEvent): Promise<string | null> {
  const { data, error } = await admin.rpc("apply_whatsapp_status", {
    p_phone_number_id: event.phoneNumberId,
    p_wa_message_id: event.waMessageId,
    p_status: event.status,
    p_error_code: event.errorCode,
    p_error_message: event.errorCode ? describeMetaError(event.errorCode).message : null,
    p_at: event.at,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Baixa da Meta a mídia de uma mensagem recebida e guarda no bucket privado.
 * Pode ser chamada de novo (reprocessamento) enquanto o id da mídia for válido.
 */
export async function storeInboundMedia(orgId: string, messageId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, wa_media_id, media_status, media_name, conversation:conversations (channel_id)")
    .eq("organization_id", orgId)
    .eq("id", messageId)
    .maybeSingle();
  if (!message || !message.wa_media_id || message.media_status === "stored") return message?.media_status === "stored";
  const channelId = (message.conversation as unknown as { channel_id: string } | null)?.channel_id;
  const fail = async () => {
    await admin.from("messages").update({ media_status: "failed" }).eq("id", messageId).eq("organization_id", orgId);
    return false;
  };
  if (!channelId) return fail();
  try {
    const channel = await loadChannelAccess(admin, orgId, channelId);
    if (!channel) return fail();
    const info = await getMediaInfo(channel.token, message.wa_media_id as string);
    if ((info.file_size ?? 0) > INBOUND_MEDIA_MAX_BYTES) return fail();
    const bytes = await downloadMedia(channel.token, info.url, INBOUND_MEDIA_MAX_BYTES);
    // O tipo real vem dos bytes; o que a Meta declara serve só de apoio.
    const detected = detectFileType(bytes);
    if (!detected) return fail();
    const declared = (info.mime_type ?? "").split(";")[0]!.trim();
    const mime = detected.mime === "application/zip" || detected.mime === "application/x-ole-storage" ? declared || "application/octet-stream" : detected.mime;
    const ext = detected.ext === "zip" || detected.ext === "ole" ? ((message.media_name as string | null)?.split(".").pop() ?? "bin") : detected.ext;
    const path = `${orgId}/whatsapp/${message.conversation_id}/${messageId}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin"}`;
    const { error } = await admin.storage.from("media").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) return fail();
    await admin.from("messages").update({ media_path: path, media_mime: mime, media_status: "stored" }).eq("id", messageId).eq("organization_id", orgId);
    return true;
  } catch (error) {
    console.error("[whatsapp] falha ao guardar mídia recebida", { orgId, code: (error as { code?: unknown }).code ?? null });
    return fail();
  }
}

/** Envia a confirmação de leitura da última mensagem recebida (melhor esforço). */
export async function sendReadReceipt(orgId: string, conversationId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("wa_message_id, conversation:conversations (channel_id)")
    .eq("organization_id", orgId)
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .not("wa_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const channelId = (message?.conversation as unknown as { channel_id: string } | null)?.channel_id;
  if (!message?.wa_message_id || !channelId) return;
  try {
    const channel = await loadChannelAccess(admin, orgId, channelId);
    if (channel) await markAsRead(channel.token, channel.phoneNumberId, message.wa_message_id as string);
  } catch {
    // Confirmação de leitura é opcional; falhas não afetam o atendimento.
  }
}
