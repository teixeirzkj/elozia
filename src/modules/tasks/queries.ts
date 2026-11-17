import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sanitizeSearch } from "@/modules/contacts/queries";
import type { Option, Task } from "@/modules/crm/types";

export const TASKS_PAGE_SIZE = 25;

export const TASK_SCOPES = { minhas: "Minhas", todas: "Todas", sem: "Sem responsável" } as const;
export type TaskScope = keyof typeof TASK_SCOPES;

export const TASK_SITUATIONS = { abertas: "Abertas", atrasadas: "Atrasadas", concluidas: "Concluídas" } as const;
export type TaskSituation = keyof typeof TASK_SITUATIONS;

const pick = <T extends Record<string, string>>(map: T, fallback: keyof T) =>
  z.preprocess((v) => (typeof v === "string" && Object.hasOwn(map, v) ? v : fallback), z.enum(Object.keys(map) as [string, ...string[]]));

export const taskFiltersSchema = z.object({
  de: pick(TASK_SCOPES, "todas"),
  situacao: pick(TASK_SITUATIONS, "abertas"),
  q: z.preprocess((v) => (typeof v === "string" ? sanitizeSearch(v) || undefined : undefined), z.string().optional()),
  pagina: z.preprocess((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }, z.number().int().min(1)),
});

export type TaskFilters = { de: TaskScope; situacao: TaskSituation; q?: string; pagina: number };

/** Valida os parâmetros da URL; valores inválidos voltam ao padrão (todas, abertas, página 1). */
export function parseTaskFilters(params: Record<string, string | string[] | undefined>): TaskFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return taskFiltersSchema.parse(flat) as TaskFilters;
}

export type TaskRow = Task & { created_at: string };

export type TaskSummary = { open: number; overdue: number; doneLast7Days: number };

/** Filtro "de quem" como expressão PostgREST (`or`), aplicável a qualquer consulta de tarefas. */
function scopeFilter(scope: TaskScope, userId: string): string | null {
  if (scope === "minhas") return `assignee_id.eq.${userId}`;
  if (scope === "sem") return "assignee_id.is.null";
  return null;
}

/** Lista paginada de tarefas da agência, com contato e responsável. */
export async function listTasksPage(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  filters: TaskFilters,
  members: Option[],
  now: Date,
): Promise<{ tasks: TaskRow[]; total: number; page: number }> {
  const page = filters.pagina;
  const nowIso = now.toISOString();

  let query = supabase
    .from("tasks")
    .select("id, title, notes, due_at, assignee_id, contact_id, opportunity_id, done_at, origin, created_at, contact:contacts (name)", {
      count: "exact",
    })
    .eq("organization_id", orgId);
  const scope = scopeFilter(filters.de, userId);
  if (scope) query = query.or(scope);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);

  if (filters.situacao === "concluidas") {
    query = query.not("done_at", "is", null).order("done_at", { ascending: false });
  } else {
    query = query.is("done_at", null);
    if (filters.situacao === "atrasadas") query = query.lt("due_at", nowIso);
    query = query.order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  }

  const from = (page - 1) * TASKS_PAGE_SIZE;
  const { data, error, count } = await query.order("id").range(from, from + TASKS_PAGE_SIZE - 1);
  // Página além do fim (PostgREST responde 416): lista vazia em vez de erro.
  if (error?.code === "PGRST103") return { tasks: [], total: 0, page };
  if (error) throw error;

  const names = new Map(members.map((m) => [m.id, m.name]));
  const tasks = (data ?? []).map((row) => {
    const assigneeId = row.assignee_id as string | null;
    return {
      id: row.id as string,
      title: row.title as string,
      notes: row.notes as string | null,
      due_at: row.due_at as string | null,
      assignee_id: assigneeId,
      assignee_name: assigneeId ? (names.get(assigneeId) ?? null) : null,
      contact_id: row.contact_id as string | null,
      contact_name: (row.contact as unknown as { name: string } | null)?.name ?? null,
      opportunity_id: row.opportunity_id as string | null,
      done_at: row.done_at as string | null,
      origin: row.origin as Task["origin"],
      created_at: row.created_at as string,
    };
  });
  return { tasks, total: count ?? 0, page };
}

/** Contagens reais (count exact no servidor) para o resumo do topo, no mesmo recorte "de quem". */
export async function getTaskSummary(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  scope: TaskScope,
  now: Date,
): Promise<TaskSummary> {
  const filter = scopeFilter(scope, userId);
  const base = () => {
    const query = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    return filter ? query.or(filter) : query;
  };
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [open, overdue, done] = await Promise.all([
    base().is("done_at", null),
    base().is("done_at", null).lt("due_at", now.toISOString()),
    base().gte("done_at", since),
  ]);
  for (const result of [open, overdue, done]) if (result.error) throw result.error;
  return { open: open.count ?? 0, overdue: overdue.count ?? 0, doneLast7Days: done.count ?? 0 };
}

/** Se a agência tem alguma tarefa (distingue "vazio" de "vazio filtrado"). */
export async function hasAnyTask(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { count, error } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
