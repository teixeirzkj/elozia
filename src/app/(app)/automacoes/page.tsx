import { Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { AutomationToggle } from "@/modules/automations/components/automation-controls";
import { listAutomations } from "@/modules/automations/queries";
import { ACTION_LABELS, describeDelay, TRIGGERS } from "@/modules/automations/types";

export const metadata: Metadata = { title: "Automações" };

export default async function AutomacoesPage() {
  const { supabase, membership } = await requireMembership();
  const automations = await listAutomations(supabase, membership.organization.id);
  const canManage = can(membership.role, "automations.manage");
  const tz = membership.organization.timezone;

  return (
    <>
      <PageHeader
        title="Automações"
        description="Regras de follow-up: quando uma situação acontece, o sistema cria tarefas, organiza o funil ou agenda um template aprovado."
        actions={
          canManage ? (
            <LinkButton href="/automacoes/nova">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova automação
            </LinkButton>
          ) : null
        }
      />
      <Card className="overflow-hidden">
        {automations.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="Nenhuma automação criada"
            description={
              canManage
                ? "Crie a primeira regra, por exemplo: quando uma proposta ficar 2 dias sem resposta, criar uma tarefa para o responsável."
                : "As automações são criadas por supervisores e administradores da agência."
            }
            action={canManage ? <LinkButton href="/automacoes/nova">Criar automação</LinkButton> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="elz-table">
              <thead>
                <tr>
                  <th scope="col">Automação</th>
                  <th scope="col">Quando</th>
                  <th scope="col">Ações</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Últimos 30 dias</th>
                  {canManage ? <th scope="col" className="text-right">Controle</th> : null}
                </tr>
              </thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/automacoes/${a.id}`} className="font-semibold hover:underline">
                        {a.name}
                      </Link>
                    </td>
                    <td className="text-[13px] text-fg-muted">
                      {TRIGGERS[a.trigger_type].label}
                      <span className="block text-xs text-fg-subtle">após {describeDelay(a.delay_minutes)}</span>
                    </td>
                    <td className="text-[13px] text-fg-muted">{a.actions.map((action) => ACTION_LABELS[action.type]).join(", ")}</td>
                    <td>{a.status === "active" ? <Badge tone="brand">Ativa</Badge> : <Badge tone="neutral">Pausada</Badge>}</td>
                    <td className="text-[13px] whitespace-nowrap">
                      {a.runs === 0 ? (
                        <span className="text-fg-subtle">Nenhuma execução</span>
                      ) : (
                        <>
                          {a.runs} {a.runs === 1 ? "execução" : "execuções"}
                          {a.failures > 0 ? (
                            <Badge tone="danger" className="ml-2">
                              {a.failures} com falha
                            </Badge>
                          ) : null}
                          <span className="block text-xs text-fg-subtle">última em {formatDateTime(a.last_run_at, tz)}</span>
                        </>
                      )}
                    </td>
                    {canManage ? (
                      <td className="text-right">
                        <AutomationToggle automationId={a.id} status={a.status} name={a.name} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
