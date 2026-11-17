import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";
import { Button, buttonClass, LinkButton } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireCapabilityPage } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/utils";
import { listPackageOptions } from "@/modules/catalog/queries";
import { csvValue, formatDuration, percent, REPORT_KEYS, REPORTS, resolvePeriod, type Column, type ReportKey } from "@/modules/reports/definitions";
import { getReport, parseFilters } from "@/modules/reports/queries";
import { listActiveMembers } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Relatórios" };

type Search = { de?: string; ate?: string; atendente?: string; pacote?: string };
type Row = Record<string, unknown>;

function cell(column: Column, row: Row): string {
  const value = row[column.key];
  if (column.kind === "money") return formatMoney(Number(value ?? 0));
  if (column.kind === "duration") return formatDuration(value == null ? null : Number(value));
  if (column.csv) return String(column.csv(row) ?? "—");
  return value == null || value === "" ? "—" : String(value);
}

/** Barra proporcional ao maior valor da coluna, sempre acompanhada do número. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-10 text-right tabular-nums">{value}</span>
      <span className="h-2 w-24 rounded-full bg-muted" aria-hidden="true">
        <span className="block h-2 rounded-full bg-ink" style={{ width: `${max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0}%` }} />
      </span>
    </span>
  );
}

const BAR_COLUMN: Partial<Record<ReportKey, string>> = { funnel: "entered", sources: "leads", lost: "lost", packages: "bookings", attendance: "messages_sent" };

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, membership } = await requireCapabilityPage("reports.view");
  const orgId = membership.organization.id;
  const period = resolvePeriod(params.de, params.ate, membership.organization.timezone);
  const filters = parseFilters(params.atendente, params.pacote);

  const [members, packages, ...reports] = await Promise.all([
    listActiveMembers(supabase, orgId),
    listPackageOptions(supabase, orgId),
    ...REPORT_KEYS.map((key) => getReport(supabase, key, period, filters)),
  ]);
  const data = Object.fromEntries(REPORT_KEYS.map((key, index) => [key, reports[index] as Row[]])) as Record<ReportKey, Row[]>;

  const exportHref = (key: ReportKey) => {
    const query = new URLSearchParams({ relatorio: key, de: period.fromDate, ate: period.toDate });
    if (filters.owner) query.set("atendente", filters.owner);
    if (filters.packageId) query.set("pacote", filters.packageId);
    return `/api/relatorios/exportar?${query.toString()}`;
  };

  const firstStage = data.funnel[0];
  const firstEntered = Number(firstStage?.entered ?? 0);

  return (
    <>
      <PageHeader title="Relatórios" description={`Período de ${formatDate(period.fromDate)} a ${formatDate(period.toDate)}, no fuso da agência.`} />

      <Card className="mb-6">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto]">
          <div className="space-y-1.5">
            <label htmlFor="rel-de" className="block text-label font-semibold">
              De
            </label>
            <input id="rel-de" type="date" name="de" defaultValue={period.fromDate} className="elz-field" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rel-ate" className="block text-label font-semibold">
              Até
            </label>
            <input id="rel-ate" type="date" name="ate" defaultValue={period.toDate} className="elz-field" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rel-atendente" className="block text-label font-semibold">
              Atendente
            </label>
            <select id="rel-atendente" name="atendente" defaultValue={filters.owner ?? ""} className="elz-field">
              <option value="">Todos</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rel-pacote" className="block text-label font-semibold">
              Viagem
            </label>
            <select id="rel-pacote" name="pacote" defaultValue={filters.packageId ?? ""} className="elz-field">
              <option value="">Todas</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit">Aplicar</Button>
            {params.de || params.ate || filters.owner || filters.packageId ? (
              <LinkButton href="/relatorios" variant="ghost">
                Limpar
              </LinkButton>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="space-y-6">
        {REPORT_KEYS.map((key) => {
          const report = REPORTS[key];
          const rows = data[key];
          const barKey = BAR_COLUMN[key];
          const max = barKey ? Math.max(0, ...rows.map((r) => Number(r[barKey] ?? 0))) : 0;
          return (
            <Card key={key} className="overflow-hidden">
              <CardHeader
                title={report.title}
                description={report.description}
                action={
                  rows.length > 0 ? (
                    // Link comum (não o roteador): a resposta é um arquivo para baixar.
                    <a href={exportHref(key)} className={buttonClass("secondary", "sm")} download>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Exportar CSV
                    </a>
                  ) : null
                }
              />
              {rows.length === 0 ? (
                <EmptyState icon={BarChart3} title="Sem dados neste período" description="Nenhum registro atende aos filtros escolhidos." className="py-8" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="elz-table">
                    <thead>
                      <tr>
                        {report.columns.map((column) => (
                          <th key={column.key} scope="col">
                            {column.label}
                          </th>
                        ))}
                        {key === "funnel" ? <th scope="col">Em relação à primeira etapa</th> : null}
                        {key === "sources" ? <th scope="col">Viraram venda</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={index}>
                          {report.columns.map((column: Column, columnIndex) => (
                            <td key={column.key} className={columnIndex === 0 ? "font-medium" : "whitespace-nowrap"}>
                              {column.key === barKey ? <Bar value={Number(csvValue(column, row) ?? 0)} max={max} /> : cell(column, row)}
                            </td>
                          ))}
                          {key === "funnel" ? <td className="whitespace-nowrap">{row.kind === "open" && index > 0 ? percent(Number(row.entered), firstEntered) : "—"}</td> : null}
                          {key === "sources" ? <td className="whitespace-nowrap">{percent(Number(row.with_sale), Number(row.leads))}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
