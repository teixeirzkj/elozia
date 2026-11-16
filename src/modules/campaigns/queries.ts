import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Campaign, CampaignRecipient, RecipientStatus } from "./types";

const COLUMNS =
  "id, name, package_id, departure_id, audience_interest, audience_tag_ids, template_id, variables, scheduled_at, status, total_recipients, error, created_at, started_at, finished_at, package:packages (name), departure:package_departures (departs_on), template:whatsapp_templates (name)";

function mapCampaign(row: unknown): Campaign {
  const { package: pkg, departure, template, ...rest } = row as Omit<Campaign, "package_name" | "departure_date" | "template_name"> & {
    package: { name: string } | null;
    departure: { departs_on: string } | null;
    template: { name: string } | null;
  };
  return { ...rest, package_name: pkg?.name ?? null, departure_date: departure?.departs_on ?? null, template_name: template?.name ?? null };
}

export async function listCampaigns(supabase: SupabaseClient, orgId: string): Promise<Campaign[]> {
  const { data, error } = await supabase.from("campaigns").select(COLUMNS).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(mapCampaign);
}

export async function getCampaign(supabase: SupabaseClient, orgId: string, id: string): Promise<Campaign | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("campaigns").select(COLUMNS).eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapCampaign(data) : null;
}

export async function listRecipients(supabase: SupabaseClient, orgId: string, campaignId: string): Promise<CampaignRecipient[]> {
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id, contact_id, status, error, processed_at, contact:contacts (name), message:messages (status)")
    .eq("organization_id", orgId)
    .eq("campaign_id", campaignId)
    .order("processed_at", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    contact_id: row.contact_id as string,
    contact_name: (row.contact as unknown as { name: string } | null)?.name ?? "—",
    status: row.status as RecipientStatus,
    error: row.error as string | null,
    processed_at: row.processed_at as string | null,
    delivery: (row.message as unknown as { status: string } | null)?.status ?? null,
  }));
}

/** Contagem de destinatários por situação, para a lista de campanhas. */
export async function recipientCounts(supabase: SupabaseClient, orgId: string, campaignIds: string[]): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (campaignIds.length === 0) return out;
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("campaign_id, status")
    .eq("organization_id", orgId)
    .in("campaign_id", campaignIds)
    .limit(20000);
  if (error) throw error;
  for (const row of data ?? []) {
    const entry = out.get(row.campaign_id as string) ?? {};
    entry[row.status as string] = (entry[row.status as string] ?? 0) + 1;
    out.set(row.campaign_id as string, entry);
  }
  return out;
}
