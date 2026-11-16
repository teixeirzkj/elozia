"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, formObject, invalid, ok, optText, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { encryptSecret, parseKey, randomToken, sha256Hex } from "@/lib/crypto";
import { metaGraphVersion, MissingConfigError, optionalServerSecret } from "@/lib/env";
import { can } from "@/lib/permissions";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { manualConnector } from "@/lib/whatsapp/connector";
import { describeSendFailure } from "@/lib/whatsapp/errors";
import { syncTemplates } from "./sync";

const digits = (label: string) =>
  z.preprocess((v) => String(v ?? "").trim(), z.string().regex(/^\d{5,30}$/, `${label} deve conter apenas números.`));

const connectSchema = z.object({
  waba_id: digits("O WABA ID"),
  phone_number_id: digits("O Phone Number ID"),
  token: z.preprocess((v) => String(v ?? "").trim(), z.string().min(40, "Informe o token permanente.").max(2000).regex(/^\S+$/, "O token não pode conter espaços.")),
  app_secret: optText(200),
});

/** Confere se o servidor tem o necessário para guardar segredos e falar com a Meta. */
function serverReady(): string | null {
  try {
    parseKey(process.env.ENCRYPTION_KEY);
    metaGraphVersion();
    createAdminClient();
    return null;
  } catch (error) {
    if (error instanceof MissingConfigError) return error.message;
    return "O servidor não está configurado para guardar credenciais (ENCRYPTION_KEY). Consulte a documentação de deploy.";
  }
}

export async function connectChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = connectSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { membership, user } = await authorize("channels.manage");
    const orgId = membership.organization.id;
    if (!(await rateLimit("auth", `canal:${orgId}`))) return fail(RATE_LIMITED_MESSAGE);

    const notReady = serverReady();
    if (notReady) return fail(notReady);
    const { waba_id, phone_number_id, token, app_secret } = parsed.data;
    if (!app_secret && !optionalServerSecret("META_APP_SECRET")) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: { app_secret: ["Informe o App Secret do aplicativo da Meta que emitiu o token."] } };
    }

    const admin = createAdminClient();
    const { data: existing } = await admin.from("whatsapp_channels").select("id, organization_id").eq("phone_number_id", phone_number_id).maybeSingle();
    if (existing && existing.organization_id !== orgId) return fail("Este número já está conectado a outra conta da Elozia.");

    // Valida na Meta antes de gravar qualquer coisa.
    const result = await manualConnector.connect({ wabaId: waba_id, phoneNumberId: phone_number_id, token });
    if (!result.ok) return fail(result.error);
    const connected = result.channel;

    const channelValues = {
      organization_id: orgId,
      waba_id,
      phone_number_id,
      display_phone: connected.displayPhone,
      verified_name: connected.verifiedName,
      quality_rating: connected.qualityRating,
      status: "connected",
      connection_method: connected.method,
      uses_own_app: Boolean(app_secret),
      last_error: null,
      created_by: user.id,
    };
    let channelId: string;
    if (existing) {
      channelId = existing.id as string;
      const { error } = await admin.from("whatsapp_channels").update(channelValues).eq("id", channelId).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("whatsapp_channels").insert(channelValues).select("id").single();
      if (error) throw error;
      channelId = data.id as string;
    }

    const { data: currentCred } = await admin
      .from("whatsapp_credentials")
      .select("verify_token_ciphertext, verify_token_hash")
      .eq("channel_id", channelId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const verifyToken = currentCred ? null : randomToken(24);
    const { error: credError } = await admin.from("whatsapp_credentials").upsert({
      channel_id: channelId,
      organization_id: orgId,
      token_ciphertext: encryptSecret(token),
      app_secret_ciphertext: app_secret ? encryptSecret(app_secret) : null,
      verify_token_ciphertext: currentCred ? currentCred.verify_token_ciphertext : encryptSecret(verifyToken!),
      verify_token_hash: currentCred ? currentCred.verify_token_hash : sha256Hex(verifyToken!),
      updated_at: new Date().toISOString(),
    });
    if (credError) {
      if (!existing) await admin.from("whatsapp_channels").delete().eq("id", channelId).eq("organization_id", orgId);
      throw credError;
    }

    await admin.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: user.id,
      action: existing ? "channel.reconnected" : "channel.connected",
      entity: "whatsapp_channel",
      entity_id: channelId,
      metadata: { phone_number_id, uses_own_app: Boolean(app_secret) },
    });

    let templatesNote = "";
    try {
      const synced = await syncTemplates(admin, orgId, channelId);
      templatesNote = ` ${synced.approved} template(s) aprovado(s) sincronizado(s).`;
    } catch {
      templatesNote = " Não foi possível sincronizar os templates agora; use o botão Sincronizar.";
    }
    revalidatePath("/configuracoes/canais");
    revalidatePath("/atendimentos");
    return ok(`Número ${connected.displayPhone ?? phone_number_id} conectado.${templatesNote}${connected.warning ? ` Atenção: ${connected.warning}` : ""}`);
  } catch (error) {
    return failFrom(error, "Não foi possível conectar o canal. Tente novamente.");
  }
}

export async function disconnectChannelAction(channelId: string): Promise<ActionState> {
  try {
    const { membership, user } = await authorize("channels.manage");
    const orgId = membership.organization.id;
    const admin = createAdminClient();
    const { error, count } = await admin
      .from("whatsapp_channels")
      .update({ status: "disconnected" }, { count: "exact" })
      .eq("id", channelId)
      .eq("organization_id", orgId);
    if (error) throw error;
    if (!count) return fail("Canal não encontrado.");
    // O token é apagado; as conversas e o histórico permanecem.
    await admin
      .from("whatsapp_credentials")
      .update({ token_ciphertext: encryptSecret(""), app_secret_ciphertext: null, updated_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("organization_id", orgId);
    await admin.from("audit_logs").insert({ organization_id: orgId, actor_id: user.id, action: "channel.disconnected", entity: "whatsapp_channel", entity_id: channelId });
    revalidatePath("/configuracoes/canais");
    revalidatePath("/atendimentos");
    return ok("Canal desconectado. O token foi removido do sistema.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function syncTemplatesAction(channelId: string): Promise<ActionState> {
  try {
    const { membership } = await authorize();
    if (!can(membership.role, "channels.manage") && !can(membership.role, "automations.manage")) {
      return fail("Você não tem permissão para sincronizar templates.");
    }
    const orgId = membership.organization.id;
    if (!(await rateLimit("auth", `templates:${orgId}`))) return fail(RATE_LIMITED_MESSAGE);
    const synced = await syncTemplates(createAdminClient(), orgId, channelId);
    revalidatePath("/configuracoes/canais");
    revalidatePath("/atendimentos");
    return ok(`${synced.total} template(s) encontrado(s) na Meta, ${synced.approved} aprovado(s).`);
  } catch (error) {
    const failure = describeSendFailure(error);
    if (failure.code !== null || failure.channelIssue) return fail(`Não foi possível sincronizar. ${failure.message}`);
    return failFrom(error, "Não foi possível sincronizar os templates. Verifique se o canal está conectado.");
  }
}
