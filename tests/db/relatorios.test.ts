import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, twoAgencies, type Agencies, type TestDb } from "./helpers";

let db: TestDb;
let ctx: Agencies;
let supervisorA: string;
const stage: Record<string, string> = {};
let packageId: string;

const RANGE = [new Date(Date.now() - 30 * 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString()] as const;

type Json = Record<string, unknown>;
const call = async <T = Json>(userId: string, fn: string, extra = "") => {
  const rows = await db.as(userId, (q) => q<{ r: T }>(`select public.${fn}($1, $2${extra}) as r`, [...RANGE]));
  return rows[0]!.r;
};
const report = <T = Json[]>(userId: string, name: string, owner: string | null = null, pkg: string | null = null) =>
  db.as(userId, async (q) => (await q<{ r: T }>(`select public.report_${name}($1, $2, $3, $4) as r`, [...RANGE, owner, pkg]))[0]!.r);

/** Cenário fictício e pequeno, com números conhecidos, criado pelos caminhos reais. */
beforeAll(async () => {
  db = await createTestDb();
  ctx = await twoAgencies(db);
  supervisorA = await db.addMember(ctx.a.orgId, "supervisora.a@exemplo.test", "supervisor");
  const A = ctx.a.orgId;

  for (const s of await db.admin<{ id: string; name: string }>(`select id, name from pipeline_stages where organization_id = $1`, [A])) stage[s.name] = s.id;
  const [pkg] = await db.admin<{ id: string }>(`insert into packages (organization_id, name, destination) values ($1, 'Pacote Teste', 'Destino Fictício') returning id`, [A]);
  packageId = pkg!.id;
  const [dep] = await db.admin<{ id: string }>(
    `insert into package_departures (organization_id, package_id, departs_on, seats_total) values ($1, $2, current_date + 10, 20) returning id`, [A, packageId]);

  await db.as(ctx.a.ownerId, async (q) => {
    const contacts: string[] = [];
    for (const [name, source, owner] of [
      ["Lead 1", "instagram", ctx.a.agentId], ["Lead 2", "instagram", ctx.a.agentId], ["Lead 3", "indicacao", supervisorA], ["Lead 4", "site", null],
    ] as const) {
      const [c] = await q<{ id: string }>(`insert into contacts (organization_id, name, source, owner_id) values ($1, $2, $3, $4) returning id`, [A, name, source, owner]);
      contacts.push(c!.id);
    }
    // contato de demonstração nunca entra nos números
    await q(`insert into contacts (organization_id, name, is_demo) values ($1, 'Demo', true)`, [A]);

    const opp = async (contact: string, owner: string | null, value: number, withPackage = true) =>
      (await q<{ id: string }>(
        `insert into opportunities (organization_id, contact_id, stage_id, owner_id, estimated_value_cents, package_id) values ($1, $2, $3, $4, $5, $6) returning id`,
        [A, contact, stage["Novo lead"], owner, value, withPackage ? packageId : null],
      ))[0]!.id;
    const o1 = await opp(contacts[0]!, ctx.a.agentId, 500000); // ganha
    const o2 = await opp(contacts[1]!, ctx.a.agentId, 300000); // perdida por preço
    const o3 = await opp(contacts[2]!, supervisorA, 200000); // perdida por preço
    await opp(contacts[3]!, null, 100000, false); // aberta, sem pacote

    await q(`select public.move_opportunity($1, $2)`, [o1, stage["Proposta enviada"]]);
    await q(`insert into proposals (organization_id, opportunity_id, amount_cents, status, sent_at) values ($1, $2, 480000, 'sent', now())`, [A, o1]);
    await q(`insert into proposals (organization_id, opportunity_id, amount_cents, status) values ($1, $2, 300000, 'draft')`, [A, o2]);
    await q(`select public.move_opportunity($1, $2)`, [o1, stage["Venda confirmada"]]);
    await q(`select public.move_opportunity($1, $2, null, 'Preço')`, [o2, stage["Perdido"]]);
    await q(`select public.move_opportunity($1, $2, null, ' preço ')`, [o3, stage["Perdido"]]);

    await q(
      `insert into bookings (organization_id, contact_id, opportunity_id, package_id, departure_id, travelers, total_cents, status, confirmed_at)
       values ($1, $2, $3, $4, $5, 2, 480000, 'confirmed', now())`, [A, contacts[0], o1, packageId, dep!.id]);
    await q(
      `insert into bookings (organization_id, contact_id, package_id, departure_id, travelers, total_cents, status)
       values ($1, $2, $3, $4, 3, 900000, 'pending')`, [A, contacts[1], packageId, dep!.id]);
    await q(`insert into tasks (organization_id, title, due_at) values ($1, 'Atrasada', now() - interval '1 day'), ($1, 'Futura', now() + interval '1 day')`, [A]);
    await q(`insert into tasks (organization_id, title, done_at) values ($1, 'Feita', now())`, [A]);
  });

  // Atendimento: uma conversa pendente e uma concluída com primeira resposta em 120 s.
  const [ch] = await db.admin<{ id: string }>(`insert into whatsapp_channels (organization_id, waba_id, phone_number_id) values ($1, '900000000000', '100000000000001') returning id`, [A]);
  await db.admin(`select * from public.ingest_whatsapp_message('100000000000001', '5511911110001', '+5511911110001', null, 'WhatsApp 1', 'w1', 'text', 'oi', null, null, null, now())`);
  const [done] = await db.admin<{ conversation_id: string }>(
    `select conversation_id from public.ingest_whatsapp_message('100000000000001', '5511911110002', '+5511911110002', null, 'WhatsApp 2', 'w2', 'text', 'oi', null, null, null, now())`);
  await db.as(ctx.a.agentId, (q) => q(`select public.assume_conversation($1)`, [done!.conversation_id]));
  await db.admin(`insert into messages (organization_id, conversation_id, direction, type, body, status, sender_id) values ($1, $2, 'out', 'text', 'Olá', 'sent', $3)`, [A, done!.conversation_id, ctx.a.agentId]);
  await db.admin(`insert into conversation_events (organization_id, conversation_id, type, actor_id, metadata) values ($1, $2, 'first_response', $3, '{"seconds": 120}')`, [A, done!.conversation_id, ctx.a.agentId]);
  await db.as(ctx.a.agentId, (q) => q(`select public.close_conversation($1)`, [done!.conversation_id]));
  void ch;

  // Dados na agência B, que não podem aparecer em nenhum número da A.
  const [cb] = await db.admin<{ id: string }>(`insert into contacts (organization_id, name, source) values ($1, 'Lead B', 'instagram') returning id`, [ctx.b.orgId]);
  const [sb] = await db.admin<{ id: string }>(`select id from pipeline_stages where organization_id = $1 and kind = 'won'`, [ctx.b.orgId]);
  await db.admin(`insert into opportunities (organization_id, contact_id, stage_id, estimated_value_cents) values ($1, $2, $3, 99999900)`, [ctx.b.orgId, cb!.id, sb!.id]);
  await db.admin(`insert into bookings (organization_id, contact_id, total_cents, status, confirmed_at) values ($1, $2, 99999900, 'confirmed', now())`, [ctx.b.orgId, cb!.id]);
});
afterAll(async () => db.close());

describe("dashboard", () => {
  it("calcula os indicadores a partir dos registros reais", async () => {
    const m = await call(ctx.a.agentId, "dashboard_metrics");
    expect(m).toEqual({
      leads: 6, // 4 cadastrados + 2 criados pelo WhatsApp; o de demonstração fica fora
      open_opportunities: 1,
      open_value_cents: 100000,
      proposals_sent: 1,
      sales_won: 1,
      bookings_confirmed: 1,
      sales_value_cents: 480000,
      sales_other_currencies: 0,
      conversations_pending: 1,
      conversations_open: 0,
      conversations_closed: 1,
      first_response_count: 1,
      first_response_avg_seconds: 120,
      tasks_open: 2,
      tasks_overdue: 1,
    });
  });

  it("sem dados, devolve zeros e média nula (nada inventado)", async () => {
    const { ownerId } = await db.createAgency("Agência Vazia", "vazia@exemplo.test");
    const m = await call<Record<string, number | null>>(ownerId, "dashboard_metrics");
    expect(m.first_response_avg_seconds).toBeNull();
    expect(Object.entries(m).filter(([k, v]) => k !== "first_response_avg_seconds" && v !== 0)).toEqual([]);
    expect(await db.as(ownerId, async (q) => (await q<{ r: unknown[] }>(`select public.upcoming_departures() as r`))[0]!.r)).toEqual([]);
  });

  it("fora do período, os números do período zeram", async () => {
    const rows = await db.as(ctx.a.ownerId, (q) => q<{ r: Record<string, number> }>(`select public.dashboard_metrics(now() - interval '90 days', now() - interval '60 days') as r`));
    expect(rows[0]!.r).toMatchObject({ leads: 0, proposals_sent: 0, sales_won: 0, sales_value_cents: 0, conversations_closed: 0, open_opportunities: 1 });
  });

  it("próximas viagens somam viajantes de reservas não canceladas", async () => {
    const rows = await db.as(ctx.a.agentId, async (q) => (await q<{ r: Json[] }>(`select public.upcoming_departures() as r`))[0]!.r);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ package_name: "Pacote Teste", seats_total: 20, travelers_booked: 5 });
  });

  it("os números de uma agência não incluem os de outra", async () => {
    const b = await call<Record<string, number>>(ctx.b.ownerId, "dashboard_metrics");
    expect(b).toMatchObject({ leads: 1, sales_won: 1, sales_value_cents: 99999900, proposals_sent: 0, conversations_pending: 0 });
  });
});

