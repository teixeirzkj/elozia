"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fail, failFrom, formObject, invalid, ok, type ActionState } from "@/lib/action";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  createOrganizationSchema,
  emailOnlySchema,
  invitedSignUpSchema,
  newPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "./schemas";

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await rateLimit("auth", `${await clientIp()}:${parsed.data.email}`))) return fail(RATE_LIMITED_MESSAGE);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.");
    }
    return fail("E-mail ou senha incorretos.");
  }
  redirect(safeNextPath(parsed.data.proximo));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await rateLimit("auth", await clientIp()))) return fail(RATE_LIMITED_MESSAGE);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name, agency_name: parsed.data.agency_name },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/boas-vindas`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return fail("Escolha uma senha mais forte.");
    if (error.code === "user_already_exists") return fail("Já existe uma conta com este e-mail. Entre ou recupere a senha.");
    if (error.code === "over_email_send_rate_limit") return fail(RATE_LIMITED_MESSAGE);
    console.error("[auth] signUp", error.code);
    return fail("Não foi possível criar a conta agora. Tente novamente.");
  }
  // Com confirmação de e-mail desativada no Supabase, a sessão já vem criada.
  if (data.session) redirect("/boas-vindas");
  return ok("Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar a conta e concluir o cadastro da agência.");
}

export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailOnlySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await rateLimit("auth", await clientIp()))) return fail(RATE_LIMITED_MESSAGE);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/redefinir-senha`,
  });
  if (error) console.error("[auth] resetPassword", error.code);
  // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
  return ok("Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha.");
}

export async function updatePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("O link expirou. Solicite a recuperação de senha novamente.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("A nova senha precisa ser diferente da atual.");
    if (error.code === "weak_password") return fail("Escolha uma senha mais forte.");
    console.error("[auth] updatePassword", error.code);
    return fail("Não foi possível alterar a senha. Tente novamente.");
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createOrganizationSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Sua sessão expirou. Entre novamente.");

  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_timezone: parsed.data.timezone,
  });
  if (error) return failFrom(error);
  redirect("/dashboard");
}

/** Cria a conta de uma pessoa convidada (o e-mail vem do convite, não do formulário). */
export async function invitedSignUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = invitedSignUpSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await rateLimit("auth", await clientIp()))) return fail(RATE_LIMITED_MESSAGE);

  const supabase = await createClient();
  const { data: rows, error: lookupError } = await supabase.rpc("get_invitation", { p_token: parsed.data.token });
  const invitation = (rows as Array<{ email: string }> | null)?.[0];
  if (lookupError || !invitation) return fail("Este convite não é mais válido. Peça um novo à sua agência.");

  const path = `/convite/${encodeURIComponent(parsed.data.token)}`;
  const { data, error } = await supabase.auth.signUp({
    email: invitation.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(path)}`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return fail("Já existe uma conta com este e-mail. Entre para aceitar o convite.");
    if (error.code === "weak_password") return fail("Escolha uma senha mais forte.");
    console.error("[auth] invitedSignUp", error.code);
    return fail("Não foi possível criar a conta agora. Tente novamente.");
  }
  if (data.session) {
    const { error: acceptError } = await supabase.rpc("accept_invitation", { p_token: parsed.data.token });
    if (acceptError) return failFrom(acceptError);
    redirect("/dashboard");
  }
  return ok("Conta criada. Enviamos um link de confirmação para o seu e-mail; ao abri-lo, você volta a esta página para aceitar o convite.");
}

export async function acceptInvitationAction(token: string): Promise<ActionState> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return fail("Convite inválido.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Entre na sua conta para aceitar o convite.");
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return failFrom(error);
  redirect("/dashboard");
}
