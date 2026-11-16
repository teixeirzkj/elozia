import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, twoAgencies, type Agencies, type TestDb } from "./helpers";

let db: TestDb;
let ctx: Agencies;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await twoAgencies(db);
});
afterAll(async () => db.close());

describe("estrutura", () => {
  it("toda tabela pública tem RLS ativa", async () => {
    const rows = await db.admin<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("toda tabela de negócio tem organization_id", async () => {
    const rows = await db.admin<{ table_name: string }>(
      `select t.table_name from information_schema.tables t
       where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
         and t.table_name not in ('organizations', 'profiles')
         and not exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'organization_id')`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("o papel anônimo não tem privilégio em nenhuma tabela", async () => {
    const rows = await db.admin(
      `select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });
});

describe("cadastro de agência", () => {
  it("cria agência, vínculo de proprietário e perfil", async () => {
    const rows = await db.as(ctx.a.ownerId, (q) =>
      q(
        `select m.role, o.name, p.email from memberships m
         join organizations o on o.id = m.organization_id join profiles p on p.id = m.user_id
         where m.user_id = $1`,
        [ctx.a.ownerId],
      ),
    );
    expect([...rows]).toEqual([{ role: "owner", name: "Agência Demo A", email: "dona.a@exemplo.test" }]);
  });

  it("impede uma segunda agência para o mesmo usuário", async () => {
    await expect(db.as(ctx.a.ownerId, (q) => q(`select public.create_organization('Outra')`))).rejects.toThrow(
      /já pertence/,
    );
  });

  it("recusa fuso horário inválido", async () => {
    const userId = await db.createUser("fuso@exemplo.test");
    await expect(
      db.as(userId, (q) => q(`select public.create_organization('Fuso', 'Marte/Olimpo')`)),
    ).rejects.toThrow(/Fuso horário inválido/);
  });

  it("usuário anônimo não cria agência", async () => {
    await expect(db.as(null, (q) => q(`select public.create_organization('X')`))).rejects.toThrow();
  });
});

describe("isolamento entre agências", () => {
  it("cada usuário enxerga somente a própria agência", async () => {
    const seenByA = await db.as(ctx.a.agentId, (q) => q<{ id: string }>(`select id from organizations`));
    const seenByB = await db.as(ctx.b.agentId, (q) => q<{ id: string }>(`select id from organizations`));
    expect(seenByA.map((r) => r.id)).toEqual([ctx.a.orgId]);
    expect(seenByB.map((r) => r.id)).toEqual([ctx.b.orgId]);
  });

  it("não lista colaboradores nem perfis de outra agência", async () => {
    const members = await db.as(ctx.a.ownerId, (q) =>
      q<{ organization_id: string }>(`select organization_id from memberships`),
    );
    expect(members).toHaveLength(2);
    expect(new Set(members.map((m) => m.organization_id))).toEqual(new Set([ctx.a.orgId]));
    const profiles = await db.as(ctx.a.ownerId, (q) => q<{ email: string }>(`select email from profiles order by email`));
    expect(profiles.map((p) => p.email)).toEqual(["atendente.a@exemplo.test", "dona.a@exemplo.test"]);
  });

  it("proprietário de A não altera a agência B", async () => {
    const res = await db.as(ctx.a.ownerId, (q) =>
      q(`update organizations set name = 'Invadida' where id = $1`, [ctx.b.orgId]),
    );
    expect(res.affected).toBe(0);
    const [org] = await db.admin<{ name: string }>(`select name from organizations where id = $1`, [ctx.b.orgId]);
    expect(org!.name).toBe("Agência Demo B");
  });

  it("não é possível criar equipe, convite ou auditoria em outra agência", async () => {
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`insert into teams (organization_id, name) values ($1, 'Intrusa')`, [ctx.b.orgId])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(
          `insert into invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'x@exemplo.test', 'agent', 'h1', $2)`,
          [ctx.b.orgId, ctx.a.ownerId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(ctx.a.ownerId, (q) =>
        q(`insert into audit_logs (organization_id, actor_id, action) values ($1, $2, 'x')`, [ctx.b.orgId, ctx.a.ownerId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("ninguém insere ou altera vínculo diretamente", async () => {
    const intruder = await db.createUser("intruso@exemplo.test");
    await expect(
      db.as(intruder, (q) =>
        q(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin')`, [ctx.b.orgId, intruder]),
      ),
    ).rejects.toThrow(/row-level security/);
    const res = await db.as(ctx.a.agentId, (q) =>
      q(`update memberships set role = 'admin' where user_id = $1`, [ctx.a.agentId]),
    );
    expect(res.affected).toBe(0);
  });
});

describe("papéis", () => {
  it("atendente não altera dados da agência nem cria equipe", async () => {
    const res = await db.as(ctx.a.agentId, (q) =>
      q(`update organizations set name = 'Hack' where id = $1`, [ctx.a.orgId]),
    );
    expect(res.affected).toBe(0);
    await expect(
      db.as(ctx.a.agentId, (q) => q(`insert into teams (organization_id, name) values ($1, 'Vendas')`, [ctx.a.orgId])),
    ).rejects.toThrow(/row-level security/);
  });

  it("atendente não vê convites; proprietário vê", async () => {
    await db.as(ctx.a.ownerId, (q) =>
      q(
        `insert into invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'novo@exemplo.test', 'agent', app.hash_token('segredo-1'), $2)`,
        [ctx.a.orgId, ctx.a.ownerId],
      ),
    );
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from invitations`))).toHaveLength(0);
    expect(await db.as(ctx.a.ownerId, (q) => q(`select id from invitations`))).toHaveLength(1);
    expect(await db.as(ctx.b.ownerId, (q) => q(`select id from invitations`))).toHaveLength(0);
  });

  it("update_membership aplica as regras de hierarquia", async () => {
    const [agent] = await db.admin<{ id: string }>(`select id from memberships where user_id = $1`, [ctx.a.agentId]);
    const [owner] = await db.admin<{ id: string }>(`select id from memberships where user_id = $1`, [ctx.a.ownerId]);
    await expect(
      db.as(ctx.a.agentId, (q) => q(`select public.update_membership($1, 'admin', 'active')`, [agent!.id])),
    ).rejects.toThrow();
    await expect(
      db.as(ctx.b.ownerId, (q) => q(`select public.update_membership($1, 'admin', 'active')`, [agent!.id])),
    ).rejects.toThrow(/Sem permissão/);
    await expect(
      db.as(ctx.a.ownerId, (q) => q(`select public.update_membership($1, 'admin', 'active')`, [owner!.id])),
    ).rejects.toThrow(/próprio acesso/);

    await db.as(ctx.a.ownerId, (q) => q(`select public.update_membership($1, 'supervisor', 'active')`, [agent!.id]));
    await db.as(ctx.a.ownerId, (q) => q(`select public.update_membership($1, 'supervisor', 'disabled')`, [agent!.id]));
    // desativado perde o acesso imediatamente
    expect(await db.as(ctx.a.agentId, (q) => q(`select id from organizations`))).toHaveLength(0);
    await db.as(ctx.a.ownerId, (q) => q(`select public.update_membership($1, 'agent', 'active')`, [agent!.id]));
  });
});

describe("convites", () => {
  it("get_invitation só revela convite válido, inclusive para anônimo", async () => {
    const ok = await db.as(null, (q) => q(`select * from public.get_invitation('segredo-1')`));
    expect([...ok]).toEqual([{ organization_name: "Agência Demo A", email: "novo@exemplo.test", role: "agent" }]);
    expect(await db.as(null, (q) => q(`select * from public.get_invitation('errado')`))).toHaveLength(0);
  });

  it("recusa aceite por conta com outro e-mail", async () => {
    const other = await db.createUser("outra.pessoa@exemplo.test");
    await expect(db.as(other, (q) => q(`select public.accept_invitation('segredo-1')`))).rejects.toThrow(/outro e-mail/);
  });

  it("aceita uma única vez e cria o vínculo com o papel convidado", async () => {
    const invited = await db.createUser("novo@exemplo.test");
    await db.as(invited, (q) => q(`select public.accept_invitation('segredo-1')`));
    const rows = await db.admin(`select organization_id, role from memberships where user_id = $1`, [invited]);
    expect(rows).toEqual([{ organization_id: ctx.a.orgId, role: "agent" }]);
    await expect(db.as(invited, (q) => q(`select public.accept_invitation('segredo-1')`))).rejects.toThrow(/inválido/);
  });

  it("convite expirado não é aceito", async () => {
    await db.admin(
      `insert into invitations (organization_id, email, role, token_hash, invited_by, expires_at)
       values ($1, 'tarde@exemplo.test', 'agent', app.hash_token('velho'), $2, now() - interval '1 day')`,
      [ctx.a.orgId, ctx.a.ownerId],
    );
    const late = await db.createUser("tarde@exemplo.test");
    await expect(db.as(late, (q) => q(`select public.accept_invitation('velho')`))).rejects.toThrow(/inválido/);
  });
});
