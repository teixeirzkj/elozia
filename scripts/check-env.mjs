#!/usr/bin/env node
/**
 * Confere o .env.local SEM exibir nenhum valor: informa apenas se cada
 * variável está preenchida e no formato esperado.
 * Uso: node scripts/check-env.mjs
 */
import { readFileSync } from "node:fs";

export function loadEnv(file = ".env.local") {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

const isUrl = (value, protocols) => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const checks = {
  NEXT_PUBLIC_SUPABASE_URL: (v) => (isUrl(v, ["https:"]) && /\.supabase\.co\/?$/.test(v) ? null : "deve ser a Project URL, no formato https://xxxx.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: (v) => (/^(eyJ|sb_publishable_)/.test(v) && v.length > 30 ? null : "deve começar com eyJ ou sb_publishable_"),
  SUPABASE_SERVICE_ROLE_KEY: (v) => (/^(eyJ|sb_secret_)/.test(v) && v.length > 30 ? null : "deve começar com eyJ ou sb_secret_"),
  SUPABASE_DB_URL: (v) =>
    !isUrl(v, ["postgresql:", "postgres:"])
      ? "deve começar com postgresql://"
      : /\[YOUR-PASSWORD\]|\[SUA-SENHA\]/i.test(decodeURIComponent(v))
        ? "ainda contém [YOUR-PASSWORD]: troque pela senha do banco"
        : null,
  ENCRYPTION_KEY: (v) => (Buffer.from(v, "base64").length === 32 ? null : "deve ter 32 bytes em base64"),
  CRON_SECRET: (v) => (v.length >= 20 ? null : "muito curto"),
};

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("check-env.mjs")) {
  const env = loadEnv();
  let ok = true;
  for (const [name, check] of Object.entries(checks)) {
    const value = env[name] ?? "";
    const problem = value === "" || value === "COLE AQUI" ? "não preenchida" : check(value);
    if (problem) ok = false;
    console.log(`${problem ? "✗" : "✓"} ${name}${problem ? ` — ${problem}` : ""}`);
  }
  if (ok && env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_DB_URL) {
    // Confere se a URL do banco é do mesmo projeto da Project URL (sem exibir nada).
    const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const sameProject = decodeURIComponent(env.SUPABASE_DB_URL).includes(ref);
    console.log(`${sameProject ? "✓" : "✗"} URL do banco e Project URL são do mesmo projeto`);
    if (!sameProject) ok = false;
  }
  process.exit(ok ? 0 : 1);
}
