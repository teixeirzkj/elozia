"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, failFrom, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { zonedToUtc } from "@/lib/utils";
import { buildTemplateComponents, describeTemplate, resolveVariables, type VariableMapping } from "@/lib/whatsapp/templates";
import { isWithinSendWindow, SEND_WINDOW } from "@/modules/automations/types";
import { campaignSchema } from "./types";

export async function saveCampaignAction(campaignId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config") ?? ""));
  } catch {
    return fail("Não foi possível ler a campanha. Recarregue a página e tente novamente.");
  }
  // O modo (rascunho ou agendar) vem do botão clicado.
  const parsed = campaignSchema.safeParse({ ...(raw as object), mode: formData.get("mode") });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  let targetId = campaignId;

  try {
    const { supabase, membership, user } = await authorize("automations.manage");
    const orgId = membership.organization.id;
    const tz = membership.organization.timezone;

    const { data: template } = await supabase
      .from("whatsapp_templates")
      .select("status, components, channel:whatsapp_channels (status)")
      .eq("organization_id", orgId)
      .eq("id", input.template_id)
      .maybeSingle();
    if (!template) return fail("Template não encontrado. Sincronize os templates em Configurações › Canais.");
    if (template.status !== "APPROVED") return fail("O template escolhido não está aprovado na Meta.");
    if ((template.channel as unknown as { status: string } | null)?.status !== "connected") return fail("O número de WhatsApp deste template não está conectado.");
    const spec = describeTemplate(template.components);
    if (!spec.supported) return fail(spec.reason ?? "Template não suportado.");
    const sample = resolveVariables(input.variables as VariableMapping, {
      contactName: "Contato Exemplo",
      packageName: "Pacote",
      packageDestination: "Destino",
      departureDate: "2030-01-01",
      agencyName: "Agência",
    });
    if (!buildTemplateComponents(spec, sample).ok) return fail("Defina o conteúdo de todas as variáveis do template.");

    let scheduledAt: string | null = null;
    if (input.scheduled_date && input.scheduled_time) {
      const when = zonedToUtc(input.scheduled_date, input.scheduled_time, tz);
      if (input.mode === "schedule") {
        if (when.getTime() < Date.now() - 60_000) {
          return { ok: false, error: "Revise os campos destacados.", fieldErrors: { scheduled_date: ["Escolha um horário futuro."] } };
        }
        if (!isWithinSendWindow(when, tz)) {
          return {
            ok: false,
            error: "Revise os campos destacados.",
            fieldErrors: { scheduled_date: [`Campanhas são enviadas entre ${SEND_WINDOW.startHour}h e ${SEND_WINDOW.endHour}h no fuso da agência.`] },
          };
        }
      }
      scheduledAt = when.toISOString();
    }

    if (input.mode === "schedule") {
      const { data: count, error: countError } = await supabase.rpc("campaign_audience_count", {
        p_package: input.package_id,
        p_interest: input.audience_interest,
        p_tag_ids: input.audience_tag_ids,
      });
      if (countError) throw countError;
      if (!count) return fail("Nenhum contato atende ao público escolhido com consentimento registrado. A campanha não foi agendada.");
    }

    const values = {
      name: input.name,
      package_id: input.package_id,
      departure_id: input.departure_id,
      audience_interest: input.audience_interest,
      audience_tag_ids: input.audience_tag_ids,
      template_id: input.template_id,
      variables: input.variables,
      scheduled_at: scheduledAt,
      status: input.mode === "schedule" ? "scheduled" : "draft",
    };

    if (campaignId) {
      const { data: current } = await supabase.from("campaigns").select("status").eq("organization_id", orgId).eq("id", campaignId).maybeSingle();
      if (!current) return fail("Campanha não encontrada.");
      if (!["draft", "scheduled"].includes(current.status as string)) return fail("Esta campanha já começou e não pode mais ser alterada.");
      const { error } = await supabase.from("campaigns").update(values).eq("organization_id", orgId).eq("id", campaignId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("campaigns").insert({ ...values, organization_id: orgId, created_by: user.id }).select("id").single();
      if (error) throw error;
      targetId = data.id as string;
    }
    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: user.id,
      action: input.mode === "schedule" ? "campaign.scheduled" : "campaign.saved",
      entity: "campaign",
      entity_id: targetId,
    });
    revalidatePath("/campanhas");
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23503") return fail("O pacote, a saída ou o template escolhidos não existem mais.");
    return failFrom(error);
  }
  redirect(`/campanhas/${targetId}`);
}

export async function cancelCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { supabase, membership, user } = await authorize("automations.manage");
    const orgId = membership.organization.id;
    const { error, count } = await supabase
      .from("campaigns")
      .update({ status: "cancelled", finished_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", orgId)
      .eq("id", campaignId)
      .in("status", ["draft", "scheduled", "running"]);
    if (error) throw error;
    if (!count) return fail("Esta campanha não pode mais ser cancelada.");
    await supabase.from("audit_logs").insert({ organization_id: orgId, actor_id: user.id, action: "campaign.cancelled", entity: "campaign", entity_id: campaignId });
    revalidatePath("/campanhas");
    revalidatePath(`/campanhas/${campaignId}`);
    return ok("Campanha cancelada. Os envios pendentes não serão realizados.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("automations.manage");
    const { error, count } = await supabase
      .from("campaigns")
      .delete({ count: "exact" })
      .eq("organization_id", membership.organization.id)
      .eq("id", campaignId)
      .eq("status", "draft");
    if (error) throw error;
    if (!count) return fail("Só rascunhos podem ser excluídos.");
    revalidatePath("/campanhas");
  } catch (error) {
    return failFrom(error);
  }
  redirect("/campanhas");
}

const audienceSchema = z.object({ packageId: z.uuid(), interest: z.boolean(), tagIds: z.array(z.uuid()).max(20) });

/** Prévia do público: quantos contatos com consentimento atendem ao segmento. */
export async function audienceCountAction(input: { packageId: string; interest: boolean; tagIds: string[] }): Promise<{ count: number | null }> {
  const parsed = audienceSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.interest && parsed.data.tagIds.length === 0)) return { count: null };
  try {
    const { supabase } = await authorize("automations.manage");
    const { data, error } = await supabase.rpc("campaign_audience_count", {
      p_package: parsed.data.packageId,
      p_interest: parsed.data.interest,
      p_tag_ids: parsed.data.tagIds,
    });
    return { count: error ? null : ((data as number) ?? 0) };
  } catch {
    return { count: null };
  }
}
