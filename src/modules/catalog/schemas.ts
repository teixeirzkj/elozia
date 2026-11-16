import { z } from "zod";
import { optDate, optInt, optMoney, optText, reqText } from "@/lib/action";

export const CURRENCIES = ["BRL", "USD", "EUR"] as const;
const status = z.enum(["active", "paused", "closed"], "Selecione a situação.");

export const packageSchema = z.object({
  name: reqText(160, "Nome do pacote"),
  destination: reqText(160, "Destino"),
  description: optText(5000),
  price: optMoney,
  currency: z.enum(CURRENCIES, "Selecione a moeda."),
  status,
  commercial_notes: optText(5000),
});

export const departureSchema = z
  .object({
    departs_on: z.iso.date("Informe a data de saída."),
    returns_on: optDate,
    price: optMoney,
    seats_total: optInt(0, 100000),
    status,
    notes: optText(1000),
  })
  .refine((v) => !v.returns_on || v.returns_on >= v.departs_on, {
    path: ["returns_on"],
    message: "O retorno não pode ser antes da saída.",
  });
