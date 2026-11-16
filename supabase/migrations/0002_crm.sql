-- Elozia · Fase 2 · CRM comercial
-- Contatos, etiquetas, catálogo de viagens, funil, oportunidades, propostas,
-- reservas e tarefas. Chaves estrangeiras compostas (organization_id, id)
-- impedem que um registro aponte para dados de outra agência.

-- ---------------------------------------------------------------------------
-- Etiquetas e contatos
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#71717a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index tags_name_unique on public.tags (organization_id, lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or char_length(email) <= 254),
  notes text check (notes is null or char_length(notes) <= 5000),
  source text not null default 'manual'
    check (source in ('manual', 'whatsapp', 'import', 'indicacao', 'instagram', 'site', 'telefone', 'evento', 'outro')),
  owner_id uuid,
  -- Consentimento para comunicações comerciais (LGPD / políticas da Meta)
  marketing_consent text not null default 'unknown' check (marketing_consent in ('unknown', 'granted', 'revoked')),
  consent_at timestamptz,
  consent_source text check (consent_source is null or char_length(consent_source) <= 200),
  opted_out_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)
);
create unique index contacts_phone_unique on public.contacts (organization_id, phone_e164) where phone_e164 is not null;
create index contacts_org_name_idx on public.contacts (organization_id, lower(name));
create index contacts_org_created_idx on public.contacts (organization_id, created_at desc);
create index contacts_owner_idx on public.contacts (organization_id, owner_id);
create trigger contacts_touch before update on public.contacts
  for each row execute function app.touch_updated_at();

create table public.contact_tags (
  organization_id uuid not null,
  contact_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.tags (organization_id, id) on delete cascade
);
create index contact_tags_tag_idx on public.contact_tags (organization_id, tag_id);

create table public.contact_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contact_id uuid not null,
  type text not null check (type in (
    'created', 'note', 'call', 'email', 'meeting', 'whatsapp', 'stage_change',
    'proposal', 'booking', 'consent', 'task', 'automation', 'campaign')),
  body text check (body is null or char_length(body) <= 4000),
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index contact_events_contact_idx on public.contact_events (organization_id, contact_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Catálogo de viagens
-- ---------------------------------------------------------------------------

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  destination text not null check (char_length(btrim(destination)) between 1 and 160),
  description text check (description is null or char_length(description) <= 5000),
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  image_path text check (image_path is null or char_length(image_path) <= 400),
  commercial_notes text check (commercial_notes is null or char_length(commercial_notes) <= 5000),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index packages_org_idx on public.packages (organization_id, status, lower(name));
create trigger packages_touch before update on public.packages
  for each row execute function app.touch_updated_at();

-- Saídas de um pacote. `seats_total` é informação interna da agência:
-- não representa disponibilidade confirmada por fornecedores.
create table public.package_departures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  package_id uuid not null,
  departs_on date not null,
  returns_on date,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  seats_total integer check (seats_total is null or seats_total between 0 and 100000),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (returns_on is null or returns_on >= departs_on),
  foreign key (organization_id, package_id) references public.packages (organization_id, id) on delete cascade
);
create index package_departures_pkg_idx on public.package_departures (organization_id, package_id, departs_on);
create index package_departures_date_idx on public.package_departures (organization_id, departs_on);
create trigger package_departures_touch before update on public.package_departures
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Funil e oportunidades
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index pipeline_stages_org_idx on public.pipeline_stages (organization_id, position);

create function app.seed_pipeline_stages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pipeline_stages (organization_id, name, position, kind) values
    (new.id, 'Novo lead', 1, 'open'),
    (new.id, 'Em atendimento', 2, 'open'),
    (new.id, 'Qualificado', 3, 'open'),
    (new.id, 'Proposta enviada', 4, 'open'),
    (new.id, 'Negociação', 5, 'open'),
    (new.id, 'Pagamento pendente', 6, 'open'),
    (new.id, 'Venda confirmada', 7, 'won'),
    (new.id, 'Perdido', 8, 'lost');
  return new;
end $$;
create trigger organizations_seed_stages after insert on public.organizations
  for each row execute function app.seed_pipeline_stages();

-- Agências criadas antes desta migration recebem as etapas padrão.
insert into public.pipeline_stages (organization_id, name, position, kind)
select o.id, s.name, s.position, s.kind
from public.organizations o
cross join (values
  ('Novo lead', 1, 'open'), ('Em atendimento', 2, 'open'), ('Qualificado', 3, 'open'),
  ('Proposta enviada', 4, 'open'), ('Negociação', 5, 'open'), ('Pagamento pendente', 6, 'open'),
  ('Venda confirmada', 7, 'won'), ('Perdido', 8, 'lost')) as s (name, position, kind)
