# Arquitetura — Elozia

## Visão geral

```
Navegador ──► Next.js (Vercel)
               ├─ Server Components / Server Actions ──► Supabase (cliente do usuário, RLS)
               ├─ /api/webhooks/whatsapp ◄── Meta Cloud API   (service_role, HMAC)
               ├─ /api/cron/*            ◄── agendador         (service_role, CRON_SECRET)
               └─ lib/whatsapp ──► Graph API da Meta
Supabase: Postgres + RLS · Auth · Storage (bucket privado) · Realtime
Upstash Redis: rate limiting
```

Um único aplicativo Next.js. Sem microsserviços, sem ORM: SQL versionado em `supabase/migrations` e `supabase-js` tipado.

## Stack (versões estáveis conferidas no npm em 16/11/2026)

| Pacote | Versão |
|---|---|
| next | 16.4.x |
| react / react-dom | 19.3.x |
| typescript | 7.0.x |
| tailwindcss | 4.3.x |
| @supabase/supabase-js | 2.119.x |
| @supabase/ssr | 0.12.x |
| zod | 4.6.x |
| @upstash/ratelimit / @upstash/redis | 2.2.x / 1.41.x |
| vitest | 5.1.x |
| @playwright/test | 1.65.x |
| @electric-sql/pglite (testes de banco) | 0.5.x |

Node 24. A API da Meta é chamada por `fetch` direto na Graph API, com a versão fixada em variável de ambiente (`META_GRAPH_VERSION`).

## Isolamento entre agências

Cada agência é uma linha em `organizations`. O vínculo de um usuário com a agência é uma linha em `memberships` (com o papel). **No MVP, um usuário pertence a uma única agência** (índice único em `memberships.user_id`), o que elimina troca de contexto e uma classe inteira de erros.

Camadas de proteção, todas obrigatórias:

1. **Banco (RLS).** Toda tabela de negócio tem `organization_id not null` e RLS ativa. As políticas usam funções `security definer`:
   - `app.is_member(org uuid)` — o `auth.uid()` tem membership ativa na agência;
   - `app.has_role(org uuid, roles text[])` — idem, com um dos papéis.
   Padrão: `select`/`insert`/`update` exigem `is_member(organization_id)` (com `with check` igual, impedindo gravar em outra agência); `delete` e tabelas administrativas exigem papel. Chaves estrangeiras compostas `(organization_id, id)` impedem que um registro aponte para um registro de outra agência.
2. **Servidor.** `requireMembership()` resolve usuário → agência → papel a partir da sessão; o `organization_id` usado em gravações vem daí, nunca do formulário.
3. **Service role.** Usado apenas em webhook, cron, convites e credenciais. Como ignora a RLS, cada consulta filtra `organization_id` explicitamente; o webhook resolve a agência pelo `phone_number_id` (único globalmente).
4. **Storage.** Bucket privado `media`; caminho `<organization_id>/...`; políticas de storage conferem o primeiro segmento com `is_member`; acesso por URL assinada de curta duração.
5. **Realtime.** Assinaturas `postgres_changes` passam pela RLS; o cliente só recebe linhas da própria agência.
6. **Testes.** `tests/db` aplica as migrations num Postgres (PGlite) e verifica, tabela por tabela, que o usuário da agência A não lê nem grava na agência B.

Tabelas sensíveis (`whatsapp_credentials`, `webhook_events`, `jobs`) têm RLS ativa **sem políticas** para usuários: só o servidor acessa.

## Papéis e permissões

| Capacidade | Proprietário | Administrador | Supervisor | Atendente |
|---|:-:|:-:|:-:|:-:|
| Dados da agência, fuso | ✔ | ✔ | — | — |
| Equipe, convites, papéis | ✔ | ✔ (não altera proprietário) | — | — |
| Canais (WhatsApp) | ✔ | ✔ | — | — |
| Etapas do funil, etiquetas, equipes | ✔ | ✔ | ✔ | — |
| Catálogo de viagens (criar/editar) | ✔ | ✔ | ✔ | leitura |
| Automações e campanhas | ✔ | ✔ | ✔ | leitura |
| Contatos, oportunidades, reservas | ✔ | ✔ | ✔ | ✔ |
| Excluir contatos/oportunidades | ✔ | ✔ | ✔ | — |
| Importar CSV / exportar relatórios | ✔ | ✔ | ✔ | — |
| Atender conversas | ✔ | ✔ | ✔ | ✔ |
| Transferir conversa de outro atendente | ✔ | ✔ | ✔ | só as próprias |
| Relatórios | ✔ | ✔ | ✔ | — |

