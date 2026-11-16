-- Elozia · Fase 5 · Indicadores, relatórios e retenção
-- As funções de indicadores rodam com os direitos de quem chama (a RLS vale)
-- e ainda filtram pela agência do usuário. Nenhum número é estimado: tudo é
-- contagem ou soma de registros existentes.

-- Agência do usuário autenticado (nula se não houver vínculo ativo).
create function app.current_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id from public.memberships m where m.user_id = auth.uid() and m.status = 'active' limit 1
$$;
grant execute on function app.current_org() to authenticated, service_role;

create function app.require_manager_org() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_org uuid := app.current_org();
begin
  if v_org is null or not app.is_manager(v_org) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return v_org;
end $$;
grant execute on function app.require_manager_org() to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard (todos os membros)
-- ---------------------------------------------------------------------------

create function public.dashboard_metrics(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.current_org() as id)
  select jsonb_build_object(
    'leads', (select count(*) from public.contacts c, org
              where c.organization_id = org.id and not c.is_demo and c.created_at >= p_from and c.created_at < p_to),
    'open_opportunities', (select count(*) from public.opportunities o, org
              where o.organization_id = org.id and not o.is_demo and o.status = 'open'),
    'open_value_cents', (select coalesce(sum(o.estimated_value_cents), 0) from public.opportunities o, org
              where o.organization_id = org.id and not o.is_demo and o.status = 'open' and o.currency = 'BRL'),
    'proposals_sent', (select count(*) from public.proposals p, org
              where p.organization_id = org.id and p.sent_at >= p_from and p.sent_at < p_to),
    'sales_won', (select count(*) from public.opportunities o, org
              where o.organization_id = org.id and not o.is_demo and o.status = 'won' and o.closed_at >= p_from and o.closed_at < p_to),
    'bookings_confirmed', (select count(*) from public.bookings b, org
              where b.organization_id = org.id and b.status = 'confirmed' and b.confirmed_at >= p_from and b.confirmed_at < p_to),
    'sales_value_cents', (select coalesce(sum(b.total_cents), 0) from public.bookings b, org
              where b.organization_id = org.id and b.status = 'confirmed' and b.currency = 'BRL'
                and b.confirmed_at >= p_from and b.confirmed_at < p_to),
    'sales_other_currencies', (select count(*) from public.bookings b, org
              where b.organization_id = org.id and b.status = 'confirmed' and b.currency <> 'BRL'
                and b.confirmed_at >= p_from and b.confirmed_at < p_to),
    'conversations_pending', (select count(*) from public.conversations c, org
              where c.organization_id = org.id and c.status = 'pending'),
    'conversations_open', (select count(*) from public.conversations c, org
              where c.organization_id = org.id and c.status = 'open'),
    'conversations_closed', (select count(*) from public.conversation_events e, org
              where e.organization_id = org.id and e.type = 'closed' and e.created_at >= p_from and e.created_at < p_to),
    'first_response_count', (select count(*) from public.conversation_events e, org
              where e.organization_id = org.id and e.type = 'first_response' and e.created_at >= p_from and e.created_at < p_to),
    'first_response_avg_seconds', (select round(avg((e.metadata ->> 'seconds')::numeric)) from public.conversation_events e, org
              where e.organization_id = org.id and e.type = 'first_response' and e.created_at >= p_from and e.created_at < p_to),
    'tasks_open', (select count(*) from public.tasks t, org
              where t.organization_id = org.id and t.done_at is null),
    'tasks_overdue', (select count(*) from public.tasks t, org
              where t.organization_id = org.id and t.done_at is null and t.due_at < now())
  )
$$;

-- Próximas saídas com o total de viajantes em reservas não canceladas.
create function public.upcoming_departures(p_limit integer default 6) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.departs_on), '[]'::jsonb) from (
    select d.id, d.package_id, p.name as package_name, p.destination, d.departs_on, d.returns_on, d.seats_total,
           (select coalesce(sum(b.travelers), 0) from public.bookings b
            where b.departure_id = d.id and b.status <> 'cancelled') as travelers_booked
    from public.package_departures d
    join public.packages p on p.id = d.package_id
    where d.organization_id = app.current_org() and not p.is_demo
      and d.status = 'active' and p.status <> 'closed' and d.departs_on >= current_date
    order by d.departs_on
    limit greatest(1, least(p_limit, 50))
  ) x
