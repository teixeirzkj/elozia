import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sanitizeSearch } from "@/modules/contacts/queries";
import type { Tag } from "@/modules/crm/types";

const uuid = z.uuid();

export type ConversationStatus = "pending" | "open" | "closed";
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = { pending: "Pendente", open: "Em atendimento", closed: "Concluída" };

export type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  assignee_id: string | null;
  team_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
};

export type InboxFilters = { tab: "pendentes" | "minhas" | "todas"; q?: string; status?: string; assignee?: string; tag?: string };

export async function listConversations(supabase: SupabaseClient, orgId: string, userId: string, filters: InboxFilters): Promise<ConversationListItem[]> {
  const tag = filters.tag && uuid.safeParse(filters.tag).success ? filters.tag : null;
  let query = supabase
    .from("conversations")
    .select(
      `id, status, assignee_id, team_id, last_message_at, last_message_preview, unread_count, contact_id, contact:contacts!inner (name, phone_e164${tag ? ", contact_tags!inner (tag_id)" : ""})`,
    )
    .eq("organization_id", orgId);

  if (filters.tab === "pendentes") query = query.eq("status", "pending");
  else if (filters.tab === "minhas") query = query.eq("assignee_id", userId).neq("status", "closed");

  if (filters.status && ["pending", "open", "closed"].includes(filters.status)) query = query.eq("status", filters.status);
  if (filters.assignee === "nenhum") query = query.is("assignee_id", null);
  else if (filters.assignee && uuid.safeParse(filters.assignee).success) query = query.eq("assignee_id", filters.assignee);
  if (tag) query = query.eq("contact.contact_tags.tag_id", tag);

  const q = filters.q ? sanitizeSearch(filters.q) : "";
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`name.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone_e164.ilike.%${digits}%`);
    query = query.or(parts.join(","), { referencedTable: "contact" });
  }

  const { data, error } = await query.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const contact = row.contact as unknown as { name: string; phone_e164: string | null };
    return {
      id: row.id as string,
      status: row.status as ConversationStatus,
      assignee_id: row.assignee_id as string | null,
      team_id: row.team_id as string | null,
      last_message_at: row.last_message_at as string | null,
      last_message_preview: row.last_message_preview as string | null,
      unread_count: row.unread_count as number,
      contact_id: row.contact_id as string,
      contact_name: contact.name,
      contact_phone: contact.phone_e164,
    };
  });
}

export async function countPending(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { count } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending");
  return count ?? 0;
}

export type ConversationDetail = {
  id: string;
  status: ConversationStatus;
  assignee_id: string | null;
  team_id: string | null;
  channel_id: string;
  channel_status: string;
  channel_phone: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  contact: {
    id: string;
    name: string;
    phone_e164: string | null;
    email: string | null;
    marketing_consent: "unknown" | "granted" | "revoked";
    owner_id: string | null;
    is_demo: boolean;
    tags: Tag[];
  };
};

export async function getConversation(supabase: SupabaseClient, orgId: string, id: string | undefined): Promise<ConversationDetail | null> {
  if (!id || !uuid.safeParse(id).success) return null;
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, status, assignee_id, team_id, channel_id, last_inbound_at, unread_count, channel:whatsapp_channels (status, display_phone), contact:contacts (id, name, phone_e164, email, marketing_consent, owner_id, is_demo, tags:contact_tags (tag:tags (id, name, color)))",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const channel = data.channel as unknown as { status: string; display_phone: string | null } | null;
  const contact = data.contact as unknown as Omit<ConversationDetail["contact"], "tags"> & { tags: Array<{ tag: Tag | null }> };
  return {
    id: data.id as string,
    status: data.status as ConversationStatus,
    assignee_id: data.assignee_id as string | null,
    team_id: data.team_id as string | null,
    channel_id: data.channel_id as string,
    channel_status: channel?.status ?? "disconnected",
    channel_phone: channel?.display_phone ?? null,
    last_inbound_at: data.last_inbound_at as string | null,
    unread_count: data.unread_count as number,
    contact: { ...contact, tags: (contact.tags ?? []).map((t) => t.tag).filter((t): t is Tag => t !== null) },
  };
}

export type Message = {
  id: string;
  direction: "in" | "out";
  type: "text" | "image" | "audio" | "document" | "video" | "template" | "note" | "unsupported";
  body: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_status: "pending" | "stored" | "failed" | null;
  status: "received" | "queued" | "sent" | "delivered" | "read" | "failed" | "note";
  error_message: string | null;
  template_name: string | null;
  origin: "manual" | "automation" | "campaign";
  sender_name: string | null;
  created_at: string;
};

export const MESSAGES_PAGE = 100;

/** As `limit` mensagens mais recentes, em ordem cronológica, e se há mais antigas. */
export async function listMessages(supabase: SupabaseClient, orgId: string, conversationId: string, limit: number): Promise<{ messages: Message[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, type, body, media_path, media_mime, media_name, media_status, status, error_message, template_name, origin, created_at, sender:profiles (full_name)")
    .eq("organization_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const messages = rows
    .slice(0, limit)
    .reverse()
    .map((row) => {
      const { sender, ...rest } = row as unknown as Omit<Message, "sender_name"> & { sender: { full_name: string } | null };
      return { ...rest, sender_name: sender?.full_name ?? null };
    });
  return { messages, hasMore: rows.length > limit };
}

export type ConversationEvent = { id: number; type: string; created_at: string; actor_name: string | null; metadata: Record<string, unknown> };

export async function listConversationEvents(supabase: SupabaseClient, orgId: string, conversationId: string): Promise<ConversationEvent[]> {
  const { data, error } = await supabase
    .from("conversation_events")
    .select("id, type, created_at, metadata, actor:profiles (full_name)")
    .eq("organization_id", orgId)
    .eq("conversation_id", conversationId)
    .neq("type", "first_response")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as number,
    type: row.type as string,
    created_at: row.created_at as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    actor_name: (row.actor as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
}
