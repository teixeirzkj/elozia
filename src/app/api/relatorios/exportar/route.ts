import type { NextRequest } from "next/server";
import { authorize } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/session-errors";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv } from "@/lib/utils";
import { csvHeader, csvValue, REPORT_KEYS, REPORTS, resolvePeriod, type ReportKey } from "@/modules/reports/definitions";
import { getReport, parseFilters } from "@/modules/reports/queries";

export const dynamic = "force-dynamic";

/**
 * Exportação CSV de um relatório. Só gestores; a permissão é conferida aqui e
 * de novo dentro das funções do banco. Cada exportação fica registrada na auditoria.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const key = params.get("relatorio") as ReportKey | null;
  if (!key || !REPORT_KEYS.includes(key)) return new Response("Relatório inválido.", { status: 400 });

  try {
    const { supabase, membership, user } = await authorize("reports.view");
    const orgId = membership.organization.id;
    if (!(await rateLimit("export", user.id))) return new Response("Muitas exportações em pouco tempo. Aguarde alguns minutos.", { status: 429 });

    const period = resolvePeriod(params.get("de") ?? undefined, params.get("ate") ?? undefined, membership.organization.timezone);
    const filters = parseFilters(params.get("atendente"), params.get("pacote"));
    const rows = await getReport(supabase, key, period, filters);
    const columns = REPORTS[key].columns;
    const csv = toCsv(
      columns.map(csvHeader),
      rows.map((row) => columns.map((column) => csvValue(column, row))),
    );

    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: user.id,
      action: "report.exported",
      entity: "report",
      entity_id: key,
      metadata: { from: period.fromDate, to: period.toDate, rows: rows.length, filtered: Boolean(filters.owner || filters.packageId) },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="elozia-${key}-${period.fromDate}-a-${period.toDate}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(error.message, { status: 403 });
    console.error("[export]", (error as { code?: unknown }).code ?? null);
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }
}