Fonte única: `src/lib/permissions.ts` (servidor) espelhada nas políticas RLS.

## Modelo de dados inicial

Todas as tabelas abaixo (exceto `organizations` e `profiles`) têm `organization_id`, `created_at` e, quando faz sentido, `updated_at`.

**Fundação**
- `organizations` — id, name, slug, timezone, phone, email, document.
- `profiles` — id (= auth.users.id), full_name, phone.
- `memberships` — organization_id, user_id, role, status.
- `invitations` — email, role, token_hash, expires_at, accepted_at, invited_by.
- `teams`, `team_members` — equipes de atendimento.
- `audit_logs` — actor_id, action, entity, entity_id, metadata (sem conteúdo de mensagens).

**CRM**
- `contacts` — name, phone_e164 (único por agência), email, notes, source, owner_id, marketing_consent (`unknown|granted|revoked`), consent_at, consent_source, opted_out_at.
- `tags`, `contact_tags`.
- `contact_events` — linha do tempo (nota, ligação, mudança de etapa, proposta, reserva, consentimento...).
- `packages` — name, destination, description, price_cents, currency, status (`active|paused|closed`), image_path, commercial_notes.
- `package_departures` — package_id, departs_on, returns_on, price_cents, seats_total (opcional, informativo), status.
- `pipeline_stages` — name, position, kind (`open|won|lost`).
- `opportunities` — contact_id, package_id?, departure_id?, destination_interest, stage_id, position, estimated_value_cents, currency, intended_date, travelers, owner_id, next_contact_at, last_interaction_at, status (`open|won|lost`), lost_reason, stage_entered_at.
- `opportunity_stage_history` — from_stage_id, to_stage_id, moved_by, moved_at.
- `proposals` — opportunity_id, amount_cents, currency, description, status (`draft|sent|accepted|rejected|expired`), sent_at.
- `bookings` — contact_id, opportunity_id?, package_id?, departure_id?, travelers, total_cents, status (`pending|confirmed|cancelled`), payment_status (`pending|partial|paid|refunded`), payment_method (texto), amount_paid_cents, payment_notes. Pagamento é declarado manualmente; nenhum dado de cartão.
- `tasks` — title, due_at, assignee_id, contact_id?, opportunity_id?, done_at, origin (`manual|automation`).

**WhatsApp**
- `whatsapp_channels` — waba_id, phone_number_id (único global), display_phone, verified_name, status, connection_method (`manual|embedded_signup`).
- `whatsapp_credentials` — channel_id, token_ciphertext, token_iv, token_tag (só servidor).
- `whatsapp_templates` — channel_id, meta_id, name, language, category, status, components (jsonb), synced_at.
- `conversations` — contact_id, channel_id, status (`pending|open|closed`), assignee_id, team_id, last_message_at, last_inbound_at (base da janela de 24 h), unread_count, first_response_at, closed_at.
- `messages` — conversation_id, direction, type, body, media_path, media_mime, wa_message_id (único), status (`queued|sent|delivered|read|failed`), error_code, template_name, sender_id, is_internal_note.
- `conversation_events` — assumida, transferida, concluída, reaberta.
- `webhook_events` — dedupe_key (único), organization_id?, kind, received_at, processed_at, error. Guarda metadados, não o conteúdo.

