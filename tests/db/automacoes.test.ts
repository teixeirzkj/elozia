import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, twoAgencies, type Agencies, type TestDb } from "./helpers";

let db: TestDb;
let ctx: Agencies;

type Org = { orgId: string; ownerId: string; stages: Record<string, string>; packageId: string; departureId: string; channelId: string; templateId: string };
const org: Record<"a" | "b", Org> = { a: {} as Org, b: {} as Org };

const TASK = JSON.stringify([{ type: "create_task", title: "Retomar contato", due_in_hours: 24 }]);

async function setup(key: "a" | "b", orgId: string, ownerId: string) {
  const stages = await db.admin<{ id: string; name: string }>(`select id, name from pipeline_stages where organization_id = $1`, [orgId]);
  const [pkg] = await db.admin<{ id: string }>(`insert into packages (organization_id, name, destination) values ($1, 'Pacote Teste', 'Destino Fictício') returning id`, [orgId]);
  const [dep] = await db.admin<{ id: string }>(
    `insert into package_departures (organization_id, package_id, departs_on, returns_on) values ($1, $2, current_date + 3, current_date + 6) returning id`,
    [orgId, pkg!.id],
  );
  const [ch] = await db.admin<{ id: string }>(
    `insert into whatsapp_channels (organization_id, waba_id, phone_number_id) values ($1, '900000000000', $2) returning id`,
    [orgId, key === "a" ? "100000000000001" : "200000000000002"],
  );
  const [tpl] = await db.admin<{ id: string }>(
    `insert into whatsapp_templates (organization_id, channel_id, meta_id, name, language, category, status) values ($1, $2, '1', 'oferta', 'pt_BR', 'MARKETING', 'APPROVED') returning id`,
    [orgId, ch!.id],
  );
  org[key] = { orgId, ownerId, stages: Object.fromEntries(stages.map((s) => [s.name, s.id])), packageId: pkg!.id, departureId: dep!.id, channelId: ch!.id, templateId: tpl!.id };
}