where not exists (select 1 from public.pipeline_stages p where p.organization_id = o.id);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  package_id uuid,
  departure_id uuid,
  destination_interest text check (destination_interest is null or char_length(destination_interest) <= 160),
  stage_id uuid not null,
  position double precision not null default 0,
  estimated_value_cents bigint check (estimated_value_cents is null or estimated_value_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  intended_date date,
  travelers integer check (travelers is null or travelers between 1 and 1000),
  owner_id uuid,
  next_contact_at timestamptz,
  last_interaction_at timestamptz,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 500),
  notes text check (notes is null or char_length(notes) <= 5000),
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, package_id) references public.packages (organization_id, id),
  foreign key (organization_id, departure_id) references public.package_departures (organization_id, id),
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id),
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id)
);
create index opportunities_board_idx on public.opportunities (organization_id, stage_id, position);
create index opportunities_contact_idx on public.opportunities (organization_id, contact_id);
create index opportunities_owner_idx on public.opportunities (organization_id, owner_id);
create index opportunities_status_idx on public.opportunities (organization_id, status, created_at desc);
create index opportunities_package_idx on public.opportunities (organization_id, package_id);

create table public.opportunity_stage_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  opportunity_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  moved_by uuid references public.profiles (id) on delete set null,
  moved_at timestamptz not null default now(),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);
create index opportunity_stage_history_idx on public.opportunity_stage_history (organization_id, opportunity_id, moved_at);
create index opportunity_stage_history_time_idx on public.opportunity_stage_history (organization_id, moved_at);

-- Mantém status, datas e histórico coerentes com a etapa, em qualquer caminho de gravação.
create function app.opportunities_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at = now();
    new.organization_id = old.organization_id;
  elsif new.position = 0 then
    -- Nova oportunidade entra no fim da coluna.
    select coalesce(max(o.position), 0) + 1000 into new.position from public.opportunities o
    where o.organization_id = new.organization_id and o.stage_id = new.stage_id;
  end if;
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select s.kind into v_kind from public.pipeline_stages s
    where s.id = new.stage_id and s.organization_id = new.organization_id;
    if v_kind is null then
      raise exception 'Etapa inválida' using errcode = 'P0001';
    end if;
    new.status = v_kind;
    new.stage_entered_at = now();
    new.closed_at = case when v_kind = 'open' then null else now() end;
    if v_kind <> 'lost' then
      new.lost_reason = null;
    end if;
  end if;
  return new;
end $$;

create function app.opportunities_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history (organization_id, opportunity_id, from_stage_id, to_stage_id, moved_by)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid());
    select s.name into v_name from public.pipeline_stages s where s.id = new.stage_id;
    insert into public.contact_events (organization_id, contact_id, type, body, metadata, actor_id)
    values (
      new.organization_id, new.contact_id, 'stage_change',
      case when tg_op = 'INSERT' then 'Oportunidade criada na etapa ' else 'Oportunidade movida para ' end || coalesce(v_name, '?'),
      jsonb_build_object('opportunity_id', new.id, 'stage_id', new.stage_id, 'status', new.status),
      auth.uid());
  end if;
  return null;
end $$;

create trigger opportunities_before before insert or update on public.opportunities
  for each row execute function app.opportunities_before();
create trigger opportunities_after after insert or update on public.opportunities
  for each row execute function app.opportunities_after();

-- Interações registradas no contato atualizam "última interação" das oportunidades abertas.
create function app.contact_events_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type in ('note', 'call', 'email', 'meeting', 'whatsapp', 'proposal') then
    update public.opportunities o set last_interaction_at = new.created_at
    where o.organization_id = new.organization_id and o.contact_id = new.contact_id and o.status = 'open';
  end if;
  return null;
end $$;
create trigger contact_events_after after insert on public.contact_events
  for each row execute function app.contact_events_after();

-- ---------------------------------------------------------------------------
-- Propostas, reservas e tarefas
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  description text check (description is null or char_length(description) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until date,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);
create index proposals_opp_idx on public.proposals (organization_id, opportunity_id, created_at desc);
create index proposals_sent_idx on public.proposals (organization_id, sent_at);
create trigger proposals_touch before update on public.proposals
  for each row execute function app.touch_updated_at();

-- Reserva confirmada pela agência. Pagamento é apenas DECLARADO manualmente:
-- não há integração financeira e nenhum dado de cartão é armazenado.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  opportunity_id uuid,
  package_id uuid,
  departure_id uuid,
  travelers integer not null default 1 check (travelers between 1 and 1000),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'partial', 'paid', 'refunded')),
  payment_method text check (payment_method is null or payment_method in ('pix', 'boleto', 'cartao', 'transferencia', 'dinheiro', 'outro')),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  payment_notes text check (payment_notes is null or char_length(payment_notes) <= 1000),
  confirmed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete set null (opportunity_id),
  foreign key (organization_id, package_id) references public.packages (organization_id, id),
  foreign key (organization_id, departure_id) references public.package_departures (organization_id, id)
);
create index bookings_org_idx on public.bookings (organization_id, created_at desc);
create index bookings_contact_idx on public.bookings (organization_id, contact_id);
create index bookings_departure_idx on public.bookings (organization_id, departure_id);
create trigger bookings_touch before update on public.bookings
  for each row execute function app.touch_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  due_at timestamptz,
  assignee_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  done_at timestamptz,
  origin text not null default 'manual' check (origin in ('manual', 'automation')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, assignee_id) references public.memberships (organization_id, user_id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);
