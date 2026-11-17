import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Opportunity, Option, StageKind } from "@/modules/crm/types";
import { sanitizeSearch } from "@/modules/contacts/queries";

export const OPPORTUNITIES_PAGE_SIZE = 25;

/** Situação na URL (português) → coluna `status`. */
export const OPPORTUNITY_SITUATIONS = { aberta: "open", ganha: "won", perdida: "lost" } as const satisfies Record<string, StageKind>;
export type OpportunitySituation = keyof typeof OPPORTUNITY_SITUATIONS;

/** Mesma seleção de `queries.ts`; o contato vira `!inner` quando há busca pelo nome. */
const BASE_COLUMNS =
  "id, contact_id, package_id, departure_id, destination_interest, stage_id, position, estimated_value_cents, currency, intended_date, travelers, owner_id, next_contact_at, last_interaction_at, status, lost_reason, notes, is_demo, created_at, package:packages (name), departure:package_departures (departs_on)";

const uuid = z.uuid();
const optionalUuid = z.preprocess((v) => (typeof v === "string" && uuid.safeParse(v).success ? v : undefined), z.string().optional());

export const opportunityFiltersSchema = z.object({
  situacao: z.preprocess(
    (v) => (typeof v === "string" && Object.hasOwn(OPPORTUNITY_SITUATIONS, v) ? v : undefined),
    z.enum(["aberta", "ganha", "perdida"]).optional(),
  ),
  etapa: optionalUuid,
  responsavel: z.preprocess(
    (v) => (v === "nenhum" || (typeof v === "string" && uuid.safeParse(v).success) ? v : undefined),
    z.string().optional(),
  ),
  pacote: optionalUuid,
  q: z.preprocess((v) => (typeof v === "string" ? sanitizeSearch(v) || undefined : undefined), z.string().optional()),
  pagina: z.preprocess((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }, z.number().int().min(1)),
});

export type OpportunityFilters = z.infer<typeof opportunityFiltersSchema>;

/** Valida os parâmetros da URL; valores inválidos são simplesmente ignorados. */
export function parseOpportunityFilters(params: Record<string, string | string[] | undefined>): OpportunityFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return opportunityFiltersSchema.parse(flat);
}

type RawOpportunity = Omit<Opportunity, "contact_name" | "package_name" | "departure_date" | "owner_name"> & {
  contact: { name: string } | null;
  package: { name: string } | null;
  departure: { departs_on: string } | null;
};

/** Lista paginada de todas as oportunidades (abertas, ganhas e perdidas), mais recentes primeiro. */
export async function listOpportunities(
  supabase: SupabaseClient,
  orgId: string,
  filters: OpportunityFilters,
  members: Option[],
): Promise<{ opportunities: Opportunity[]; total: number; page: number }> {
  const page = filters.pagina;
  const contactEmbed = filters.q ? "contact:contacts!inner (name)" : "contact:contacts (name)";

  let query = supabase
    .from("opportunities")
    .select(`${BASE_COLUMNS}, ${contactEmbed}`, { count: "exact" })
    .eq("organization_id", orgId);

  if (filters.situacao) query = query.eq("status", OPPORTUNITY_SITUATIONS[filters.situacao]);
  if (filters.etapa) query = query.eq("stage_id", filters.etapa);
  if (filters.responsavel === "nenhum") query = query.is("owner_id", null);
  else if (filters.responsavel) query = query.eq("owner_id", filters.responsavel);
  if (filters.pacote) query = query.eq("package_id", filters.pacote);
  if (filters.q) query = query.ilike("contact.name", `%${filters.q}%`);

  const from = (page - 1) * OPPORTUNITIES_PAGE_SIZE;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + OPPORTUNITIES_PAGE_SIZE - 1);
  // Página além do fim (PostgREST responde 416): lista vazia em vez de erro.
  if (error?.code === "PGRST103") return { opportunities: [], total: 0, page };
  if (error) throw error;

  const names = new Map(members.map((m) => [m.id, m.name]));
  const opportunities = (data ?? []).map((row) => {
    const { contact, package: pkg, departure, ...rest } = row as unknown as RawOpportunity;
    return {
      ...rest,
      contact_name: contact?.name ?? "—",
      package_name: pkg?.name ?? null,
      departure_date: departure?.departs_on ?? null,
      owner_name: rest.owner_id ? (names.get(rest.owner_id) ?? null) : null,
    };
  });
  return { opportunities, total: count ?? 0, page };
}

/** Se a agência tem alguma oportunidade (distingue "vazio" de "vazio filtrado"). */
export async function hasAnyOpportunity(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
