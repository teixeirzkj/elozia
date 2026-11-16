-- Elozia · Fase 4 · Automações, campanhas e fila persistente
-- Nada aqui depende de timers de servidor: um agendador externo chama o
-- endpoint de cron, que usa as funções abaixo para descobrir o que venceu e
-- reivindicar jobs com `for update skip locked`.

-- ---------------------------------------------------------------------------
-- Fila de jobs (somente servidor)
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('automation_run', 'campaign_start', 'campaign_batch')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_at timestamptz,
  locked_by text,
  dedupe_key text unique,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due_idx on public.jobs (run_at) where status = 'pending';
create index jobs_running_idx on public.jobs (locked_at) where status = 'running';
create index jobs_org_idx on public.jobs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Automações
-- ---------------------------------------------------------------------------

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  trigger_type text not null check (trigger_type in (
    'new_lead_unattended', 'proposal_no_response', 'opportunity_stalled',
    'payment_pending', 'departure_upcoming', 'post_trip')),
  -- Intervalo configurado pela agência, sempre guardado em minutos.
  delay_minutes integer not null check (delay_minutes between 1 and 525600),
  -- Condições opcionais
  stage_id uuid,
  package_id uuid,
  tag_id uuid,
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) between 1 and 5),
  status text not null default 'paused' check (status in ('active', 'paused')),
  -- Só contam ocorrências cujo momento de disparo é posterior à ativação.
  activated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id),
  foreign key (organization_id, package_id) references public.packages (organization_id, id),
  foreign key (organization_id, tag_id) references public.tags (organization_id, id)
);
create index automations_active_idx on public.automations (organization_id) where status = 'active';

create function app.automations_before() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.activated_at = now();
  end if;
  return new;
end $$;
create trigger automations_before before insert or update on public.automations
  for each row execute function app.automations_before();

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  automation_id uuid not null,
  entity_type text not null check (entity_type in ('conversation', 'proposal', 'opportunity', 'booking')),
  entity_id uuid not null,
  contact_id uuid,
  dedupe_key text not null unique,
  status text not null default 'scheduled' check (status in ('scheduled', 'success', 'partial', 'failed', 'skipped', 'cancelled')),
  results jsonb not null default '[]'::jsonb,
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  foreign key (organization_id, automation_id) references public.automations (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index automation_runs_automation_idx on public.automation_runs (organization_id, automation_id, created_at desc);
create index automation_runs_status_idx on public.automation_runs (organization_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Campanhas por viagem
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  package_id uuid not null,
  departure_id uuid,
  -- Público: quem demonstrou interesse no pacote e/ou tem uma das etiquetas.
  audience_interest boolean not null default true,
  audience_tag_ids uuid[] not null default '{}',
  template_id uuid not null,
  variables jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'failed')),
  total_recipients integer not null default 0,
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (organization_id, id),
  check (audience_interest or cardinality(audience_tag_ids) > 0),
  check (status = 'draft' or scheduled_at is not null),
  foreign key (organization_id, package_id) references public.packages (organization_id, id),
  foreign key (organization_id, departure_id) references public.package_departures (organization_id, id),
  foreign key (organization_id, template_id) references public.whatsapp_templates (organization_id, id)
);
create index campaigns_org_idx on public.campaigns (organization_id, created_at desc);
create index campaigns_due_idx on public.campaigns (scheduled_at) where status = 'scheduled';
create trigger campaigns_touch before update on public.campaigns
  for each row execute function app.touch_updated_at();

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  contact_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  message_id uuid references public.messages (id) on delete set null,
  error text check (error is null or char_length(error) <= 300),
  attempts integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id),
  foreign key (organization_id, campaign_id) references public.campaigns (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index campaign_recipients_pending_idx on public.campaign_recipients (campaign_id) where status = 'pending';
create index campaign_recipients_org_idx on public.campaign_recipients (organization_id, campaign_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

create policy automations_select on public.automations for select to authenticated using (app.is_member(organization_id));
create policy automations_insert on public.automations for insert to authenticated with check (app.is_manager(organization_id));
create policy automations_update on public.automations for update to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));
create policy automations_delete on public.automations for delete to authenticated using (app.is_manager(organization_id));

create policy automation_runs_select on public.automation_runs for select to authenticated using (app.is_member(organization_id));

create policy campaigns_select on public.campaigns for select to authenticated using (app.is_member(organization_id));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (app.is_manager(organization_id) and status in ('draft', 'scheduled'));
-- Gestores editam e cancelam; "em execução", "concluída" e "falhou" só o servidor define.
create policy campaigns_update on public.campaigns for update to authenticated
  using (app.is_manager(organization_id) and status in ('draft', 'scheduled', 'running'))
  with check (app.is_manager(organization_id) and status in ('draft', 'scheduled', 'cancelled'));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (app.is_manager(organization_id) and status = 'draft');

