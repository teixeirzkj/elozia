import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Cliente do servidor com a sessão do usuário (cookies). Sujeito à RLS. */
export async function createClient(): Promise<SupabaseClient> {
  // cookies() primeiro: marca a rota como dinâmica antes de qualquer outra coisa.
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Em Server Components os cookies são somente leitura; o proxy renova a sessão.
        }
      },
    },
  });
}
