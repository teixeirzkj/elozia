import { z } from "zod";
import { optDate, optUuid, reqText } from "@/lib/action";
import type { VariableMapping } from "@/lib/whatsapp/templates";
import { variablesSchema } from "@/modules/automations/types";

export const CAMPAIGN_STATUS_LABELS = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em envio",
  completed: "Concluída",
  cancelled: "Cancelada",
  failed: "Interrompida por erro",
} as const;
export type CampaignStatus = keyof typeof CAMPAIGN_STATUS_LABELS;

export const RECIPIENT_STATUS_LABELS = {
  pending: "Na fila",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Não enviada",
  cancelled: "Cancelada",
} as const;
export type RecipientStatus = keyof typeof RECIPIENT_STATUS_LABELS;

export const CAMPAIGN_MAX_RECIPIENTS = 2000;

export const campaignSchema = z
  .object({
    name: reqText(120, "Nome da campanha"),
    package_id: z.uuid("Selecione o pacote."),
    departure_id: optUuid,
    audience_interest: z.boolean(),
    audience_tag_ids: z.array(z.uuid()).max(20),
    template_id: z.uuid("Selecione o template."),
    variables: variablesSchema,
    scheduled_date: optDate,
    scheduled_time: z.preprocess((v) => (v == null || v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.").nullable()),
    mode: z.enum(["draft", "schedule"]),
  })
  .refine((v) => v.audience_interest || v.audience_tag_ids.length > 0, {
    path: ["audience_interest"],
    message: "Escolha ao menos um critério de público. Campanhas não são enviadas para toda a base.",
  })
  .refine((v) => v.mode === "draft" || (v.scheduled_date && v.scheduled_time), {
    path: ["scheduled_date"],
    message: "Informe a data e o horário do envio.",
  });

export type Campaign = {
  id: string;
  name: string;
  package_id: string;
  package_name: string | null;
  departure_id: string | null;
  departure_date: string | null;
  audience_interest: boolean;
  audience_tag_ids: string[];
  template_id: string;
  template_name: string | null;
  variables: VariableMapping;
  scheduled_at: string | null;
  status: CampaignStatus;
  total_recipients: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type CampaignRecipient = {
  id: string;
  contact_id: string;
  contact_name: string;
  status: RecipientStatus;
  error: string | null;
  processed_at: string | null;
  /** Situação da mensagem na Meta, quando enviada. */
  delivery: string | null;
};
