import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverSecret } from "@/lib/env";

let admin: SupabaseClient | undefined;

/**
 * Cliente com a chave service_role: IGNORA A RLS.
 * Uso restrito a webhook, cron e credenciais de canal. Toda consulta feita com
 * ele deve filtrar `organization_id` explicitamente.
 */
export function createAdminClient(): SupabaseClient {
  if (!admin) {
    admin = createSupabaseClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverSecret("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
