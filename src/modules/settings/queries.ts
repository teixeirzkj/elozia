import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions";

export type OrganizationRow = {
  id: string;
  name: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  document: string | null;
};

export type MemberRow = {
  id: string;
  user_id: string;
  role: Role;
  status: "active" | "disabled";
  created_at: string;
  full_name: string;
  email: string;
};

export type InvitationRow = { id: string; email: string; role: Role; expires_at: string; created_at: string };

export type TeamRow = { id: string; name: string; member_ids: string[] };

export async function getOrganization(supabase: SupabaseClient, orgId: string): Promise<OrganizationRow> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, timezone, phone, email, document")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return data as OrganizationRow;
}

export async function listMembers(supabase: SupabaseClient, orgId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at, profile:profiles (full_name, email)")
    .eq("organization_id", orgId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = row.profile as unknown as { full_name: string; email: string } | null;
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      role: row.role as Role,
      status: row.status as MemberRow["status"],
      created_at: row.created_at as string,
      full_name: profile?.full_name ?? "—",
      email: profile?.email ?? "—",
    };
  });
}

/** Colaboradores ativos, para seletores de responsável. */
export async function listActiveMembers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Array<{ id: string; name: string }>> {
  const members = await listMembers(supabase, orgId);
  return members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.user_id, name: m.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function listPendingInvitations(supabase: SupabaseClient, orgId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvitationRow[];
}

export async function listTeams(supabase: SupabaseClient, orgId: string): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, team_members (user_id)")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    member_ids: ((t.team_members as unknown as Array<{ user_id: string }>) ?? []).map((m) => m.user_id),
  }));
}
