import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde para monitores externos. Não revela configuração:
 * responde apenas se a aplicação está de pé e se alcança o banco.
 */
export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ status: "unconfigured" }, { status: 503 });
  try {
    const env = publicEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    // Função pública que não devolve dados para um token inexistente: serve só como "ping".
    const { error } = await supabase.rpc("get_invitation", { p_token: "health-check" });
    if (error) return Response.json({ status: "degraded" }, { status: 503 });
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
