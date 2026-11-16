import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Contact, ContactEvent, Tag, Task } from "@/modules/crm/types";
import { CONTACT_SOURCE_VALUES } from "@/modules/crm/types";
import type { ContactFilters } from "./schemas";

export const CONTACTS_PAGE_SIZE = 25;

const CONTACT_COLUMNS =
  "id, name, phone_e164, email, notes, source, owner_id, marketing_consent, consent_at, consent_source, opted_out_at, is_demo, created_at";

type RawContact = Omit<Contact, "tags"> & { tags?: Array<{ tag: Tag | null }> };

function mapContact(row: RawContact): Contact {
  const { tags, ...rest } = row;
  return {
    ...rest,
    tags: (tags ?? [])
      .map((t) => t.tag)
      .filter((t): t is Tag => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

/** Remove caracteres com significado na sintaxe de filtro do PostgREST. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\"':]/g, " ").trim().slice(0, 80);
}

const uuid = z.uuid();

export async function listContacts(
  supabase: SupabaseClient,
  orgId: string,
  filters: ContactFilters,
): Promise<{ contacts: Contact[]; total: number; page: number }> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const tagFilter = filters.tag && uuid.safeParse(filters.tag).success ? filters.tag : null;

  let query = supabase
    .from("contacts")
    .select(
      `${CONTACT_COLUMNS}, tags:contact_tags (tag:tags (id, name, color))${tagFilter ? ", tag_filter:contact_tags!inner (tag_id)" : ""}`,
      { count: "exact" },
    )
    .eq("organization_id", orgId);

  if (tagFilter) query = query.eq("tag_filter.tag_id", tagFilter);
  if (filters.owner === "nenhum") query = query.is("owner_id", null);
  else if (filters.owner && uuid.safeParse(filters.owner).success) query = query.eq("owner_id", filters.owner);
  if (filters.source && (CONTACT_SOURCE_VALUES as string[]).includes(filters.source)) query = query.eq("source", filters.source);
  if (filters.consent && ["unknown", "granted", "revoked"].includes(filters.consent)) {
    query = query.eq("marketing_consent", filters.consent);
  }
  const q = filters.q ? sanitizeSearch(filters.q) : "";
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone_e164.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }

  const from = (page - 1) * CONTACTS_PAGE_SIZE;
  const { data, error, count } = await query.order("name").range(from, from + CONTACTS_PAGE_SIZE - 1);
  if (error) throw error;
  return { contacts: ((data ?? []) as unknown as RawContact[]).map(mapContact), total: count ?? 0, page };
}

export async function getContact(supabase: SupabaseClient, orgId: string, id: string): Promise<Contact | null> {
  if (!uuid.safeParse(id).success) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select(`${CONTACT_COLUMNS}, tags:contact_tags (tag:tags (id, name, color))`)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapContact(data as unknown as RawContact) : null;
}

export async function listContactEvents(supabase: SupabaseClient, orgId: string, contactId: string): Promise<ContactEvent[]> {
  const { data, error } = await supabase
    .from("contact_events")
    .select("id, type, body, created_at, actor:profiles (full_name)")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    body: row.body as string | null,
    created_at: row.created_at as string,
    actor_name: (row.actor as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
}

export async function listTags(supabase: SupabaseClient, orgId: string): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("id, name, color").eq("organization_id", orgId).order("name");
  if (error) throw error;
  return (data ?? []) as Tag[];
}

type TaskFilter = { contactId?: string; opportunityId?: string; assigneeId?: string; onlyOpen?: boolean; limit?: number };

export async function listTasks(supabase: SupabaseClient, orgId: string, filter: TaskFilter): Promise<Task[]> {
  let query = supabase
    .from("tasks")
    .select("id, title, notes, due_at, assignee_id, contact_id, opportunity_id, done_at, origin, contact:contacts (name)")
    .eq("organization_id", orgId);
  if (filter.contactId) query = query.eq("contact_id", filter.contactId);
  if (filter.opportunityId) query = query.eq("opportunity_id", filter.opportunityId);
  if (filter.assigneeId) query = query.eq("assignee_id", filter.assigneeId);
  if (filter.onlyOpen) query = query.is("done_at", null);
  const { data, error } = await query
    .order("done_at", { ascending: true, nullsFirst: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(filter.limit ?? 50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    notes: row.notes as string | null,
    due_at: row.due_at as string | null,
    assignee_id: row.assignee_id as string | null,
    assignee_name: null,
    contact_id: row.contact_id as string | null,
    contact_name: (row.contact as unknown as { name: string } | null)?.name ?? null,
    opportunity_id: row.opportunity_id as string | null,
    done_at: row.done_at as string | null,
    origin: row.origin as Task["origin"],
  }));
}
