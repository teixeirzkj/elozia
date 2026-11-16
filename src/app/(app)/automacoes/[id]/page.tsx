import { ArrowLeft, History, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ui/dialog";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { cancelRunAction, deleteAutomationAction } from "@/modules/automations/actions";
import { AutomationToggle } from "@/modules/automations/components/automation-controls";
import { AutomationForm } from "@/modules/automations/components/automation-form";
import { loadRuleOptions } from "@/modules/automations/options";
import { getAutomation, listRuns } from "@/modules/automations/queries";
import { ACTION_LABELS, describeDelay, RUN_STATUS_LABELS, TRIGGERS } from "@/modules/automations/types";

export const metadata: Metadata = { title: "Automação" };

const runTone = { scheduled: "info", success: "brand", partial: "warning", failed: "danger", skipped: "neutral", cancelled: "neutral" } as const;
const resultTone = { done: "brand", failed: "danger", skipped: "neutral" } as const;
const resultLabel = { done: "feito", failed: "falhou", skipped: "ignorado" } as const;

export default async function AutomacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;
  const automation = await getAutomation(supabase, orgId, id);
  if (!automation) notFound();

  const canManage = can(membership.role, "automations.manage");
  const [runs, options] = await Promise.all([listRuns(supabase, orgId, id), canManage ? loadRuleOptions(supabase, orgId) : Promise.resolve(null)]);
  const count = (statuses: string[]) => runs.filter((r) => statuses.includes(r.status)).length;

  return (
    <>
      <Link href="/automacoes" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Automações
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{automation.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            {automation.status === "active" ? <Badge tone="brand">Ativa</Badge> : <Badge tone="neutral">Pausada</Badge>}
            {TRIGGERS[automation.trigger_type].label} · após {describeDelay(automation.delay_minutes)}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <AutomationToggle automationId={automation.id} status={automation.status} name={automation.name} />
            <ConfirmButton
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              label="Excluir"
              title="Excluir automação"
              description="A regra e o histórico de execuções serão excluídos. Tarefas e mensagens já criadas são mantidas."
              confirmLabel="Excluir"
              action={deleteAutomationAction.bind(null, automation.id)}
            />
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Execuções registradas" value={runs.length} hint="Até as 100 mais recentes" />
        <Stat label="Concluídas" value={count(["success"])} />
        <Stat label="Com falha" value={count(["failed", "partial"])} />
        <Stat label="Agendadas" value={count(["scheduled"])} />
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Histórico de execução" description="Cada ocorrência gera uma única execução, com o resultado de cada ação." />
        {runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhuma execução até agora"
            description={
              automation.status === "active"
                ? "A regra está ativa e será executada quando a situação configurada acontecer."
                : "A regra está pausada. Ative-a para que comece a valer."
            }
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="elz-table">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Contato</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Resultado das ações</th>
                  {canManage ? <th scope="col" className="text-right">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="text-[13px] whitespace-nowrap">{formatDateTime(run.executed_at ?? run.created_at, tz)}</td>
                    <td>
                      {run.contact_id ? (
                        <Link href={`/contatos/${run.contact_id}`} className="font-medium hover:underline">
                          {run.contact_name ?? "Contato"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge tone={runTone[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
                    </td>
                    <td className="text-[13px]">
                      {run.results.length === 0 ? (
                        <span className="text-fg-muted">{run.error ?? (run.status === "scheduled" ? "Aguardando execução." : "—")}</span>
                      ) : (
                        <ul className="space-y-1">
                          {run.results.map((result, index) => (
                            <li key={index} className="flex flex-wrap items-center gap-1.5">
                              <Badge tone={resultTone[result.status]}>{resultLabel[result.status]}</Badge>
                              <span className="font-medium">{ACTION_LABELS[result.type]}:</span>
                              <span className="text-fg-muted">{result.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {canManage ? (
                      <td className="text-right">
                        {run.status === "scheduled" ? (
                          <ConfirmButton
                            label="Cancelar"
                            title="Cancelar execução"
                            description="Esta execução agendada não será realizada. A regra continua valendo para as próximas ocorrências."
                            confirmLabel="Cancelar execução"
                            action={cancelRunAction.bind(null, automation.id, run.id)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {options ? (
        <>
          <h2 className="mb-3 text-base font-bold">Editar regra</h2>
          <AutomationForm
            key={`${automation.id}-${automation.status}`}
            automation={automation}
            stages={options.stages}
            packages={options.packages.map((p) => ({ id: p.id, name: p.name }))}
            tags={options.tags}
            members={options.members}
            templates={options.templates}
          />
        </>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-fg-muted">Somente supervisores e administradores podem editar automações.</p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
