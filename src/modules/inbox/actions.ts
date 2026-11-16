"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, failFrom, formObject, ok, optUuid, type ActionState } from "@/lib/action";
import { authorize, type MemberSession } from "@/lib/auth/session";
import { isManager } from "@/lib/permissions";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverMessage, sendReadReceipt, sendToConversation, storeInboundMedia, type OutboundRequest } from "@/lib/whatsapp/service";

const idSchema = z.uuid();

function refresh() {
  revalidatePath("/atendimentos");
}

/**
 * Confere se o usuário pode atuar na conversa. Conversa sem responsável é
 * assumida automaticamente por quem responde.
 */
async function prepareToReply(session: MemberSession, conversationId: string): Promise<string | null> {
  if (!idSchema.safeParse(conversationId).success) return "Conversa inválida.";
  const { supabase, membership, user } = session;
  const { data: conv } = await supabase
    .from("conversations")
    .select("assignee_id, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return "Conversa não encontrada.";
  if (conv.assignee_id && conv.assignee_id !== user.id && !isManager(membership.role)) {
    return "Esta conversa está com outro atendente. Peça a transferência para responder.";
  }
  if (conv.status === "closed") {
    const { error } = await supabase.rpc("reopen_conversation", { p_conversation: conversationId });
    if (error) return "Não foi possível reabrir a conversa.";
  }
  if (!conv.assignee_id) {
    const { error } = await supabase.rpc("assume_conversation", { p_conversation: conversationId });
    if (error) return "Não foi possível assumir a conversa.";
  }
  return null;
}

async function send(conversationId: string, request: OutboundRequest): Promise<ActionState> {
  try {
    const session = await authorize("inbox.attend");
    if (!(await rateLimit("message", session.user.id))) return fail(RATE_LIMITED_MESSAGE);
    const blocked = await prepareToReply(session, conversationId);
    if (blocked) return fail(blocked);
    const result = await sendToConversation({
      orgId: session.membership.organization.id,
      conversationId,
      senderId: session.user.id,
      origin: "manual",
      request,
    });
    refresh();
    return result.ok ? ok() : fail(result.error);
  } catch (error) {
    return failFrom(error, "Não foi possível enviar a mensagem.");
  }
}

export async function sendTextAction(conversationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return fail("Escreva uma mensagem.");
  if (body.length > 4096) return fail("A mensagem pode ter no máximo 4.096 caracteres.");
  return send(conversationId, { kind: "text", body });
}

export async function sendTemplateAction(conversationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const data = formObject(formData);
  const templateId = idSchema.safeParse(data.template_id);
  if (!templateId.success) return fail("Selecione um template.");
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if ((key.startsWith("body_") || key.startsWith("header_")) && typeof value === "string") values[key] = value;
  }
  return send(conversationId, { kind: "template", templateId: templateId.data, values });
}

/** Envia um arquivo que o navegador já colocou na pasta da agência no bucket privado. */
export async function sendMediaAction(conversationId: string, storagePath: string, caption: string): Promise<ActionState> {
  if (typeof storagePath !== "string" || storagePath.length > 400 || storagePath.includes("..")) return fail("Arquivo inválido.");
  try {
    const session = await authorize("inbox.attend");
    if (!storagePath.startsWith(`${session.membership.organization.id}/whatsapp/outbox/`)) return fail("Arquivo inválido.");
    if (!(await rateLimit("upload", session.user.id))) return fail(RATE_LIMITED_MESSAGE);
  } catch (error) {
    return failFrom(error);
  }
  return send(conversationId, { kind: "media", storagePath, caption: String(caption ?? "").trim().slice(0, 1024) || null });
}

