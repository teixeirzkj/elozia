import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedToUtc } from "@/lib/utils";
import { sendToConversation, type SendResult } from "@/lib/whatsapp/service";
import { resolveVariables, type VariableContext, type VariableMapping } from "@/lib/whatsapp/templates";
import {
  backoffMinutes,
  isWithinSendWindow,
  nextSendTime,
  summarizeResults,
  type ActionResult,
  type AutomationAction,
  type TriggerType,
} from "./types";

/**
 * Motor de automações e campanhas. Roda no endpoint de cron com service_role:
 * toda consulta filtra organization_id. Cada job é idempotente — pode ser
 * executado de novo depois de uma falha sem repetir o que já foi feito.
 */

export type JobOutcome = { retryAt?: Date; error?: string };

type Job = { id: string; organization_id: string; kind: string; payload: Record<string, unknown>; attempts: number };

const CAMPAIGN_BATCH_SIZE = 15;

function retryLater(attempts: number, error: string): JobOutcome {
  return { retryAt: new Date(Date.now() + backoffMinutes(attempts) * 60_000), error };
}

// --- Contexto da ocorrência -------------------------------------------------

type RunContext = {
  orgId: string;
  agencyName: string;
  timezone: string;
  contactId: string;
  contactName: string;
  contactOwnerId: string | null;
  opportunityId: string | null;
  opportunityOwnerId: string | null;
  conversationId: string | null;
  conversationAssigneeId: string | null;
  packageName: string | null;
  packageDestination: string | null;
  departureDate: string | null;
  /** A condição que originou a execução ainda vale? */
  stillValid: boolean;
};

async function loadContext(admin: SupabaseClient, orgId: string, trigger: TriggerType, entityType: string, entityId: string, contactId: string): Promise<RunContext | null> {
  const [{ data: org }, { data: contact }] = await Promise.all([
    admin.from("organizations").select("name, timezone").eq("id", orgId).maybeSingle(),
    admin.from("contacts").select("id, name, owner_id, is_demo").eq("organization_id", orgId).eq("id", contactId).maybeSingle(),
  ]);
  if (!org || !contact || contact.is_demo) return null;

  const ctx: RunContext = {
    orgId,
    agencyName: org.name as string,
    timezone: org.timezone as string,
    contactId,
    contactName: contact.name as string,
    contactOwnerId: contact.owner_id as string | null,
    opportunityId: null,
    opportunityOwnerId: null,
    conversationId: null,
    conversationAssigneeId: null,
    packageName: null,
    packageDestination: null,
    departureDate: null,
    stillValid: true,
  };

  let packageId: string | null = null;
  let departureId: string | null = null;
  const loadOpportunity = async (id: string | null) => {
    const query = admin.from("opportunities").select("id, owner_id, status, package_id, departure_id").eq("organization_id", orgId);
    const { data } = id
      ? await query.eq("id", id).maybeSingle()
      : await query.eq("contact_id", contactId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      ctx.opportunityId = data.id as string;
      ctx.opportunityOwnerId = data.owner_id as string | null;
      packageId = packageId ?? (data.package_id as string | null);
      departureId = departureId ?? (data.departure_id as string | null);
    }
    return data;
  };

  if (entityType === "opportunity") {
    const opp = await loadOpportunity(entityId);
    ctx.stillValid = opp?.status === "open";
  } else if (entityType === "proposal") {
    const { data: proposal } = await admin.from("proposals").select("status, opportunity_id").eq("organization_id", orgId).eq("id", entityId).maybeSingle();
    const opp = proposal ? await loadOpportunity(proposal.opportunity_id as string) : null;
    ctx.stillValid = proposal?.status === "sent" && opp?.status === "open";
  } else if (entityType === "booking") {
    const { data: booking } = await admin
      .from("bookings")
      .select("status, payment_status, opportunity_id, package_id, departure_id")
      .eq("organization_id", orgId)
      .eq("id", entityId)
      .maybeSingle();
    if (booking) {
      packageId = booking.package_id as string | null;
      departureId = booking.departure_id as string | null;
      if (booking.opportunity_id) await loadOpportunity(booking.opportunity_id as string);
    }
    ctx.stillValid =
      Boolean(booking) &&
      booking!.status !== "cancelled" &&
      (trigger !== "payment_pending" || ["pending", "partial"].includes(booking!.payment_status as string));
  } else if (entityType === "conversation") {
    const { data: conv } = await admin.from("conversations").select("id, assignee_id, first_response_at, status").eq("organization_id", orgId).eq("id", entityId).maybeSingle();
    if (conv) {
      ctx.conversationId = conv.id as string;
      ctx.conversationAssigneeId = conv.assignee_id as string | null;
    }
    ctx.stillValid = Boolean(conv) && conv!.first_response_at === null && conv!.status !== "closed";
    await loadOpportunity(null);
  }

  if (packageId) {
    const { data: pkg } = await admin.from("packages").select("name, destination").eq("organization_id", orgId).eq("id", packageId).maybeSingle();
    ctx.packageName = (pkg?.name as string | undefined) ?? null;
    ctx.packageDestination = (pkg?.destination as string | undefined) ?? null;
  }
  if (departureId) {
    const { data: dep } = await admin.from("package_departures").select("departs_on").eq("organization_id", orgId).eq("id", departureId).maybeSingle();
    ctx.departureDate = (dep?.departs_on as string | undefined) ?? null;
  }
  return ctx;
}

