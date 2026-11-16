import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { optionalServerSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTick } from "@/modules/automations/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tique do agendador, chamado a cada minuto pelo Vercel Cron (ou por pg_cron).
 * Exige `Authorization: Bearer <CRON_SECRET>`. Não depende de timers do
 * servidor: tudo o que está agendado vive na tabela `jobs`.
 */
export async function GET(request: NextRequest) {
  const secret = optionalServerSecret("CRON_SECRET");
  if (!secret) return Response.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) return Response.json({ error: "Não autorizado" }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ error: "Serviço não configurado" }, { status: 503 });
  }
  try {
    const summary = await runTick(admin, { workerId: `cron-${randomUUID()}`, budgetMs: 45_000 });
    // Uma vez por hora, remove registros técnicos com mais de 30 dias.
    if (new Date().getUTCMinutes() === 0) await admin.rpc("purge_technical_logs");
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron] tique falhou", (error as { code?: unknown }).code ?? null);
    return Response.json({ ok: false }, { status: 500 });
  }
}