async function contact(o: Org, name: string, extra: Record<string, unknown> = {}) {
  const row = { organization_id: o.orgId, name, phone_e164: `+55119${Math.floor(10000000 + Math.random() * 89999999)}`, ...extra };
  const cols = Object.keys(row);
  const [c] = await db.admin<{ id: string }>(
    `insert into contacts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return c!.id;
}

async function opportunity(o: Org, contactId: string, stage = "Em atendimento", staleHours = 0) {
  const [row] = await db.admin<{ id: string }>(
    `insert into opportunities (organization_id, contact_id, stage_id, package_id) values ($1, $2, $3, $4) returning id`,
    [o.orgId, contactId, o.stages[stage], o.packageId],
  );
  if (staleHours) await db.admin(`update opportunities set stage_entered_at = now() - make_interval(hours => $2) where id = $1`, [row!.id, staleHours]);
  return row!.id;
}

/** Cria uma automação já ativa "há `activatedHoursAgo` horas". */
async function automation(o: Org, trigger: string, delayMinutes: number, activatedHoursAgo = 100, extra: Record<string, unknown> = {}) {
  const row = { organization_id: o.orgId, name: `Regra ${trigger}`, trigger_type: trigger, delay_minutes: delayMinutes, actions: TASK, status: "active", ...extra };
  const cols = Object.keys(row);
  const [a] = await db.admin<{ id: string }>(
    `insert into automations (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  await db.admin(`update automations set activated_at = now() - make_interval(hours => $2) where id = $1`, [a!.id, activatedHoursAgo]);
  return a!.id;
}

const enqueue = async () => (await db.admin<{ n: number }>(`select public.enqueue_due_automations() as n`))[0]!.n;
const runsOf = (automationId: string) => db.admin<{ entity_id: string; status: string }>(`select entity_id, status from automation_runs where automation_id = $1 order by created_at`, [automationId]);

beforeAll(async () => {
  db = await createTestDb();
  ctx = await twoAgencies(db);
  await setup("a", ctx.a.orgId, ctx.a.ownerId);
  await setup("b", ctx.b.orgId, ctx.b.ownerId);
});
afterAll(async () => db.close());

describe("agendamento das automações", () => {
  it("oportunidade parada gera uma execução e um job, uma única vez", async () => {
    const stalled = await opportunity(org.a, await contact(org.a, "Parada"), "Em atendimento", 5);
    await opportunity(org.a, await contact(org.a, "Recente"), "Em atendimento", 0);
    const rule = await automation(org.a, "opportunity_stalled", 120);

    expect(await enqueue()).toBe(1);
    expect(await runsOf(rule)).toEqual([{ entity_id: stalled, status: "scheduled" }]);
    const jobs = await db.admin(`select kind, status from jobs where organization_id = $1`, [org.a.orgId]);
    expect(jobs).toEqual([{ kind: "automation_run", status: "pending" }]);

    // chamadas repetidas (ou concorrentes) não duplicam
    expect(await enqueue()).toBe(0);
    expect(await enqueue()).toBe(0);
    expect(await runsOf(rule)).toHaveLength(1);
    expect(await db.admin(`select 1 from jobs where organization_id = $1`, [org.a.orgId])).toHaveLength(1);
  });

  it("mudar de etapa abre uma nova ocorrência para a mesma oportunidade", async () => {
    const [run] = await db.admin<{ entity_id: string; automation_id: string }>(`select entity_id, automation_id from automation_runs limit 1`);
    await db.admin(`update opportunities set stage_id = $2 where id = $1`, [run!.entity_id, org.a.stages["Qualificado"]]);
    expect(await enqueue()).toBe(0); // acabou de entrar na etapa
    await db.admin(`update opportunities set stage_entered_at = now() - interval '3 hours' where id = $1`, [run!.entity_id]);
    expect(await enqueue()).toBe(1);
    expect(await runsOf(run!.automation_id)).toHaveLength(2);
  });

  it("não dispara para o que venceu antes da ativação da regra", async () => {
    await opportunity(org.a, await contact(org.a, "Antiga"), "Negociação", 500);
    const rule = await automation(org.a, "opportunity_stalled", 60, 1, { stage_id: org.a.stages["Negociação"] });
    await enqueue();
    expect(await runsOf(rule)).toHaveLength(0);
  });

  it("regra pausada não agenda nada; ao reativar, só conta o que vencer depois", async () => {
    const rule = await automation(org.a, "opportunity_stalled", 60, 100, { stage_id: org.a.stages["Proposta enviada"] });
    await db.admin(`update automations set status = 'paused' where id = $1`, [rule]);
    await opportunity(org.a, await contact(org.a, "Pausada"), "Proposta enviada", 3);
    await enqueue();
    expect(await runsOf(rule)).toHaveLength(0);
    await db.admin(`update automations set status = 'active' where id = $1`, [rule]);
    const [row] = await db.admin<{ recent: boolean }>(`select activated_at > now() - interval '1 minute' as recent from automations where id = $1`, [rule]);
    expect(row!.recent).toBe(true);
    await enqueue();
    expect(await runsOf(rule)).toHaveLength(0);
  });

  it("condições de etapa, pacote e etiqueta restringem o alcance; contatos de demonstração ficam fora", async () => {
    const [tag] = await db.admin<{ id: string }>(`insert into tags (organization_id, name) values ($1, 'VIP') returning id`, [org.a.orgId]);
    const vip = await contact(org.a, "VIP");
    await db.admin(`insert into contact_tags (organization_id, contact_id, tag_id) values ($1, $2, $3)`, [org.a.orgId, vip, tag!.id]);
    const withTag = await opportunity(org.a, vip, "Pagamento pendente", 10);
    await opportunity(org.a, await contact(org.a, "Sem etiqueta"), "Pagamento pendente", 10);
    await opportunity(org.a, await contact(org.a, "Demo", { is_demo: true }), "Pagamento pendente", 10);
    const rule = await automation(org.a, "opportunity_stalled", 60, 100, { stage_id: org.a.stages["Pagamento pendente"], tag_id: tag!.id, package_id: org.a.packageId });
    await enqueue();
    expect((await runsOf(rule)).map((r) => r.entity_id)).toEqual([withTag]);
  });

  it("proposta sem resposta dispara; com resposta do cliente depois do envio, não", async () => {
    const silent = await contact(org.a, "Silencioso");
    const replied = await contact(org.a, "Respondeu");
    const proposals: string[] = [];
    for (const c of [silent, replied]) {
      const opp = await opportunity(org.a, c);
      const [p] = await db.admin<{ id: string }>(
        `insert into proposals (organization_id, opportunity_id, amount_cents, status, sent_at) values ($1, $2, 100000, 'sent', now() - interval '3 days') returning id`,
        [org.a.orgId, opp],
      );
      proposals.push(p!.id);
    }
    await db.admin(
      `insert into conversations (organization_id, contact_id, channel_id, last_inbound_at) values ($1, $2, $3, now() - interval '1 day')`,
      [org.a.orgId, replied, org.a.channelId],
    );
    const rule = await automation(org.a, "proposal_no_response", 2 * 24 * 60);
    await enqueue();
    expect((await runsOf(rule)).map((r) => r.entity_id)).toEqual([proposals[0]]);
  });

  it("novo lead sem atendimento dispara só enquanto não houver primeira resposta", async () => {
    const waiting = await contact(org.a, "Aguardando");
    const answered = await contact(org.a, "Respondido");
    const ids: string[] = [];
    for (const [c, responded] of [[waiting, false], [answered, true]] as const) {
      const [conv] = await db.admin<{ id: string }>(
        `insert into conversations (organization_id, contact_id, channel_id, cycle_started_at, last_inbound_at, first_response_at)
         values ($1, $2, $3, now() - interval '40 minutes', now() - interval '40 minutes', $4) returning id`,
        [org.a.orgId, c, org.a.channelId, responded ? new Date().toISOString() : null],
      );
      ids.push(conv!.id);
    }
    const rule = await automation(org.a, "new_lead_unattended", 30);
    await enqueue();
    expect((await runsOf(rule)).map((r) => r.entity_id)).toEqual([ids[0]]);
  });

  it("pagamento pendente, viagem próxima e pós-viagem usam as reservas", async () => {
    const c = await contact(org.a, "Viajante");
    const [pending] = await db.admin<{ id: string }>(
      `insert into bookings (organization_id, contact_id, package_id, departure_id, total_cents, status, payment_status, created_at)
       values ($1, $2, $3, $4, 100000, 'confirmed', 'pending', now() - interval '4 days') returning id`,
      [org.a.orgId, c, org.a.packageId, org.a.departureId],
    );
    const [past] = await db.admin<{ id: string }>(
      `insert into package_departures (organization_id, package_id, departs_on, returns_on) values ($1, $2, current_date - 10, current_date - 3) returning id`,
      [org.a.orgId, org.a.packageId],
    );
    const [returned] = await db.admin<{ id: string }>(
      `insert into bookings (organization_id, contact_id, package_id, departure_id, total_cents, status, payment_status)
       values ($1, $2, $3, $4, 100000, 'confirmed', 'paid') returning id`,
      [org.a.orgId, c, org.a.packageId, past!.id],
    );
    await db.admin(
      `insert into bookings (organization_id, contact_id, package_id, departure_id, total_cents, status, payment_status, created_at)
       values ($1, $2, $3, $4, 100000, 'cancelled', 'pending', now() - interval '4 days')`,
      [org.a.orgId, c, org.a.packageId, org.a.departureId],
    );

    const payment = await automation(org.a, "payment_pending", 3 * 24 * 60);
    const upcoming = await automation(org.a, "departure_upcoming", 7 * 24 * 60, 300); // saída em 3 dias: o aviso de 7 dias já venceu
    const post = await automation(org.a, "post_trip", 2 * 24 * 60);
    const tooEarly = await automation(org.a, "departure_upcoming", 24 * 60); // 1 dia antes: ainda não chegou
    await enqueue();
    expect((await runsOf(payment)).map((r) => r.entity_id)).toEqual([pending!.id]);
    expect((await runsOf(upcoming)).map((r) => r.entity_id)).toEqual([pending!.id]);
    expect((await runsOf(post)).map((r) => r.entity_id)).toEqual([returned!.id]);
    expect(await runsOf(tooEarly)).toHaveLength(0);
  });
});

describe("fila de jobs", () => {
  it("um job é reivindicado por um único executor", async () => {
    const first = await db.admin<{ id: string }>(`select id from public.claim_jobs(100, 'executor-1')`);
    expect(first.length).toBeGreaterThan(0);
    const second = await db.admin(`select id from public.claim_jobs(100, 'executor-2')`);
    expect(second).toHaveLength(0);
    // conclui todos para os próximos testes
    for (const job of first) await db.admin(`select public.finish_job($1, 'executor-1', null, null)`, [job.id]);
    expect(await db.admin(`select 1 from jobs where status <> 'done'`)).toHaveLength(0);
  });

  it("só quem reivindicou finaliza; falha reagenda até esgotar as tentativas", async () => {
    const [job] = await db.admin<{ id: string }>(
      `insert into jobs (organization_id, kind, max_attempts) values ($1, 'campaign_batch', 2) returning id`, [org.a.orgId]);
    await db.admin(`select public.claim_jobs(10, 'w1')`);
    expect((await db.admin<{ r: string }>(`select public.finish_job($1, 'intruso', null, null) as r`, [job!.id]))[0]!.r).toBe("ignored");
    expect((await db.admin<{ r: string }>(`select public.finish_job($1, 'w1', 'falha temporária', now() - interval '1 second') as r`, [job!.id]))[0]!.r).toBe("pending");
    await db.admin(`select public.claim_jobs(10, 'w1')`);
    expect((await db.admin<{ r: string }>(`select public.finish_job($1, 'w1', 'falha de novo', now()) as r`, [job!.id]))[0]!.r).toBe("failed");
    const [row] = await db.admin(`select status, attempts, last_error from jobs where id = $1`, [job!.id]);
    expect(row).toEqual({ status: "failed", attempts: 2, last_error: "falha de novo" });
  });

  it("reagendar sem erro (fora do horário) não consome tentativa", async () => {
    const [job] = await db.admin<{ id: string }>(`insert into jobs (organization_id, kind, max_attempts) values ($1, 'campaign_batch', 1) returning id`, [org.a.orgId]);
    await db.admin(`select public.claim_jobs(10, 'w1')`);
    await db.admin(`select public.finish_job($1, 'w1', null, now() + interval '8 hours')`, [job!.id]);
    const [row] = await db.admin(`select status, attempts, run_at > now() as later from jobs where id = $1`, [job!.id]);
    expect(row).toEqual({ status: "pending", attempts: 0, later: true });
    expect(await db.admin(`select id from public.claim_jobs(10, 'w1')`)).toHaveLength(0); // ainda não venceu
    await db.admin(`update jobs set status = 'cancelled' where id = $1`, [job!.id]);
  });

  it("job preso em execução volta à fila depois de 10 minutos", async () => {
    const [job] = await db.admin<{ id: string }>(`insert into jobs (organization_id, kind) values ($1, 'campaign_batch') returning id`, [org.a.orgId]);
    await db.admin(`select public.claim_jobs(10, 'w-travado')`);
    expect(await db.admin(`select id from public.claim_jobs(10, 'w2')`)).toHaveLength(0);
    await db.admin(`update jobs set locked_at = now() - interval '11 minutes' where id = $1`, [job!.id]);
    const reclaimed = await db.admin<{ id: string; locked_by: string; attempts: number }>(`select id, locked_by, attempts from public.claim_jobs(10, 'w2')`);
    expect(reclaimed).toEqual([{ id: job!.id, locked_by: "w2", attempts: 2 }]);
    await db.admin(`select public.finish_job($1, 'w2', null, null)`, [job!.id]);
  });

  it("job cancelado nunca é reivindicado", async () => {
    const [job] = await db.admin<{ id: string }>(`insert into jobs (organization_id, kind, status) values ($1, 'campaign_batch', 'cancelled') returning id`, [org.a.orgId]);
    const claimed = await db.admin<{ id: string }>(`select id from public.claim_jobs(10, 'w1')`);
    expect(claimed.map((j) => j.id)).not.toContain(job!.id);
  });
});

describe("cancelamento e permissões", () => {
  it("gestor cancela execução agendada e o job é cancelado junto", async () => {
    await opportunity(org.a, await contact(org.a, "Para cancelar"), "Novo lead", 9);
    const rule = await automation(org.a, "opportunity_stalled", 60, 100, { stage_id: org.a.stages["Novo lead"] });
    await enqueue();
    const [run] = await db.admin<{ id: string }>(`select id from automation_runs where automation_id = $1`, [rule]);

    await expect(db.as(ctx.a.agentId, (q) => q(`select public.cancel_automation_run($1)`, [run!.id]))).rejects.toThrow(/Sem permissão/);
    await expect(db.as(ctx.b.ownerId, (q) => q(`select public.cancel_automation_run($1)`, [run!.id]))).rejects.toThrow(/não encontrada/);
    await db.as(ctx.a.ownerId, (q) => q(`select public.cancel_automation_run($1)`, [run!.id]));

    expect(await db.admin(`select status from automation_runs where id = $1`, [run!.id])).toEqual([{ status: "cancelled" }]);
    expect(await db.admin(`select status from jobs where dedupe_key = $1`, [`run:${run!.id}`])).toEqual([{ status: "cancelled" }]);
    await expect(db.as(ctx.a.ownerId, (q) => q(`select public.cancel_automation_run($1)`, [run!.id]))).rejects.toThrow(/já foi processada/);
  });

  it("usuários não leem a fila nem chamam as funções do agendador", async () => {
    await expect(db.as(ctx.a.ownerId, (q) => q(`select * from jobs`))).rejects.toThrow(/permission denied/);
    for (const sql of [
      `select public.enqueue_due_automations()`,
      `select public.enqueue_due_campaigns()`,
      `select * from public.claim_jobs(1, 'x')`,
      `select public.start_campaign(gen_random_uuid())`,
      `select * from public.claim_campaign_recipients(gen_random_uuid(), 1)`,
    ]) {
      await expect(db.as(ctx.a.ownerId, (q) => q(sql))).rejects.toThrow(/permission denied/);
    }
  });

  it("atendente lê mas não cria nem altera automações; outra agência não vê nada", async () => {
    expect((await db.as(ctx.a.agentId, (q) => q(`select id from automations`))).length).toBeGreaterThan(0);
    await expect(
      db.as(ctx.a.agentId, (q) => q(`insert into automations (organization_id, name, trigger_type, delay_minutes, actions) values ($1, 'X', 'post_trip', 60, $2)`, [org.a.orgId, TASK])),
    ).rejects.toThrow(/row-level security/);
    const upd = await db.as(ctx.a.agentId, (q) => q(`update automations set status = 'paused'`));
    expect(upd.affected).toBe(0);
    for (const table of ["automations", "automation_runs", "campaigns", "campaign_recipients"]) {
      expect(await db.as(ctx.b.ownerId, (q) => q(`select 1 from ${table} where organization_id = $1`, [org.a.orgId])), table).toHaveLength(0);
    }
    await expect(
      db.as(ctx.b.ownerId, (q) => q(`insert into automations (organization_id, name, trigger_type, delay_minutes, actions) values ($1, 'X', 'post_trip', 60, $2)`, [org.a.orgId, TASK])),
    ).rejects.toThrow(/row-level security/);
  });

  it("automação não referencia etapa, pacote ou etiqueta de outra agência", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into automations (organization_id, name, trigger_type, delay_minutes, actions, stage_id) values ($1, 'X', 'opportunity_stalled', 60, $2, $3)`, [org.a.orgId, TASK, org.b.stages["Novo lead"]]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("automações de uma agência nunca alcançam dados de outra", async () => {
    await opportunity(org.b, await contact(org.b, "Da agência B"), "Em atendimento", 50);
    await enqueue();
    const leaked = await db.admin(`select 1 from automation_runs r join automations a on a.id = r.automation_id where a.organization_id <> r.organization_id`);
    expect(leaked).toHaveLength(0);
    expect(await db.admin(`select 1 from automation_runs where organization_id = $1`, [org.b.orgId])).toHaveLength(0);
  });
});

describe("campanhas", () => {
  let campaignId: string;
  const audience: Record<string, string> = {};

  beforeAll(async () => {
    const make = async (label: string, extra: Record<string, unknown>, interested = true) => {
      const id = await contact(org.a, label, extra);
      if (interested) await opportunity(org.a, id);
      audience[label] = id;
    };
    await make("autorizou", { marketing_consent: "granted" });
    await make("autorizou 2", { marketing_consent: "granted" });
    await make("não informado", {});
    await make("descadastrado", { marketing_consent: "revoked", opted_out_at: new Date().toISOString() });
    await make("sem telefone", { marketing_consent: "granted", phone_e164: null });
    await make("demonstração", { marketing_consent: "granted", is_demo: true });
    await make("sem interesse", { marketing_consent: "granted" }, false);
    // contato da outra agência com consentimento e interesse em pacote da própria agência
    const other = await contact(org.b, "outra agência", { marketing_consent: "granted" });
    await opportunity(org.b, other);
  });

  it("o público inclui só quem autorizou, tem interesse no pacote e pode receber", async () => {
    const [row] = await db.as(ctx.a.ownerId, (q) => q<{ n: number }>(`select public.campaign_audience_count($1, true, '{}') as n`, [org.a.packageId]));
    expect(row!.n).toBe(2);
    await expect(db.as(ctx.a.agentId, (q) => q(`select public.campaign_audience_count($1, true, '{}')`, [org.a.packageId]))).rejects.toThrow(/Sem permissão/);
    // o pacote de outra agência não devolve ninguém
    const [foreign] = await db.as(ctx.a.ownerId, (q) => q<{ n: number }>(`select public.campaign_audience_count($1, true, '{}') as n`, [org.b.packageId]));
    expect(foreign!.n).toBe(0);
  });

  it("campanha sem segmento é recusada; atendente não cria campanha", async () => {
    const insert = (interest: boolean, userId: string) =>
      db.as(userId, (q) =>
        q(
          `insert into campaigns (organization_id, name, package_id, template_id, audience_interest, scheduled_at, status) values ($1, 'Oferta', $2, $3, $4, now() - interval '1 minute', 'scheduled') returning id`,
          [org.a.orgId, org.a.packageId, org.a.templateId, interest],
        ),
      );
    await expect(insert(false, ctx.a.ownerId)).rejects.toThrow(/check constraint/);
    await expect(insert(true, ctx.a.agentId)).rejects.toThrow(/row-level security/);
    const [row] = await insert(true, ctx.a.ownerId);
    campaignId = (row as { id: string }).id;
  });

  it("gestor não marca campanha como concluída ou em execução por conta própria", async () => {
    await expect(db.as(ctx.a.ownerId, (q) => q(`update campaigns set status = 'completed' where id = $1`, [campaignId]))).rejects.toThrow(/row-level security/);
    await expect(db.as(ctx.a.ownerId, (q) => q(`update campaigns set status = 'running' where id = $1`, [campaignId]))).rejects.toThrow(/row-level security/);
  });

  it("no horário agendado a campanha entra na fila uma única vez e congela os destinatários", async () => {
    await db.admin(`select public.enqueue_due_campaigns()`);
    await db.admin(`select public.enqueue_due_campaigns()`);
    expect(await db.admin(`select status from jobs where dedupe_key = $1`, [`campaign_start:${campaignId}`])).toEqual([{ status: "pending" }]);

    const [started] = await db.admin<{ n: number }>(`select public.start_campaign($1) as n`, [campaignId]);
    expect(started!.n).toBe(2);
    const [again] = await db.admin<{ n: number }>(`select public.start_campaign($1) as n`, [campaignId]);
    expect(again!.n).toBe(-1); // já iniciada: não duplica
    const recipients = await db.admin<{ contact_id: string }>(`select contact_id from campaign_recipients where campaign_id = $1`, [campaignId]);
    expect(new Set(recipients.map((r) => r.contact_id))).toEqual(new Set([audience["autorizou"], audience["autorizou 2"]]));
    expect(await db.admin(`select status, total_recipients from campaigns where id = $1`, [campaignId])).toEqual([{ status: "running", total_recipients: 2 }]);
  });

  it("cada destinatário é reservado para envio uma única vez", async () => {
    const first = await db.admin(`select * from public.claim_campaign_recipients($1, 1)`, [campaignId]);
    const second = await db.admin(`select * from public.claim_campaign_recipients($1, 10)`, [campaignId]);
    const third = await db.admin(`select * from public.claim_campaign_recipients($1, 10)`, [campaignId]);
    expect([first.length, second.length, third.length]).toEqual([1, 1, 0]);
    await db.admin(`update campaign_recipients set status = 'pending' where campaign_id = $1`, [campaignId]);
  });

  it("cancelar a campanha cancela destinatários pendentes e jobs", async () => {
    await db.admin(`insert into jobs (organization_id, kind, payload) values ($1, 'campaign_batch', $2)`, [org.a.orgId, JSON.stringify({ campaign_id: campaignId })]);
    const res = await db.as(ctx.a.ownerId, (q) => q(`update campaigns set status = 'cancelled' where id = $1`, [campaignId]));
    expect(res.affected).toBe(1);
    const statuses = await db.admin<{ status: string }>(`select distinct status from campaign_recipients where campaign_id = $1`, [campaignId]);
    expect(statuses).toEqual([{ status: "cancelled" }]);
    const jobs = await db.admin<{ status: string }>(`select status from jobs where payload ->> 'campaign_id' = $1 and status = 'pending'`, [campaignId]);
    expect(jobs).toHaveLength(0);
    expect(await db.admin(`select * from public.claim_campaign_recipients($1, 10)`, [campaignId])).toHaveLength(0);
  });

  it("campanha não usa pacote ou template de outra agência", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into campaigns (organization_id, name, package_id, template_id) values ($1, 'X', $2, $3)`, [org.a.orgId, org.b.packageId, org.a.templateId]),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into campaigns (organization_id, name, package_id, template_id) values ($1, 'X', $2, $3)`, [org.a.orgId, org.a.packageId, org.b.templateId]),
      ),
    ).rejects.toThrow(/foreign key/);
  });
});
