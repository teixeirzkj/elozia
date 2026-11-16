import { z } from "zod";
import { optEmail, optText, reqText, reqUuid } from "@/lib/action";
import { TIMEZONE_VALUES } from "@/lib/timezones";
import { emailSchema } from "@/modules/auth/schemas";

export const organizationSchema = z.object({
  name: reqText(120, "Nome da agência").pipe(z.string().min(2, "Informe o nome da agência.")),
  timezone: z.enum(TIMEZONE_VALUES, "Selecione um fuso horário."),
  phone: optText(30),
  email: optEmail,
  document: optText(30),
});

export const profileSchema = z.object({
  full_name: reqText(120, "Nome"),
  phone: optText(30),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "supervisor", "agent"], "Selecione um papel."),
});

export const memberUpdateSchema = z.object({
  membership_id: reqUuid,
  role: z.enum(["admin", "supervisor", "agent"], "Selecione um papel."),
  status: z.enum(["active", "disabled"]),
});

export const teamSchema = z.object({
  name: reqText(80, "Nome da equipe"),
  members: z.array(z.uuid()).max(200),
});