**Automações**
- `automations` — name, trigger_type, trigger_config (jsonb), conditions (jsonb), actions (jsonb), status (`active|paused`).
- `automation_runs` — automation_id, entity_type, entity_id, dedupe_key (único), status, error, executed_at.
- `campaigns` — name, package_id?, departure_id?, segment (jsonb), template_id, scheduled_at, status (`draft|scheduled|running|completed|cancelled|failed`).
- `campaign_recipients` — campaign_id, contact_id (único por campanha), status, message_id, error.
- `jobs` — fila persistente: kind, payload, run_at, status (`pending|running|done|failed|cancelled`), attempts, max_attempts, locked_at, dedupe_key (único), last_error.

## Padrões de aplicação

- **Leitura:** Server Components chamam `modules/<x>/queries.ts` com o cliente Supabase do usuário.
- **Escrita:** Server Actions em `modules/<x>/actions.ts`: Zod → autorização → banco → `revalidatePath`.
- **Erros:** ações devolvem resultado tipado; mensagens em português; detalhes técnicos só no log do servidor.
- **Kanban:** movimentação por função SQL transacional (`move_opportunity`) que atualiza etapa/posição, grava histórico e evento do contato.

## WhatsApp (Meta Cloud API)

- **Conexão:** Configurações › Canais recebe WABA ID, Phone Number ID e token; o servidor valida na Graph API antes de salvar; o token é criptografado com AES-256-GCM (`ENCRYPTION_KEY`). Interface `ChannelConnector` com implementação `manual`; `embedded_signup` fica previsto.
- **Webhook:** `GET` responde ao desafio com `META_WEBHOOK_VERIFY_TOKEN`; `POST` lê o corpo bruto, valida `X-Hub-Signature-256` com `META_APP_SECRET` (comparação em tempo constante), registra em `webhook_events` com chave de deduplicação, resolve a agência pelo `phone_number_id` e grava mensagens/status. `wa_message_id` único garante idempotência.
- **Janela de 24 h:** calculada a partir de `conversations.last_inbound_at`, no servidor. Fora da janela, só template aprovado.
- **Mídia:** baixada da Meta pelo servidor para o bucket privado; uploads validados por tipo e tamanho; exibição por URL assinada.
- **Tempo real:** Supabase Realtime em `conversations` e `messages`.

## Agendamento e fila

Nada de timers em memória. A tabela `jobs` é a fila; um endpoint `/api/cron/tick` protegido por `CRON_SECRET` reivindica lotes com `for update skip locked`, executa e registra. Falhas reagendam com espera crescente até `max_attempts`. O disparo do tick vem do **Vercel Cron** (a cada minuto exige plano Pro) ou, como alternativa, de **pg_cron + pg_net** no Supabase. Horários são guardados em UTC e interpretados no fuso da agência.

## Segurança

- Cabeçalhos: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Rate limiting (Upstash) em login, cadastro, convites, envio de mensagens e webhook. Sem Upstash configurado, em desenvolvimento usa limitador em memória; em produção a ausência é erro de configuração.
- Variáveis validadas com Zod na inicialização (`lib/env.ts`).
- Logs sem tokens e sem corpo de mensagens.

## Serviços externos necessários

| Serviço | Para quê | Obrigatório no MVP |
|---|---|---|
| Supabase | Banco, Auth, Storage, Realtime | Sim |
| Vercel | Hospedagem, cron | Sim |
| Meta for Developers (app + WhatsApp Business Account) | Cloud API, webhook, templates | Sim, para o módulo WhatsApp |
| Upstash Redis | Rate limiting | Sim, em produção |
| Provedor SMTP (ex.: Resend) no Supabase Auth | E-mails de confirmação, recuperação e convite | Sim, em produção (o SMTP padrão do Supabase é limitado) |
| Domínio próprio | URL do sistema e do webhook | Sim, em produção |
| Monitoramento de erros | Erros de produção | Recomendado |
| Provedor de IA, n8n, gateway de cobrança | Fases futuras | Não |

## Testes

- **Unitários (Vitest):** schemas, normalização de telefone, janela de 24 h, assinatura do webhook, motor de automações, permissões.
- **Banco (Vitest + PGlite):** migrations aplicadas num Postgres embarcado com um esquema `auth` mínimo; isolamento entre agências e regras de papel em todas as tabelas.
- **E2E (Playwright):** fluxo completo contra um projeto Supabase de testes; WhatsApp com mocks de webhook.
