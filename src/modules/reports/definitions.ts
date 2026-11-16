import { utcToZonedParts, zonedToUtc } from "@/lib/utils";
import { CAMPAIGN_STATUS_LABELS } from "@/modules/campaigns/types";
import { CONTACT_SOURCES, STAGE_KIND_LABELS } from "@/modules/crm/types";
import { TRIGGERS } from "@/modules/automations/types";

/** Período, colunas e formatação dos relatórios (tela e exportação CSV usam as mesmas definições). */

export type Period = { from: string; to: string; fromDate: string; toDate: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Intervalo [de 00:00, até 24:00) no fuso da agência. Sem datas válidas,
 * usa os últimos 30 dias. Limitado a 366 dias.
 */
export function resolvePeriod(de: string | undefined, ate: string | undefined, timeZone: string, now = new Date()): Period {
  const today = utcToZonedParts(now.toISOString(), timeZone).date;
  const shift = (date: string, days: number) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
  };
  let toDate = ate && DATE.test(ate) ? ate : today;
  let fromDate = de && DATE.test(de) ? de : shift(toDate, -29);
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  if (shift(fromDate, 366) < toDate) fromDate = shift(toDate, -366);
  return {
    fromDate,
    toDate,
    from: zonedToUtc(fromDate, "00:00", timeZone).toISOString(),
    to: zonedToUtc(shift(toDate, 1), "00:00", timeZone).toISOString(),
  };
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

const money = (cents: unknown) => (Number(cents) / 100).toFixed(2).replace(".", ",");

type Row = Record<string, unknown>;
export type Column = { key: string; label: string; kind?: "money" | "duration" | "number" | "text"; csv?: (row: Row) => unknown };

export const REPORTS = {
  sales: {
    title: "Desempenho comercial",
    description: "Oportunidades criadas, ganhas e perdidas no período, por responsável.",
    columns: [
      { key: "owner_name", label: "Responsável" },
      { key: "created", label: "Oportunidades criadas", kind: "number" },
      { key: "proposals_sent", label: "Propostas enviadas", kind: "number" },
      { key: "won", label: "Ganhas", kind: "number" },
      { key: "lost", label: "Perdidas", kind: "number" },
      { key: "open_now", label: "Abertas hoje", kind: "number" },
      { key: "won_value_cents", label: "Valor estimado ganho (R$)", kind: "money" },
    ],
  },
  funnel: {
    title: "Conversão por etapa do funil",
    description: "Quantas oportunidades entraram em cada etapa no período e quantas estão nela hoje.",
    columns: [
      { key: "name", label: "Etapa" },
      { key: "kind", label: "Tipo", csv: (r) => STAGE_KIND_LABELS[r.kind as keyof typeof STAGE_KIND_LABELS] ?? r.kind },
      { key: "entered", label: "Entraram no período", kind: "number" },
      { key: "current_count", label: "Na etapa hoje", kind: "number" },
      { key: "current_value_cents", label: "Valor na etapa hoje (R$)", kind: "money" },
    ],
  },
  packages: {
    title: "Vendas por pacote",
    description: "Oportunidades e reservas confirmadas no período, por pacote.",
    columns: [
      { key: "package_name", label: "Pacote" },
      { key: "destination", label: "Destino" },
      { key: "opportunities", label: "Oportunidades criadas", kind: "number" },
      { key: "won", label: "Oportunidades ganhas", kind: "number" },
      { key: "bookings", label: "Reservas confirmadas", kind: "number" },
      { key: "travelers", label: "Viajantes", kind: "number" },
      { key: "revenue_cents", label: "Valor das reservas (R$)", kind: "money" },
    ],
  },
  sources: {
    title: "Origem dos leads",
    description: "Contatos cadastrados no período por origem, e quantos viraram oportunidade e venda.",
    columns: [
      { key: "source", label: "Origem", csv: (r) => CONTACT_SOURCES[r.source as keyof typeof CONTACT_SOURCES] ?? r.source },
      { key: "leads", label: "Leads", kind: "number" },
      { key: "with_opportunity", label: "Com oportunidade", kind: "number" },
      { key: "with_sale", label: "Com venda", kind: "number" },
    ],
  },
  attendance: {
    title: "Atendimentos por usuário",
    description: "Conversas assumidas e concluídas, mensagens enviadas e tempo médio de primeira resposta.",
    columns: [
      { key: "user_name", label: "Usuário" },
      { key: "assumed", label: "Conversas assumidas", kind: "number" },
      { key: "closed", label: "Conversas concluídas", kind: "number" },
      { key: "messages_sent", label: "Mensagens enviadas", kind: "number" },
      { key: "first_response_avg_seconds", label: "Primeira resposta (média)", kind: "duration" },
      { key: "open_now", label: "Em atendimento hoje", kind: "number" },
    ],
  },
  campaigns: {
    title: "Campanhas",
    description: "Campanhas iniciadas no período e o resultado dos envios.",
    columns: [
      { key: "name", label: "Campanha" },
      { key: "package_name", label: "Pacote" },
      { key: "status", label: "Situação", csv: (r) => CAMPAIGN_STATUS_LABELS[r.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? r.status },
      { key: "total_recipients", label: "Destinatários", kind: "number" },
      { key: "sent", label: "Enviadas", kind: "number" },
      { key: "delivered", label: "Entregues", kind: "number" },
      { key: "read", label: "Lidas", kind: "number" },
      { key: "failed", label: "Falhas", kind: "number" },
      { key: "not_sent", label: "Não enviadas", kind: "number" },
    ],
  },
  automations: {
    title: "Follow-ups automáticos",
    description: "Execuções de cada automação no período.",
    columns: [
      { key: "name", label: "Automação" },
      { key: "trigger_type", label: "Gatilho", csv: (r) => TRIGGERS[r.trigger_type as keyof typeof TRIGGERS]?.label ?? r.trigger_type },
      { key: "status", label: "Situação", csv: (r) => (r.status === "active" ? "Ativa" : "Pausada") },
      { key: "runs", label: "Execuções", kind: "number" },
      { key: "success", label: "Concluídas", kind: "number" },
      { key: "failed", label: "Com falha", kind: "number" },
      { key: "not_run", label: "Ignoradas ou canceladas", kind: "number" },
    ],
  },
  lost: {
    title: "Oportunidades perdidas",
    description: "Perdas no período, agrupadas pelo motivo informado.",
    columns: [
      { key: "reason", label: "Motivo" },
      { key: "lost", label: "Oportunidades", kind: "number" },
      { key: "value_cents", label: "Valor estimado (R$)", kind: "money" },
    ],
  },
} as const satisfies Record<string, { title: string; description: string; columns: readonly Column[] }>;

export type ReportKey = keyof typeof REPORTS;
export const REPORT_KEYS = Object.keys(REPORTS) as ReportKey[];

/** Valor de uma célula para o CSV (sem formatação visual). */
export function csvValue(column: Column, row: Row): unknown {
  if (column.csv) return column.csv(row);
  const value = row[column.key];
  if (column.kind === "money") return money(value ?? 0);
  if (column.kind === "duration") return value == null ? "" : Math.round(Number(value));
  return value ?? "";
}

export function csvHeader(column: Column): string {
  return column.kind === "duration" ? `${column.label} em segundos` : column.label;
}
