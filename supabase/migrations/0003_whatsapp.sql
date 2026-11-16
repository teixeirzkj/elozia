-- Elozia · Fase 3 · Atendimento WhatsApp (Meta Cloud API oficial)
-- Canais, credenciais criptografadas, templates, conversas, mensagens e
-- registro de webhooks. Escritas sensíveis acontecem somente no servidor
-- (service_role) ou por funções com verificação própria.

-- Identificador de usuário da Meta (BSUID), usado quando o telefone não vem no webhook.
alter table public.contacts add column wa_user_id text check (wa_user_id is null or char_length(wa_user_id) <= 128);
create unique index contacts_wa_user_unique on public.contacts (organization_id, wa_user_id) where wa_user_id is not null;

-- ---------------------------------------------------------------------------
-- Canais
-- ---------------------------------------------------------------------------

create table public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  display_phone text,
  verified_name text,
  quality_rating text,
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  connection_method text not null default 'manual' check (connection_method in ('manual', 'embedded_signup')),
  uses_own_app boolean not null default false,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  last_webhook_at timestamptz,
  templates_synced_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index whatsapp_channels_org_idx on public.whatsapp_channels (organization_id);
create trigger whatsapp_channels_touch before update on public.whatsapp_channels
  for each row execute function app.touch_updated_at();

-- Segredos do canal, cifrados pelo servidor (AES-256-GCM). Sem políticas de RLS:
-- nenhum usuário lê esta tabela, apenas o servidor com service_role.
create table public.whatsapp_credentials (
  channel_id uuid primary key references public.whatsapp_channels (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_ciphertext text not null,
  app_secret_ciphertext text,
  verify_token_ciphertext text not null,
  verify_token_hash text not null,
  updated_at timestamptz not null default now()
);
create index whatsapp_credentials_verify_idx on public.whatsapp_credentials (verify_token_hash);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  channel_id uuid not null,
  meta_id text not null,
  name text not null,
  language text not null,
  category text not null,
  status text not null,
  components jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel_id, name, language),
  foreign key (organization_id, channel_id) references public.whatsapp_channels (organization_id, id) on delete cascade
);
create index whatsapp_templates_org_idx on public.whatsapp_templates (organization_id, status);

-- ---------------------------------------------------------------------------
-- Conversas e mensagens
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  channel_id uuid not null,
  wa_id text,
  wa_user_id text,
  status text not null default 'pending' check (status in ('pending', 'open', 'closed')),
  assignee_id uuid,
  team_id uuid,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 200),
  unread_count integer not null default 0 check (unread_count >= 0),
  cycle_started_at timestamptz not null default now(),
  first_response_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel_id, contact_id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, channel_id) references public.whatsapp_channels (organization_id, id) on delete cascade,
  foreign key (organization_id, assignee_id) references public.memberships (organization_id, user_id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id) on delete set null (team_id)
);
create index conversations_inbox_idx on public.conversations (organization_id, status, last_message_at desc);
create index conversations_assignee_idx on public.conversations (organization_id, assignee_id, status);
create index conversations_contact_idx on public.conversations (organization_id, contact_id);
create trigger conversations_touch before update on public.conversations
  for each row execute function app.touch_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  type text not null check (type in ('text', 'image', 'audio', 'document', 'video', 'template', 'note', 'unsupported')),
  body text check (body is null or char_length(body) <= 8000),
  media_path text check (media_path is null or char_length(media_path) <= 400),
  media_mime text,
  media_name text check (media_name is null or char_length(media_name) <= 200),
  media_status text check (media_status is null or media_status in ('pending', 'stored', 'failed')),
  wa_media_id text,
  wa_message_id text unique,
  status text not null check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'note')),
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  template_name text,
  payload jsonb,
  sender_id uuid references public.profiles (id) on delete set null,
  origin text not null default 'manual' check (origin in ('manual', 'automation', 'campaign')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade
);
create index messages_conversation_idx on public.messages (organization_id, conversation_id, created_at);
create index messages_org_created_idx on public.messages (organization_id, created_at);

create table public.conversation_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  conversation_id uuid not null,
  type text not null check (type in ('created', 'assumed', 'transferred', 'closed', 'reopened', 'first_response')),
  actor_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade
);
create index conversation_events_conv_idx on public.conversation_events (organization_id, conversation_id, created_at);
create index conversation_events_type_idx on public.conversation_events (organization_id, type, created_at);

-- Registro técnico dos webhooks: só metadados, nunca o conteúdo das mensagens.
create table public.webhook_events (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  kind text not null,
  phone_number_id text,
  outcome text not null default 'processed',
  error text check (error is null or char_length(error) <= 300),
  received_at timestamptz not null default now()
);
create index webhook_events_org_idx on public.webhook_events (organization_id, received_at desc);

