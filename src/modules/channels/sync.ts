import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTemplates } from "@/lib/whatsapp/graph";
import { loadChannelAccess } from "@/lib/whatsapp/service";

/** Copia para o banco os templates da conta na Meta (todos os status) e remove os que deixaram de existir. */
export async function syncTemplates(admin: SupabaseClient, orgId: string, channelId: string): Promise<{ total: number; approved: number }> {
  const channel = await loadChannelAccess(admin, orgId, channelId);
  if (!channel) throw new Error("Canal não conectado.");
  const templates = await listTemplates(channel.token, channel.wabaId);
  const now = new Date().toISOString();

  const rows = templates
    .filter((t) => t.id && t.name && t.language)
    .map((t) => ({
      organization_id: orgId,
      channel_id: channelId,
      meta_id: String(t.id),
      name: t.name,
      language: t.language,
      category: (t.category ?? "UNKNOWN").toUpperCase(),
      status: (t.status ?? "UNKNOWN").toUpperCase(),
      components: t.components ?? [],
      synced_at: now,
    }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin.from("whatsapp_templates").upsert(rows.slice(i, i + 100), { onConflict: "channel_id,name,language" });
    if (error) throw error;
  }
  // O que não veio nesta sincronização não existe mais na Meta.
  const { error: delError } = await admin
    .from("whatsapp_templates")
    .delete()
    .eq("organization_id", orgId)
    .eq("channel_id", channelId)
    .lt("synced_at", now);
  if (delError && delError.code !== "23503") throw delError;

  await admin.from("whatsapp_channels").update({ templates_synced_at: now }).eq("id", channelId).eq("organization_id", orgId);
  return { total: rows.length, approved: rows.filter((r) => r.status === "APPROVED").length };
}
