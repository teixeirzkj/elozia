import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Booking, Opportunity, Option, Proposal, Stage } from "@/modules/crm/types";

const uuid = z.uuid();

const OPPORTUNITY_COLUMNS =
  "id, contact_id, package_id, departure_id, destination_interest, stage_id, position, estimated_value_cents, currency, intended_date, travelers, owner_id, next_contact_at, last_interaction_at, status, lost_reason, notes, is_demo, created_at, contact:contacts (name), package:packages (name), departure:package_departures (departs_on)";

type RawOpportunity = Omit<Opportunity, "contact_name" | "package_name" | "departure_date" | "owner_name"> & {
  contact: { name: string } | null;
  package: { name: string } | null;
  departure: { departs_on: string } | null;
};

function mapOpportunity(row: unknown, names: Map<string, string>): Opportunity {
  const { contact, package: pkg, departure, ...rest } = row as RawOpportunity;
  return {
    ...rest,
    contact_name: contact?.name ?? "—",
    package_name: pkg?.name ?? null,
    departure_date: departure?.departs_on ?? null,
    owner_name: rest.owner_id ? (names.get(rest.owner_id) ?? null) : null,
  };
}

const nameMap = (members: Option[]) => new Map(members.map((m) => [m.id, m.name]));

export async function listStages(supabase: SupabaseClient, orgId: string): Promise<Stage[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, kind")
    .eq("organization_id", orgId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as Stage[];
}

/** Oportunidades do quadro: todas as abertas e as fechadas nos últimos 30 dias. */
export async function listBoard(
  supabase: SupabaseClient,
  orgId: string,
  members: Option[],
  filters: { owner?: string; packageId?: string } = {},
): Promise<Opportunity[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  let query = supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .eq("organization_id", orgId)
    .or(`status.eq.open,closed_at.gte.${since}`);
  if (filters.owner === "nenhum") query = query.is("owner_id", null);
  else if (filters.owner && uuid.safeParse(filters.owner).success) query = query.eq("owner_id", filters.owner);
  if (filters.packageId && uuid.safeParse(filters.packageId).success) query = query.eq("package_id", filters.packageId);
  const { data, error } = await query.order("position").limit(1000);
  if (error) throw error;
  const names = nameMap(members);
  return (data ?? []).map((row) => mapOpportunity(row, names));
}

export async function getOpportunity(supabase: SupabaseClient, orgId: string, id: string, members: Option[]): Promise<Opportunity | null> {
  if (!uuid.safeParse(id).success) return null;
  const { data, error } = await supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapOpportunity(data, nameMap(members)) : null;
}

export async function listOpportunitiesByContact(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  members: Option[],
): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const names = nameMap(members);
  return (data ?? []).map((row) => mapOpportunity(row, names));
}

export async function listProposals(supabase: SupabaseClient, orgId: string, opportunityId: string): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from("proposals")
    .select("id, opportunity_id, amount_cents, currency, description, status, valid_until, sent_at, created_at")
    .eq("organization_id", orgId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Proposal[];
}

export type StageMove = { id: number; from: string | null; to: string; moved_by: string | null; moved_at: string };

export async function listStageHistory(supabase: SupabaseClient, orgId: string, opportunityId: string): Promise<StageMove[]> {
  const { data, error } = await supabase
    .from("opportunity_stage_history")
    .select("id, from_stage_id, to_stage_id, moved_at, mover:profiles (full_name)")
    .eq("organization_id", orgId)
    .eq("opportunity_id", opportunityId)
    .order("moved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as number,
    from: row.from_stage_id as string | null,
    to: row.to_stage_id as string,
    moved_by: (row.mover as unknown as { full_name: string } | null)?.full_name ?? null,
    moved_at: row.moved_at as string,
  }));
}

const BOOKING_COLUMNS =
  "id, contact_id, opportunity_id, package_id, departure_id, travelers, total_cents, currency, status, payment_status, payment_method, amount_paid_cents, payment_notes, created_at, contact:contacts (name), package:packages (name), departure:package_departures (departs_on)";

function mapBooking(row: unknown): Booking {
  const { contact, package: pkg, departure, ...rest } = row as Omit<Booking, "contact_name" | "package_name" | "departure_date"> & {
    contact: { name: string } | null;
    package: { name: string } | null;
    departure: { departs_on: string } | null;
  };
  return { ...rest, contact_name: contact?.name ?? "—", package_name: pkg?.name ?? null, departure_date: departure?.departs_on ?? null };
}

export const BOOKINGS_PAGE_SIZE = 25;

export async function listBookings(
  supabase: SupabaseClient,
  orgId: string,
  filters: { contactId?: string; opportunityId?: string; status?: string; page?: number } = {},
): Promise<{ bookings: Booking[]; total: number; page: number }> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  let query = supabase.from("bookings").select(BOOKING_COLUMNS, { count: "exact" }).eq("organization_id", orgId);
  if (filters.contactId) query = query.eq("contact_id", filters.contactId);
  if (filters.opportunityId) query = query.eq("opportunity_id", filters.opportunityId);
  if (filters.status && ["pending", "confirmed", "cancelled"].includes(filters.status)) query = query.eq("status", filters.status);
  const from = (page - 1) * BOOKINGS_PAGE_SIZE;
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + BOOKINGS_PAGE_SIZE - 1);
  if (error) throw error;
  return { bookings: (data ?? []).map(mapBooking), total: count ?? 0, page };
}

/** Contato mínimo para pré-preencher formulários. */
export async function getContactOption(supabase: SupabaseClient, orgId: string, id: string | undefined): Promise<Option | null> {
  if (!id || !uuid.safeParse(id).success) return null;
  const { data } = await supabase.from("contacts").select("id, name").eq("organization_id", orgId).eq("id", id).maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}
