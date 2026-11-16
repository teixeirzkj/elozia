import { z } from "zod";
import { optDate, optInt, optMoney, optText, optUuid, reqText, reqUuid } from "@/lib/action";
import { CURRENCIES } from "@/modules/catalog/schemas";

const optTime = z.preprocess(
  (v) => (v == null || v === "" ? null : v),
  z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.").nullable(),
);

const reqMoney = optMoney.refine((v) => v !== null, "Informe o valor.");

export const opportunitySchema = z.object({
  contact_id: reqUuid,
  package_id: optUuid,
  departure_id: optUuid,
  destination_interest: optText(160),
  stage_id: reqUuid,
  estimated_value: optMoney,
  currency: z.enum(CURRENCIES).default("BRL"),
  intended_date: optDate,
  travelers: optInt(1, 1000),
  owner_id: optUuid,
  next_contact_date: optDate,
  next_contact_time: optTime,
  lost_reason: optText(500),
  notes: optText(5000),
});

export const proposalSchema = z.object({
  amount: reqMoney,
  currency: z.enum(CURRENCIES).default("BRL"),
  description: optText(5000),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
  valid_until: optDate,
});

export const bookingSchema = z
  .object({
    contact_id: reqUuid,
    opportunity_id: optUuid,
    package_id: optUuid,
    departure_id: optUuid,
    travelers: z.preprocess((v) => Number(v), z.number("Informe a quantidade.").int().min(1, "Mínimo de 1 viajante.").max(1000)),
    total: reqMoney,
    currency: z.enum(CURRENCIES).default("BRL"),
    status: z.enum(["pending", "confirmed", "cancelled"]),
    payment_status: z.enum(["pending", "partial", "paid", "refunded"]),
    payment_method: z.preprocess(
      (v) => (v == null || v === "" ? null : v),
      z.enum(["pix", "boleto", "cartao", "transferencia", "dinheiro", "outro"]).nullable(),
    ),
    amount_paid: optMoney,
    payment_notes: optText(1000),
  })
  .refine((v) => !/\b(?:\d[ -]?){13,19}\b/.test(v.payment_notes ?? ""), {
    path: ["payment_notes"],
    message: "Não registre números de cartão. Informe apenas como o pagamento foi feito.",
  });

export const stageSchema = z.object({
  name: reqText(60, "Nome da etapa"),
  kind: z.enum(["open", "won", "lost"]),
});

export const moveSchema = z.object({
  opportunityId: z.uuid(),
  stageId: z.uuid(),
  afterId: z.uuid().nullable(),
  lostReason: z.string().trim().max(500).nullable(),
});
