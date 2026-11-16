import { FileText, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";
import { optionalServerSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { disconnectChannelAction } from "@/modules/channels/actions";
import { ConnectForm, SyncTemplatesButton } from "@/modules/channels/components/channel-forms";
import { listChannels, listTemplates, TEMPLATE_CATEGORY_LABELS, TEMPLATE_STATUS_LABELS } from "@/modules/channels/queries";

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
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-muted">WABA ID</dt>
                <dd className="font-medium">{channel.waba_id}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">Phone Number ID</dt>
                <dd className="font-medium">{channel.phone_number_id}</dd>
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
                  <div className="space-y-2 rounded-md border border-line p-4 text-sm">
                    <p className="font-semibold">Configuração do webhook no aplicativo da Meta</p>
                    <p className="text-fg-muted">
                      No aplicativo da agência, em WhatsApp › Configuração, informe os dados abaixo e assine o campo{" "}
                      <strong className="text-fg">messages</strong>.
                    </p>
                    <p>
                      <span className="text-fg-muted">URL de callback: </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] break-all">{webhookUrl}</code>
                    </p>
                    <p>
                      <span className="text-fg-muted">Token de verificação: </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] break-all">
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
                    title="Desconectar canal"
                    description="A agência deixa de enviar e receber mensagens por este número e o token é apagado do sistema. As conversas e o histórico são mantidos."
                    confirmLabel="Desconectar"
                    action={disconnectChannelAction.bind(null, channel.id)}
                  />
                </div>
                {channel.status === "error" ? (
                  <div className="border-t border-line pt-5">
                    <p className="mb-3 text-sm font-semibold">Reconectar com novas credenciais</p>
                    <ConnectForm requireAppSecret={!hasGlobalApp} reconnect={{ wabaId: channel.waba_id, phoneNumberId: channel.phone_number_id }} />
                  </div>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>
      ))}

      {active.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Templates de mensagem"
            description="Criados e aprovados no Gerenciador do WhatsApp da Meta. Fora da janela de 24 horas, só templates aprovados podem ser enviados."
          />
          {templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum template sincronizado"
              description="Crie templates no Gerenciador do WhatsApp da Meta e use Sincronizar templates para trazê-los."
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="elz-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Idioma</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Situação na Meta</th>
                    <th scope="col">Uso no sistema</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium">{t.name}</td>
                      <td>{t.language}</td>
                      <td>{TEMPLATE_CATEGORY_LABELS[t.category] ?? t.category}</td>
                      <td>
                        <Badge tone={t.status === "APPROVED" ? "brand" : t.status === "PENDING" ? "warning" : "neutral"}>
                          {TEMPLATE_STATUS_LABELS[t.status] ?? t.status}
                        </Badge>
                      </td>
                      <td className="text-[13px] text-fg-muted">{t.spec.supported ? "Disponível" : t.spec.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
