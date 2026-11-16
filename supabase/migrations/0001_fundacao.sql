-- Elozia · Fase 1 · Fundação multiempresa
-- Agências, perfis, vínculos, convites, equipes e auditoria, todos com RLS.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

create type public.member_role as enum ('owner', 'admin', 'supervisor', 'agent');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

create function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create function app.assert_timezone(tz text) returns void
language plpgsql stable as $$
begin
  perform now() at time zone tz;
exception when others then
  raise exception 'Fuso horário inválido: %', tz using errcode = '22023';
end $$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  timezone text not null default 'America/Sao_Paulo',
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 254),
  document text check (document is null or char_length(document) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function app.organizations_validate() returns trigger
language plpgsql as $$
begin
  perform app.assert_timezone(new.timezone);
  return new;
end $$;

create trigger organizations_validate before insert or update on public.organizations
  for each row execute function app.organizations_validate();
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  email text not null,
  phone text check (phone is null or char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
-- MVP: cada usuário pertence a uma única agência.
create unique index memberships_one_org_per_user on public.memberships (user_id);
-- Cada agência tem exatamente um proprietário.
create unique index memberships_one_owner on public.memberships (organization_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_pending_unique on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_org_idx on public.invitations (organization_id, created_at desc);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.team_members (
  organization_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity text check (entity is null or char_length(entity) <= 80),
  entity_id text check (entity_id is null or char_length(entity_id) <= 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas de RLS)
-- ---------------------------------------------------------------------------

create function app.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create function app.has_role(org uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any (roles)
  )
$$;

-- Atalhos de papel
create function app.is_admin(org uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(org, array['owner', 'admin']::public.member_role[])
$$;

create function app.is_manager(org uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(org, array['owner', 'admin', 'supervisor']::public.member_role[])
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Perfil criado automaticamente no cadastro
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.audit_logs enable row level security;

-- organizations: criação somente pela função create_organization.
create policy organizations_select on public.organizations for select to authenticated
  using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.is_admin(id)) with check (app.is_admin(id));

-- profiles: o próprio usuário e colegas da mesma agência.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.memberships m where m.user_id = profiles.id and app.is_member(m.organization_id))
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: leitura pelos membros; alterações somente pelas funções abaixo.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.is_member(organization_id));

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (app.is_admin(organization_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (app.is_admin(organization_id) and invited_by = auth.uid());
create policy invitations_update on public.invitations for update to authenticated
  using (app.is_admin(organization_id)) with check (app.is_admin(organization_id));

-- teams
create policy teams_select on public.teams for select to authenticated
  using (app.is_member(organization_id));
create policy teams_insert on public.teams for insert to authenticated
  with check (app.is_manager(organization_id));
create policy teams_update on public.teams for update to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));
create policy teams_delete on public.teams for delete to authenticated
  using (app.is_manager(organization_id));

create policy team_members_select on public.team_members for select to authenticated
  using (app.is_member(organization_id));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (app.is_manager(organization_id));
create policy team_members_delete on public.team_members for delete to authenticated
  using (app.is_manager(organization_id));

-- audit_logs: somente inclusão e leitura; nunca alteração.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.is_admin(organization_id));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (app.is_member(organization_id) and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Funções de negócio (security definer, com verificação própria)
-- ---------------------------------------------------------------------------

-- Cria a agência do usuário autenticado e o torna proprietário.
create function public.create_organization(p_name text, p_timezone text default 'America/Sao_Paulo')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = v_user) then
    raise exception 'Usuário já pertence a uma agência' using errcode = 'P0001';
  end if;
  insert into public.organizations (name, timezone) values (btrim(p_name), p_timezone)
  returning id into v_org;
  insert into public.memberships (organization_id, user_id, role) values (v_org, v_user, 'owner');
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id)
  values (v_org, v_user, 'organization.created', 'organization', v_org::text);
  return v_org;
end $$;

create function app.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Dados públicos mínimos de um convite válido (para a tela de aceite).
create function public.get_invitation(p_token text)
returns table (organization_name text, email text, role public.member_role)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, i.role
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = app.hash_token(p_token)
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- Aceita um convite: o e-mail da conta precisa ser o e-mail convidado.
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  select * into v_inv from public.invitations i
  where i.token_hash = app.hash_token(p_token)
  for update;

  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'Convite inválido ou expirado' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships where user_id = v_user) then
    raise exception 'Usuário já pertence a uma agência' using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (v_inv.organization_id, v_user, v_inv.role);
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  values (v_inv.organization_id, v_user, 'invitation.accepted', 'invitation', v_inv.id::text,
          jsonb_build_object('role', v_inv.role));
  return v_inv.organization_id;
end $$;

-- Altera papel ou situação de um colaborador.
-- Regras: só proprietário/administrador; ninguém altera a si mesmo; o proprietário
-- não pode ser alterado; administrador não altera outro administrador.
create function public.update_membership(p_membership uuid, p_role public.member_role, p_status text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
begin
  select * into v_target from public.memberships where id = p_membership for update;
  if not found then
    raise exception 'Colaborador não encontrado' using errcode = 'P0001';
  end if;

  select m.role into v_actor_role from public.memberships m
  where m.organization_id = v_target.organization_id and m.user_id = v_user and m.status = 'active';

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_target.user_id = v_user then
    raise exception 'Você não pode alterar o próprio acesso' using errcode = 'P0001';
  end if;
  if v_target.role = 'owner' or p_role = 'owner' then
    raise exception 'O proprietário não pode ser alterado' using errcode = 'P0001';
  end if;
  if v_actor_role = 'admin' and (v_target.role = 'admin' or p_role = 'admin') then
    raise exception 'Somente o proprietário gerencia administradores' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;

  update public.memberships set role = p_role, status = p_status where id = p_membership;
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  values (v_target.organization_id, v_user, 'membership.updated', 'membership', p_membership::text,
          jsonb_build_object('role', p_role, 'status', p_status));
end $$;

revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.update_membership(uuid, public.member_role, text) from public, anon;
revoke execute on function public.get_invitation(text) from public;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.update_membership(uuid, public.member_role, text) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privilégios (a RLS decide as linhas; aqui só o acesso às tabelas)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
