import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Period, ReportKey } from "./definitions";

export type DashboardMetrics = {
  leads: number;
  open_opportunities: number;
  open_value_cents: number;
  proposals_sent: number;
  sales_won: number;
  bookings_confirmed: number;
  sales_value_cents: number;
  sales_other_currencies: number;
  conversations_pending: number;
  conversations_open: number;
  conversations_closed: number;
  first_response_count: number;
  first_response_avg_seconds: number | null;
  tasks_open: number;
  tasks_overdue: number;
};

export type UpcomingDeparture = {
  id: string;
  package_id: string;
  package_name: string;
  destination: string;
  departs_on: string;
  returns_on: string | null;
  seats_total: number | null;
  travelers_booked: number;
};

export async function getDashboardMetrics(supabase: SupabaseClient, period: Period): Promise<DashboardMetrics> {
  const { data, error } = await supabase.rpc("dashboard_metrics", { p_from: period.from, p_to: period.to });
  if (error) throw error;
  return data as DashboardMetrics;
}

export async function getUpcomingDepartures(supabase: SupabaseClient, limit = 6): Promise<UpcomingDeparture[]> {
  const { data, error } = await supabase.rpc("upcoming_departures", { p_limit: limit });
  if (error) throw error;
  return (data as UpcomingDeparture[]) ?? [];
}

export type ReportFilters = { owner: string | null; packageId: string | null };

const uuid = z.uuid();
export function parseFilters(owner: string | undefined | null, packageId: string | undefined | null): ReportFilters {
  return {
    owner: owner && uuid.safeParse(owner).success ? owner : null,
    packageId: packageId && uuid.safeParse(packageId).success ? packageId : null,
  };
}

type Row = Record<string, unknown>;

/** Linhas de um relatório. "campaigns" e "automations" vêm da mesma função do banco. */
export async function getReport(supabase: SupabaseClient, key: ReportKey, period: Period, filters: ReportFilters): Promise<Row[]> {
  const fn = key === "automations" ? "report_campaigns" : `report_${key}`;
  const { data, error } = await supabase.rpc(fn, { p_from: period.from, p_to: period.to, p_owner: filters.owner, p_package: filters.packageId });
  if (error) throw error;
  if (key === "campaigns" || key === "automations") return ((data as Record<string, Row[]>)?.[key] ?? []) as Row[];
  return (data as Row[]) ?? [];
}
