import { after, type NextRequest } from "next/server";
import { optionalServerSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhookEvents, storeInboundMedia } from "@/lib/whatsapp/service";
import { authenticateWebhook, channelSecretLookup, verifySubscription } from "@/lib/whatsapp/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 1024 * 1024;

/** Verificação do endereço pela Meta (hub.challenge). */
export async function GET(request: NextRequest) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return new Response("Serviço não configurado", { status: 503 });
  }
  const challenge = await verifySubscription(
    request.nextUrl.searchParams,
    optionalServerSecret("META_WEBHOOK_VERIFY_TOKEN"),
    async (hash) => {
      const { data } = await admin.from("whatsapp_credentials").select("channel_id").eq("verify_token_hash", hash).limit(1);
      return (data?.length ?? 0) > 0;
    },
  );
  if (challenge === null) return new Response("Verificação recusada", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Recebimento de mensagens e status. A assinatura é conferida sobre o corpo bruto. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return new Response("Corpo grande demais", { status: 413 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return new Response("Serviço não configurado", { status: 503 });
  }

  const auth = await authenticateWebhook(rawBody, request.headers.get("x-hub-signature-256"), {
    globalAppSecret: optionalServerSecret("META_APP_SECRET"),
    channelSecret: channelSecretLookup(admin),
  });
  if (!auth.ok) {
    console.warn("[webhook] requisição recusada:", auth.reason);
    return new Response("Não autorizado", { status: auth.status });
  }

  try {
    const pendingMedia = await processWebhookEvents(auth.events);
    // O download de mídias acontece depois da resposta, para confirmar rápido à Meta.
    if (pendingMedia.length > 0) {
      after(async () => {
        for (const item of pendingMedia) await storeInboundMedia(item.orgId, item.messageId);
      });
    }
  } catch {
    // Resposta de erro faz a Meta reenviar; o processamento é idempotente.
    return new Response("Falha temporária", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
