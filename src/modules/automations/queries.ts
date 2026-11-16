import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionResult, Automation, RunStatus } from "./types";

const COLUMNS = "id, name, trigger_type, delay_minutes, stage_id, package_id, tag_id, actions, status, activated_at, created_at";

export type AutomationSummary = Automation & { runs: number; failures: number; last_run_at: string | null };

export async function listAutomations(supabase: SupabaseClient, orgId: string): Promise<AutomationSummary[]> {
  const { data, error } = await supabase.from("automations").select(COLUMNS).eq("organization_id", orgId).order("created_at", { ascending: false });
  if (error) throw error;
  const automations = (data ?? []) as Automation[];
  if (automations.length === 0) return [];

  // Execuções dos últimos 30 dias, agregadas por automação.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: runs, error: runError } = await supabase
    .from("automation_runs")
    .select("automation_id, status, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (runError) throw runError;
  const stats = new Map<string, { runs: number; failures: number; last: string | null }>();
  for (const run of runs ?? []) {
    const entry = stats.get(run.automation_id as string) ?? { runs: 0, failures: 0, last: null };
    entry.runs++;
    if (run.status === "failed" || run.status === "partial") entry.failures++;
    entry.last = entry.last ?? (run.created_at as string);
    stats.set(run.automation_id as string, entry);
  }
  return automations.map((a) => ({ ...a, runs: stats.get(a.id)?.runs ?? 0, failures: stats.get(a.id)?.failures ?? 0, last_run_at: stats.get(a.id)?.last ?? null }));
}

export async function getAutomation(supabase: SupabaseClient, orgId: string, id: string): Promise<Automation | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("automations").select(COLUMNS).eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Automation | null) ?? null;
}

export type AutomationRun = {
  id: string;
  status: RunStatus;
  results: ActionResult[];
  error: string | null;
  created_at: string;
  executed_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
};

export async function listRuns(supabase: SupabaseClient, orgId: string, automationId: string, limit = 100): Promise<AutomationRun[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select("id, status, results, error, created_at, executed_at, contact_id, contact:contacts (name)")
    .eq("organization_id", orgId)
    .eq("automation_id", automationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as RunStatus,
    results: Array.isArray(row.results) ? (row.results as ActionResult[]) : [],
    error: row.error as string | null,
    created_at: row.created_at as string,
    executed_at: row.executed_at as string | null,
    contact_id: row.contact_id as string | null,
    contact_name: (row.contact as unknown as { name: string } | null)?.name ?? null,
  }));
}
