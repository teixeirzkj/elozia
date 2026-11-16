import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, twoAgencies, type Agencies, type TestDb } from "./helpers";

let db: TestDb;
let ctx: Agencies;
let supervisorA: string;

type Seed = { contactId: string; packageId: string; departureId: string; opportunityId: string; stages: Record<string, string> };
const seed: Record<"a" | "b", Seed> = { a: {} as Seed, b: {} as Seed };

/** Dados fictícios de teste criados pelo caminho real (como usuário, sob RLS). */
async function seedAgency(key: "a" | "b", orgId: string, ownerId: string) {
  const stages = await db.admin<{ id: string; name: string }>(
    `select id, name from pipeline_stages where organization_id = $1 order by position`,
    [orgId],
  );
  const byName = Object.fromEntries(stages.map((s) => [s.name, s.id]));
  await db.as(ownerId, async (q) => {
    const [contact] = await q<{ id: string }>(
      `insert into contacts (organization_id, name, phone_e164, created_by) values ($1, $2, $3, $4) returning id`,
      [orgId, `Contato Teste ${key.toUpperCase()}`, key === "a" ? "+5511900000001" : "+5511900000002", ownerId],
    );
    const [pkg] = await q<{ id: string }>(
      `insert into packages (organization_id, name, destination, price_cents) values ($1, 'Pacote Teste', 'Destino Fictício', 250000) returning id`,
      [orgId],
    );
    const [dep] = await q<{ id: string }>(
      `insert into package_departures (organization_id, package_id, departs_on, returns_on, seats_total) values ($1, $2, '2030-01-10', '2030-01-17', 20) returning id`,
      [orgId, pkg!.id],
    );
    const [opp] = await q<{ id: string }>(
      `insert into opportunities (organization_id, contact_id, package_id, departure_id, stage_id, estimated_value_cents, travelers)
       values ($1, $2, $3, $4, $5, 500000, 2) returning id`,
      [orgId, contact!.id, pkg!.id, dep!.id, byName["Novo lead"]],
    );
    seed[key] = { contactId: contact!.id, packageId: pkg!.id, departureId: dep!.id, opportunityId: opp!.id, stages: byName };
  });
}

beforeAll(async () => {
  db = await createTestDb();
  ctx = await twoAgencies(db);
  supervisorA = await db.addMember(ctx.a.orgId, "supervisora.a@exemplo.test", "supervisor");
  await seedAgency("a", ctx.a.orgId, ctx.a.ownerId);
  await seedAgency("b", ctx.b.orgId, ctx.b.ownerId);
});
afterAll(async () => db.close());

const CRM_TABLES = [
  "contacts", "contact_events", "contact_tags", "tags", "packages", "package_departures",
  "pipeline_stages", "opportunities", "opportunity_stage_history", "proposals", "bookings", "tasks",
];

describe("funil padrão", () => {
  it("toda agência nasce com as oito etapas", async () => {
    const rows = await db.as(ctx.a.agentId, (q) => q<{ name: string; kind: string }>(`select name, kind from pipeline_stages order by position`));
    expect(rows.map((r) => r.name)).toEqual([
      "Novo lead", "Em atendimento", "Qualificado", "Proposta enviada",
      "Negociação", "Pagamento pendente", "Venda confirmada", "Perdido",
    ]);
    expect(rows.at(-2)!.kind).toBe("won");
    expect(rows.at(-1)!.kind).toBe("lost");
  });
});

