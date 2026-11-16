"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, failFrom, formObject, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { formatMoney, zonedToUtc } from "@/lib/utils";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@/modules/crm/types";
import { bookingSchema, moveSchema, opportunitySchema, proposalSchema, stageSchema } from "./schemas";

function revalidateOpportunity(id: string, contactId?: string | null) {
  revalidatePath("/funil");
  revalidatePath(`/funil/${id}`);
  if (contactId) revalidatePath(`/contatos/${contactId}`);
}

export async function saveOpportunityAction(opportunityId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = opportunitySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  let createdId: string | null = null;
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const orgId = membership.organization.id;
    const { estimated_value, next_contact_date, next_contact_time, lost_reason, ...rest } = parsed.data;

    const { data: stage } = await supabase.from("pipeline_stages").select("kind").eq("id", rest.stage_id).eq("organization_id", orgId).maybeSingle();
    if (!stage) return fail("Etapa inválida.");
    if (stage.kind === "lost" && !lost_reason) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: { lost_reason: ["Informe o motivo da perda."] } };
    }

    const values = {
      ...rest,
      // Uma saída só faz sentido junto do pacote a que pertence.
      departure_id: rest.package_id ? rest.departure_id : null,
      estimated_value_cents: estimated_value,
      next_contact_at: next_contact_date
        ? zonedToUtc(next_contact_date, next_contact_time ?? "09:00", membership.organization.timezone).toISOString()
        : null,
      lost_reason: stage.kind === "lost" ? lost_reason : null,
    };

    if (opportunityId) {
      const { error, count } = await supabase
        .from("opportunities")
        .update(values, { count: "exact" })
        .eq("id", opportunityId)
        .eq("organization_id", orgId);
      if (error) throw error;
      if (!count) return fail("Você só pode alterar oportunidades sob sua responsabilidade.");
      revalidateOpportunity(opportunityId, rest.contact_id);
    } else {
      const { data, error } = await supabase
        .from("opportunities")
        .insert({ ...values, organization_id: orgId, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      createdId = data.id as string;
      revalidateOpportunity(createdId, rest.contact_id);
    }
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23503") return fail("Contato, pacote, saída ou responsável inválido para esta agência.");
    return failFrom(error);
  }
  if (createdId) redirect(`/funil/${createdId}`);
  return ok("Oportunidade salva.");
}

/** Movimentação no Kanban: persiste etapa e posição, com histórico gravado pelo banco. */
export async function moveOpportunityAction(input: {
  opportunityId: string;
  stageId: string;
  afterId: string | null;
  lostReason: string | null;
}): Promise<ActionState> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("Movimentação inválida.");
  try {
    const { supabase } = await authorize("crm.write");
    const { error } = await supabase.rpc("move_opportunity", {
      p_opportunity: parsed.data.opportunityId,
      p_stage: parsed.data.stageId,
      p_after: parsed.data.afterId,
      p_lost_reason: parsed.data.lostReason,
    });
    if (error) {
      if (error.code === "42501") return fail("Você só pode mover oportunidades sob sua responsabilidade.");
      throw error;
    }
    revalidatePath("/funil");
    revalidatePath(`/funil/${parsed.data.opportunityId}`);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteOpportunityAction(opportunityId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("crm.delete");
    const { error, count } = await supabase
      .from("opportunities")
      .delete({ count: "exact" })
      .eq("id", opportunityId)
      .eq("organization_id", membership.organization.id);
    if (error) throw error;
    if (!count) return fail("Oportunidade não encontrada.");
    revalidatePath("/funil");
  } catch (error) {
    return failFrom(error);
  }
  redirect("/funil");
}

