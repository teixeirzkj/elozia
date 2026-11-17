import { ArrowRight, FileText, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";
import { optionalServerSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { disconnectChannelAction } from "@/modules/channels/actions";
import { ConnectForm, SyncTemplatesButton } from "@/modules/channels/components/channel-forms";
import { listChannels, listTemplates } from "@/modules/channels/queries";

export const metadata: Metadata = { title: "Canais" };

/** Lê o token de verificação do webhook de um canal (somente para administradores, no servidor). */
async function readVerifyToken(orgId: string, channelId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("whatsapp_credentials")
      .select("verify_token_ciphertext")
      .eq("organization_id", orgId)
      .eq("channel_id", channelId)
      .maybeSingle();
    return data ? decryptSecret(data.verify_token_ciphertext as string) : null;
  } catch {
    return null;
  }
}

const statusBadge = {
  connected: <Badge tone="brand">Conectado</Badge>,
  error: <Badge tone="danger">Com erro</Badge>,
  disconnected: <Badge tone="neutral">Desconectado</Badge>,
} as const;

export default async function CanaisPage() {
  const { supabase, membership } = await requireCapabilityPage("channels.manage");
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;
  const [channels, templates] = await Promise.all([listChannels(supabase, orgId), listTemplates(supabase, orgId)]);
  const active = channels.filter((c) => c.status !== "disconnected");
  const approvedCount = templates.filter((t) => t.status === "APPROVED").length;
  const canTemplates = can(membership.role, "automations.manage");
  const hasGlobalApp = Boolean(optionalServerSecret("META_APP_SECRET"));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const webhookUrl = `${base}/api/webhooks/whatsapp`;

  const verifyTokens = new Map<string, string | null>();
  for (const channel of active) {
    if (channel.uses_own_app) verifyTokens.set(channel.id, await readVerifyToken(orgId, channel.id));
  }

  return (
    <div className="max-w-4xl space-y-6">
      {active.length === 0 ? (
        <Card>
          <CardHeader
            title="Conectar WhatsApp"
            description="Conexão pela API oficial da Meta (WhatsApp Cloud API). Não usamos QR Code nem WhatsApp Web."
          />
          <CardBody className="space-y-5">
            <Alert tone="info" title="Antes de começar">
              Você precisa de uma conta do WhatsApp Business na Meta com um número registrado na Cloud API e de um token
              permanente de usuário do sistema. As credenciais são validadas na Meta antes de serem salvas.
            </Alert>
            <ConnectForm requireAppSecret={!hasGlobalApp} />
          </CardBody>
        </Card>
      ) : null}

      {channels.map((channel) => (
        <Card key={channel.id}>
          <CardHeader
            title={channel.display_phone ?? `Número ${channel.phone_number_id}`}
            description={channel.verified_name ?? undefined}
            action={statusBadge[channel.status]}
          />
          <CardBody className="space-y-5">
            {channel.status === "error" && channel.last_error ? (
              <Alert tone="danger" title="O canal apresentou um erro">
                {channel.last_error}
              </Alert>
            ) : null}
            <dl className="grid gap-x-6 gap-y-3 text-body sm:grid-cols-2">
              <div>
                <dt className="text-fg-muted">WABA ID</dt>
                <dd className="font-medium break-all">{channel.waba_id}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Phone Number ID</dt>
                <dd className="font-medium break-all">{channel.phone_number_id}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Qualidade informada pela Meta</dt>
                <dd className="font-medium">{channel.quality_rating ?? "Não informada"}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Último webhook recebido</dt>
                <dd className="font-medium">{channel.last_webhook_at ? formatDateTime(channel.last_webhook_at, tz) : "Nenhum até agora"}</dd>
              </div>
            </dl>

            {channel.status !== "disconnected" ? (
              <>
                {channel.uses_own_app ? (
                  <div className="space-y-2 rounded-md border border-line p-4 text-body">
                    <p className="font-semibold">Configuração do webhook no aplicativo da Meta</p>
                    <p className="text-fg-muted">
                      No aplicativo da agência, em WhatsApp › Configuração, informe os dados abaixo e assine o campo{" "}
                      <strong className="text-fg">messages</strong>.
                    </p>
                    <p>
                      <span className="text-fg-muted">URL de callback: </span>
                      <code className="rounded-sm bg-muted px-1.5 py-0.5 text-label break-all">{webhookUrl}</code>
                    </p>
                    <p>
                      <span className="text-fg-muted">Token de verificação: </span>
                      <code className="rounded-sm bg-muted px-1.5 py-0.5 text-label break-all">
                        {verifyTokens.get(channel.id) ?? "indisponível (verifique a configuração do servidor)"}
                      </code>
                    </p>
                  </div>
                ) : null}
                {!channel.last_webhook_at ? (
                  <Alert tone="warning" title="Recebimento ainda não confirmado">
                    As credenciais foram validadas na Meta, mas nenhum webhook chegou até agora. Envie uma mensagem para o
                    número para confirmar o recebimento.
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <SyncTemplatesButton channelId={channel.id} />
                  <ConfirmButton
                    label="Desconectar"
                    className="max-md:min-h-touch"
                    title="Desconectar canal"
                    description="A agência deixa de enviar e receber mensagens por este número e o token é apagado do sistema. As conversas e o histórico são mantidos."
                    confirmLabel="Desconectar"
                    action={disconnectChannelAction.bind(null, channel.id)}
                  />
                </div>
                {channel.status === "error" ? (
                  <div className="border-t border-line pt-5">
                    <p className="mb-3 text-body font-semibold">Reconectar com novas credenciais</p>
                    <ConnectForm requireAppSecret={!hasGlobalApp} reconnect={{ wabaId: channel.waba_id, phoneNumberId: channel.phone_number_id }} />
                  </div>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>
      ))}

      {active.length > 0 ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-50 text-green-700">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-title font-bold text-fg">Modelos de mensagem</h2>
                <p className="mt-0.5 text-label text-fg-muted">
                  {templates.length === 0
                    ? "Nenhum modelo sincronizado ainda. Use Sincronizar templates no canal acima."
                    : `${templates.length} ${templates.length === 1 ? "modelo sincronizado" : "modelos sincronizados"}, ${approvedCount} ${approvedCount === 1 ? "aprovado" : "aprovados"} pela Meta.`}
                </p>
              </div>
            </div>
            {canTemplates ? (
              <LinkButton href="/configuracoes/modelos" variant="secondary" className="max-md:min-h-touch">
                Ver modelos de mensagem
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </LinkButton>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {channels.length > 0 && active.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={MessageCircle} title="Nenhum canal ativo" description="Conecte um número acima para voltar a atender pelo WhatsApp." className="py-6" />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
