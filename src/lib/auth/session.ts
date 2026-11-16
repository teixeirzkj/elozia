import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError } from "@/lib/auth/session-errors";
import { can, isRole, type Capability, type Role } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string; fullName: string; phone: string | null };

export type Membership = {
  id: string;
  role: Role;
  organization: { id: string; name: string; timezone: string };
};

export type Session = { supabase: SupabaseClient; user: SessionUser; membership: Membership | null };
export type MemberSession = Session & { membership: Membership };

export { ForbiddenError };

/**
 * Resolve usuário → agência → papel a partir da sessão (uma vez por requisição).
 * O `organization_id` usado em qualquer gravação vem daqui, nunca do cliente.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, email").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, organization:organizations (id, name, timezone)")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const org = member?.organization as unknown as { id: string; name: string; timezone: string } | null | undefined;
  const membership: Membership | null =
    member && org && isRole(member.role) ? { id: member.id as string, role: member.role, organization: org } : null;

  return {
    supabase,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? (profile?.email as string | undefined) ?? "",
      fullName: (profile?.full_name as string | undefined) ?? auth.user.email ?? "Usuário",
      phone: (profile?.phone as string | null | undefined) ?? null,
    },
    membership,
  };
});

/** Para páginas: exige login; sem sessão, vai para /entrar. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  return session;
}

/** Para páginas: exige login e vínculo ativo com uma agência. */
export async function requireMembership(): Promise<MemberSession> {
  const session = await requireUser();
  if (!session.membership) redirect("/boas-vindas");
  return session as MemberSession;
}

/** Para páginas restritas: sem a capacidade, volta ao dashboard. */
export async function requireCapabilityPage(capability: Capability): Promise<MemberSession> {
  const session = await requireMembership();
  if (!can(session.membership.role, capability)) redirect("/dashboard?aviso=sem-permissao");
  return session;
}

/**
 * Para Server Actions e Route Handlers: lança ForbiddenError em vez de redirecionar.
 * Sempre a primeira chamada depois da validação de entrada.
 */
export async function authorize(capability?: Capability): Promise<MemberSession> {
  const session = await getSession();
  if (!session) throw new ForbiddenError("Sua sessão expirou. Entre novamente.");
  if (!session.membership) throw new ForbiddenError("Sua conta não está vinculada a uma agência ativa.");
  if (capability && !can(session.membership.role, capability)) throw new ForbiddenError();
  return session as MemberSession;
}
