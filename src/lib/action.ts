import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/session-errors";

/** Resultado padrão de toda Server Action. */
export type ActionState<T = unknown> = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: T;
};

export const initialState: ActionState = { ok: false };

export function ok<T = unknown>(message?: string, data?: T): ActionState<T> {
  return { ok: true, message, data };
}

export function fail(error: string): ActionState<never> {
  return { ok: false, error };
}

export function invalid(error: z.ZodError): ActionState<never> {
  return {
    ok: false,
    error: "Revise os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

/** Converte FormData em objeto simples (campos repetidos viram lista com `getAll`). */
export function formObject(formData: FormData, multi: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = multi.includes(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const key of multi) if (!(key in out)) out[key] = [];
  return out;
}

type PgError = { code?: string; message?: string };

const PG_MESSAGES: Record<string, string> = {
  "23505": "Já existe um registro com estes dados.",
  "23503": "Este registro está relacionado a outros dados e não pode ser alterado desta forma.",
  "23514": "Algum valor informado não é permitido.",
  "42501": "Você não tem permissão para realizar esta ação.",
};

/**
 * Traduz erros para uma mensagem segura em português. Erros lançados pelas
 * funções do banco com código P0001 já trazem mensagem escrita para o usuário.
 */
export function failFrom(error: unknown, fallback = "Não foi possível concluir a operação. Tente novamente."): ActionState<never> {
  if (error instanceof ForbiddenError) return fail(error.message);
  const pg = error as PgError | null;
  if (pg?.code === "P0001" && pg.message) return fail(pg.message);
  if (pg?.code && PG_MESSAGES[pg.code]) return fail(PG_MESSAGES[pg.code]!);
  if (pg?.message?.includes("row-level security")) return fail(PG_MESSAGES["42501"]!);
  console.error("[action]", pg?.code ?? "", pg?.message ?? error);
  return fail(fallback);
}

// --- Blocos de validação reutilizáveis -------------------------------------

/** Texto opcional: aceita ausente/vazio e devolve null. */
export const optText = (max: number) =>
  z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .max(max, `Use no máximo ${max} caracteres.`)
      .transform((v) => (v === "" ? null : v)),
  );

export const reqText = (max: number, label = "Campo") =>
  z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, `${label} é obrigatório.`).max(max, `Use no máximo ${max} caracteres.`),
  );

export const optUuid = z.preprocess((v) => (v == null || v === "" ? null : v), z.uuid("Seleção inválida.").nullable());
export const reqUuid = z.uuid("Seleção inválida.");

export const optEmail = z.preprocess(
  (v) => (v == null ? "" : v),
  z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
    .transform((v) => (v === "" ? null : v)),
);

/** Data (AAAA-MM-DD) opcional. */
export const optDate = z.preprocess(
  (v) => (v == null || v === "" ? null : v),
  z.iso.date("Data inválida.").nullable(),
);

/** Inteiro opcional a partir de campo de formulário. */
export const optInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z.number("Número inválido.").int("Use um número inteiro.").min(min).max(max).nullable(),
  );

/** Valor em reais digitado ("1.234,56" ou "1234.56") → centavos. */
export function parseMoneyToCents(input: string): number | null {
  const raw = input.trim().replace(/[^\d,.-]/g, "");
  if (raw === "") return input.trim() === "" ? null : Number.NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1e10) return Number.NaN;
  return Math.round(value * 100);
}

export const optMoney = z.preprocess(
  (v) => (v == null ? "" : String(v)),
  z
    .string()
    .transform((v) => parseMoneyToCents(v))
    .refine((v) => v === null || !Number.isNaN(v), "Valor inválido."),
);
