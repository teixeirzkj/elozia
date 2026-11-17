import { AlarmClock, CheckCheck, ListTodo, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { DataList, type DataColumn } from "@/components/ui/data-list";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { requireMembership } from "@/lib/auth/session";
import { cn, formatDateTime } from "@/lib/utils";
import { TaskDialog } from "@/modules/contacts/components/tasks";
import { listActiveMembers } from "@/modules/settings/queries";
import { TaskToggle } from "@/modules/tasks/components/task-toggle";
import {
  getTaskSummary,
  hasAnyTask,
  listTasksPage,
  parseTaskFilters,
  TASK_SCOPES,
  TASK_SITUATIONS,
  TASKS_PAGE_SIZE,
  type TaskFilters,
  type TaskRow,
  type TaskSituation,
} from "@/modules/tasks/queries";

export const metadata: Metadata = { title: "Tarefas" };

const EMPTY_BY_SITUATION: Record<TaskSituation, { title: string; description: string }> = {
  abertas: { title: "Nenhuma tarefa aberta", description: "Tudo em dia por aqui. Crie uma tarefa quando houver algo para acompanhar." },
  atrasadas: { title: "Nenhuma tarefa atrasada", description: "Todas as tarefas abertas estão dentro do prazo." },
  concluidas: { title: "Nenhuma tarefa concluída", description: "As tarefas marcadas como concluídas aparecem aqui." },
};

/** Monta a URL da lista preservando os filtros atuais (a página volta para 1). */
function tasksHref(filters: TaskFilters, change: Partial<TaskFilters>): string {
  const next = { ...filters, ...change };
  const search = new URLSearchParams();
  if (next.de !== "todas") search.set("de", next.de);
  if (next.situacao !== "abertas") search.set("situacao", next.situacao);
  if (next.q) search.set("q", next.q);
  const qs = search.toString();
  return qs ? `/tarefas?${qs}` : "/tarefas";
}

export default async function TarefasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseTaskFilters(await searchParams);
  const { supabase, membership, user } = await requireMembership();
  const orgId = membership.organization.id;
  const timeZone = membership.organization.timezone;
  const now = new Date();

  const members = await listActiveMembers(supabase, orgId);
  const [{ tasks, total, page }, summary] = await Promise.all([
    listTasksPage(supabase, orgId, user.id, filters, members, now),
    getTaskSummary(supabase, orgId, user.id, filters.de, now),
  ]);
  const filtered = filters.de !== "todas" || Boolean(filters.q);
  const anyAtAll = tasks.length > 0 || summary.open > 0 || summary.doneLast7Days > 0 ? true : await hasAnyTask(supabase, orgId);
  const nowMs = now.getTime();

  const newTask = <TaskDialog members={members} currentUserId={user.id} />;
  const scopeHint = filters.de === "minhas" ? "Atribuídas a você" : filters.de === "sem" ? "Sem responsável" : "Toda a agência";

  const columns: DataColumn<TaskRow>[] = [
    {
      key: "title",
      header: "Tarefa",
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn("font-semibold text-fg", t.done_at && "text-fg-subtle line-through")}>{t.title}</span>
            {t.origin === "automation" ? <Badge tone="info">Automação</Badge> : null}
          </p>
          {t.notes ? <p className="mt-0.5 line-clamp-2 max-w-md text-label font-normal text-fg-muted">{t.notes}</p> : null}
        </div>
      ),
    },
    {
      key: "due",
      header: "Prazo",
      className: "whitespace-nowrap",
      hideOnMobile: filters.situacao === "concluidas",
      cell: (t) => {
        if (!t.due_at) return <span className="text-fg-subtle">Sem prazo</span>;
        const overdue = !t.done_at && new Date(t.due_at).getTime() < nowMs;
        return overdue ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-danger">
            <Badge tone="danger">Atrasada</Badge>
            {formatDateTime(t.due_at, timeZone)}
          </span>
        ) : (
          formatDateTime(t.due_at, timeZone)
        );
      },
    },
    ...(filters.situacao === "concluidas"
      ? [
          {
            key: "done",
            header: "Concluída em",
            className: "whitespace-nowrap",
            cell: (t: TaskRow) => formatDateTime(t.done_at, timeZone),
          },
        ]
      : []),
    {
      key: "contact",
      header: "Contato",
      cell: (t) =>
        t.contact_id && t.contact_name ? (
          <Link
            href={`/contatos/${t.contact_id}`}
            className="inline-flex min-h-touch items-center font-medium text-brand-strong hover:underline md:min-h-0"
          >
            {t.contact_name}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "assignee",
      header: "Responsável",
      className: "whitespace-nowrap",
      cell: (t) =>
        t.assignee_id ? (
          (t.assignee_name ?? <span className="text-fg-subtle">Colaborador inativo</span>)
        ) : (
          <span className="text-fg-subtle">Sem responsável</span>
        ),
    },
    {
      key: "toggle",
      header: "Ações",
      actions: true,
      align: "end",
      cell: (t) => <TaskToggle key={`${t.id}-${t.done_at ?? "open"}`} taskId={t.id} title={t.title} done={t.done_at !== null} />,
    },
  ];

  return (
    <>
      <PageHeader title="Tarefas" description="Os próximos passos de toda a equipe, com prazo, contato e responsável." actions={newTask} />

      {!anyAtAll ? (
        <Card>
          <EmptyState
            icon={ListTodo}
            title="Nenhuma tarefa ainda"
            description="Crie tarefas para lembrar de retornos, envios de proposta e pagamentos. As automações também podem criar tarefas."
            action={newTask}
          />
        </Card>
      ) : (
        <>
          <section aria-label="Resumo das tarefas" className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Abertas" value={summary.open} hint={scopeHint} icon={ListTodo} tone="info" />
            <Stat label="Atrasadas" value={summary.overdue} hint={scopeHint} icon={AlarmClock} tone={summary.overdue > 0 ? "danger" : "neutral"} />
            <Stat label="Concluídas nos últimos 7 dias" value={summary.doneLast7Days} hint={scopeHint} icon={CheckCheck} tone="brand" />
          </section>

          <Card className="overflow-hidden">
            <nav aria-label="Situação das tarefas" className="flex gap-1 overflow-x-auto border-b border-line px-2">
              {(Object.keys(TASK_SITUATIONS) as TaskSituation[]).map((key) => {
                const active = filters.situacao === key;
                return (
                  <Link
                    key={key}
                    href={tasksHref(filters, { situacao: key })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex min-h-touch items-center border-b-2 px-3 text-body font-semibold whitespace-nowrap transition-colors",
                      active ? "border-ink text-fg" : "border-transparent text-fg-muted hover:text-fg",
                    )}
                  >
                    {TASK_SITUATIONS[key]}
                  </Link>
                );
              })}
            </nav>

            <form method="get" role="search" aria-label="Filtrar tarefas" className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_auto_auto]">
              {filters.situacao !== "abertas" ? <input type="hidden" name="situacao" value={filters.situacao} /> : null}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={filters.q ?? ""}
                  placeholder="Buscar pelo título"
                  aria-label="Buscar tarefas pelo título"
                  className="elz-field pl-9 max-md:min-h-touch"
                />
              </div>
              <select name="de" defaultValue={filters.de} aria-label="De quem" className="elz-field max-md:min-h-touch sm:w-auto sm:min-w-48">
                {Object.entries(TASK_SCOPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value === "todas" ? "Todas as tarefas" : value === "minhas" ? "Minhas tarefas" : label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" className="min-h-touch flex-1 md:min-h-0 sm:flex-none">
                  Filtrar
                </Button>
                {filtered ? (
                  <LinkButton href={tasksHref(filters, { de: "todas", q: undefined })} variant="ghost" className="min-h-touch md:min-h-0">
                    Limpar
                  </LinkButton>
                ) : null}
              </div>
            </form>

            {tasks.length === 0 ? (
              page > 1 ? (
                <EmptyState
                  icon={Search}
                  title="Esta página está vazia"
                  description="A lista tem menos páginas do que o endereço indica."
                  action={
                    <LinkButton href={tasksHref(filters, {})} variant="secondary">
                      Ir para a primeira página
                    </LinkButton>
                  }
                />
              ) : filtered ? (
                <EmptyState
                  icon={Search}
                  title="Nenhuma tarefa encontrada"
                  description="Nenhuma tarefa corresponde à busca e aos filtros escolhidos."
                  action={
                    <LinkButton href={tasksHref(filters, { de: "todas", q: undefined })} variant="secondary">
                      Limpar filtros
                    </LinkButton>
                  }
                />
              ) : (
                <EmptyState
                  icon={filters.situacao === "concluidas" ? CheckCheck : ListTodo}
                  title={EMPTY_BY_SITUATION[filters.situacao].title}
                  description={EMPTY_BY_SITUATION[filters.situacao].description}
                />
              )
            ) : (
              <>
                <DataList columns={columns} rows={tasks} getKey={(t) => t.id} caption={`Tarefas ${TASK_SITUATIONS[filters.situacao].toLowerCase()}`} />
                <Pagination
                  page={page}
                  pageSize={TASKS_PAGE_SIZE}
                  total={total}
                  basePath="/tarefas"
                  params={{
                    de: filters.de !== "todas" ? filters.de : undefined,
                    situacao: filters.situacao !== "abertas" ? filters.situacao : undefined,
                    q: filters.q,
                  }}
                />
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
