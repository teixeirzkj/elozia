"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { fail, failFrom, formObject, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { assignableRoles } from "@/lib/permissions";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { inviteSchema, memberUpdateSchema, organizationSchema, profileSchema, teamSchema } from "./schemas";

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = organizationSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("organization.manage");
    const { error } = await supabase.from("organizations").update(parsed.data).eq("id", membership.organization.id);
    if (error) throw error;
    await supabase.from("audit_logs").insert({
      organization_id: membership.organization.id,
      actor_id: user.id,
      action: "organization.updated",
      entity: "organization",
      entity_id: membership.organization.id,
    });
    revalidatePath("/", "layout");
    return ok("Dados da agência salvos.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, user } = await authorize();
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Perfil salvo.");
  } catch (error) {
    return failFrom(error);
  }
}

async function origin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

/**
 * Cria um convite e devolve o link para ser enviado à pessoa. O link contém um
 * segredo de uso único; no banco fica apenas o hash.
 */
export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("team.manage");
    if (!assignableRoles(membership.role).includes(parsed.data.role)) {
      return fail("Você não pode convidar alguém com este papel.");
    }
    if (!(await rateLimit("invite", membership.organization.id))) return fail(RATE_LIMITED_MESSAGE);

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", parsed.data.email)
      .maybeSingle();
    if (existing) return fail("Esta pessoa já faz parte da equipe.");

    const token = randomBytes(32).toString("base64url");
    const { error } = await supabase.from("invitations").insert({
      organization_id: membership.organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
      invited_by: user.id,
    });
    if (error) {
      if (error.code === "23505") return fail("Já existe um convite pendente para este e-mail.");
      throw error;
    }
    await supabase.from("audit_logs").insert({
      organization_id: membership.organization.id,
      actor_id: user.id,
      action: "invitation.created",
      entity: "invitation",
      metadata: { role: parsed.data.role },
    });
    revalidatePath("/configuracoes/equipe");
    return ok("Convite criado. Copie o link e envie para a pessoa convidada.", {
      link: `${await origin()}/convite/${token}`,
      email: parsed.data.email,
    });
  } catch (error) {
    return failFrom(error);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("team.manage");
    const { error } = await supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("organization_id", membership.organization.id)
      .is("accepted_at", null);
    if (error) throw error;
    revalidatePath("/configuracoes/equipe");
    return ok("Convite cancelado.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function updateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = memberUpdateSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase } = await authorize("team.manage");
    // As regras de hierarquia são aplicadas dentro da função do banco.
    const { error } = await supabase.rpc("update_membership", {
      p_membership: parsed.data.membership_id,
      p_role: parsed.data.role,
      p_status: parsed.data.status,
    });
    if (error) throw error;
    revalidatePath("/configuracoes/equipe");
    return ok("Colaborador atualizado.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function saveTeamAction(teamId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = teamSchema.safeParse(formObject(formData, ["members"]));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const orgId = membership.organization.id;
    let id = teamId;
    if (id) {
      const { error } = await supabase.from("teams").update({ name: parsed.data.name }).eq("id", id).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("teams")
        .insert({ organization_id: orgId, name: parsed.data.name })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id as string;
    }
    const { error: delError } = await supabase.from("team_members").delete().eq("team_id", id).eq("organization_id", orgId);
    if (delError) throw delError;
    if (parsed.data.members.length > 0) {
      const { error: insError } = await supabase
        .from("team_members")
        .insert(parsed.data.members.map((user_id) => ({ organization_id: orgId, team_id: id, user_id })));
      if (insError) throw insError;
    }
    revalidatePath("/configuracoes/equipe");
    return ok("Equipe salva.");
  } catch (error) {
    return failFrom(error, "Não foi possível salvar a equipe. Verifique se o nome já está em uso.");
  }
}

export async function deleteTeamAction(teamId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const { error } = await supabase.from("teams").delete().eq("id", teamId).eq("organization_id", membership.organization.id);
    if (error) throw error;
    revalidatePath("/configuracoes/equipe");
    return ok("Equipe excluída.");
  } catch (error) {
    return failFrom(error);
  }
}