$$;

-- ---------------------------------------------------------------------------
-- Relatórios (somente gestores). Filtros opcionais: atendente e pacote.
-- ---------------------------------------------------------------------------

-- Desempenho comercial por responsável.
create function public.report_sales(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id),
  opp as (
    select o.* from public.opportunities o, org
    where o.organization_id = org.id and not o.is_demo
      and (p_owner is null or o.owner_id = p_owner) and (p_package is null or o.package_id = p_package)
  )
  select coalesce(jsonb_agg(row_to_json(x) order by x.won_value_cents desc, x.created desc), '[]'::jsonb) from (
    select coalesce(pr.full_name, 'Sem responsável') as owner_name,
           count(*) filter (where opp.created_at >= p_from and opp.created_at < p_to) as created,
           count(*) filter (where opp.status = 'won' and opp.closed_at >= p_from and opp.closed_at < p_to) as won,
           count(*) filter (where opp.status = 'lost' and opp.closed_at >= p_from and opp.closed_at < p_to) as lost,
           count(*) filter (where opp.status = 'open') as open_now,
           coalesce(sum(opp.estimated_value_cents) filter (
             where opp.status = 'won' and opp.currency = 'BRL' and opp.closed_at >= p_from and opp.closed_at < p_to), 0) as won_value_cents,
           (select count(*) from public.proposals p
            where p.opportunity_id in (select o2.id from opp o2 where o2.owner_id is not distinct from opp.owner_id)
              and p.sent_at >= p_from and p.sent_at < p_to) as proposals_sent
    from opp
    left join public.profiles pr on pr.id = opp.owner_id
    group by opp.owner_id, pr.full_name
    having count(*) filter (where opp.created_at >= p_from and opp.created_at < p_to) > 0
        or count(*) filter (where opp.closed_at >= p_from and opp.closed_at < p_to) > 0
        or count(*) filter (where opp.status = 'open') > 0
  ) x
$$;