create index tasks_open_idx on public.tasks (organization_id, assignee_id, due_at) where done_at is null;
create index tasks_contact_idx on public.tasks (organization_id, contact_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  -- Leitura e escrita por qualquer membro; exclusão por gestores.
  foreach t in array array['contacts', 'proposals', 'bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_member(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.is_manager(organization_id))', t || '_delete', t);
  end loop;

  -- Leitura, escrita e exclusão por qualquer membro.
  foreach t in array array['contact_tags', 'tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_member(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_member(organization_id)) with check (app.is_member(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.is_member(organization_id))', t || '_delete', t);
  end loop;

  -- Leitura por membros; gestão por gestores (proprietário, administrador, supervisor).
  foreach t in array array['tags', 'packages', 'package_departures', 'pipeline_stages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.is_manager(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.is_manager(organization_id)) with check (app.is_manager(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.is_manager(organization_id))', t || '_delete', t);
  end loop;
end $$;

-- Linha do tempo: inclusão por membros, sem edição; exclusão por gestores.
alter table public.contact_events enable row level security;
create policy contact_events_select on public.contact_events for select to authenticated
  using (app.is_member(organization_id));
create policy contact_events_insert on public.contact_events for insert to authenticated
  with check (app.is_member(organization_id) and (actor_id is null or actor_id = auth.uid()));
create policy contact_events_delete on public.contact_events for delete to authenticated
  using (app.is_manager(organization_id));

-- Oportunidades: todos veem; atendente só altera as suas ou as sem responsável.
alter table public.opportunities enable row level security;
create policy opportunities_select on public.opportunities for select to authenticated
  using (app.is_member(organization_id));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (app.is_member(organization_id));
create policy opportunities_update on public.opportunities for update to authenticated
  using (app.is_manager(organization_id) or (app.is_member(organization_id) and (owner_id is null or owner_id = auth.uid())))
  with check (app.is_member(organization_id));
create policy opportunities_delete on public.opportunities for delete to authenticated
  using (app.is_manager(organization_id));

-- Histórico de etapas: somente leitura (gravado por trigger).
alter table public.opportunity_stage_history enable row level security;
create policy opportunity_stage_history_select on public.opportunity_stage_history for select to authenticated
  using (app.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- Movimentação no Kanban
-- ---------------------------------------------------------------------------

-- Move a oportunidade para `p_stage`, logo depois do cartão `p_after`
-- (ou para o topo, quando nulo). Roda com os direitos de quem chama: a RLS decide.
create function public.move_opportunity(
  p_opportunity uuid,
  p_stage uuid,
  p_after uuid default null,
  p_lost_reason text default null
) returns void
language plpgsql set search_path = '' as $$
declare
  v_org uuid;
  v_kind text;
  v_prev double precision;
  v_next double precision;
  v_pos double precision;
  v_rows integer;
begin
  select o.organization_id into v_org from public.opportunities o where o.id = p_opportunity;
  if v_org is null then
    raise exception 'Oportunidade não encontrada' using errcode = 'P0001';
  end if;
  select s.kind into v_kind from public.pipeline_stages s where s.id = p_stage and s.organization_id = v_org;
  if v_kind is null then
    raise exception 'Etapa inválida' using errcode = 'P0001';
  end if;
  if v_kind = 'lost' and coalesce(btrim(p_lost_reason), '') = '' then
    raise exception 'Informe o motivo da perda' using errcode = 'P0001';
  end if;

  if p_after is not null then
    select o.position into v_prev from public.opportunities o
    where o.id = p_after and o.stage_id = p_stage and o.organization_id = v_org;
  end if;
  select min(o.position) into v_next from public.opportunities o
  where o.organization_id = v_org and o.stage_id = p_stage and o.id <> p_opportunity
    and (v_prev is null or o.position > v_prev);

  v_pos := case
    when v_prev is null and v_next is null then 1000
    when v_prev is null then v_next - 1000
    when v_next is null then v_prev + 1000
    else (v_prev + v_next) / 2
  end;

  update public.opportunities o
  set stage_id = p_stage,
      position = v_pos,
      lost_reason = case when v_kind = 'lost' then left(btrim(p_lost_reason), 500) else o.lost_reason end
  where o.id = p_opportunity;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Você só pode mover oportunidades sob sua responsabilidade' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.move_opportunity(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.move_opportunity(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Armazenamento privado de arquivos (imagens de pacotes e mídias de conversas)
-- Caminho: <organization_id>/<área>/<arquivo>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 16777216,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
        'application/pdf', 'video/mp4',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain']
)
on conflict (id) do nothing;

create function app.storage_org(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.storage_org(text) to anon, authenticated, service_role;

create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and app.is_member(app.storage_org(name)));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and app.is_member(app.storage_org(name)));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and app.is_manager(app.storage_org(name)));

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
