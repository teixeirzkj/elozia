import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sanitizeSearch } from "@/modules/contacts/queries";
import type { Departure, TravelPackage } from "@/modules/crm/types";

const PACKAGE_COLUMNS =
  "id, name, destination, description, price_cents, currency, status, image_path, commercial_notes, is_demo, departures:package_departures (id, package_id, departs_on, returns_on, price_cents, seats_total, status, notes)";

function mapPackage(row: unknown): TravelPackage {
  const pkg = row as TravelPackage;
  return { ...pkg, departures: [...(pkg.departures ?? [])].sort((a, b) => a.departs_on.localeCompare(b.departs_on)) };
}

export async function listPackages(
  supabase: SupabaseClient,
  orgId: string,
  filters: { status?: string; q?: string } = {},
): Promise<TravelPackage[]> {
  let query = supabase.from("packages").select(PACKAGE_COLUMNS).eq("organization_id", orgId);
  if (filters.status && ["active", "paused", "closed"].includes(filters.status)) query = query.eq("status", filters.status);
  const q = filters.q ? sanitizeSearch(filters.q) : "";
  if (q) query = query.or(`name.ilike.%${q}%,destination.ilike.%${q}%`);
  const { data, error } = await query.order("name").limit(500);
  if (error) throw error;
  return (data ?? []).map(mapPackage);
}

export async function getPackage(supabase: SupabaseClient, orgId: string, id: string): Promise<TravelPackage | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("packages").select(PACKAGE_COLUMNS).eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPackage(data) : null;
}

export type PackageOption = { id: string; name: string; destination: string; status: string; departures: Departure[] };

/** Pacotes e saídas para seletores (oportunidades, reservas, campanhas). */
export async function listPackageOptions(supabase: SupabaseClient, orgId: string): Promise<PackageOption[]> {
  const packages = await listPackages(supabase, orgId);
  return packages.map(({ id, name, destination, status, departures }) => ({ id, name, destination, status, departures }));
}

/** URL temporária (1 hora) para um arquivo do bucket privado. */
export async function signedUrl(supabase: SupabaseClient, path: string | null, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}

export async function signedUrls(supabase: SupabaseClient, paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await supabase.storage.from("media").createSignedUrls(paths, expiresIn);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

/** Quantidade de viajantes em reservas não canceladas, por saída. */
export async function bookedTravelersByDeparture(supabase: SupabaseClient, orgId: string, packageId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("bookings")
    .select("departure_id, travelers")
    .eq("organization_id", orgId)
    .eq("package_id", packageId)
    .neq("status", "cancelled");
  if (error) throw error;
  const out = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.departure_id) out.set(row.departure_id as string, (out.get(row.departure_id as string) ?? 0) + (row.travelers as number));
  }
  return out;
}