-- ---------------------------------------------------------------------------
-- RLS: leitura pelos membros; escrita somente pelo servidor ou pelas funções
-- ---------------------------------------------------------------------------

alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_credentials enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_events enable row level security;
alter table public.webhook_events enable row level security;

create policy whatsapp_channels_select on public.whatsapp_channels for select to authenticated
  using (app.is_member(organization_id));
create policy whatsapp_templates_select on public.whatsapp_templates for select to authenticated
  using (app.is_member(organization_id));
create policy conversations_select on public.conversations for select to authenticated
  using (app.is_member(organization_id));
create policy messages_select on public.messages for select to authenticated
  using (app.is_member(organization_id));
create policy conversation_events_select on public.conversation_events for select to authenticated
  using (app.is_member(organization_id));
-- whatsapp_credentials e webhook_events: nenhuma política (acesso só pelo servidor).

-- ---------------------------------------------------------------------------
-- Gestão dos atendimentos (chamadas pelo usuário; verificam papel e agência)
-- ---------------------------------------------------------------------------

create function app.conversation_for_update(p_conversation uuid) returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found or not app.is_member(v_conv.organization_id) then
    raise exception 'Conversa não encontrada' using errcode = 'P0001';
  end if;
  return v_conv;
end $$;

-- Atendente só age em conversa sem responsável ou atribuída a ele; gestores agem em qualquer uma.
create function app.can_handle_conversation(v_conv public.conversations) returns boolean
language sql stable set search_path = '' as $$
  select app.is_manager(v_conv.organization_id) or v_conv.assignee_id is null or v_conv.assignee_id = auth.uid()
$$;

