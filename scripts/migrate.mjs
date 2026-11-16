#!/usr/bin/env node
/**
 * Aplica as migrations de supabase/migrations no banco apontado por
 * SUPABASE_DB_URL (.env.local), em ordem, cada uma em uma transação.
 * O que já foi aplicado fica registrado em app.schema_migrations e é pulado.
 *
 * Uso: node scripts/migrate.mjs            aplica o que falta
 *      node scripts/migrate.mjs --status   só lista a situação
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadEnv } from "./check-env.mjs";

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL não definida no .env.local.");
  process.exit(1);
}
const statusOnly = process.argv.includes("--status");
const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (error) {
  // Nunca imprime a URL: ela contém a senha.
  console.error("Não foi possível conectar ao banco:", error.code ?? error.message?.replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
}

try {
  await client.query("create schema if not exists app");
  await client.query(
    "create table if not exists app.schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select name, checksum from app.schema_migrations");
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      const changed = applied.get(file) !== checksum;
      console.log(`  já aplicada  ${file}${changed ? "  (ATENÇÃO: o arquivo mudou depois de aplicado)" : ""}`);
      continue;
    }
    if (statusOnly) {
      console.log(`  pendente     ${file}`);
      continue;
    }
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into app.schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
      await client.query("commit");
      console.log(`  aplicada     ${file}`);
    } catch (error) {
      await client.query("rollback");
      console.error(`  FALHOU       ${file}: ${error.message}${error.where ? `\n               ${String(error.where).split("\n")[0]}` : ""}`);
      process.exitCode = 1;
      break;
    }
  }

  if (!statusOnly && !process.exitCode) {
    const check = await client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    const total = await client.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
    console.log(`\n${total.rows[0].n} tabelas no esquema public; sem RLS: ${check.rows.length === 0 ? "nenhuma" : check.rows.map((r) => r.relname).join(", ")}`);
  }
} finally {
  await client.end();
}
