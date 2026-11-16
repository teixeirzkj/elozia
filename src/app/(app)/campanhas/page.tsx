import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { listCampaigns, recipientCounts } from "@/modules/campaigns/queries";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/types";

export const metadata: Metadata = { title: "Campanhas" };

const statusTone = { draft: "neutral", scheduled: "info", running: "warning", completed: "brand", cancelled: "neutral", failed: "danger" } as const;

export default async function CampanhasPage() {
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const campaigns = await listCampaigns(supabase, orgId);
  const counts = await recipientCounts(supabase, orgId, campaigns.filter((c) => c.total_recipients > 0).map((c) => c.id));
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
          <div className="overflow-x-auto">
            <table className="elz-table">
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col">Pacote</th>
                  <th scope="col">Template</th>
                  <th scope="col">Envio</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const stats = counts.get(c.id) ?? {};
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/campanhas/${c.id}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="text-fg-muted">{c.package_name ?? "—"}</td>
                      <td className="text-fg-muted">{c.template_name ?? "—"}</td>
                      <td className="text-[13px] whitespace-nowrap">{c.scheduled_at ? formatDateTime(c.scheduled_at, tz) : "Sem data"}</td>
                      <td>
                        <Badge tone={statusTone[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
                      </td>
                      <td className="text-[13px] whitespace-nowrap">
                        {c.total_recipients === 0 ? (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