/** Conversa do contato no canal conectado; criada como concluída para não poluir a fila de pendentes. */
export async function ensureConversation(admin: SupabaseClient, orgId: string, contactId: string): Promise<string | null> {
  const { data: channel } = await admin.from("whatsapp_channels").select("id").eq("organization_id", orgId).eq("status", "connected").order("created_at").limit(1).maybeSingle();
  if (!channel) return null;
  const { data: existing } = await admin.from("conversations").select("id").eq("organization_id", orgId).eq("channel_id", channel.id).eq("contact_id", contactId).maybeSingle();
  if (existing) return existing.id as string;
  const { data: contact } = await admin.from("contacts").select("phone_e164, wa_user_id").eq("organization_id", orgId).eq("id", contactId).maybeSingle();
  if (!contact || (!contact.phone_e164 && !contact.wa_user_id)) return null;
  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      channel_id: channel.id,
      wa_id: contact.phone_e164 ? (contact.phone_e164 as string).replace(/^[+]/, "") : null,
      wa_user_id: contact.wa_user_id,
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Outra execução criou a conversa ao mesmo tempo: usa a existente.
    const { data: raced } = await admin.from("conversations").select("id").eq("organization_id", orgId).eq("channel_id", channel.id).eq("contact_id", contactId).maybeSingle();
    return (raced?.id as string | undefined) ?? null;
  }
  return error ? null : (created.id as string);
}

// --- Ações ------------------------------------------------------------------

type ActionOutcome = ActionResult & { retryable?: boolean };

