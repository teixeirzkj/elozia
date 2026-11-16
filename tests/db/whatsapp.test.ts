import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, twoAgencies, type Agencies, type TestDb } from "./helpers";

let db: TestDb;
let ctx: Agencies;
let supervisorA: string;
let agentA2: string;
const channel = { a: "", b: "" };

const PHONE_A = "100000000000001";
const PHONE_B = "200000000000002";

type Ingested = { message_id: string; organization_id: string; conversation_id: string; contact_id: string | null; duplicate: boolean };

/** Simula o que o webhook faz depois de validar a assinatura (roda como servidor). */
async function ingest(phoneNumberId: string, waId: string, wamid: string, body = "Olá", type = "text", mediaId: string | null = null) {
  return db.admin<Ingested>(
    `select * from public.ingest_whatsapp_message($1, $2, $3, null, 'Cliente Teste', $4, $5, $6, $7, null, null, now())`,
    [phoneNumberId, waId, `+${waId}`, wamid, type, body, mediaId],
  );
}

async function outbound(conversationId: string, orgId: string, wamid: string) {
  await db.admin(
    `insert into messages (organization_id, conversation_id, direction, type, body, wa_message_id, status) values ($1, $2, 'out', 'text', 'Resposta', $3, 'sent')`,
    [orgId, conversationId, wamid],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  ctx = await twoAgencies(db);
  supervisorA = await db.addMember(ctx.a.orgId, "supervisora.a@exemplo.test", "supervisor");
  agentA2 = await db.addMember(ctx.a.orgId, "atendente2.a@exemplo.test", "agent");
  for (const [key, org, phone] of [["a", ctx.a.orgId, PHONE_A], ["b", ctx.b.orgId, PHONE_B]] as const) {
    const [row] = await db.admin<{ id: string }>(
      `insert into whatsapp_channels (organization_id, waba_id, phone_number_id, display_phone) values ($1, '900000000000', $2, '+55 11 90000-0000') returning id`,
      [org, phone],
    );
    channel[key] = row!.id;
    await db.admin(
      `insert into whatsapp_credentials (channel_id, organization_id, token_ciphertext, verify_token_ciphertext, verify_token_hash) values ($1, $2, 'cifrado', 'cifrado', $3)`,
      [row!.id, org, `hash-${key}`],
    );
  }
});
afterAll(async () => db.close());