export async function saveProposalAction(
  opportunityId: string,
  proposalId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = proposalSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const orgId = membership.organization.id;
    const { data: opp } = await supabase.from("opportunities").select("contact_id").eq("id", opportunityId).eq("organization_id", orgId).maybeSingle();
    if (!opp) return fail("Oportunidade não encontrada.");

    const { amount, ...rest } = parsed.data;
    let wasSent = false;
    if (proposalId) {
      const { data: current } = await supabase.from("proposals").select("sent_at").eq("id", proposalId).eq("organization_id", orgId).maybeSingle();
      if (!current) return fail("Proposta não encontrada.");
      wasSent = current.sent_at !== null;
    }
    const markSent = rest.status === "sent" && !wasSent;
    const values = { ...rest, amount_cents: amount, ...(markSent ? { sent_at: new Date().toISOString() } : {}) };

    const { error } = proposalId
      ? await supabase.from("proposals").update(values).eq("id", proposalId).eq("organization_id", orgId)
      : await supabase.from("proposals").insert({ ...values, opportunity_id: opportunityId, organization_id: orgId, created_by: user.id });
    if (error) throw error;

    if (markSent || !proposalId) {
      await supabase.from("contact_events").insert({
        organization_id: orgId,
        contact_id: opp.contact_id,
        type: "proposal",
        body: `Proposta ${markSent ? "enviada" : "registrada"}: ${formatMoney(amount, rest.currency)}`,
        metadata: { opportunity_id: opportunityId },
        actor_id: user.id,
      });
    }
    revalidateOpportunity(opportunityId, opp.contact_id as string);
    return ok("Proposta salva.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function setProposalStatusAction(opportunityId: string, proposalId: string, status: ProposalStatus): Promise<ActionState> {
  if (!(status in PROPOSAL_STATUS_LABELS)) return fail("Situação inválida.");
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const orgId = membership.organization.id;
    const { data: current } = await supabase
      .from("proposals")
      .select("sent_at, amount_cents, currency, opportunity:opportunities (contact_id)")
      .eq("id", proposalId)
      .eq("opportunity_id", opportunityId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!current) return fail("Proposta não encontrada.");
    const patch: Record<string, unknown> = { status };
    if (status === "sent" && !current.sent_at) patch.sent_at = new Date().toISOString();
    const { error } = await supabase.from("proposals").update(patch).eq("id", proposalId).eq("organization_id", orgId);
    if (error) throw error;
    const contactId = (current.opportunity as unknown as { contact_id: string } | null)?.contact_id;
    if (contactId) {
      await supabase.from("contact_events").insert({
        organization_id: orgId,
        contact_id: contactId,
        type: "proposal",
        body: `Proposta de ${formatMoney(current.amount_cents as number, current.currency as string)}: ${PROPOSAL_STATUS_LABELS[status].toLowerCase()}`,
        metadata: { opportunity_id: opportunityId },
        actor_id: user.id,
      });
    }
    revalidateOpportunity(opportunityId, contactId);
    return ok("Proposta atualizada.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function saveBookingAction(bookingId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = bookingSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership, user } = await authorize("crm.write");
    const orgId = membership.organization.id;
    const { total, amount_paid, ...rest } = parsed.data;
    const paid = amount_paid ?? 0;
    if (paid > total) {
      return { ok: false, error: "Revise os campos destacados.", fieldErrors: { amount_paid: ["O valor pago não pode ser maior que o total."] } };
    }
    const values = {
      ...rest,
      departure_id: rest.package_id ? rest.departure_id : null,
      total_cents: total,
      amount_paid_cents: paid,
    };

    if (bookingId) {
      const { data: current } = await supabase.from("bookings").select("status").eq("id", bookingId).eq("organization_id", orgId).maybeSingle();
      if (!current) return fail("Reserva não encontrada.");
      const confirmedNow = rest.status === "confirmed" && current.status !== "confirmed";
      const { error } = await supabase
        .from("bookings")
        .update({ ...values, ...(confirmedNow ? { confirmed_at: new Date().toISOString() } : {}) })
        .eq("id", bookingId)
        .eq("organization_id", orgId);
      if (error) throw error;
      if (confirmedNow) {
        await supabase.from("contact_events").insert({ organization_id: orgId, contact_id: rest.contact_id, type: "booking", body: "Reserva confirmada", actor_id: user.id });
      }
    } else {
      const { error } = await supabase.from("bookings").insert({
        ...values,
        organization_id: orgId,
        created_by: user.id,
        confirmed_at: rest.status === "confirmed" ? new Date().toISOString() : null,
      });
      if (error) throw error;
      await supabase.from("contact_events").insert({
        organization_id: orgId,
        contact_id: rest.contact_id,
        type: "booking",
        body: `Reserva registrada: ${formatMoney(total, rest.currency)} · ${rest.travelers} ${rest.travelers === 1 ? "viajante" : "viajantes"}`,
        actor_id: user.id,
      });
    }
    revalidatePath("/viagens/reservas");
    revalidatePath(`/contatos/${rest.contact_id}`);
    if (rest.opportunity_id) revalidatePath(`/funil/${rest.opportunity_id}`);
    if (rest.package_id) revalidatePath(`/viagens/${rest.package_id}`);
    return ok("Reserva salva.");
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23503") return fail("Contato, pacote ou saída inválidos para esta agência.");
    return failFrom(error);
  }
}

// --- Etapas do funil --------------------------------------------------------

export async function saveStageAction(stageId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stageSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const orgId = membership.organization.id;
    if (stageId) {
      const { data: current } = await supabase.from("pipeline_stages").select("kind").eq("id", stageId).eq("organization_id", orgId).maybeSingle();
      if (!current) return fail("Etapa não encontrada.");
      if (current.kind !== parsed.data.kind) {
        const { count } = await supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stageId)
          .eq("organization_id", orgId);
        if (count) return fail("Não é possível mudar o tipo de uma etapa que já tem oportunidades. Mova-as antes.");
      }
      const { error } = await supabase.from("pipeline_stages").update(parsed.data).eq("id", stageId).eq("organization_id", orgId);
      if (error) throw error;
    } else {
      const { data: last } = await supabase
        .from("pipeline_stages")
        .select("position")
        .eq("organization_id", orgId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase
        .from("pipeline_stages")
        .insert({ ...parsed.data, organization_id: orgId, position: ((last?.position as number | undefined) ?? 0) + 1 });
      if (error) throw error;
    }
    revalidatePath("/configuracoes/funil");
    revalidatePath("/funil");
    return ok("Etapa salva.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function moveStageAction(stageId: string, direction: "up" | "down"): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const orgId = membership.organization.id;
    const { data: stages, error } = await supabase.from("pipeline_stages").select("id, position").eq("organization_id", orgId).order("position");
    if (error) throw error;
    const list = stages ?? [];
    const index = list.findIndex((s) => s.id === stageId);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= list.length) return ok();
    const a = list[index]!;
    const b = list[swap]!;
    const r1 = await supabase.from("pipeline_stages").update({ position: b.position }).eq("id", a.id).eq("organization_id", orgId);
    const r2 = await supabase.from("pipeline_stages").update({ position: a.position }).eq("id", b.id).eq("organization_id", orgId);
    if (r1.error || r2.error) throw r1.error ?? r2.error;
    revalidatePath("/configuracoes/funil");
    revalidatePath("/funil");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteStageAction(stageId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("settings.crm");
    const orgId = membership.organization.id;
    const { count } = await supabase.from("pipeline_stages").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    if ((count ?? 0) <= 2) return fail("O funil precisa de pelo menos duas etapas.");
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId).eq("organization_id", orgId);
    if (error) {
      if (error.code === "23503") return fail("Esta etapa tem oportunidades ou é usada em automações. Mova as oportunidades antes de excluir.");
      throw error;
    }
    revalidatePath("/configuracoes/funil");
    revalidatePath("/funil");
    return ok("Etapa excluída.");
  } catch (error) {
    return failFrom(error);
  }
}