create policy campaign_recipients_select on public.campaign_recipients for select to authenticated using (app.is_member(organization_id));
-- jobs: nenhuma política (somente servidor).

-- ---------------------------------------------------------------------------
-- Cancelamentos em cascata
-- ---------------------------------------------------------------------------

create function app.campaigns_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.campaign_recipients set status = 'cancelled', processed_at = now()
    where campaign_id = new.id and status in ('pending', 'sending');
    update public.jobs set status = 'cancelled', finished_at = now()
    where organization_id = new.organization_id and status = 'pending'
      and kind in ('campaign_start', 'campaign_batch') and payload ->> 'campaign_id' = new.id::text;
  end if;
  return null;
end $$;
create trigger campaigns_after_update after update on public.campaigns
  for each row execute function app.campaigns_after_update();

-- Cancela uma execução agendada de automação (e o job correspondente).
create function public.cancel_automation_run(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.automation_runs%rowtype;
begin
  select * into v_run from public.automation_runs r where r.id = p_run for update;
  if not found or not app.is_member(v_run.organization_id) then
    raise exception 'Execução não encontrada' using errcode = 'P0001';
  end if;
  if not app.is_manager(v_run.organization_id) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_run.status <> 'scheduled' then
    raise exception 'Esta execução já foi processada' using errcode = 'P0001';
  end if;
  update public.automation_runs set status = 'cancelled', executed_at = now() where id = p_run;
  update public.jobs set status = 'cancelled', finished_at = now()
  where dedupe_key = 'run:' || p_run::text and status = 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- Descoberta do que venceu (somente servidor)
-- ---------------------------------------------------------------------------

-- Cria uma execução por ocorrência de cada automação ativa. A chave única
-- (dedupe_key) garante uma única execução mesmo com chamadas concorrentes.
create function public.enqueue_due_automations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  v_rows integer;
begin
  -- 1. Novo lead sem atendimento: conversa sem primeira resposta.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'conversation', c.id, c.contact_id,
         a.id || ':' || c.id || ':' || extract(epoch from c.cycle_started_at)::bigint
  from public.automations a
  join public.conversations c on c.organization_id = a.organization_id
  join public.contacts ct on ct.id = c.contact_id
  where a.status = 'active' and a.trigger_type = 'new_lead_unattended'
    and c.status in ('pending', 'open') and c.first_response_at is null
    and c.last_inbound_at is not null and c.last_inbound_at >= c.cycle_started_at
    and not ct.is_demo
    and c.cycle_started_at + make_interval(mins => a.delay_minutes) <= now()
    and c.cycle_started_at + make_interval(mins => a.delay_minutes) >= a.activated_at
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 2. Proposta enviada sem resposta do cliente desde o envio.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'proposal', p.id, o.contact_id, a.id || ':' || p.id
  from public.automations a
  join public.proposals p on p.organization_id = a.organization_id
  join public.opportunities o on o.id = p.opportunity_id
  join public.contacts ct on ct.id = o.contact_id
  where a.status = 'active' and a.trigger_type = 'proposal_no_response'
    and p.status = 'sent' and p.sent_at is not null and o.status = 'open'
    and not ct.is_demo
    and p.sent_at + make_interval(mins => a.delay_minutes) <= now()
    and p.sent_at + make_interval(mins => a.delay_minutes) >= a.activated_at
    and (a.package_id is null or o.package_id = a.package_id)
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
    and not exists (select 1 from public.conversations c where c.contact_id = o.contact_id and c.last_inbound_at > p.sent_at)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 3. Oportunidade parada na mesma etapa.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'opportunity', o.id, o.contact_id,
         a.id || ':' || o.id || ':' || extract(epoch from o.stage_entered_at)::bigint
  from public.automations a
  join public.opportunities o on o.organization_id = a.organization_id
  join public.contacts ct on ct.id = o.contact_id
  where a.status = 'active' and a.trigger_type = 'opportunity_stalled'
    and o.status = 'open' and not ct.is_demo
    and (a.stage_id is null or o.stage_id = a.stage_id)
    and (a.package_id is null or o.package_id = a.package_id)
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
    and o.stage_entered_at + make_interval(mins => a.delay_minutes) <= now()
    and o.stage_entered_at + make_interval(mins => a.delay_minutes) >= a.activated_at
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 4. Pagamento pendente em reserva.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'booking', b.id, b.contact_id, a.id || ':' || b.id
  from public.automations a
  join public.bookings b on b.organization_id = a.organization_id
  join public.contacts ct on ct.id = b.contact_id
  where a.status = 'active' and a.trigger_type = 'payment_pending'
    and b.status <> 'cancelled' and b.payment_status in ('pending', 'partial') and not ct.is_demo
    and (a.package_id is null or b.package_id = a.package_id)
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
    and b.created_at + make_interval(mins => a.delay_minutes) <= now()
    and b.created_at + make_interval(mins => a.delay_minutes) >= a.activated_at
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 5. Viagem próxima: X antes das 9h (fuso da agência) do dia da saída.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'booking', b.id, b.contact_id, a.id || ':' || b.id
  from public.automations a
  join public.organizations org on org.id = a.organization_id
  join public.bookings b on b.organization_id = a.organization_id
  join public.package_departures d on d.id = b.departure_id
  join public.contacts ct on ct.id = b.contact_id
  cross join lateral (
    select ((d.departs_on::timestamp + time '09:00') at time zone org.timezone) - make_interval(mins => a.delay_minutes) as moment
  ) t
  where a.status = 'active' and a.trigger_type = 'departure_upcoming'
    and b.status <> 'cancelled' and not ct.is_demo
    and (a.package_id is null or b.package_id = a.package_id)
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
    and t.moment <= now() and t.moment >= a.activated_at
    and ((d.departs_on::timestamp + time '23:59') at time zone org.timezone) >= now()
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- 6. Pós-viagem: X depois das 9h (fuso da agência) do dia do retorno.
  insert into public.automation_runs (organization_id, automation_id, entity_type, entity_id, contact_id, dedupe_key)
  select a.organization_id, a.id, 'booking', b.id, b.contact_id, a.id || ':' || b.id
  from public.automations a
  join public.organizations org on org.id = a.organization_id
  join public.bookings b on b.organization_id = a.organization_id
  join public.package_departures d on d.id = b.departure_id
  join public.contacts ct on ct.id = b.contact_id
  cross join lateral (
    select ((coalesce(d.returns_on, d.departs_on)::timestamp + time '09:00') at time zone org.timezone) + make_interval(mins => a.delay_minutes) as moment
  ) t
  where a.status = 'active' and a.trigger_type = 'post_trip'
    and b.status = 'confirmed' and not ct.is_demo
    and (a.package_id is null or b.package_id = a.package_id)
    and (a.tag_id is null or exists (select 1 from public.contact_tags x where x.contact_id = ct.id and x.tag_id = a.tag_id))
    and t.moment <= now() and t.moment >= a.activated_at
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Um job por execução agendada.
  insert into public.jobs (organization_id, kind, payload, dedupe_key)
  select r.organization_id, 'automation_run', jsonb_build_object('run_id', r.id), 'run:' || r.id
  from public.automation_runs r
  where r.status = 'scheduled'
  on conflict (dedupe_key) do nothing;

  return v_count;
end $$;

create function public.enqueue_due_campaigns() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
begin
  insert into public.jobs (organization_id, kind, payload, dedupe_key)
  select c.organization_id, 'campaign_start', jsonb_build_object('campaign_id', c.id), 'campaign_start:' || c.id
  from public.campaigns c
  where c.status = 'scheduled' and c.scheduled_at <= now()
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- ---------------------------------------------------------------------------
-- Fila: reivindicar e finalizar (somente servidor)
-- ---------------------------------------------------------------------------

-- Reivindica jobs vencidos. `skip locked` impede que dois executores peguem o
-- mesmo job; jobs presos em execução por mais de 10 minutos voltam à fila.
create function public.claim_jobs(p_limit integer, p_worker text) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  -- Quem estourou as tentativas enquanto estava preso é dado como falho.
  update public.jobs j set status = 'failed', finished_at = now(), last_error = coalesce(j.last_error, 'Tempo de execução excedido')
  where j.status = 'running' and j.locked_at < now() - interval '10 minutes' and j.attempts >= j.max_attempts;

  return query
  update public.jobs j
  set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select x.id from public.jobs x
    where (x.status = 'pending' and x.run_at <= now())
       or (x.status = 'running' and x.locked_at < now() - interval '10 minutes')
    order by x.run_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning j.*;
end $$;

-- Finaliza um job. Com `p_retry_at`, ele volta à fila até esgotar as tentativas.
create function public.finish_job(p_job uuid, p_worker text, p_error text, p_retry_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs%rowtype;
  v_status text;
begin
  select * into v_job from public.jobs j where j.id = p_job for update;
  if not found or v_job.status <> 'running' or v_job.locked_by is distinct from p_worker then
    return 'ignored';
  end if;
  v_status := case
    when p_error is null and p_retry_at is null then 'done'
    when p_retry_at is not null and (p_error is null or v_job.attempts < v_job.max_attempts) then 'pending'
    else 'failed'
  end;
  update public.jobs
  set status = v_status,
      run_at = case when v_status = 'pending' then p_retry_at else run_at end,
      -- Reagendamento sem erro (ex.: fora do horário de envio) não consome tentativa.
      attempts = case when v_status = 'pending' and p_error is null then greatest(attempts - 1, 0) else attempts end,
      last_error = left(p_error, 500),
      locked_at = null, locked_by = null,
      finished_at = case when v_status in ('done', 'failed') then now() end
  where id = p_job;
  return v_status;
end $$;

-- ---------------------------------------------------------------------------
-- Público das campanhas
-- ---------------------------------------------------------------------------

-- Contatos elegíveis: com consentimento registrado, sem descadastro, com
-- destino no WhatsApp, não fictícios, e dentro do segmento escolhido.
create function app.campaign_audience(p_org uuid, p_package uuid, p_interest boolean, p_tag_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.contacts c
  where c.organization_id = p_org
    and c.marketing_consent = 'granted' and c.opted_out_at is null
    and (c.phone_e164 is not null or c.wa_user_id is not null)
    and not c.is_demo
    and (p_interest or cardinality(p_tag_ids) > 0)
    and (not p_interest or exists (
      select 1 from public.opportunities o
      where o.organization_id = p_org and o.contact_id = c.id and o.package_id = p_package))
    and (cardinality(p_tag_ids) = 0 or exists (
      select 1 from public.contact_tags t
      where t.organization_id = p_org and t.contact_id = c.id and t.tag_id = any (p_tag_ids)))
$$;
revoke execute on function app.campaign_audience(uuid, uuid, boolean, uuid[]) from public, anon, authenticated;

-- Prévia do tamanho do público para quem monta a campanha (gestores).
create function public.campaign_audience_count(p_package uuid, p_interest boolean, p_tag_ids uuid[]) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select m.organization_id into v_org from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin', 'supervisor');
  if v_org is null then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (select count(*)::int from app.campaign_audience(v_org, p_package, p_interest, coalesce(p_tag_ids, '{}')));
end $$;

-- Inicia uma campanha agendada: congela a lista de destinatários (até 2.000).
create function public.start_campaign(p_campaign uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.campaigns%rowtype;
  v_total integer;
begin
  select * into v_c from public.campaigns c where c.id = p_campaign for update;
  if not found or v_c.status <> 'scheduled' then
    return -1;
  end if;
  insert into public.campaign_recipients (organization_id, campaign_id, contact_id)
  select v_c.organization_id, v_c.id, a.id
  from app.campaign_audience(v_c.organization_id, v_c.package_id, v_c.audience_interest, v_c.audience_tag_ids) a (id)
  limit 2000
  on conflict (campaign_id, contact_id) do nothing;
  select count(*) into v_total from public.campaign_recipients r where r.campaign_id = v_c.id;
  update public.campaigns
  set status = case when v_total = 0 then 'completed' else 'running' end,
      started_at = now(), total_recipients = v_total,
      finished_at = case when v_total = 0 then now() end
  where id = v_c.id;
  return v_total;
end $$;

-- Reserva um lote de destinatários pendentes para envio.
create function public.claim_campaign_recipients(p_campaign uuid, p_limit integer)
returns table (recipient_id uuid, contact_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.status = 'running') then
    return;
  end if;
  return query
  update public.campaign_recipients r
  set status = 'sending', attempts = r.attempts + 1
  where r.id in (
    select x.id from public.campaign_recipients x
    where x.campaign_id = p_campaign and x.status = 'pending'
    order by x.created_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning r.id, r.contact_id;
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios (somente das tabelas e funções desta migration)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.automations, public.campaigns to authenticated;
grant select on public.automation_runs, public.campaign_recipients to authenticated;
grant all on public.jobs, public.automations, public.automation_runs, public.campaigns, public.campaign_recipients to service_role;
grant execute on all functions in schema app to service_role;
grant execute on function app.automations_before(), app.campaigns_after_update() to authenticated;

revoke execute on function public.cancel_automation_run(uuid) from public, anon;
revoke execute on function public.campaign_audience_count(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.cancel_automation_run(uuid) to authenticated;
grant execute on function public.campaign_audience_count(uuid, boolean, uuid[]) to authenticated;

revoke execute on function public.enqueue_due_automations() from public, anon, authenticated;
revoke execute on function public.enqueue_due_campaigns() from public, anon, authenticated;
revoke execute on function public.claim_jobs(integer, text) from public, anon, authenticated;
revoke execute on function public.finish_job(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.start_campaign(uuid) from public, anon, authenticated;
revoke execute on function public.claim_campaign_recipients(uuid, integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_automations() to service_role;
grant execute on function public.enqueue_due_campaigns() to service_role;
grant execute on function public.claim_jobs(integer, text) to service_role;
grant execute on function public.finish_job(uuid, text, text, timestamptz) to service_role;
grant execute on function public.start_campaign(uuid) to service_role;
grant execute on function public.claim_campaign_recipients(uuid, integer) to service_role;
