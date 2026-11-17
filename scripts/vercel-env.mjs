#!/usr/bin/env node
/**
 * Envia as variáveis do .env.local para o ambiente de produção do projeto na
 * Vercel (a pasta precisa estar ligada ao projeto: .vercel/project.json).
 * Os valores vão pela entrada padrão do comando e nunca são exibidos.
 *
 * Uso: node scripts/vercel-env.mjs
 */
import { spawnSync } from "node:child_process";
import { loadEnv } from "./check-env.mjs";

const env = loadEnv();
// SUPABASE_DB_URL fica só na máquina: a aplicação não usa conexão direta ao banco.
const names = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "CRON_SECRET",
  "META_GRAPH_VERSION",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

let failed = false;
for (const name of names) {
  const value = env[name];
  if (!value) {
    console.log(`pulada  ${name} (vazia no .env.local)`);
    continue;
  }
  const sensitive = !name.startsWith("NEXT_PUBLIC_") && name !== "META_GRAPH_VERSION";
  const command = `npx --yes vercel@latest env add ${name} production ${sensitive ? "--sensitive " : ""}--force`;
  const result = spawnSync(command, { input: value, encoding: "utf8", shell: true, timeout: 120_000, env: { ...process.env, CI: "1" } });
  const ok = result.status === 0;
  if (!ok) failed = true;
  const reason = result.error?.code === "ETIMEDOUT" ? "tempo esgotado" : (result.stderr ?? "").split("\n").filter((line) => /error/i.test(line)).join(" ").slice(0, 200);
  console.log(`${ok ? "ok    " : "FALHOU"}  ${name}${ok ? "" : ` — ${reason}`}`);
}
process.exit(failed ? 1 : 0);
