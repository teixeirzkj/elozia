import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Banco de testes: Postgres embarcado (PGlite) com um esqueleto mínimo do que o
 * Supabase fornece (papéis, auth.users, auth.uid(), storage). As migrations reais
 * de supabase/migrations são aplicadas por cima, sem alteração.
 */
const BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on all tables in schema storage to service_role;

create publication supabase_realtime;
`;

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export type Row = Record<string, unknown>;

export type Query = <R extends Row = Row>(sql: string, params?: unknown[]) => Promise<R[] & { affected: number }>;

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** Executa como superusuário (equivale ao service_role ignorando RLS). */
  async admin<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pg.query<T>(sql, params);
    return res.rows;
  }

  /** Executa `fn` como um usuário autenticado (ou anônimo, com `null`). */
  async as<T>(userId: string | null, fn: (q: Query) => Promise<T>): Promise<T> {
    await this.pg.exec(`set role ${userId ? "authenticated" : "anon"}`);
    await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
    const q: Query = async <R extends Row = Row>(sql: string, params: unknown[] = []) => {
      const res = await this.pg.query<R>(sql, params);
      return Object.assign(res.rows, { affected: res.affectedRows ?? 0 });
    };
    try {
      return await fn(q);
    } finally {
      await this.pg.exec(`reset role`);
      await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  async createUser(email: string, fullName = email.split("@")[0] ?? email): Promise<string> {
    const rows = await this.admin<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, JSON.stringify({ full_name: fullName })],
    );
    return rows[0]!.id;
  }

  /** Cria um usuário e a agência dele (como proprietário), pelo caminho real. */
  async createAgency(name: string, ownerEmail: string): Promise<{ orgId: string; ownerId: string }> {
    const ownerId = await this.createUser(ownerEmail);
    const orgId = await this.as(ownerId, async (q) => {
      const rows = await q<{ id: string }>(`select public.create_organization($1) as id`, [name]);
      return rows[0]!.id;
    });
    return { orgId, ownerId };
  }

  async addMember(orgId: string, email: string, role: "admin" | "supervisor" | "agent"): Promise<string> {
    const userId = await this.createUser(email);
    await this.admin(`insert into public.memberships (organization_id, user_id, role) values ($1, $2, $3)`, [
      orgId,
      userId,
      role,
    ]);
    return userId;
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(BOOTSTRAP);
  for (const file of migrationFiles()) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Falha ao aplicar a migration ${file}: ${(error as Error).message}`);
    }
  }
  return new TestDb(pg);
}

export type Agencies = Awaited<ReturnType<typeof twoAgencies>>;

/** Duas agências fictícias prontas, cada uma com proprietário e um atendente. */
export async function twoAgencies(db: TestDb) {
  const a = await db.createAgency("Agência Demo A", "dona.a@exemplo.test");
  const b = await db.createAgency("Agência Demo B", "dono.b@exemplo.test");
  const agentA = await db.addMember(a.orgId, "atendente.a@exemplo.test", "agent");
  const agentB = await db.addMember(b.orgId, "atendente.b@exemplo.test", "agent");
  return { a: { ...a, agentId: agentA }, b: { ...b, agentId: agentB } };
}
