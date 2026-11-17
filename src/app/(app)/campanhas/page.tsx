import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { listCampaigns, recipientCounts } from "@/modules/campaigns/queries";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/types";

export const metadata: Metadata = { title: "Campanhas" };

const statusTone = {
  draft: "neutral",
  scheduled: "info",
  running: "progress",
  completed: "won",
  cancelled: "neutral",
  failed: "danger",
} as const;

export default async function CampanhasPage() {
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const campaigns = await listCampaigns(supabase, orgId);
  const counts = await recipientCounts(
    supabase,
    orgId,
    campaigns.filter((c) => c.total_recipients > 0).map((c) => c.id),
  );
  const canManage = can(membership.role, "automations.manage");
  const tz = membership.organization.timezone;

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Mensagens por viagem para um público segmentado, sempre com template aprovado e consentimento do contato."
        actions={
          canManage ? (
            <LinkButton href="/campanhas/nova">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova campanha
            </LinkButton>
          ) : null
        }
      />
      <Card className="overflow-hidden">
        {campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha criada"
            description={
              canManage
                ? "Escolha um pacote, defina o público que demonstrou interesse e agende um template aprovado."
                : "As campanhas são criadas por supervisores e administradores da agência."
            }
            action={canManage ? <LinkButton href="/campanhas/nova">Criar campanha</LinkButton> : undefined}
          />
        ) : (
          <DataList
            caption="Campanhas da agência"
            rows={campaigns}
            getKey={(c) => c.id}
            columns={[
              {
                key: "campanha",
                header: "Campanha",
                primary: true,
                cell: (c) => (
                  <Link href={`/campanhas/${c.id}`} className="font-semibold hover:underline">
                    {c.name}
                  </Link>
                ),
              },
              { key: "pacote", header: "Pacote", className: "text-fg-muted", cell: (c) => c.package_name ?? "—" },
              { key: "template", header: "Template", hideOnMobile: true, className: "text-fg-muted", cell: (c) => c.template_name ?? "—" },
              {
                key: "envio",
                header: "Envio",
                className: "text-label whitespace-nowrap",
                cell: (c) => (c.scheduled_at ? formatDateTime(c.scheduled_at, tz) : "Sem data"),
              },
              {
                key: "situacao",
                header: "Situação",
                cell: (c) => <Badge tone={statusTone[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>,
              },
              {
                key: "resultado",
                header: "Resultado",
                className: "text-label md:whitespace-nowrap",
                cell: (c) => {
                  const stats = counts.get(c.id) ?? {};
                  return c.total_recipients === 0 ? (
                    <span className="text-fg-subtle">{c.status === "completed" ? "Sem destinatários elegíveis" : "Ainda não enviada"}</span>
                  ) : (
                    <>
                      {stats.sent ?? 0} de {c.total_recipients} enviadas
                      {(stats.failed ?? 0) > 0 ? (
                        <Badge tone="danger" className="ml-2">
                          {stats.failed} com falha
                        </Badge>
                      ) : null}
                    </>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
