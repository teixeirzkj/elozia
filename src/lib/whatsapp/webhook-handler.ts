import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, safeEqual, sha256Hex, verifyMetaSignature } from "@/lib/crypto";
import { parseWebhook, type WebhookEvent } from "./webhook";

/**
 * Autenticação dos webhooks da Meta, separada da rota para ser testável.
 *
 * Cada canal pode usar o aplicativo Meta da Elozia (segredo global
 * META_APP_SECRET) ou o aplicativo da própria agência (App Secret guardado
 * cifrado no canal). A assinatura é sempre conferida sobre o corpo BRUTO, e
 * cada evento só é aceito se a assinatura for válida para o segredo do canal
 * ao qual o evento se destina.
 */

export type WebhookSecrets = {
  /** App Secret global (aplicativo da Elozia); pode não existir. */
  globalAppSecret: string | null;
  /** App Secret próprio de um canal, por phone_number_id (null = usa o global). */
  channelSecret: (phoneNumberId: string) => Promise<string | null | undefined>;
};

export type WebhookAuthResult =
  | { ok: true; events: WebhookEvent[] }
  | { ok: false; status: 400 | 401; reason: string };

export async function authenticateWebhook(rawBody: string, signature: string | null, secrets: WebhookSecrets): Promise<WebhookAuthResult> {
  if (!signature) return { ok: false, status: 401, reason: "assinatura ausente" };

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, reason: "corpo inválido" };
  }
  // O conteúdo só é usado, neste ponto, para descobrir QUAL segredo conferir.
  const { events, phoneNumberIds } = parseWebhook(json);

  const globalValid = secrets.globalAppSecret ? verifyMetaSignature(rawBody, signature, secrets.globalAppSecret) : false;
  const trusted = new Set<string>();
  for (const phoneNumberId of phoneNumberIds) {
    const own = await secrets.channelSecret(phoneNumberId);
    if (own === undefined) continue; // número desconhecido: nunca confiável
    const valid = own ? verifyMetaSignature(rawBody, signature, own) : globalValid;
    if (valid) trusted.add(phoneNumberId);
  }

  // Sem nenhum canal reconhecido, ainda exigimos assinatura válida do aplicativo global.
  if (trusted.size === 0 && !(globalValid && phoneNumberIds.length === 0)) {
    return { ok: false, status: 401, reason: "assinatura inválida" };
  }
  return { ok: true, events: events.filter((e) => trusted.has(e.phoneNumberId)) };
}

/** Busca o App Secret próprio de um canal: string, null (usa o global) ou undefined (canal inexistente). */
export function channelSecretLookup(admin: SupabaseClient): WebhookSecrets["channelSecret"] {
  const cache = new Map<string, string | null | undefined>();
  return async (phoneNumberId) => {
    if (cache.has(phoneNumberId)) return cache.get(phoneNumberId);
    const { data: channel } = await admin
      .from("whatsapp_channels")
      .select("id, organization_id, status")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    let secret: string | null | undefined;
    if (channel && channel.status !== "disconnected") {
      const { data: cred } = await admin
        .from("whatsapp_credentials")
        .select("app_secret_ciphertext")
        .eq("channel_id", channel.id)
        .eq("organization_id", channel.organization_id)
        .maybeSingle();
      secret = cred?.app_secret_ciphertext ? decryptSecret(cred.app_secret_ciphertext as string) : null;
    }
    cache.set(phoneNumberId, secret);
    return secret;
  };
}

/**
 * Verificação do endereço (GET): aceita o token global ou o token de
 * verificação gerado para algum canal.
 */
export async function verifySubscription(
  params: URLSearchParams,
  globalToken: string | null,
  channelTokenExists: (hash: string) => Promise<boolean>,
): Promise<string | null> {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge || challenge.length > 200) return null;
  if (globalToken && safeEqual(token, globalToken)) return challenge;
  return (await channelTokenExists(sha256Hex(token))) ? challenge : null;
}