async function executeAction(admin: SupabaseClient, ctx: RunContext, automationName: string, action: AutomationAction): Promise<ActionOutcome> {
  const { orgId } = ctx;
  const done = (detail: string): ActionOutcome => ({ type: action.type, status: "done", detail });
  const skipped = (detail: string): ActionOutcome => ({ type: action.type, status: "skipped", detail });
  const failed = (detail: string, retryable = false): ActionOutcome => ({ type: action.type, status: "failed", detail, retryable });

  switch (action.type) {
    case "create_task": {
      const assignee = action.assignee_id ?? ctx.opportunityOwnerId ?? ctx.conversationAssigneeId ?? ctx.contactOwnerId;
      const { error } = await admin.from("tasks").insert({
        organization_id: orgId,
        title: action.title,
        notes: `Criada pela automação “${automationName}”.`,
        due_at: new Date(Date.now() + action.due_in_hours * 3_600_000).toISOString(),
        assignee_id: assignee,
        contact_id: ctx.contactId,
        opportunity_id: ctx.opportunityId,
        origin: "automation",
      });
      if (error) return failed(error.code === "23503" ? "O responsável definido não faz mais parte da agência." : "Não foi possível criar a tarefa.");
      return done(assignee ? "Tarefa criada." : "Tarefa criada sem responsável.");
    }
    case "change_owner": {
      const { data: member } = await admin.from("memberships").select("user_id").eq("organization_id", orgId).eq("user_id", action.owner_id).eq("status", "active").maybeSingle();
      if (!member) return failed("O novo responsável não está ativo na agência.");
      const r1 = await admin.from("contacts").update({ owner_id: action.owner_id }).eq("organization_id", orgId).eq("id", ctx.contactId);
      if (r1.error) return failed("Não foi possível alterar o responsável.");
      if (ctx.opportunityId) {
        await admin.from("opportunities").update({ owner_id: action.owner_id }).eq("organization_id", orgId).eq("id", ctx.opportunityId);
      }
      return done("Responsável alterado.");
    }
    case "add_tag": {
      const { error } = await admin
        .from("contact_tags")
        .upsert({ organization_id: orgId, contact_id: ctx.contactId, tag_id: action.tag_id }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
      if (error) return failed(error.code === "23503" ? "A etiqueta não existe mais." : "Não foi possível adicionar a etiqueta.");
      return done("Etiqueta adicionada.");
    }
    case "move_opportunity": {
      if (!ctx.opportunityId) return skipped("O contato não tem oportunidade aberta para mover.");
      const { data: stage } = await admin.from("pipeline_stages").select("id, kind, name").eq("organization_id", orgId).eq("id", action.stage_id).maybeSingle();
      if (!stage) return failed("A etapa de destino não existe mais.");
      const { error, count } = await admin
        .from("opportunities")
        .update({ stage_id: stage.id, ...(stage.kind === "lost" ? { lost_reason: `Automação: ${automationName}`.slice(0, 500) } : {}) }, { count: "exact" })
        .eq("organization_id", orgId)
        .eq("id", ctx.opportunityId)
        .eq("status", "open")
        .neq("stage_id", stage.id);
      if (error) return failed("Não foi possível mover a oportunidade.");
      return count ? done(`Oportunidade movida para ${stage.name}.`) : skipped("A oportunidade já estava nesta etapa ou foi encerrada.");
    }
    case "send_template": {
      const conversationId = ctx.conversationId ?? (await ensureConversation(admin, orgId, ctx.contactId));
      if (!conversationId) return failed("Sem número de WhatsApp conectado ou contato sem telefone.");
      const result = await sendTemplate(orgId, conversationId, action.template_id, action.variables, ctx, "automation");
      if (result.ok) return done("Template enviado.");
      if (result.code === "opt_out" || result.code === "no_consent") return skipped(result.error);
      return failed(result.error, result.retryable);
    }
  }
}

function sendTemplate(
  orgId: string,
  conversationId: string,
  templateId: string,
  mapping: VariableMapping,
  ctx: Pick<RunContext, "contactName" | "packageName" | "packageDestination" | "departureDate" | "agencyName">,
  origin: "automation" | "campaign",
): Promise<SendResult> {
  const context: VariableContext = {
    contactName: ctx.contactName,
    packageName: ctx.packageName,
    packageDestination: ctx.packageDestination,
    departureDate: ctx.departureDate,
    agencyName: ctx.agencyName,
  };
  return sendToConversation({
    orgId,
    conversationId,
    senderId: null,
    origin,
    request: { kind: "template", templateId, values: resolveVariables(mapping, context) },
  });
}

// --- Execução de uma automação ---------------------------------------------

export async function runAutomationJob(admin: SupabaseClient, job: Job): Promise<JobOutcome> {
  const orgId = job.organization_id;
  const runId = String(job.payload.run_id ?? "");
  const { data: run } = await admin
    .from("automation_runs")
    .select("id, status, entity_type, entity_id, contact_id, results, automation:automations (id, name, status, trigger_type, actions)")
    .eq("organization_id", orgId)
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.status !== "scheduled") return {};

  const automation = run.automation as unknown as { id: string; name: string; status: string; trigger_type: TriggerType; actions: AutomationAction[] } | null;
  const finish = async (status: string, results: ActionResult[], error: string | null = null) => {
    await admin.from("automation_runs").update({ status, results, error, executed_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", runId);
  };

  if (!automation || automation.status !== "active") {
    await finish("cancelled", [], "A automação foi pausada antes da execução.");
    return {};
  }
  const ctx = run.contact_id ? await loadContext(admin, orgId, automation.trigger_type, run.entity_type as string, run.entity_id as string, run.contact_id as string) : null;
  if (!ctx) {
    await finish("skipped", [], "O registro de origem não existe mais.");
    return {};
  }
  if (!ctx.stillValid) {
    await finish("skipped", [], "A situação mudou antes da execução (por exemplo, o cliente foi atendido ou a oportunidade andou).");
    return {};
  }

  // Mensagens automáticas respeitam o horário comercial no fuso da agência.
  const sends = automation.actions.some((a) => a.type === "send_template");
  if (sends && !isWithinSendWindow(new Date(), ctx.timezone)) {
    return { retryAt: nextSendTime(new Date(), ctx.timezone, zonedToUtc) };
  }

  // Ações já concluídas em uma tentativa anterior não são repetidas.
  const results: ActionResult[] = Array.isArray(run.results) ? (run.results as ActionResult[]) : [];
  let retryable = false;
  for (let i = 0; i < automation.actions.length; i++) {
    if (results[i] && results[i]!.status !== "failed") continue;
    let outcome: ActionOutcome;
    try {
      outcome = await executeAction(admin, ctx, automation.name, automation.actions[i]!);
    } catch {
      outcome = { type: automation.actions[i]!.type, status: "failed", detail: "Erro inesperado ao executar a ação.", retryable: true };
    }
    results[i] = { type: outcome.type, status: outcome.status, detail: outcome.detail };
    if (outcome.status === "failed" && outcome.retryable) retryable = true;
    await admin.from("automation_runs").update({ results }).eq("organization_id", orgId).eq("id", runId);
  }

  if (retryable && job.attempts < 5) return retryLater(job.attempts, "Falha temporária em uma ação.");

  const status = summarizeResults(results);
  await finish(status, results, status === "failed" || status === "partial" ? (results.find((r) => r.status === "failed")?.detail ?? null) : null);
  await admin.from("contact_events").insert({
    organization_id: orgId,
    contact_id: ctx.contactId,
    type: "automation",
    body: `Automação “${automation.name}” executada: ${results.map((r) => r.detail).join(" ")}`.slice(0, 4000),
  });
  return {};
}

// --- Campanhas --------------------------------------------------------------

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  template_id: string;
  variables: VariableMapping;
  package: { name: string; destination: string } | null;
  departure: { departs_on: string } | null;
};

async function loadCampaign(admin: SupabaseClient, orgId: string, id: string): Promise<CampaignRow | null> {
  const { data } = await admin
    .from("campaigns")
    .select("id, name, status, template_id, variables, package:packages (name, destination), departure:package_departures (departs_on)")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as CampaignRow | null) ?? null;
}

