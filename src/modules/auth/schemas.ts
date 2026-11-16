import { z } from "zod";
import { reqText } from "@/lib/action";
import { TIMEZONE_VALUES } from "@/lib/timezones";

export const emailSchema = z
  .string("Informe o e-mail.")
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254)
  .pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string("Informe a senha.")
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string("Informe a senha.").min(1, "Informe a senha.").max(72),
  proximo: z.string().optional(),
});

export const signUpSchema = z.object({
  full_name: reqText(120, "Seu nome"),
  agency_name: reqText(120, "Nome da agência").pipe(z.string().min(2, "Informe o nome da agência.")),
  email: emailSchema,
  password: passwordSchema,
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não coincidem." });

export const createOrganizationSchema = z.object({
  name: reqText(120, "Nome da agência").pipe(z.string().min(2, "Informe o nome da agência.")),
  timezone: z.enum(TIMEZONE_VALUES, "Selecione um fuso horário."),
});

export const invitedSignUpSchema = z.object({
  token: z.string().min(20).max(200),
  full_name: reqText(120, "Seu nome"),
  password: passwordSchema,
});

/** Só aceita caminhos internos como destino pós-login (evita redirecionamento aberto). */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