-- Conversão por etapa: quantas oportunidades entraram em cada etapa no período.
create function public.report_funnel(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select coalesce(jsonb_agg(row_to_json(x) order by x.position), '[]'::jsonb) from (
    select s.id, s.name, s.kind, s.position,
           (select count(distinct h.opportunity_id) from public.opportunity_stage_history h
            join public.opportunities o on o.id = h.opportunity_id
            where h.to_stage_id = s.id and h.moved_at >= p_from and h.moved_at < p_to and not o.is_demo
              and (p_owner is null or o.owner_id = p_owner) and (p_package is null or o.package_id = p_package)) as entered,
           (select count(*) from public.opportunities o
            where o.stage_id = s.id and not o.is_demo
              and (p_owner is null or o.owner_id = p_owner) and (p_package is null or o.package_id = p_package)) as current_count,
           (select coalesce(sum(o.estimated_value_cents), 0) from public.opportunities o
            where o.stage_id = s.id and not o.is_demo and o.currency = 'BRL'
              and (p_owner is null or o.owner_id = p_owner) and (p_package is null or o.package_id = p_package)) as current_value_cents
    from public.pipeline_stages s, org
    where s.organization_id = org.id
  ) x
$$;

-- Vendas por pacote.
create function public.report_packages(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select coalesce(jsonb_agg(row_to_json(x) order by x.revenue_cents desc, x.opportunities desc), '[]'::jsonb) from (
    select p.id, p.name as package_name, p.destination,
           (select count(*) from public.opportunities o
            where o.package_id = p.id and not o.is_demo and o.created_at >= p_from and o.created_at < p_to
              and (p_owner is null or o.owner_id = p_owner)) as opportunities,
           (select count(*) from public.opportunities o
            where o.package_id = p.id and not o.is_demo and o.status = 'won' and o.closed_at >= p_from and o.closed_at < p_to
              and (p_owner is null or o.owner_id = p_owner)) as won,
           (select count(*) from public.bookings b
            where b.package_id = p.id and b.status = 'confirmed' and b.confirmed_at >= p_from and b.confirmed_at < p_to) as bookings,
           (select coalesce(sum(b.travelers), 0) from public.bookings b
            where b.package_id = p.id and b.status = 'confirmed' and b.confirmed_at >= p_from and b.confirmed_at < p_to) as travelers,
           (select coalesce(sum(b.total_cents), 0) from public.bookings b
            where b.package_id = p.id and b.status = 'confirmed' and b.currency = 'BRL'
              and b.confirmed_at >= p_from and b.confirmed_at < p_to) as revenue_cents
    from public.packages p, org
    where p.organization_id = org.id and not p.is_demo and (p_package is null or p.id = p_package)
  ) x
  where x.opportunities > 0 or x.won > 0 or x.bookings > 0
$$;

-- Origem dos leads.
create function public.report_sources(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select coalesce(jsonb_agg(row_to_json(x) order by x.leads desc), '[]'::jsonb) from (
    select c.source,
           count(*) as leads,
           count(*) filter (where exists (
             select 1 from public.opportunities o where o.contact_id = c.id and (p_package is null or o.package_id = p_package))) as with_opportunity,
           count(*) filter (where exists (
             select 1 from public.opportunities o where o.contact_id = c.id and o.status = 'won'
               and (p_package is null or o.package_id = p_package))) as with_sale
    from public.contacts c, org
    where c.organization_id = org.id and not c.is_demo and c.created_at >= p_from and c.created_at < p_to
      and (p_owner is null or c.owner_id = p_owner)
    group by c.source
  ) x
$$;

-- Atendimentos por usuário.
create function public.report_attendance(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select coalesce(jsonb_agg(row_to_json(x) order by x.messages_sent desc, x.user_name), '[]'::jsonb) from (
    select pr.full_name as user_name,
           (select count(*) from public.conversation_events e
            where e.organization_id = m.organization_id and e.actor_id = m.user_id and e.type = 'assumed'
              and e.created_at >= p_from and e.created_at < p_to) as assumed,
           (select count(*) from public.conversation_events e
            where e.organization_id = m.organization_id and e.actor_id = m.user_id and e.type = 'closed'
              and e.created_at >= p_from and e.created_at < p_to) as closed,
           (select count(*) from public.messages msg
            where msg.organization_id = m.organization_id and msg.sender_id = m.user_id and msg.direction = 'out'
              and msg.type <> 'note' and msg.origin = 'manual' and msg.created_at >= p_from and msg.created_at < p_to) as messages_sent,
           (select round(avg((e.metadata ->> 'seconds')::numeric)) from public.conversation_events e
            where e.organization_id = m.organization_id and e.actor_id = m.user_id and e.type = 'first_response'
              and e.created_at >= p_from and e.created_at < p_to) as first_response_avg_seconds,
           (select count(*) from public.conversations c
            where c.organization_id = m.organization_id and c.assignee_id = m.user_id and c.status = 'open') as open_now
    from public.memberships m
    join public.profiles pr on pr.id = m.user_id, org
    where m.organization_id = org.id and (p_owner is null or m.user_id = p_owner)
  ) x
  where x.assumed > 0 or x.closed > 0 or x.messages_sent > 0 or x.open_now > 0
$$;

-- Campanhas e follow-ups.
create function public.report_campaigns(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select jsonb_build_object(
    'campaigns', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.started_at desc nulls last), '[]'::jsonb) from (
        select c.id, c.name, c.status, c.started_at, p.name as package_name, c.total_recipients,
               count(r.id) filter (where r.status = 'sent') as sent,
               count(r.id) filter (where r.status = 'failed') as failed,
               count(r.id) filter (where r.status in ('skipped', 'cancelled')) as not_sent,
               count(m.id) filter (where m.status in ('delivered', 'read')) as delivered,
               count(m.id) filter (where m.status = 'read') as read
        from public.campaigns c
        join public.packages p on p.id = c.package_id
        left join public.campaign_recipients r on r.campaign_id = c.id
        left join public.messages m on m.id = r.message_id, org
        where c.organization_id = org.id and c.status <> 'draft'
          and coalesce(c.started_at, c.scheduled_at) >= p_from and coalesce(c.started_at, c.scheduled_at) < p_to
          and (p_package is null or c.package_id = p_package)
        group by c.id, p.name
      ) x),
    'automations', (
      select coalesce(jsonb_agg(row_to_json(y) order by y.runs desc), '[]'::jsonb) from (
        select a.id, a.name, a.trigger_type, a.status,
               count(r.id) as runs,
               count(r.id) filter (where r.status = 'success') as success,
               count(r.id) filter (where r.status in ('failed', 'partial')) as failed,
               count(r.id) filter (where r.status in ('skipped', 'cancelled')) as not_run
        from public.automations a
        left join public.automation_runs r on r.automation_id = a.id and r.created_at >= p_from and r.created_at < p_to, org
        where a.organization_id = org.id and (p_package is null or a.package_id is null or a.package_id = p_package)
        group by a.id
      ) y)
  )
$$;

-- Oportunidades perdidas, por motivo.
create function public.report_lost(p_from timestamptz, p_to timestamptz, p_owner uuid, p_package uuid) returns jsonb
language sql stable set search_path = '' as $$
  with org as (select app.require_manager_org() as id)
  select coalesce(jsonb_agg(row_to_json(x) order by x.lost desc), '[]'::jsonb) from (
    -- Agrupa sem diferenciar maiúsculas de minúsculas.
    select coalesce(upper(left(btrim(o.lost_reason), 1)) || lower(substr(btrim(o.lost_reason), 2)), 'Motivo não informado') as reason,
           count(*) as lost,
           coalesce(sum(o.estimated_value_cents) filter (where o.currency = 'BRL'), 0) as value_cents
    from public.opportunities o, org
    where o.organization_id = org.id and not o.is_demo and o.status = 'lost'
      and o.closed_at >= p_from and o.closed_at < p_to
      and (p_owner is null or o.owner_id = p_owner) and (p_package is null or o.package_id = p_package)
    group by 1
  ) x
$$;

-- ---------------------------------------------------------------------------
-- Retenção de registros técnicos (somente servidor)
-- ---------------------------------------------------------------------------

-- Remove registros técnicos antigos: webhooks (30 dias) e jobs finalizados (30 dias).
-- Dados de negócio (contatos, conversas, vendas) nunca são apagados aqui.
create function public.purge_technical_logs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_webhooks integer;
  v_jobs integer;
begin
  delete from public.webhook_events where received_at < now() - interval '30 days';
  get diagnostics v_webhooks = row_count;
  delete from public.jobs where status in ('done', 'failed', 'cancelled') and coalesce(finished_at, created_at) < now() - interval '30 days';
  get diagnostics v_jobs = row_count;
  return jsonb_build_object('webhook_events', v_webhooks, 'jobs', v_jobs);
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'dashboard_metrics(timestamptz, timestamptz)', 'upcoming_departures(integer)',
    'report_sales(timestamptz, timestamptz, uuid, uuid)', 'report_funnel(timestamptz, timestamptz, uuid, uuid)',
    'report_packages(timestamptz, timestamptz, uuid, uuid)', 'report_sources(timestamptz, timestamptz, uuid, uuid)',
    'report_attendance(timestamptz, timestamptz, uuid, uuid)', 'report_campaigns(timestamptz, timestamptz, uuid, uuid)',
    'report_lost(timestamptz, timestamptz, uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

revoke execute on function public.purge_technical_logs() from public, anon, authenticated;
grant execute on function public.purge_technical_logs() to service_role;