describe("relatórios", () => {
  it("são restritos a gestores", async () => {
    for (const name of ["sales", "funnel", "packages", "sources", "attendance", "campaigns", "lost"]) {
      await expect(report(ctx.a.agentId, name)).rejects.toThrow(/Sem permissão/);
    }
    await expect(db.as(null, (q) => q(`select public.report_sales(now(), now(), null, null)`))).rejects.toThrow();
  });

  it("desempenho comercial por responsável", async () => {
    const rows = await report(supervisorA, "sales");
    const by = Object.fromEntries(rows.map((r) => [r.owner_name, r]));
    expect(by["atendente.a"]).toMatchObject({ created: 2, won: 1, lost: 1, open_now: 0, won_value_cents: 500000, proposals_sent: 1 });
    expect(by["supervisora.a"]).toMatchObject({ created: 1, won: 0, lost: 1, won_value_cents: 0, proposals_sent: 0 });
    expect(by["Sem responsável"]).toMatchObject({ created: 1, open_now: 1 });
  });

  it("filtros de atendente e de viagem restringem os números", async () => {
    const onlyAgent = await report(ctx.a.ownerId, "sales", ctx.a.agentId);
    expect(onlyAgent.map((r) => r.owner_name)).toEqual(["atendente.a"]);
    const onlyPackage = await report(ctx.a.ownerId, "sales", null, packageId);
    expect(onlyPackage.map((r) => r.owner_name).sort()).toEqual(["atendente.a", "supervisora.a"]);
  });

  it("conversão por etapa conta quem entrou em cada etapa", async () => {
    const rows = await report(ctx.a.ownerId, "funnel");
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(rows.map((r) => r.name)).toEqual(["Novo lead", "Em atendimento", "Qualificado", "Proposta enviada", "Negociação", "Pagamento pendente", "Venda confirmada", "Perdido"]);
    expect(by["Novo lead"]).toMatchObject({ entered: 4, current_count: 1, current_value_cents: 100000 });
    expect(by["Proposta enviada"]).toMatchObject({ entered: 1, current_count: 0 });
    expect(by["Venda confirmada"]).toMatchObject({ entered: 1, current_count: 1 });
    expect(by["Perdido"]).toMatchObject({ entered: 2, current_count: 2 });
    expect(by["Negociação"]).toMatchObject({ entered: 0, current_count: 0 });
  });

  it("vendas por pacote usam reservas confirmadas", async () => {
    expect(await report(ctx.a.ownerId, "packages")).toEqual([
      expect.objectContaining({ package_name: "Pacote Teste", opportunities: 3, won: 1, bookings: 1, travelers: 2, revenue_cents: 480000 }),
    ]);
  });

  it("origem dos leads", async () => {
    const rows = await report(ctx.a.ownerId, "sources");
    const by = Object.fromEntries(rows.map((r) => [r.source, r]));
    expect(by["instagram"]).toMatchObject({ leads: 2, with_opportunity: 2, with_sale: 1 });
    expect(by["whatsapp"]).toMatchObject({ leads: 2, with_opportunity: 0, with_sale: 0 });
    expect(by["indicacao"]).toMatchObject({ leads: 1, with_sale: 0 });
    expect(rows.reduce((sum, r) => sum + (r.leads as number), 0)).toBe(6);
  });

  it("atendimentos por usuário", async () => {
    expect(await report(ctx.a.ownerId, "attendance")).toEqual([
      expect.objectContaining({ user_name: "atendente.a", assumed: 1, closed: 1, messages_sent: 1, first_response_avg_seconds: 120, open_now: 0 }),
    ]);
  });

  it("oportunidades perdidas agrupadas por motivo", async () => {
    const rows = await report(ctx.a.ownerId, "lost");
    // "Preço" e " preço " contam como o mesmo motivo
    expect(rows).toEqual([{ reason: "Preço", lost: 2, value_cents: 500000 }]);
  });

  it("campanhas e automações sem execução aparecem zeradas, sem números fictícios", async () => {
    await db.admin(
      `insert into automations (organization_id, name, trigger_type, delay_minutes, actions) values ($1, 'Regra', 'post_trip', 60, '[{"type":"create_task","title":"x","due_in_hours":1}]')`,
      [ctx.a.orgId],
    );
    const r = await report<{ campaigns: Json[]; automations: Json[] }>(ctx.a.ownerId, "campaigns");
    expect(r.campaigns).toEqual([]);
    expect(r.automations).toEqual([expect.objectContaining({ name: "Regra", runs: 0, success: 0, failed: 0 })]);
  });

  it("gestor de outra agência só vê os próprios números", async () => {
    expect(await report(ctx.b.ownerId, "packages")).toEqual([]);
    const sources = await report(ctx.b.ownerId, "sources");
    expect(sources).toEqual([expect.objectContaining({ source: "instagram", leads: 1 })]);
    // filtrar pelo pacote ou atendente de outra agência não revela nada
    expect(await report(ctx.b.ownerId, "sales", ctx.a.agentId)).toEqual([]);
    expect(await report(ctx.b.ownerId, "packages", null, packageId)).toEqual([]);
  });
});

describe("retenção", () => {
  it("remove só registros técnicos antigos e não é acessível a usuários", async () => {
    await db.admin(`insert into webhook_events (dedupe_key, kind, received_at) values ('antigo', 'message', now() - interval '31 days'), ('recente', 'message', now())`);
    await db.admin(`insert into jobs (organization_id, kind, status, finished_at) values ($1, 'campaign_batch', 'done', now() - interval '40 days'), ($1, 'campaign_batch', 'pending', null)`, [ctx.a.orgId]);
    await expect(db.as(ctx.a.ownerId, (q) => q(`select public.purge_technical_logs()`))).rejects.toThrow(/permission denied/);
    const [row] = await db.admin<{ r: Json }>(`select public.purge_technical_logs() as r`);
    expect(row!.r).toEqual({ webhook_events: 1, jobs: 1 });
    expect(await db.admin(`select dedupe_key from webhook_events where dedupe_key in ('antigo', 'recente')`)).toEqual([{ dedupe_key: "recente" }]);
    expect(await db.admin(`select 1 from jobs where status = 'pending'`)).toHaveLength(1);
    expect((await db.admin<{ n: number }>(`select count(*)::int as n from contacts`))[0]!.n).toBeGreaterThan(0);
  });
});