describe("isolamento do CRM", () => {
  it("nenhuma tabela do CRM mostra linhas de outra agência", async () => {
    // garante que existam linhas em todas as tabelas da agência B
    await db.as(ctx.b.ownerId, async (q) => {
      const [tag] = await q<{ id: string }>(`insert into tags (organization_id, name) values ($1, 'VIP') returning id`, [ctx.b.orgId]);
      await q(`insert into contact_tags (organization_id, contact_id, tag_id) values ($1, $2, $3)`, [ctx.b.orgId, seed.b.contactId, tag!.id]);
      await q(`insert into proposals (organization_id, opportunity_id, amount_cents) values ($1, $2, 480000)`, [ctx.b.orgId, seed.b.opportunityId]);
      await q(`insert into bookings (organization_id, contact_id, total_cents) values ($1, $2, 480000)`, [ctx.b.orgId, seed.b.contactId]);
      await q(`insert into tasks (organization_id, title, contact_id) values ($1, 'Ligar', $2)`, [ctx.b.orgId, seed.b.contactId]);
    });
    for (const table of CRM_TABLES) {
      const total = await db.admin<{ n: number }>(`select count(*)::int as n from ${table} where organization_id = $1`, [ctx.b.orgId]);
      expect(total[0]!.n, `${table} deveria ter dados na agência B`).toBeGreaterThan(0);
      const leaked = await db.as(ctx.a.ownerId, (q) => q(`select 1 from ${table} where organization_id = $1`, [ctx.b.orgId]));
      expect(leaked, `${table} vazou para a agência A`).toHaveLength(0);
    }
  });

  it("não grava em outra agência", async () => {
    for (const sql of [
      `insert into contacts (organization_id, name) values ('${ctx.b.orgId}', 'Intruso')`,
      `insert into packages (organization_id, name, destination) values ('${ctx.b.orgId}', 'X', 'Y')`,
      `insert into tags (organization_id, name) values ('${ctx.b.orgId}', 'X')`,
      `insert into tasks (organization_id, title) values ('${ctx.b.orgId}', 'X')`,
    ]) {
      await expect(db.as(ctx.a.ownerId, (q) => q(sql))).rejects.toThrow(/row-level security/);
    }
    const upd = await db.as(ctx.a.ownerId, (q) => q(`update contacts set name = 'Hack' where id = $1`, [seed.b.contactId]));
    expect(upd.affected).toBe(0);
    const del = await db.as(ctx.a.ownerId, (q) => q(`delete from contacts where id = $1`, [seed.b.contactId]));
    expect(del.affected).toBe(0);
  });

  it("não liga registros a dados de outra agência (chaves compostas)", async () => {
    // oportunidade da agência A apontando para contato, pacote ou etapa da agência B
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into opportunities (organization_id, contact_id, stage_id) values ($1, $2, $3)`, [ctx.a.orgId, seed.b.contactId, seed.a.stages["Novo lead"]]),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into opportunities (organization_id, contact_id, stage_id) values ($1, $2, $3)`, [ctx.a.orgId, seed.a.contactId, seed.b.stages["Novo lead"]]),
      ),
    ).rejects.toThrow(/Etapa inválida/);
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`update opportunities set package_id = $1 where id = $2`, [seed.b.packageId, seed.a.opportunityId])),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`update contacts set owner_id = $1 where id = $2`, [ctx.b.agentId, seed.a.contactId])),
    ).rejects.toThrow(/foreign key/);
  });

  it("move_opportunity não alcança oportunidade de outra agência", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.b.opportunityId, seed.a.stages["Qualificado"]])),
    ).rejects.toThrow(/não encontrada/);
  });

  it("o mesmo telefone pode existir em agências diferentes, mas não duas vezes na mesma", async () => {
    await db.as(ctx.b.ownerId, (q) => q(`insert into contacts (organization_id, name, phone_e164) values ($1, 'Mesmo número', '+5511900000001')`, [ctx.b.orgId]));
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into contacts (organization_id, name, phone_e164) values ($1, 'Duplicado', '+5511900000001')`, [ctx.a.orgId])),
    ).rejects.toThrow(/unique|duplicate/);
  });
});

describe("CRUD e regras", () => {
  it("contato: cria, edita, etiqueta e registra histórico", async () => {
    await db.as(ctx.a.agentId, async (q) => {
      const [c] = await q<{ id: string }>(
        `insert into contacts (organization_id, name, source, owner_id) values ($1, 'Maria Teste', 'indicacao', $2) returning id`,
        [ctx.a.orgId, ctx.a.agentId],
      );
      await q(`update contacts set email = 'maria@exemplo.test', marketing_consent = 'granted', consent_at = now(), consent_source = 'Formulário' where id = $1`, [c!.id]);
      await q(`insert into contact_events (organization_id, contact_id, type, body, actor_id) values ($1, $2, 'note', 'Prefere contato à tarde', $3)`, [ctx.a.orgId, c!.id, ctx.a.agentId]);
      const events = await q(`select type from contact_events where contact_id = $1`, [c!.id]);
      expect(events).toHaveLength(1);
      // atendente não exclui contato
      const del = await q(`delete from contacts where id = $1`, [c!.id]);
      expect(del.affected).toBe(0);
    });
  });

  it("telefone fora do formato E.164 é recusado pelo banco", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into contacts (organization_id, name, phone_e164) values ($1, 'X', '11999990000')`, [ctx.a.orgId])),
    ).rejects.toThrow(/check constraint/);
  });

  it("atendente lê o catálogo mas não o altera; supervisor altera", async () => {
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from packages`))).toHaveLength(1);
    await expect(
      db.as(ctx.a.agentId, (q) => q(`insert into packages (organization_id, name, destination) values ($1, 'X', 'Y')`, [ctx.a.orgId])),
    ).rejects.toThrow(/row-level security/);
    const res = await db.as(ctx.a.agentId, (q) => q(`update packages set status = 'closed' where id = $1`, [seed.a.packageId]));
    expect(res.affected).toBe(0);
    const ok = await db.as(supervisorA, (q) => q(`update packages set status = 'paused' where id = $1`, [seed.a.packageId]));
    expect(ok.affected).toBe(1);
  });

  it("saída com retorno antes da ida é recusada; um pacote aceita várias saídas", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into package_departures (organization_id, package_id, departs_on, returns_on) values ($1, $2, '2030-05-10', '2030-05-01')`, [ctx.a.orgId, seed.a.packageId])),
    ).rejects.toThrow(/check constraint/);
    await db.as(ctx.a.ownerId, (q) => q(`insert into package_departures (organization_id, package_id, departs_on) values ($1, $2, '2030-07-01')`, [ctx.a.orgId, seed.a.packageId]));
    const rows = await db.as(ctx.a.agentId, (q) => q(`select id from package_departures where package_id = $1`, [seed.a.packageId]));
    expect(rows).toHaveLength(2);
  });

  it("proposta e reserva ficam ligadas à oportunidade e ao contato", async () => {
    await db.as(ctx.a.agentId, async (q) => {
      await q(`insert into proposals (organization_id, opportunity_id, amount_cents, status, sent_at) values ($1, $2, 470000, 'sent', now())`, [ctx.a.orgId, seed.a.opportunityId]);
      await q(
        `insert into bookings (organization_id, contact_id, opportunity_id, package_id, departure_id, travelers, total_cents, payment_method, amount_paid_cents, payment_status)
         values ($1, $2, $3, $4, $5, 2, 470000, 'pix', 100000, 'partial')`,
        [ctx.a.orgId, seed.a.contactId, seed.a.opportunityId, seed.a.packageId, seed.a.departureId],
      );
      const rows = await q(`select b.payment_status, p.status from bookings b join proposals p on p.opportunity_id = b.opportunity_id where b.contact_id = $1`, [seed.a.contactId]);
      expect([...rows]).toEqual([{ payment_status: "partial", status: "sent" }]);
    });
  });

  it("forma de pagamento fora da lista é recusada (nada de dados de cartão em texto livre)", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into bookings (organization_id, contact_id, total_cents, payment_method) values ($1, $2, 1, '4111 1111 1111 1111')`, [ctx.a.orgId, seed.a.contactId])),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("Kanban", () => {
  const stage = (name: string) => seed.a.stages[name]!;

  it("mover grava etapa, histórico e evento no contato", async () => {
    await db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Qualificado")]));
    const [opp] = await db.admin<{ stage_id: string; status: string }>(`select stage_id, status from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp).toEqual({ stage_id: stage("Qualificado"), status: "open" });
    const history = await db.admin<{ from_stage_id: string | null; to_stage_id: string; moved_by: string }>(
      `select from_stage_id, to_stage_id, moved_by from opportunity_stage_history where opportunity_id = $1 order by id`,
      [seed.a.opportunityId],
    );
    expect(history).toEqual([
      { from_stage_id: null, to_stage_id: stage("Novo lead"), moved_by: ctx.a.ownerId },
      { from_stage_id: stage("Novo lead"), to_stage_id: stage("Qualificado"), moved_by: ctx.a.ownerId },
    ]);
    const events = await db.admin(`select body from contact_events where contact_id = $1 and type = 'stage_change' order by created_at`, [seed.a.contactId]);
    expect(events.at(-1)).toEqual({ body: "Oportunidade movida para Qualificado" });
  });

  it("ordena os cartões dentro da coluna", async () => {
    const ids: string[] = [];
    await db.as(ctx.a.ownerId, async (q) => {
      for (const name of ["Um", "Dois", "Três"]) {
        const [c] = await q<{ id: string }>(`insert into contacts (organization_id, name) values ($1, $2) returning id`, [ctx.a.orgId, name]);
        const [o] = await q<{ id: string }>(`insert into opportunities (organization_id, contact_id, stage_id) values ($1, $2, $3) returning id`, [ctx.a.orgId, c!.id, stage("Em atendimento")]);
        ids.push(o!.id);
      }
      // "Três" vai para o topo; "Um" vai para logo depois de "Dois"
      await q(`select public.move_opportunity($1, $2, null)`, [ids[2], stage("Em atendimento")]);
      await q(`select public.move_opportunity($1, $2, $3)`, [ids[0], stage("Em atendimento"), ids[1]]);
    });
    const order = await db.admin<{ id: string }>(`select id from opportunities where stage_id = $1 order by position`, [stage("Em atendimento")]);
    expect(order.map((r) => r.id)).toEqual([ids[2], ids[1], ids[0]]);
  });

  it("etapa de perda exige motivo; ganho e perda fecham a oportunidade", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Perdido")])),
    ).rejects.toThrow(/motivo da perda/);
    await db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2, null, 'Preço')`, [seed.a.opportunityId, stage("Perdido")]));
    let [opp] = await db.admin<{ status: string; lost_reason: string | null; closed: boolean }>(
      `select status, lost_reason, closed_at is not null as closed from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp).toEqual({ status: "lost", lost_reason: "Preço", closed: true });
    await db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Venda confirmada")]));
    [opp] = await db.admin(`select status, lost_reason, closed_at is not null as closed from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp).toEqual({ status: "won", lost_reason: null, closed: true });
    await db.as(ctx.a.ownerId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Negociação")]));
    [opp] = await db.admin(`select status, lost_reason, closed_at is not null as closed from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp).toEqual({ status: "open", lost_reason: null, closed: false });
  });

  it("atendente só move as próprias oportunidades ou as sem responsável; supervisor move qualquer uma", async () => {
    await db.admin(`update opportunities set owner_id = $1 where id = $2`, [supervisorA, seed.a.opportunityId]);
    await expect(
      db.as(ctx.a.agentId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Qualificado")])),
    ).rejects.toThrow(/sob sua responsabilidade/);
    await db.admin(`update opportunities set owner_id = $1 where id = $2`, [ctx.a.agentId, seed.a.opportunityId]);
    await db.as(ctx.a.agentId, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Qualificado")]));
    await db.as(supervisorA, (q) => q(`select public.move_opportunity($1, $2)`, [seed.a.opportunityId, stage("Negociação")]));
    const [opp] = await db.admin<{ stage_id: string }>(`select stage_id from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp!.stage_id).toBe(stage("Negociação"));
  });

  it("etapa com oportunidades não pode ser excluída; etapa vazia pode", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`delete from pipeline_stages where id = $1`, [stage("Negociação")])),
    ).rejects.toThrow(/foreign key/);
    const res = await db.as(ctx.a.ownerId, (q) => q(`delete from pipeline_stages where id = $1`, [stage("Pagamento pendente")]));
    expect(res.affected).toBe(1);
  });

  it("interação no contato atualiza a última interação das oportunidades abertas", async () => {
    await db.as(ctx.a.agentId, (q) =>
      q(`insert into contact_events (organization_id, contact_id, type, body, actor_id) values ($1, $2, 'call', 'Ligação de retorno', $3)`, [ctx.a.orgId, seed.a.contactId, ctx.a.agentId]),
    );
    const [opp] = await db.admin<{ ok: boolean }>(`select last_interaction_at is not null as ok from opportunities where id = $1`, [seed.a.opportunityId]);
    expect(opp!.ok).toBe(true);
  });
});

describe("armazenamento", () => {
  it("arquivo só entra e só é lido na pasta da própria agência", async () => {
    await db.as(ctx.a.ownerId, (q) => q(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${ctx.a.orgId}/packages/foto.jpg`]));
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${ctx.b.orgId}/packages/foto.jpg`])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into storage.objects (bucket_id, name) values ('media', 'solto.jpg')`)),
    ).rejects.toThrow(/row-level security/);
    expect(await db.as(ctx.b.ownerId, (q) => q(`select id from storage.objects`))).toHaveLength(0);
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from storage.objects`))).toHaveLength(1);
  });
});
