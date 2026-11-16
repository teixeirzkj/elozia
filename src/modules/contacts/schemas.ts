import { z } from "zod";
import { optDate, optEmail, optText, optUuid, reqText } from "@/lib/action";
import { normalizePhone } from "@/lib/phone";
import { CONTACT_SOURCE_VALUES, MANUAL_EVENT_TYPES } from "@/modules/crm/types";

/** Telefone opcional, normalizado para E.164. */
export const optPhone = z.preprocess(
  (v) => (v == null ? "" : String(v)),
  z.string().trim().max(30).transform((value, ctx) => {
    if (value === "") return null;
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido. Informe DDD e número, por exemplo (11) 91234-5678." });
      return z.NEVER;
    }
    return normalized;
  }),
);

export const contactSchema = z.object({
  name: reqText(160, "Nome"),
  phone: optPhone,
  email: optEmail,
  notes: optText(5000),
  source: z.enum(CONTACT_SOURCE_VALUES, "Selecione a origem."),
  owner_id: optUuid,
  marketing_consent: z.enum(["unknown", "granted", "revoked"]),
  consent_source: optText(200),
  tags: z.array(z.uuid()).max(50),
});

export const contactEventSchema = z.object({
  type: z.enum(MANUAL_EVENT_TYPES, "Selecione o tipo."),
  body: reqText(4000, "Descrição"),
});

export const tagSchema = z.object({
  name: reqText(40, "Nome"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
});

export const taskSchema = z.object({
  title: reqText(200, "Título"),
  notes: optText(2000),
  due_date: optDate,
  due_time: z.preprocess((v) => (v == null || v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.").nullable()),
  assignee_id: optUuid,
  contact_id: optUuid,
  opportunity_id: optUuid,
});

export type ContactFilters = {
  q?: string;
  tag?: string;
  owner?: string;
  source?: string;
  consent?: string;
  page?: number;
};