export async function addNoteAction(conversationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return fail("Escreva a nota.");
  if (body.length > 4000) return fail("A nota pode ter no máximo 4.000 caracteres.");
  if (!idSchema.safeParse(conversationId).success) return fail("Conversa inválida.");
  try {
    const { supabase, membership, user } = await authorize("inbox.attend");
    const orgId = membership.organization.id;
    // A leitura com o cliente do usuário garante, pela RLS, que a conversa é da agência dele.
    const { data: conv } = await supabase.from("conversations").select("id").eq("organization_id", orgId).eq("id", conversationId).maybeSingle();
    if (!conv) return fail("Conversa não encontrada.");
    const { error } = await createAdminClient().from("messages").insert({
      organization_id: orgId,
      conversation_id: conversationId,
      direction: "out",
      type: "note",
      body,
      status: "note",
      sender_id: user.id,
    });
    if (error) throw error;
    refresh();
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

/** Reprocessa o envio de uma mensagem que falhou. */
export async function retryMessageAction(messageId: string): Promise<ActionState> {
  if (!idSchema.safeParse(messageId).success) return fail("Mensagem inválida.");
  try {
    const session = await authorize("inbox.attend");
    const orgId = session.membership.organization.id;
    if (!(await rateLimit("message", session.user.id))) return fail(RATE_LIMITED_MESSAGE);
    const { data: message } = await session.supabase
      .from("messages")
      .select("conversation_id, status")
      .eq("organization_id", orgId)
      .eq("id", messageId)
      .maybeSingle();
    if (!message || message.status !== "failed") return fail("Esta mensagem não pode ser reenviada.");
    const blocked = await prepareToReply(session, message.conversation_id as string);
    if (blocked) return fail(blocked);
    const result = await deliverMessage(createAdminClient(), orgId, messageId);
    refresh();
    return result.ok ? ok("Mensagem reenviada.") : fail(result.error);
  } catch (error) {
    return failFrom(error);
  }
}

/** Tenta baixar de novo a mídia de uma mensagem recebida. */
export async function retryMediaAction(messageId: string): Promise<ActionState> {
  if (!idSchema.safeParse(messageId).success) return fail("Mensagem inválida.");
  try {
    const { supabase, membership } = await authorize("inbox.attend");
    const orgId = membership.organization.id;
    const { data: message } = await supabase.from("messages").select("id").eq("organization_id", orgId).eq("id", messageId).maybeSingle();
    if (!message) return fail("Mensagem não encontrada.");
    const stored = await storeInboundMedia(orgId, messageId);
    refresh();
    return stored ? ok("Mídia baixada.") : fail("A mídia não está mais disponível na Meta (os arquivos expiram em 7 dias) ou excede 16 MB.");
  } catch (error) {
    return failFrom(error);
  }
}

async function manage(fn: string, args: Record<string, unknown>, success: string): Promise<ActionState> {
  try {
    const { supabase } = await authorize("inbox.attend");
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
    refresh();
    return ok(success);
  } catch (error) {
    const pg = error as { code?: string; message?: string };
    if (pg.code === "42501" && pg.message) return fail(pg.message);
    return failFrom(error);
  }
}

export async function assumeConversationAction(conversationId: string): Promise<ActionState> {
  return manage("assume_conversation", { p_conversation: conversationId }, "Você assumiu este atendimento.");
}

export async function closeConversationAction(conversationId: string): Promise<ActionState> {
  return manage("close_conversation", { p_conversation: conversationId }, "Atendimento concluído.");
}

export async function reopenConversationAction(conversationId: string): Promise<ActionState> {
  return manage("reopen_conversation", { p_conversation: conversationId }, "Atendimento reaberto.");
}

export async function transferConversationAction(conversationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ assignee_id: optUuid, team_id: optUuid }).safeParse(formObject(formData));
  if (!parsed.success || (!parsed.data.assignee_id && !parsed.data.team_id)) return fail("Escolha o atendente ou a equipe de destino.");
  return manage(
    "transfer_conversation",
    { p_conversation: conversationId, p_assignee: parsed.data.assignee_id, p_team: parsed.data.team_id },
    "Atendimento transferido.",
  );
}

/** Zera as não lidas e envia a confirmação de leitura à Meta. */
export async function markReadAction(conversationId: string): Promise<void> {
  if (!idSchema.safeParse(conversationId).success) return;
  try {
    const { supabase, membership } = await authorize("inbox.attend");
    const { data: conv } = await supabase
      .from("conversations")
      .select("unread_count")
      .eq("organization_id", membership.organization.id)
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.unread_count === 0) return;
    await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
    await sendReadReceipt(membership.organization.id, conversationId);
    refresh();
  } catch {
    // Não bloqueia a leitura da conversa.
  }
}

/** Abre (ou cria) a conversa de um contato para enviar um template aprovado. */
export async function startConversationAction(contactId: string): Promise<ActionState> {
  if (!idSchema.safeParse(contactId).success) return fail("Contato inválido.");
  let conversationId: string;
  try {
    const { supabase, membership, user } = await authorize("inbox.attend");
    const orgId = membership.organization.id;
    const { data: contact } = await supabase.from("contacts").select("id, phone_e164, wa_user_id, is_demo").eq("organization_id", orgId).eq("id", contactId).maybeSingle();
    if (!contact) return fail("Contato não encontrado.");
    if (contact.is_demo) return fail("Contatos de demonstração não recebem mensagens.");
    if (!contact.phone_e164 && !contact.wa_user_id) return fail("Cadastre o telefone do contato para conversar pelo WhatsApp.");
    const { data: channel } = await supabase.from("whatsapp_channels").select("id").eq("organization_id", orgId).eq("status", "connected").limit(1).maybeSingle();
    if (!channel) return fail("Nenhum número de WhatsApp conectado. Um administrador pode conectar em Configurações › Canais.");

    const admin = createAdminClient();
    const { data: existing } = await admin.from("conversations").select("id").eq("organization_id", orgId).eq("channel_id", channel.id).eq("contact_id", contactId).maybeSingle();
    if (existing) {
      conversationId = existing.id as string;
    } else {
      const { data: created, error } = await admin
        .from("conversations")
        .insert({
          organization_id: orgId,
          contact_id: contactId,
          channel_id: channel.id,
          wa_id: contact.phone_e164 ? (contact.phone_e164 as string).replace(/^\+/, "") : null,
          wa_user_id: contact.wa_user_id,
          status: "open",
          assignee_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = created.id as string;
      await admin.from("conversation_events").insert({ organization_id: orgId, conversation_id: conversationId, type: "created", actor_id: user.id });
    }
    refresh();
  } catch (error) {
    return failFrom(error);
  }
  redirect(`/atendimentos?aba=todas&conversa=${conversationId}`);
}
