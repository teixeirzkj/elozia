"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, failFrom, invalid, ok, type ActionState } from "@/lib/action";
import { authorize } from "@/lib/auth/session";
import { buildTemplateComponents, describeTemplate, resolveVariables, type VariableMapping } from "@/lib/whatsapp/templates";
import { automationSchema, DELAY_UNITS, TRIGGERS, type AutomationAction } from "./types";

/**
 * Confere, sob a RLS do usuário, que tudo o que a regra referencia existe na
 * agência dele (as ações ficam em JSON, sem chave estrangeira).
 */
async function validateReferences(supabase: SupabaseClient, orgId: string, actions: AutomationAction[]): Promise<string | null> {
  const exists = async (table: string, id: string) => {
    const { data } = await supabase.from(table).select("id").eq("organization_id", orgId).eq("id", id).maybeSingle();
    return Boolean(data);
  };
  for (const [index, action] of actions.entries()) {
    const label = `Ação ${index + 1}`;
    if (action.type === "create_task" && action.assignee_id) {
      const { data } = await supabase.from("memberships").select("id").eq("organization_id", orgId).eq("user_id", action.assignee_id).eq("status", "active").maybeSingle();
      if (!data) return `${label}: o responsável escolhido não está ativo na agência.`;
    }
    if (action.type === "change_owner") {
      const { data } = await supabase.from("memberships").select("id").eq("organization_id", orgId).eq("user_id", action.owner_id).eq("status", "active").maybeSingle();
      if (!data) return `${label}: o responsável escolhido não está ativo na agência.`;
    }
    if (action.type === "add_tag" && !(await exists("tags", action.tag_id))) return `${label}: etiqueta não encontrada.`;
    if (action.type === "move_opportunity" && !(await exists("pipeline_stages", action.stage_id))) return `${label}: etapa não encontrada.`;
    if (action.type === "send_template") {
      const { data: template } = await supabase
        .from("whatsapp_templates")
        .select("status, components")
        .eq("organization_id", orgId)
        .eq("id", action.template_id)
        .maybeSingle();
      if (!template) return `${label}: template não encontrado. Sincronize os templates em Configurações › Canais.`;
      if (template.status !== "APPROVED") return `${label}: o template não está aprovado na Meta.`;
      const spec = describeTemplate(template.components);
      if (!spec.supported) return `${label}: ${spec.reason}`;
      // Simula o preenchimento para garantir que toda variável tem origem definida.
      const sample = resolveVariables(action.variables as VariableMapping, {
        contactName: "Contato Exemplo",
        packageName: "Pacote",
        packageDestination: "Destino",
        departureDate: "2030-01-01",
        agencyName: "Agência",
      });
      const built = buildTemplateComponents(spec, sample);
      if (!built.ok) return `${label}: defina o conteúdo de todas as variáveis do template.`;
    }
  }
  return null;
}

export async function saveAutomationAction(automationId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config") ?? ""));
  } catch {
    return fail("Não foi possível ler a regra. Recarregue a página e tente novamente.");
  }
  const parsed = automationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const allowed = TRIGGERS[input.trigger_type].conditions as readonly string[];
  let createdId: string | null = null;

  try {
    const { supabase, membership, user } = await authorize("automations.manage");
    const orgId = membership.organization.id;
    const problem = await validateReferences(supabase, orgId, input.actions);
    if (problem) return fail(problem);

    const values = {
      name: input.name,
      trigger_type: input.trigger_type,
      delay_minutes: input.delay_value * DELAY_UNITS[input.delay_unit].minutes,
      stage_id: allowed.includes("stage") ? input.stage_id : null,
      package_id: allowed.includes("package") ? input.package_id : null,
      tag_id: allowed.includes("tag") ? input.tag_id : null,
      actions: input.actions,
      status: input.status,
    };
    if (automationId) {
      const { error, count } = await supabase.from("automations").update(values, { count: "exact" }).eq("id", automationId).eq("organization_id", orgId);
      if (error) throw error;
      if (!count) return fail("Automação não encontrada.");
    } else {
      const { data, error } = await supabase.from("automations").insert({ ...values, organization_id: orgId, created_by: user.id }).select("id").single();
      if (error) throw error;
      createdId = data.id as string;
    }
    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: user.id,
      action: automationId ? "automation.updated" : "automation.created",
      entity: "automation",
      entity_id: automationId ?? createdId,
      metadata: { status: input.status, trigger: input.trigger_type },
    });
    revalidatePath("/automacoes");
    if (automationId) revalidatePath(`/automacoes/${automationId}`);
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23503") return fail("A etapa, o pacote ou a etiqueta escolhidos não existem mais.");
    return failFrom(error);
  }
  if (createdId) redirect(`/automacoes/${createdId}`);
  return ok("Automação salva.");
}

export async function setAutomationStatusAction(automationId: string, status: "active" | "paused"): Promise<ActionState> {
  if (status !== "active" && status !== "paused") return fail("Situação inválida.");
  try {
    const { supabase, membership, user } = await authorize("automations.manage");
    const orgId = membership.organization.id;
    const { error, count } = await supabase.from("automations").update({ status }, { count: "exact" }).eq("id", automationId).eq("organization_id", orgId);
    if (error) throw error;
    if (!count) return fail("Automação não encontrada.");
    await supabase.from("audit_logs").insert({ organization_id: orgId, actor_id: user.id, action: `automation.${status}`, entity: "automation", entity_id: automationId });
    revalidatePath("/automacoes");
    revalidatePath(`/automacoes/${automationId}`);
    return ok(status === "active" ? "Automação ativada. Ela vale para o que vencer a partir de agora." : "Automação pausada. Execuções agendadas não serão realizadas.");
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteAutomationAction(automationId: string): Promise<ActionState> {
  try {
    const { supabase, membership } = await authorize("automations.manage");
    const { error } = await supabase.from("automations").delete().eq("id", automationId).eq("organization_id", membership.organization.id);
    if (error) throw error;
    revalidatePath("/automacoes");
  } catch (error) {
    return failFrom(error);
  }
  redirect("/automacoes");
}

export async function cancelRunAction(automationId: string, runId: string): Promise<ActionState> {
  try {
    const { supabase } = await authorize("automations.manage");
    const { error } = await supabase.rpc("cancel_automation_run", { p_run: runId });
    if (error) throw error;
    revalidatePath(`/automacoes/${automationId}`);
    return ok("Execução cancelada.");
  } catch (error) {
    return failFrom(error);
  }
}
