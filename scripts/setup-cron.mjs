#!/usr/bin/env node
/**
 * Agenda no Supabase (pg_cron + pg_net) a chamada do agendador da Elozia a
 * cada minuto. Use quando o plano da Vercel não permite cron por minuto.
 * O CRON_SECRET fica gravado na definição do job, dentro do banco (esquema
 * `cron`, inacessível pela API pública).
 *
 * Uso: node scripts/setup-cron.mjs https://seu-dominio      agenda (ou atualiza)
 *      node scripts/setup-cron.mjs --status                  mostra as últimas execuções
 *      node scripts/setup-cron.mjs --remove                  remove o agendamento
 */
import pg from "pg";
import { loadEnv } from "./check-env.mjs";

const env = { ...loadEnv(), ...process.env };
const arg = process.argv[2];
if (!env.SUPABASE_DB_URL || !env.CRON_SECRET || !arg) {
  console.error("Informe a URL do site (ou --status / --remove) e confira SUPABASE_DB_URL e CRON_SECRET no .env.local.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (arg === "--remove") {
    await client.query("select cron.unschedule('elozia-tick')");
    console.log("Agendamento removido.");
  } else if (arg === "--status") {
    const job = await client.query("select schedule, active from cron.job where jobname = 'elozia-tick'");
    console.log(job.rows[0] ? `Agendado: ${job.rows[0].schedule} (ativo: ${job.rows[0].active})` : "Não agendado.");
    const runs = await client.query(
      `select r.id, r.status_code, r.created from net._http_response r order by r.created desc limit 5`,
    );
    for (const run of runs.rows) console.log(`  resposta ${run.status_code ?? "sem resposta"} em ${new Date(run.created).toISOString()}`);
  } else {
    const site = new URL(arg);
    if (site.protocol !== "https:") throw new Error("Use uma URL https.");
    const url = `${site.origin}/api/cron/tick`;
    await client.query("create extension if not exists pg_cron");
    await client.query("create extension if not exists pg_net");
    // format() com %L monta os literais com escape correto; o segredo não é exibido.
    const { rows } = await client.query(
      `select format(
         'select net.http_get(url := %L, headers := jsonb_build_object(''Authorization'', %L), timeout_milliseconds := 55000)',
         $1::text, $2::text) as command`,
      [url, `Bearer ${env.CRON_SECRET}`],
    );
    await client.query("select cron.schedule('elozia-tick', '* * * * *', $1)", [rows[0].command]);
    console.log(`Agendado: a cada minuto → ${url}`);
  }
} catch (error) {
  console.error("Falhou:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
