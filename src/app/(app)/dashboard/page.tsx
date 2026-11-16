import { CalendarDays, Plane } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { TaskDialog, TaskList } from "@/modules/contacts/components/tasks";
import { listTasks } from "@/modules/contacts/queries";
import { formatDuration, resolvePeriod } from "@/modules/reports/definitions";
import { getDashboardMetrics, getUpcomingDepartures } from "@/modules/reports/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Dashboard" };

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periodo?: string; aviso?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const tz = membership.organization.timezone;

  const days = PERIODS.find((p) => String(p.days) === params.periodo)?.days ?? 30;
  const today = resolvePeriod(undefined, undefined, tz).toDate;
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d! - (days - 1))).toISOString().slice(0, 10);
  const period = resolvePeriod(start, today, tz);

  const [metrics, departures, tasks, members] = await Promise.all([
    getDashboardMetrics(supabase, period),
    getUpcomingDepartures(supabase),
    listTasks(supabase, orgId, { assigneeId: user.id, onlyOpen: true, limit: 8 }),
    listActiveMembers(supabase, orgId),
  ]);

  const hasAnyData =
    metrics.leads + metrics.open_opportunities + metrics.proposals_sent + metrics.sales_won + metrics.bookings_confirmed + metrics.conversations_pending + metrics.conversations_open + metrics.conversations_closed + metrics.tasks_open + departures.length > 0;
  const rangeLabel = `${formatDate(period.fromDate)} a ${formatDate(period.toDate)}`;

  return (
    <>
      <PageHeader
        title={`Olá, ${user.fullName.split(" ")[0]}`}
        description={`Indicadores de ${rangeLabel}, calculados a partir dos registros da agência.`}
        actions={
          <nav aria-label="Período" className="flex rounded-md border border-line-strong bg-surface p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={`/dashboard?periodo=${p.days}`}
                aria-current={p.days === days ? "page" : undefined}
                className={cn("rounded px-3 py-1.5 text-[13px] font-semibold", p.days === days ? "bg-ink text-white" : "text-fg-muted hover:text-fg")}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      {params.aviso === "sem-permissao" ? (
        <Alert tone="warning" className="mb-6">
          Você não tem permissão para acessar aquela página.
        </Alert>
      ) : null}

      {!hasAnyData ? (
        <Card className="mb-6">
          <EmptyState
            icon={Plane}
            title="Ainda não há dados para mostrar"
            description="Os indicadores aparecem conforme a agência cadastra contatos, viagens e oportunidades e atende conversas. Nenhum número é preenchido com exemplos."
            action={
              <>
                <LinkButton href="/contatos">Cadastrar contatos</LinkButton>
                {can(membership.role, "catalog.manage") ? (
                  <LinkButton href="/viagens" variant="secondary">
                    Cadastrar viagens
                  </LinkButton>
                ) : null}
              </>
            }
          />
        </Card>
      ) : null}

      <section aria-labelledby="dash-comercial" className="mb-6">
        <h2 id="dash-comercial" className="mb-3 text-[13px] font-bold tracking-wide text-fg-muted uppercase">
          Comercial
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Leads recebidos" value={metrics.leads} hint="Contatos cadastrados no período" />
          <Stat label="Oportunidades abertas" value={metrics.open_opportunities} hint={`${formatMoney(metrics.open_value_cents)} em negociação hoje`} />
          <Stat label="Propostas enviadas" value={metrics.proposals_sent} hint="Marcadas como enviadas no período" />
          <Stat label="Vendas confirmadas" value={metrics.sales_won} hint="Oportunidades em etapa de ganho no período" />
          <Stat
            label="Valor das vendas registradas"
            value={formatMoney(metrics.sales_value_cents)}
            hint={`${metrics.bookings_confirmed} ${metrics.bookings_confirmed === 1 ? "reserva confirmada" : "reservas confirmadas"}${metrics.sales_other_currencies > 0 ? ` · ${metrics.sales_other_currencies} em outra moeda fora da soma` : ""}`}
          />
        </div>
      </section>

      <section aria-labelledby="dash-atendimento" className="mb-6">
        <h2 id="dash-atendimento" className="mb-3 text-[13px] font-bold tracking-wide text-fg-muted uppercase">
          Atendimento
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Conversas pendentes" value={metrics.conversations_pending} hint="Aguardando um atendente agora" />
          <Stat label="Conversas em atendimento" value={metrics.conversations_open} hint="Abertas neste momento" />
          <Stat label="Conversas concluídas" value={metrics.conversations_closed} hint="Concluídas no período" />
          <Stat
            label="Tempo médio de primeira resposta"
            value={formatDuration(metrics.first_response_avg_seconds)}
            hint={
              metrics.first_response_count === 0
                ? "Sem primeiras respostas no período"
                : `Média de ${metrics.first_response_count} ${metrics.first_response_count === 1 ? "atendimento" : "atendimentos"}`
            }
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Próximas viagens"
            description="Saídas ativas a partir de hoje."
            action={
              <LinkButton href="/viagens" variant="secondary" size="sm">
                Ver catálogo
              </LinkButton>
            }
          />
          {departures.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nenhuma saída futura" description="As saídas cadastradas nos pacotes aparecem aqui." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {departures.map((dep) => (
                <li key={dep.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/viagens/${dep.package_id}`} className="font-semibold hover:underline">
                      {dep.package_name}
                    </Link>
                    <p className="text-[13px] text-fg-muted">{dep.destination}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatDate(dep.departs_on)}</p>
                    <p className="text-xs text-fg-subtle">
                      {dep.travelers_booked} {dep.travelers_booked === 1 ? "viajante" : "viajantes"} em reservas
                      {dep.seats_total != null ? ` · ${dep.seats_total} vagas (interno)` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Minhas atividades pendentes"
            description={
              metrics.tasks_open === 0
                ? "Nenhuma tarefa aberta na agência."
                : `${metrics.tasks_open} ${metrics.tasks_open === 1 ? "tarefa aberta" : "tarefas abertas"} na agência${metrics.tasks_overdue > 0 ? `, ${metrics.tasks_overdue} em atraso` : ""}.`
            }
            action={<TaskDialog members={members} currentUserId={user.id} />}
          />
          <TaskList tasks={tasks} timeZone={tz} showContact emptyText="Você não tem tarefas pendentes." />
        </Card>
      </div>
    </>
  );
}