async function enqueueBatch(admin: SupabaseClient, orgId: string, campaignId: string, runAt = new Date()): Promise<void> {
  await admin.from("jobs").insert({ organization_id: orgId, kind: "campaign_batch", payload: { campaign_id: campaignId }, run_at: runAt.toISOString() });
}

export async function runCampaignStartJob(admin: SupabaseClient, job: Job): Promise<JobOutcome> {
  const campaignId = String(job.payload.campaign_id ?? "");
  const { data, error } = await admin.rpc("start_campaign", { p_campaign: campaignId });
  if (error) return retryLater(job.attempts, "Falha ao iniciar a campanha.");
  if ((data as number) > 0) await enqueueBatch(admin, job.organization_id, campaignId);
  return {};
}

export async function runCampaignBatchJob(admin: SupabaseClient, job: Job): Promise<JobOutcome> {
  const orgId = job.organization_id;
  const campaignId = String(job.payload.campaign_id ?? "");
  const campaign = await loadCampaign(admin, orgId, campaignId);
  if (!campaign || campaign.status !== "running") return {};

  const { data: org } = await admin.from("organizations").select("name, timezone").eq("id", orgId).maybeSingle();
  if (!org) return {};
  if (!isWithinSendWindow(new Date(), org.timezone as string)) {
    return { retryAt: nextSendTime(new Date(), org.timezone as string, zonedToUtc) };
  }

  const { data: claimed, error } = await admin.rpc("claim_campaign_recipients", { p_campaign: campaignId, p_limit: CAMPAIGN_BATCH_SIZE });
  if (error) return retryLater(job.attempts, "Falha ao reservar destinatários.");
  const recipients = (claimed as Array<{ recipient_id: string; contact_id: string }> | null) ?? [];

  const mark = (recipientId: string, patch: Record<string, unknown>) =>
    admin.from("campaign_recipients").update({ ...patch, processed_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", recipientId);
  const release = (ids: string[]) =>
    ids.length ? admin.from("campaign_recipients").update({ status: "pending" }).eq("organization_id", orgId).in("id", ids).eq("status", "sending") : Promise.resolve();

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!;
    const remaining = recipients.slice(i).map((r) => r.recipient_id);
    const { data: contact } = await admin.from("contacts").select("name").eq("organization_id", orgId).eq("id", recipient.contact_id).maybeSingle();
    const conversationId = contact ? await ensureConversation(admin, orgId, recipient.contact_id) : null;
    if (!contact || !conversationId) {
      await mark(recipient.recipient_id, { status: "failed", error: "Contato sem telefone ou sem número de WhatsApp conectado." });
      continue;
    }
    const result = await sendTemplate(orgId, conversationId, campaign.template_id, campaign.variables ?? {}, {
      contactName: contact.name as string,
      packageName: campaign.package?.name ?? null,
      packageDestination: campaign.package?.destination ?? null,
      departureDate: campaign.departure?.departs_on ?? null,
      agencyName: org.name as string,
    }, "campaign");

    if (result.ok) {
      await mark(recipient.recipient_id, { status: "sent", message_id: result.messageId, error: null });
      await admin.from("contact_events").insert({ organization_id: orgId, contact_id: recipient.contact_id, type: "campaign", body: `Campanha “${campaign.name}” enviada.` });
      continue;
    }
    if (result.code === "opt_out" || result.code === "no_consent") {
      // O consentimento é conferido de novo no momento do envio.
      await mark(recipient.recipient_id, { status: "skipped", error: result.error.slice(0, 300) });
      continue;
    }
    if (result.code === "channel" || result.code === "template_not_approved" || ["0", "190", "131031", "368", "131048", "131063", "132001", "132015", "132016"].includes(result.code ?? "")) {
      // Problema do canal ou do template: parar a campanha em vez de falhar contato a contato.
      await release(remaining);
      await admin.from("campaigns").update({ status: "failed", error: result.error.slice(0, 500), finished_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", campaignId);
      return {};
    }
    if (result.retryable) {
      // Limite de envio ou indisponibilidade da Meta: devolve o lote e espera.
      await release(remaining);
      return retryLater(job.attempts, result.error);
    }
    await mark(recipient.recipient_id, { status: "failed", error: result.error.slice(0, 300), message_id: result.messageId });
  }

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "sending"]);
  if (count) {
    await enqueueBatch(admin, orgId, campaignId);
  } else {
    await admin.from("campaigns").update({ status: "completed", finished_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", campaignId).eq("status", "running");
  }
  return {};
}

// --- Laço do executor -------------------------------------------------------

export type TickSummary = { automationsScheduled: number; campaignsStarted: number; jobsDone: number; jobsRetried: number; jobsFailed: number };

/**
 * Um "tique" do agendador: descobre o que venceu, reivindica jobs e executa
 * enquanto houver tempo. Pode rodar em paralelo com outro tique sem duplicar
 * trabalho (a fila usa `skip locked` e chaves únicas).
 */
export async function runTick(admin: SupabaseClient, options: { workerId: string; budgetMs: number }): Promise<TickSummary> {
  const deadline = Date.now() + options.budgetMs;
  const summary: TickSummary = { automationsScheduled: 0, campaignsStarted: 0, jobsDone: 0, jobsRetried: 0, jobsFailed: 0 };

  const scheduled = await admin.rpc("enqueue_due_automations");
  if (!scheduled.error) summary.automationsScheduled = (scheduled.data as number) ?? 0;
  const campaigns = await admin.rpc("enqueue_due_campaigns");
  if (!campaigns.error) summary.campaignsStarted = (campaigns.data as number) ?? 0;

  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("claim_jobs", { p_limit: 5, p_worker: options.workerId });
    const jobs = (data as Job[] | null) ?? [];
    if (error || jobs.length === 0) break;

    for (const job of jobs) {
      let outcome: JobOutcome;
      try {
        if (job.kind === "automation_run") outcome = await runAutomationJob(admin, job);
        else if (job.kind === "campaign_start") outcome = await runCampaignStartJob(admin, job);
        else if (job.kind === "campaign_batch") outcome = await runCampaignBatchJob(admin, job);
        else outcome = { error: "Tipo de job desconhecido." };
      } catch (error) {
        console.error("[cron] job falhou", { kind: job.kind, code: (error as { code?: unknown }).code ?? null });
        outcome = retryLater(job.attempts, "Erro inesperado na execução.");
      }
      const { data: status } = await admin.rpc("finish_job", {
        p_job: job.id,
        p_worker: options.workerId,
        p_error: outcome.error ?? null,
        p_retry_at: outcome.retryAt?.toISOString() ?? null,
      });
      if (status === "done") summary.jobsDone++;
      else if (status === "pending") summary.jobsRetried++;
      else if (status === "failed") {
        summary.jobsFailed++;
        if (job.kind === "automation_run") {
          await admin
            .from("automation_runs")
            .update({ status: "failed", error: (outcome.error ?? "Falhou após várias tentativas.").slice(0, 500), executed_at: new Date().toISOString() })
            .eq("organization_id", job.organization_id)
            .eq("id", String(job.payload.run_id ?? ""))
            .eq("status", "scheduled");
        }
      }
    }
  }
  return summary;
}
