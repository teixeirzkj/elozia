import { z } from "zod";

/**
 * Variáveis de ambiente validadas sob demanda (não no import), para que o build
 * não dependa de segredos. Cada grupo falha com mensagem clara quando usado sem
 * configuração.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export class MissingConfigError extends Error {
  constructor(what: string) {
    super(`Configuração ausente ou inválida: ${what}. Consulte o arquivo .env.example.`);
    this.name = "MissingConfigError";
  }
}

export function publicEnv() {
  // Referências literais: o Next só injeta NEXT_PUBLIC_* no navegador assim.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) throw new MissingConfigError("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return parsed.data;
}

export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }).success;
}

/** Lê um segredo do servidor. Nunca chamar em código de cliente. */
export function serverSecret(
  name:
    | "SUPABASE_SERVICE_ROLE_KEY"
    | "ENCRYPTION_KEY"
    | "META_APP_SECRET"
    | "META_WEBHOOK_VERIFY_TOKEN"
    | "CRON_SECRET",
): string {
  if (typeof window !== "undefined") throw new Error("Segredo de servidor acessado no navegador.");
  const value = process.env[name];
  if (!value) throw new MissingConfigError(name);
  return value;
}

export function optionalServerSecret(name: Parameters<typeof serverSecret>[0]): string | null {
  if (typeof window !== "undefined") return null;
  return process.env[name] || null;
}

/** Versão da Graph API da Meta. Fixada por ambiente para atualização controlada. */
export function metaGraphVersion(): string {
  const value = process.env.META_GRAPH_VERSION;
  if (!value || !/^v\d+\.\d+$/.test(value)) throw new MissingConfigError("META_GRAPH_VERSION (ex.: v24.0)");
  return value;
}