describe("segredos do canal", () => {
  it("nenhum usuário lê credenciais nem o registro de webhooks, nem o proprietário", async () => {
    for (const table of ["whatsapp_credentials", "webhook_events"]) {
      await expect(db.as(ctx.a.ownerId, (q) => q(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("usuários não chamam as funções de ingestão do webhook", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`select * from public.ingest_whatsapp_message($1, '5511900000009', '+5511900000009', null, 'X', 'wamid.forjado', 'text', 'oi', null, null, null, now())`, [PHONE_B]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`select public.apply_whatsapp_status($1, 'x', 'read', null, null, now())`, [PHONE_A])),
    ).rejects.toThrow(/permission denied/);
  });

  it("usuários não gravam canais, conversas nem mensagens diretamente", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into whatsapp_channels (organization_id, waba_id, phone_number_id) values ($1, '123456', '300000000000003')`, [ctx.a.orgId])),
    ).rejects.toThrow(/row-level security/);
    const upd = await db.as(ctx.a.ownerId, (q) => q(`update whatsapp_channels set phone_number_id = '300000000000003' where id = $1`, [channel.a]));
    expect(upd.affected).toBe(0);
  });

  it("um phone_number_id não pode ser conectado por duas agências", async () => {
    await expect(
      db.admin(`insert into whatsapp_channels (organization_id, waba_id, phone_number_id) values ($1, '900000000000', $2)`, [ctx.b.orgId, PHONE_A]),
    ).rejects.toThrow(/unique|duplicate/);
  });
});

describe("recebimento de mensagens", () => {
  it("roteia pelo phone_number_id para a agência correta", async () => {
    const [a] = await ingest(PHONE_A, "5511911110001", "wamid.A1");
    const [b] = await ingest(PHONE_B, "5511911110001", "wamid.B1");
    expect(a!.organization_id).toBe(ctx.a.orgId);
    expect(b!.organization_id).toBe(ctx.b.orgId);
    expect(a!.conversation_id).not.toBe(b!.conversation_id);

    const seenA = await db.as(ctx.a.agentId, (q) => q<{ wa_message_id: string }>(`select wa_message_id from messages`));
    const seenB = await db.as(ctx.b.agentId, (q) => q<{ wa_message_id: string }>(`select wa_message_id from messages`));
    expect(seenA.map((m) => m.wa_message_id)).toEqual(["wamid.A1"]);
    expect(seenB.map((m) => m.wa_message_id)).toEqual(["wamid.B1"]);
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from conversations`))).toHaveLength(1);
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from conversation_events`))).toHaveLength(1);
  });

  it("cria o contato com telefone E.164 e origem WhatsApp, uma única vez", async () => {
    await ingest(PHONE_A, "5511911110001", "wamid.A2", "Segunda mensagem");
    const contacts = await db.admin(`select name, phone_e164, source from contacts where organization_id = $1`, [ctx.a.orgId]);
    expect(contacts).toEqual([{ name: "Cliente Teste", phone_e164: "+5511911110001", source: "whatsapp" }]);
    const [conv] = await db.admin<{ unread_count: number; status: string; last_message_preview: string }>(
      `select unread_count, status, last_message_preview from conversations where organization_id = $1`, [ctx.a.orgId]);
    expect(conv).toEqual({ unread_count: 2, status: "pending", last_message_preview: "Segunda mensagem" });
  });

  it("mensagem duplicada não gera nova mensagem nem conta como não lida", async () => {
    const [again] = await ingest(PHONE_A, "5511911110001", "wamid.A2", "Segunda mensagem");
    expect(again!.duplicate).toBe(true);
    const [count] = await db.admin<{ n: number }>(`select count(*)::int as n from messages where organization_id = $1`, [ctx.a.orgId]);
    expect(count!.n).toBe(2);
    const [conv] = await db.admin<{ unread_count: number }>(`select unread_count from conversations where organization_id = $1`, [ctx.a.orgId]);
    expect(conv!.unread_count).toBe(2);
  });

  it("o mesmo identificador de mensagem não é aceito em outra agência", async () => {
    const [other] = await ingest(PHONE_B, "5511911110001", "wamid.A1");
    expect(other!.duplicate).toBe(true);
    const leaked = await db.admin(`select 1 from messages where wa_message_id = 'wamid.A1' and organization_id = $1`, [ctx.b.orgId]);
    expect(leaked).toHaveLength(0);
  });

  it("número desconhecido ou canal desconectado não gera dados", async () => {
    expect(await ingest("999999999999999", "5511911110009", "wamid.X1")).toHaveLength(0);
    await db.admin(`update whatsapp_channels set status = 'disconnected' where id = $1`, [channel.b]);
    expect(await ingest(PHONE_B, "5511911110009", "wamid.X2")).toHaveLength(0);
    await db.admin(`update whatsapp_channels set status = 'connected' where id = $1`, [channel.b]);
    expect(await db.admin(`select 1 from messages where wa_message_id in ('wamid.X1', 'wamid.X2')`)).toHaveLength(0);
  });

  it("mídia entra como pendente de download", async () => {
    const [row] = await ingest(PHONE_A, "5511911110001", "wamid.A3", "", "image", "media-123");
    const [msg] = await db.admin(`select type, media_status, wa_media_id from messages where id = $1`, [row!.message_id]);
    expect(msg).toEqual({ type: "image", media_status: "pending", wa_media_id: "media-123" });
  });

  it("identifica contato sem telefone pelo identificador de usuário da Meta", async () => {
    const run = (wamid: string) =>
      db.admin<Ingested>(
        `select * from public.ingest_whatsapp_message($1, null, null, 'BR.123456', 'Sem Telefone', $2, 'text', 'oi', null, null, null, now())`,
        [PHONE_A, wamid],
      );
    const [first] = await run("wamid.U1");
    const [second] = await run("wamid.U2");
    expect(first!.contact_id).toBe(second!.contact_id);
    expect(first!.conversation_id).toBe(second!.conversation_id);
  });

  it("palavra de descadastro revoga o consentimento", async () => {
    const [row] = await ingest(PHONE_A, "5511911110002", "wamid.S0", "Quero receber ofertas");
    await db.admin(`update contacts set marketing_consent = 'granted', consent_at = now() where id = $1`, [row!.contact_id]);
    await ingest(PHONE_A, "5511911110002", "wamid.S1", "  sair ");
    const [contact] = await db.admin(`select marketing_consent, opted_out_at is not null as opted from contacts where id = $1`, [row!.contact_id]);
    expect(contact).toEqual({ marketing_consent: "revoked", opted: true });
  });
});

describe("status das mensagens", () => {
  let conversationId: string;

  beforeAll(async () => {
    const [conv] = await db.admin<{ id: string }>(`select id from conversations where organization_id = $1 order by created_at limit 1`, [ctx.a.orgId]);
    conversationId = conv!.id;
    await outbound(conversationId, ctx.a.orgId, "wamid.OUT1");
    await outbound(conversationId, ctx.a.orgId, "wamid.OUT2");
  });

  const status = async (wamid: string) => (await db.admin<{ status: string }>(`select status from messages where wa_message_id = $1`, [wamid]))[0]!.status;
  const apply = (phone: string, wamid: string, value: string, code: string | null = null) =>
    db.admin(`select public.apply_whatsapp_status($1, $2, $3, $4, $5, now())`, [phone, wamid, value, code, code ? "Falha" : null]);

  it("avança e nunca regride, mesmo com eventos fora de ordem ou repetidos", async () => {
    await apply(PHONE_A, "wamid.OUT1", "read");
    await apply(PHONE_A, "wamid.OUT1", "delivered");
    await apply(PHONE_A, "wamid.OUT1", "sent");
    await apply(PHONE_A, "wamid.OUT1", "read");
    expect(await status("wamid.OUT1")).toBe("read");
    await apply(PHONE_A, "wamid.OUT1", "failed", "131026");
    expect(await status("wamid.OUT1")).toBe("read");
  });

  it("registra falha com o código do erro", async () => {
    await apply(PHONE_A, "wamid.OUT2", "failed", "131047");
    const [msg] = await db.admin(`select status, error_code from messages where wa_message_id = 'wamid.OUT2'`);
    expect(msg).toEqual({ status: "failed", error_code: "131047" });
  });

  it("status vindo do número de outra agência é ignorado", async () => {
    await outbound(conversationId, ctx.a.orgId, "wamid.OUT3");
    await apply(PHONE_B, "wamid.OUT3", "read");
    expect(await status("wamid.OUT3")).toBe("sent");
  });

  it("status não altera mensagens recebidas", async () => {
    await apply(PHONE_A, "wamid.A1", "failed", "1");
    expect(await status("wamid.A1")).toBe("received");
  });
});

describe("gestão dos atendimentos", () => {
  let conv: string;
  const state = async () =>
    (await db.admin<{ status: string; assignee_id: string | null; team_id: string | null }>(`select status, assignee_id, team_id from conversations where id = $1`, [conv]))[0]!;

  beforeAll(async () => {
    const [row] = await ingest(PHONE_A, "5511911110077", "wamid.G1");
    conv = row!.conversation_id;
  });

  it("atendente assume conversa pendente", async () => {
    await db.as(ctx.a.agentId, (q) => q(`select public.assume_conversation($1)`, [conv]));
    expect(await state()).toMatchObject({ status: "open", assignee_id: ctx.a.agentId });
  });

  it("outro atendente não assume, não transfere e não conclui conversa alheia", async () => {
    for (const sql of [
      `select public.assume_conversation($1)`,
      `select public.close_conversation($1)`,
    ]) {
      await expect(db.as(agentA2, (q) => q(sql, [conv]))).rejects.toThrow(/outro atendente|responsável/);
    }
    await expect(
      db.as(agentA2, (q) => q(`select public.transfer_conversation($1, $2, null)`, [conv, agentA2])),
    ).rejects.toThrow(/responsável/);
  });

  it("usuário de outra agência não alcança a conversa", async () => {
    for (const sql of [`select public.assume_conversation($1)`, `select public.close_conversation($1)`, `select public.reopen_conversation($1)`, `select public.mark_conversation_read($1)`]) {
      await expect(db.as(ctx.b.ownerId, (q) => q(sql, [conv]))).rejects.toThrow(/não encontrada/);
    }
  });

  it("responsável transfere para colega; não transfere para pessoa de outra agência", async () => {
    await expect(
      db.as(ctx.a.agentId, (q) => q(`select public.transfer_conversation($1, $2, null)`, [conv, ctx.b.agentId])),
    ).rejects.toThrow(/Atendente inválido/);
    await db.as(ctx.a.agentId, (q) => q(`select public.transfer_conversation($1, $2, null)`, [conv, agentA2]));
    expect(await state()).toMatchObject({ status: "open", assignee_id: agentA2 });
  });

  it("supervisor transfere para uma equipe e a conversa volta a pendente", async () => {
    const [team] = await db.as(supervisorA, (q) => q<{ id: string }>(`insert into teams (organization_id, name) values ($1, 'Vendas') returning id`, [ctx.a.orgId]));
    const [foreign] = await db.as(ctx.b.ownerId, (q) => q<{ id: string }>(`insert into teams (organization_id, name) values ($1, 'Vendas B') returning id`, [ctx.b.orgId]));
    await expect(
      db.as(supervisorA, (q) => q(`select public.transfer_conversation($1, null, $2)`, [conv, foreign!.id])),
    ).rejects.toThrow(/Equipe inválida/);
    await db.as(supervisorA, (q) => q(`select public.transfer_conversation($1, null, $2)`, [conv, team!.id]));
    expect(await state()).toEqual({ status: "pending", assignee_id: null, team_id: team!.id });
  });

  it("conclui, reabre manualmente e reabre sozinha quando o cliente escreve", async () => {
    await db.as(ctx.a.agentId, (q) => q(`select public.assume_conversation($1)`, [conv]));
    await db.as(ctx.a.agentId, (q) => q(`select public.close_conversation($1)`, [conv]));
    expect((await state()).status).toBe("closed");
    await db.as(agentA2, (q) => q(`select public.reopen_conversation($1)`, [conv]));
    expect(await state()).toMatchObject({ status: "open", assignee_id: ctx.a.agentId });
    await db.as(ctx.a.agentId, (q) => q(`select public.close_conversation($1)`, [conv]));
    await ingest(PHONE_A, "5511911110077", "wamid.G2", "Voltei");
    expect(await state()).toMatchObject({ status: "open", assignee_id: ctx.a.agentId });
    const events = await db.admin<{ type: string }>(`select type from conversation_events where conversation_id = $1 order by id`, [conv]);
    expect(events.map((e) => e.type)).toEqual(["created", "assumed", "transferred", "transferred", "assumed", "closed", "reopened", "closed", "reopened"]);
  });

  it("marcar como lida zera as não lidas", async () => {
    await db.as(ctx.a.agentId, (q) => q(`select public.mark_conversation_read($1)`, [conv]));
    const [row] = await db.admin<{ unread_count: number }>(`select unread_count from conversations where id = $1`, [conv]);
    expect(row!.unread_count).toBe(0);
  });
});
