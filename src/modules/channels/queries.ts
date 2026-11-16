import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeTemplate, type TemplateSpec } from "@/lib/whatsapp/templates";

export type Channel = {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: "connected" | "error" | "disconnected";
  uses_own_app: boolean;
  last_error: string | null;
  last_webhook_at: string | null;
  templates_synced_at: string | null;
};

export type Template = {
  id: string;
  channel_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  spec: TemplateSpec;
};

export async function listChannels(supabase: SupabaseClient, orgId: string): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("id, waba_id, phone_number_id, display_phone, verified_name, quality_rating, status, uses_own_app, last_error, last_webhook_at, templates_synced_at")
    .eq("organization_id", orgId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Channel[];
}

export async function listTemplates(supabase: SupabaseClient, orgId: string, options: { approvedOnly?: boolean; channelId?: string } = {}): Promise<Template[]> {
  let query = supabase.from("whatsapp_templates").select("id, channel_id, name, language, category, status, components").eq("organization_id", orgId);
  if (options.approvedOnly) query = query.eq("status", "APPROVED");
  if (options.channelId) query = query.eq("channel_id", options.channelId);
  const { data, error } = await query.order("name").limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    channel_id: row.channel_id as string,
    name: row.name as string,
    language: row.language as string,
    category: row.category as string,
    status: row.status as string,
    spec: describeTemplate(row.components),
  }));
}

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
  IN_APPEAL: "Em recurso",
  ARCHIVED: "Arquivado",
  LIMIT_EXCEEDED: "Limite excedido",
  PENDING_DELETION: "Exclusão pendente",
  DELETED: "Excluído",
};

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
  FREE_SERVICE: "Serviço",
};
