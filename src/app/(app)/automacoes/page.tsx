import { Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
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
          <DataList
            caption="Automações da agência"
            rows={automations}
            getKey={(a) => a.id}
            columns={[
              {
                key: "automacao",
                header: "Automação",
                primary: true,
                cell: (a) => (
                  <Link href={`/automacoes/${a.id}`} className="font-semibold hover:underline">
                    {a.name}
                  </Link>
                ),
              },
              {
                key: "quando",
                header: "Quando",
                className: "text-label text-fg-muted",
                cell: (a) => (
                  <>
                    {TRIGGERS[a.trigger_type].label}
                    <span className="block text-xs text-fg-subtle">após {describeDelay(a.delay_minutes)}</span>
                  </>
                ),
              },
              {
                key: "acoes",
                header: "Ações",
                className: "text-label text-fg-muted",
                cell: (a) => a.actions.map((action) => ACTION_LABELS[action.type]).join(", "),
              },
              {
                key: "situacao",
                header: "Situação",
                cell: (a) => (a.status === "active" ? <Badge tone="brand">Ativa</Badge> : <Badge tone="neutral">Pausada</Badge>),
              },
              {
                key: "execucoes",
                header: "Últimos 30 dias",
                className: "text-label md:whitespace-nowrap",
                cell: (a) =>
                  a.runs === 0 ? (
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
                  ),
              },
              ...(canManage
                ? [
                    {
                      key: "controle",
                      header: "Controle",
                      align: "end" as const,
                      actions: true,
                      cell: (a: (typeof automations)[number]) => <AutomationToggle automationId={a.id} status={a.status} name={a.name} />,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>
    </>
  );
}
