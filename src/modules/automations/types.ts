import { z } from "zod";
import { optUuid, reqText } from "@/lib/action";
import { TEMPLATE_VARIABLE_SOURCES, type TemplateVariableSource } from "@/lib/whatsapp/templates";

/** Definições compartilhadas das automações (formulário, servidor e motor). */

export const TRIGGERS = {
  new_lead_unattended: {
    label: "Novo lead sem atendimento",
    description: "Uma conversa recebida no WhatsApp ficou sem primeira resposta.",
    interval: "sem resposta da equipe",
    conditions: ["tag"],
  },
  proposal_no_response: {
    label: "Proposta enviada sem resposta",
    description: "Uma proposta foi marcada como enviada e o cliente não escreveu desde então.",
    interval: "depois do envio da proposta",
    conditions: ["package", "tag"],
  },
  opportunity_stalled: {
    label: "Oportunidade parada no funil",
    description: "Uma oportunidade aberta ficou na mesma etapa.",
    interval: "na mesma etapa",
    conditions: ["stage", "package", "tag"],
  },
  payment_pending: {
    label: "Pagamento pendente",
    description: "Uma reserva continua com pagamento pendente ou parcial.",
    interval: "depois de registrada a reserva",
    conditions: ["package", "tag"],
  },
  departure_upcoming: {
    label: "Viagem próxima da data de saída",
    description: "Uma reserva tem a saída se aproximando.",
    interval: "antes da saída (contado a partir das 9h do dia da saída)",
    conditions: ["package", "tag"],
  },
  post_trip: {
    label: "Mensagem de pós-viagem",
    description: "Uma reserva confirmada teve a viagem concluída.",
    interval: "depois do retorno (contado a partir das 9h do dia do retorno)",
    conditions: ["package", "tag"],
  },
} as const;

export type TriggerType = keyof typeof TRIGGERS;
export const TRIGGER_VALUES = Object.keys(TRIGGERS) as [TriggerType, ...TriggerType[]];

export const DELAY_UNITS = { minutes: { label: "minutos", minutes: 1 }, hours: { label: "horas", minutes: 60 }, days: { label: "dias", minutes: 1440 } } as const;
export type DelayUnit = keyof typeof DELAY_UNITS;

export function splitDelay(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

export function describeDelay(minutes: number): string {
  const { value, unit } = splitDelay(minutes);
  const label = DELAY_UNITS[unit].label;
  return `${value} ${value === 1 ? label.replace(/s$/, "") : label}`;
}

const variableSources = Object.keys(TEMPLATE_VARIABLE_SOURCES) as [TemplateVariableSource, ...TemplateVariableSource[]];
export const variablesSchema = z.record(
  z.string().regex(/^(body|header)_[A-Za-z0-9_]{1,40}$/),
  z.object({ source: z.enum(variableSources), value: z.string().trim().max(200).optional() }),
);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: reqText(200, "Título da tarefa"),
    due_in_hours: z.coerce.number("Prazo inválido.").int().min(0).max(720),
    assignee_id: optUuid,
  }),
  z.object({ type: z.literal("change_owner"), owner_id: z.uuid("Selecione o novo responsável.") }),
  z.object({ type: z.literal("add_tag"), tag_id: z.uuid("Selecione a etiqueta.") }),
  z.object({ type: z.literal("move_opportunity"), stage_id: z.uuid("Selecione a etapa.") }),
  z.object({ type: z.literal("send_template"), template_id: z.uuid("Selecione o template."), variables: variablesSchema }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  create_task: "Criar tarefa",
  change_owner: "Alterar responsável",
  add_tag: "Adicionar etiqueta",
  move_opportunity: "Mover oportunidade",
  send_template: "Enviar template aprovado",
};

export const automationSchema = z
  .object({
    name: reqText(120, "Nome"),
    trigger_type: z.enum(TRIGGER_VALUES, "Selecione o gatilho."),
    delay_value: z.coerce.number("Informe o intervalo.").int("Use um número inteiro.").min(1, "O intervalo mínimo é 1."),
    delay_unit: z.enum(["minutes", "hours", "days"]),
    stage_id: optUuid,
    package_id: optUuid,
    tag_id: optUuid,
    actions: z.array(actionSchema).min(1, "Adicione ao menos uma ação.").max(5, "Use no máximo 5 ações."),
    status: z.enum(["active", "paused"]),
  })
  .refine((v) => v.delay_value * DELAY_UNITS[v.delay_unit].minutes <= 525600, { path: ["delay_value"], message: "O intervalo máximo é de 365 dias." });

export type AutomationInput = z.infer<typeof automationSchema>;

export type Automation = {
  id: string;
  name: string;
  trigger_type: TriggerType;
  delay_minutes: number;
  stage_id: string | null;
  package_id: string | null;
  tag_id: string | null;
  actions: AutomationAction[];
  status: "active" | "paused";
  activated_at: string | null;
  created_at: string;
};

export const RUN_STATUS_LABELS = {
  scheduled: "Agendada",
  success: "Concluída",
  partial: "Concluída com falhas",
  failed: "Falhou",
  skipped: "Ignorada",
  cancelled: "Cancelada",
} as const;
export type RunStatus = keyof typeof RUN_STATUS_LABELS;

export type ActionResult = { type: AutomationAction["type"]; status: "done" | "failed" | "skipped"; detail: string };

/** Resultado geral de uma execução a partir do resultado de cada ação. */
export function summarizeResults(results: ActionResult[]): RunStatus {
  if (results.length === 0) return "skipped";
  const failed = results.filter((r) => r.status === "failed").length;
  const done = results.filter((r) => r.status === "done").length;
  if (failed === 0) return done > 0 ? "success" : "skipped";
  return done > 0 ? "partial" : "failed";
}

// --- Horário permitido para mensagens automáticas ---------------------------

export const SEND_WINDOW = { startHour: 8, endHour: 20 } as const;

function localParts(at: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Mensagens automáticas e de campanha só saem entre 8h e 20h no fuso da agência. */
export function isWithinSendWindow(at: Date, timeZone: string): boolean {
  const { hour } = localParts(at, timeZone);
  return hour >= SEND_WINDOW.startHour && hour < SEND_WINDOW.endHour;
}

/** Próximo instante permitido para envio (o próprio `at`, se já estiver na janela). */
export function nextSendTime(at: Date, timeZone: string, toUtc: (date: string, time: string, tz: string) => Date): Date {
  if (isWithinSendWindow(at, timeZone)) return at;
  const { date, hour } = localParts(at, timeZone);
  const start = `${String(SEND_WINDOW.startHour).padStart(2, "0")}:00`;
  if (hour < SEND_WINDOW.startHour) return toUtc(date, start, timeZone);
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return toUtc(next, start, timeZone);
}

/** Espera crescente entre tentativas: 1, 2, 4, 8... minutos, até 1 hora. */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1));
}