create function public.assume_conversation(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations := app.conversation_for_update(p_conversation);
begin
  if v_conv.assignee_id = auth.uid() and v_conv.status = 'open' then
    return;
  end if;
  if not app.can_handle_conversation(v_conv) then
    raise exception 'Esta conversa já está com outro atendente' using errcode = '42501';
  end if;
  update public.conversations set assignee_id = auth.uid(), status = 'open', closed_at = null where id = v_conv.id;
  insert into public.conversation_events (organization_id, conversation_id, type, actor_id)
  values (v_conv.organization_id, v_conv.id, 'assumed', auth.uid());
end $$;

create function public.transfer_conversation(p_conversation uuid, p_assignee uuid, p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations := app.conversation_for_update(p_conversation);
begin
  if not app.can_handle_conversation(v_conv) then
    raise exception 'Somente o responsável ou um supervisor pode transferir esta conversa' using errcode = '42501';
  end if;
  if p_assignee is null and p_team is null then
    raise exception 'Informe o atendente ou a equipe de destino' using errcode = 'P0001';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.memberships m
    where m.organization_id = v_conv.organization_id and m.user_id = p_assignee and m.status = 'active') then
    raise exception 'Atendente inválido' using errcode = 'P0001';
  end if;
  if p_team is not null and not exists (
    select 1 from public.teams t where t.organization_id = v_conv.organization_id and t.id = p_team) then
    raise exception 'Equipe inválida' using errcode = 'P0001';
  end if;
  update public.conversations
  set assignee_id = p_assignee,
      team_id = coalesce(p_team, case when p_assignee is not null then team_id end),
      status = case when p_assignee is null then 'pending' else 'open' end,
      closed_at = null
  where id = v_conv.id;
  insert into public.conversation_events (organization_id, conversation_id, type, actor_id, metadata)
  values (v_conv.organization_id, v_conv.id, 'transferred', auth.uid(),
          jsonb_build_object('from', v_conv.assignee_id, 'to', p_assignee, 'team', p_team));
end $$;

create function public.close_conversation(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations := app.conversation_for_update(p_conversation);
begin
  if v_conv.status = 'closed' then
    return;
  end if;
  if not app.can_handle_conversation(v_conv) then
    raise exception 'Somente o responsável ou um supervisor pode concluir esta conversa' using errcode = '42501';
  end if;
  update public.conversations set status = 'closed', closed_at = now(), unread_count = 0 where id = v_conv.id;
  insert into public.conversation_events (organization_id, conversation_id, type, actor_id)
  values (v_conv.organization_id, v_conv.id, 'closed', auth.uid());
end $$;

create function public.reopen_conversation(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations := app.conversation_for_update(p_conversation);
begin
  if v_conv.status <> 'closed' then
    return;
  end if;
  update public.conversations
  set status = 'open', assignee_id = coalesce(assignee_id, auth.uid()), closed_at = null,
      cycle_started_at = now(), first_response_at = null
  where id = v_conv.id;
  insert into public.conversation_events (organization_id, conversation_id, type, actor_id)
  values (v_conv.organization_id, v_conv.id, 'reopened', auth.uid());
end $$;

create function public.mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations := app.conversation_for_update(p_conversation);
begin
  if v_conv.unread_count > 0 and app.can_handle_conversation(v_conv) then
    update public.conversations set unread_count = 0 where id = v_conv.id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Entrada de webhooks (somente service_role)
-- ---------------------------------------------------------------------------

-- Registra uma mensagem recebida de forma idempotente e atômica:
-- a agência é resolvida pelo phone_number_id; contato e conversa são criados
-- quando necessário; mensagem repetida (mesmo wa_message_id) não gera nada.
create function public.ingest_whatsapp_message(
  p_phone_number_id text,
  p_wa_id text,
  p_phone_e164 text,
  p_wa_user_id text,
  p_profile_name text,
  p_wa_message_id text,
  p_type text,
  p_body text,
  p_wa_media_id text,
  p_media_mime text,
  p_media_name text,
  p_sent_at timestamptz
) returns table (message_id uuid, organization_id uuid, conversation_id uuid, contact_id uuid, duplicate boolean)
language plpgsql security definer set search_path = '' as $$
-- Os nomes das colunas de retorno coincidem com colunas das tabelas: nas consultas vale a coluna.
#variable_conflict use_column
declare
  v_channel public.whatsapp_channels%rowtype;
  v_contact uuid;
  v_conv public.conversations%rowtype;
  v_message uuid;
  v_new_cycle boolean := false;
  v_at timestamptz := least(coalesce(p_sent_at, now()), now());
  v_preview text;
begin
  select * into v_channel from public.whatsapp_channels c
  where c.phone_number_id = p_phone_number_id and c.status <> 'disconnected';
  if not found then
    return;
  end if;
  if p_phone_e164 is null and p_wa_user_id is null then
    return;
  end if;

  select m.id, m.conversation_id into v_message, v_conv.id from public.messages m where m.wa_message_id = p_wa_message_id;
  if found then
    return query select v_message, v_channel.organization_id, v_conv.id, null::uuid, true;
    return;
  end if;

  -- Contato: pelo telefone ou pelo identificador de usuário da Meta.
  select c.id into v_contact from public.contacts c
  where c.organization_id = v_channel.organization_id
    and ((p_phone_e164 is not null and c.phone_e164 = p_phone_e164)
      or (p_wa_user_id is not null and c.wa_user_id = p_wa_user_id))
  order by (c.phone_e164 = p_phone_e164) desc nulls last
  limit 1;
  if v_contact is null then
    begin
      insert into public.contacts (organization_id, name, phone_e164, wa_user_id, source)
      values (v_channel.organization_id,
              left(coalesce(nullif(btrim(p_profile_name), ''), p_phone_e164, 'Contato do WhatsApp'), 160),
              p_phone_e164, p_wa_user_id, 'whatsapp')
      returning id into v_contact;
      insert into public.contact_events (organization_id, contact_id, type, body)
      values (v_channel.organization_id, v_contact, 'created', 'Contato criado a partir de mensagem recebida no WhatsApp');
    exception when unique_violation then
      select c.id into v_contact from public.contacts c
      where c.organization_id = v_channel.organization_id
        and (c.phone_e164 = p_phone_e164 or c.wa_user_id = p_wa_user_id)
      limit 1;
    end;
  else
    update public.contacts c set wa_user_id = p_wa_user_id
    where c.id = v_contact and c.wa_user_id is null and p_wa_user_id is not null
      and not exists (select 1 from public.contacts x
                      where x.organization_id = c.organization_id and x.wa_user_id = p_wa_user_id);
  end if;

  -- Conversa: uma por contato e canal; mensagem nova reabre a conversa concluída.
  insert into public.conversations (organization_id, contact_id, channel_id, wa_id, wa_user_id, status)
  values (v_channel.organization_id, v_contact, v_channel.id, p_wa_id, p_wa_user_id, 'pending')
  on conflict (channel_id, contact_id) do nothing;
  if found then
    v_new_cycle := true;
  end if;
  select * into v_conv from public.conversations c
  where c.channel_id = v_channel.id and c.contact_id = v_contact for update;

  if v_new_cycle then
    insert into public.conversation_events (organization_id, conversation_id, type)
    values (v_conv.organization_id, v_conv.id, 'created');
  elsif v_conv.status = 'closed' then
    v_new_cycle := true;
    insert into public.conversation_events (organization_id, conversation_id, type, metadata)
    values (v_conv.organization_id, v_conv.id, 'reopened', jsonb_build_object('by', 'contact'));
  end if;

  insert into public.messages (organization_id, conversation_id, direction, type, body, wa_media_id, media_mime,
                               media_name, media_status, wa_message_id, status, created_at)
  values (v_conv.organization_id, v_conv.id, 'in', p_type, left(p_body, 8000), p_wa_media_id, p_media_mime,
          left(p_media_name, 200), case when p_wa_media_id is not null then 'pending' end, p_wa_message_id, 'received', v_at)
  returning id into v_message;

  v_preview := left(coalesce(nullif(btrim(p_body), ''), case p_type
    when 'image' then 'Imagem' when 'audio' then 'Áudio' when 'document' then 'Documento'
    when 'video' then 'Vídeo' else 'Mensagem' end), 200);

  update public.conversations c
  set last_message_at = greatest(coalesce(c.last_message_at, v_at), v_at),
      last_inbound_at = greatest(coalesce(c.last_inbound_at, v_at), v_at),
      last_message_preview = v_preview,
      unread_count = c.unread_count + 1,
      wa_id = coalesce(p_wa_id, c.wa_id),
      wa_user_id = coalesce(p_wa_user_id, c.wa_user_id),
      status = case when c.status = 'closed' then (case when c.assignee_id is null then 'pending' else 'open' end) else c.status end,
      closed_at = null,
      cycle_started_at = case when v_new_cycle then v_at else c.cycle_started_at end,
      first_response_at = case when v_new_cycle then null else c.first_response_at end
  where c.id = v_conv.id;

  update public.whatsapp_channels set last_webhook_at = now() where id = v_channel.id;
  update public.opportunities o set last_interaction_at = v_at
  where o.organization_id = v_conv.organization_id and o.contact_id = v_contact and o.status = 'open';

  -- Descadastro por palavra-chave: interrompe campanhas e mensagens automáticas.
  if p_type = 'text' and upper(btrim(coalesce(p_body, ''))) in ('SAIR', 'PARAR', 'STOP', 'DESCADASTRAR') then
    update public.contacts c set marketing_consent = 'revoked', opted_out_at = now(), consent_at = null
    where c.id = v_contact and c.marketing_consent <> 'revoked';
    if found then
      insert into public.contact_events (organization_id, contact_id, type, body)
      values (v_conv.organization_id, v_contact, 'consent', 'Descadastro solicitado pelo contato no WhatsApp');
    end if;
  end if;

  return query select v_message, v_conv.organization_id, v_conv.id, v_contact, false;
end $$;

-- Aplica uma atualização de status vinda da Meta. Nunca regride
-- (lida não volta a entregue) e ignora mensagens desconhecidas.
create function public.apply_whatsapp_status(
  p_phone_number_id text,
  p_wa_message_id text,
  p_status text,
  p_error_code text,
  p_error_message text,
  p_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages%rowtype;
  v_rank constant jsonb := '{"queued": 0, "failed": 0, "sent": 1, "delivered": 2, "read": 3}';
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then
    return null;
  end if;
  -- A mensagem precisa pertencer à agência dona do número que enviou o webhook.
  select m.* into v_msg from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.whatsapp_channels ch on ch.id = c.channel_id
  where m.wa_message_id = p_wa_message_id and m.direction = 'out' and ch.phone_number_id = p_phone_number_id
  for update of m;
  if not found then
    return null;
  end if;

  if p_status = 'failed' then
    if v_msg.status in ('delivered', 'read') then
      return v_msg.organization_id;
    end if;
    update public.messages set status = 'failed', error_code = left(p_error_code, 20), error_message = left(p_error_message, 500)
    where id = v_msg.id;
  elsif (v_rank ->> p_status)::int > (v_rank ->> v_msg.status)::int then
    update public.messages
    set status = p_status,
        error_code = null, error_message = null,
        delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at, now()) else delivered_at end,
        read_at = case when p_status = 'read' then coalesce(p_at, now()) else read_at end
    where id = v_msg.id;
  end if;
  return v_msg.organization_id;
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke execute on function public.assume_conversation(uuid) from public, anon;
revoke execute on function public.transfer_conversation(uuid, uuid, uuid) from public, anon;
revoke execute on function public.close_conversation(uuid) from public, anon;
revoke execute on function public.reopen_conversation(uuid) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.assume_conversation(uuid) to authenticated;
grant execute on function public.transfer_conversation(uuid, uuid, uuid) to authenticated;
grant execute on function public.close_conversation(uuid) to authenticated;
grant execute on function public.reopen_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke execute on function public.ingest_whatsapp_message(text, text, text, text, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.apply_whatsapp_status(text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_message(text, text, text, text, text, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.apply_whatsapp_status(text, text, text, text, text, timestamptz) to service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- Tabelas só do servidor: nem privilégio de tabela para usuários.
revoke all on public.whatsapp_credentials, public.webhook_events from authenticated;

-- Tempo real para a central de atendimento (a RLS filtra o que cada um recebe).
alter publication supabase_realtime add table public.conversations, public.messages;
