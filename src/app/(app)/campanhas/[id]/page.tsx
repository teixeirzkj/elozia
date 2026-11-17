import { AlertTriangle, Ban, CheckCheck, Send, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DataList } from "@/components/ui/data-list";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/utils";
import { loadRuleOptions } from "@/modules/automations/options";
import { cancelCampaignAction, deleteCampaignAction } from "@/modules/campaigns/actions";
import { CampaignForm } from "@/modules/campaigns/components/campaign-form";
import { getCampaign, listRecipients } from "@/modules/campaigns/queries";
import { CAMPAIGN_STATUS_LABELS, RECIPIENT_STATUS_LABELS } from "@/modules/campaigns/types";

export const metadata: Metadata = { title: "Campanha" };

const statusTone = {
  draft: "neutral",
  scheduled: "info",
  running: "progress",
  completed: "won",
  cancelled: "neutral",
  failed: "danger",
} as const;
const recipientTone = {
  pending: "info",
  sending: "info",
  sent: "brand",
  failed: "danger",
  skipped: "warning",
  cancelled: "neutral",
} as const;
const DELIVERY_LABELS: Record<string, string> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou na entrega",
  queued: "na fila",
};

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;
  const campaign = await getCampaign(supabase, orgId, id);
  if (!campaign) notFound();

  const canManage = can(membership.role, "automations.manage");
  const editable = canManage && (campaign.status === "draft" || campaign.status === "scheduled");
  const [recipients, options] = await Promise.all([
    listRecipients(supabase, orgId, id),
    editable ? loadRuleOptions(supabase, orgId) : Promise.resolve(null),
  ]);
  const count = (statuses: string[]) => recipients.filter((r) => statuses.includes(r.status)).length;
  const delivered = recipients.filter((r) => r.delivery === "delivered" || r.delivery === "read").length;

  return (
    <>
      <Breadcrumbs items={[{ label: "Campanhas", href: "/campanhas" }, { label: campaign.name }]} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading font-bold tracking-tight break-words text-fg sm:text-display">{campaign.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone={statusTone[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
            <Link href={`/viagens/${campaign.package_id}`} className="font-medium hover:underline">
              {campaign.package_name}
            </Link>
            {campaign.departure_date ? <span>· saída {formatDate(campaign.departure_date)}</span> : null}
            <span>· template {campaign.template_name ?? "removido"}</span>
            {campaign.scheduled_at ? <span>· envio em {formatDateTime(campaign.scheduled_at, tz)}</span> : null}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {["scheduled", "running"].includes(campaign.status) ? (
              <ConfirmButton
                label="Cancelar campanha"
                buttonSize="md"
                title="Cancelar campanha"
                description="Os envios que ainda não saíram serão cancelados. Mensagens já enviadas não podem ser desfeitas."
                confirmLabel="Cancelar campanha"
                action={cancelCampaignAction.bind(null, campaign.id)}
              />
            ) : null}
            {campaign.status === "draft" ? (
              <ConfirmButton
                icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                label="Excluir rascunho"
                buttonSize="md"
                title="Excluir rascunho"
                description="O rascunho desta campanha será excluído."
                confirmLabel="Excluir"
                action={deleteCampaignAction.bind(null, campaign.id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {campaign.status === "failed" && campaign.error ? (
        <Alert tone="danger" title="A campanha foi interrompida" className="mb-6">
          {campaign.error} Os contatos que ainda não receberam continuam na fila e não serão enviados.
        </Alert>
      ) : null}

      {campaign.total_recipients > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Destinatários" icon={Users} value={campaign.total_recipients} />
          <Stat label="Enviadas" icon={Send} tone="info" value={count(["sent"])} />
          <Stat label="Entregues ou lidas" icon={CheckCheck} tone="brand" value={delivered} hint="Conforme os status recebidos da Meta" />
          <Stat label="Falhas" icon={AlertTriangle} tone={count(["failed"]) > 0 ? "danger" : "neutral"} value={count(["failed"])} />
          <Stat
            label="Não enviadas"
            icon={Ban}
            tone="warning"
            value={count(["skipped", "cancelled"])}
            hint="Sem consentimento no envio ou canceladas"
          />
        </div>
      ) : null}

      {campaign.status !== "draft" ? (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title="Histórico de envios" description="Um registro por destinatário, com o resultado de cada envio." />
          {recipients.length === 0 ? (
            <EmptyState
              icon={Send}
              title={campaign.status === "scheduled" ? "Envio ainda não iniciado" : "Nenhum destinatário"}
              description={
                campaign.status === "scheduled"
                  ? "A lista de destinatários é definida no horário agendado, com os contatos que tiverem consentimento naquele momento."
                  : "Nenhum contato atendia ao público com consentimento no momento do envio."
              }
              className="py-10"
            />
          ) : (
            // Área rolável focável, para quem navega pelo teclado conseguir rolar o histórico.
            <div className="max-h-128 overflow-y-auto" tabIndex={0} role="region" aria-label="Histórico de envios (rolável)">
              <DataList
                caption="Histórico de envios"
                rows={recipients}
                getKey={(r) => r.id}
                columns={[
                  {
                    key: "contato",
                    header: "Contato",
                    primary: true,
                    cell: (r) => (
                      <Link href={`/contatos/${r.contact_id}`} className="font-medium hover:underline">
                        {r.contact_name}
                      </Link>
                    ),
                  },
                  {
                    key: "situacao",
                    header: "Situação",
                    cell: (r) => <Badge tone={recipientTone[r.status]}>{RECIPIENT_STATUS_LABELS[r.status]}</Badge>,
                  },
                  {
                    key: "detalhe",
                    header: "Detalhe",
                    className: "text-label text-fg-muted",
                    cell: (r) => r.error ?? (r.delivery ? `Na Meta: ${DELIVERY_LABELS[r.delivery] ?? r.delivery}` : "—"),
                  },
                  {
                    key: "processado",
                    header: "Processado em",
                    className: "text-label whitespace-nowrap",
                    cell: (r) => formatDateTime(r.processed_at, tz),
                  },
                ]}
              />
            </div>
          )}
        </Card>
      ) : null}

      {options ? (
        <>
          <h2 className="mb-3 text-title font-bold text-fg">
            {campaign.status === "draft" ? "Concluir rascunho" : "Editar campanha agendada"}
          </h2>
          <CampaignForm campaign={campaign} packages={options.packages} tags={options.tags} templates={options.templates} timeZone={tz} />
        </>
      ) : null}
    </>
  );
}
