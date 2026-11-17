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
| typescript | 6.0.x (a 7.0 ainda não é suportada pelo typescript-eslint) |
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
- **Webhook:** `GET` responde ao desafio com o token global (`META_WEBHOOK_VERIFY_TOKEN`) ou com o token de verificação gerado para um canal; `POST` lê o corpo bruto e valida `X-Hub-Signature-256` em tempo constante. Cada canal usa o aplicativo da Elozia (`META_APP_SECRET`) ou o aplicativo da própria agência (App Secret cifrado no canal); um evento só é aceito se a assinatura conferir com o segredo do canal a que se destina. Depois, as funções `ingest_whatsapp_message` e `apply_whatsapp_status` resolvem a agência pelo `phone_number_id` e gravam de forma atômica e idempotente (`wa_message_id` único).
- **Identidade do contato:** telefone em E.164 ou, quando a Meta não o envia, o identificador de usuário (`wa_user_id`).
- **Janela de 24 h:** calculada a partir de `conversations.last_inbound_at`, no servidor, a cada envio e reenvio. Fora da janela, só template aprovado.
- **Consentimento:** template de marketing exige consentimento registrado; toda mensagem automática (automação ou campanha) exige consentimento e respeita o descadastro.
- **Mídia:** baixada da Meta pelo servidor para o bucket privado; uploads validados por tipo e tamanho; exibição por URL assinada.
- **Tempo real:** Supabase Realtime em `conversations` e `messages`.

## Agendamento e fila

Nada de timers em memória. A tabela `jobs` é a fila; um endpoint `/api/cron/tick` protegido por `CRON_SECRET` chama `enqueue_due_automations` e `enqueue_due_campaigns` (que criam uma execução por ocorrência, com chave única), reivindica lotes com `claim_jobs` (`for update skip locked`), executa e finaliza com `finish_job`. Falhas reagendam com espera crescente até `max_attempts`; ações já concluídas não se repetem na nova tentativa. Mensagens automáticas só saem entre 8h e 20h no fuso da agência. O disparo do tick vem do **Vercel Cron** (a cada minuto exige plano Pro) ou, como alternativa, de **pg_cron + pg_net** no Supabase. Horários são guardados em UTC e interpretados no fuso da agência.

## Segurança

- Cabeçalhos: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Rate limiting (Upstash) em login, cadastro, convites, envio de mensagens, uploads, importação, exportação e webhook. Sem Upstash configurado usa limitador em memória por instância e registra aviso em produção.
- Indicadores e relatórios são funções SQL que rodam com os direitos do usuário (RLS) e filtram pela agência dele; relatórios exigem papel de gestor.
- Auditoria completa e riscos aceitos em [SEGURANCA.md](SEGURANCA.md).
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

---

## Atualização planejada (16/11/2026)

> Esta seção descreve o modelo **planejado** para a atualização da [Parte 2 do PLANO.md](PLANO.md). Nada abaixo está implementado. Cada item entra numa migration nova (0007 em diante); as migrations 0001–0006 nunca são editadas.

### Navegação e interface

- Barra superior escura no desktop, com menu principal e submenus suspensos; navegação adaptada no celular. Substitui a sidebar.
- Configurações com menu lateral contextual (título e descrição por item).
- Submenus mostram só funcionalidades existentes.
- Bibliotecas novas, carregadas só em componentes cliente que as usam: `motion@14` (animações, com `prefers-reduced-motion` respeitado também em JS), `recharts@3` (gráficos), `@xyflow/react@12.12.1` (construtor de chatbot, só na rota do editor; a 13.x saiu em 16/11/2026 e fica para depois de estabilizar).

### Identidade Master

- Esquema `platform`, **fora da API pública** (sem grants para `anon` e `authenticated`; acesso só por funções `security definer`).
- `platform.platform_admins(user_id, role owner|operator|viewer, status, ...)` é a **única fonte de autorização** Master. `app_metadata` serve no máximo como dica de roteamento; `user_metadata` nunca participa de autorização.
- MFA TOTP obrigatório: o servidor confere `aal2` (`getUser` + `getAuthenticatorAssuranceLevel`) e o banco confere `auth.jwt()->>'aal'` em toda função Master. Ações sensíveis exigem TOTP recente.
- Master **nunca** é membro de agência: gatilhos impedem vínculo nos dois sentidos. Quem atua nas duas frentes usa duas contas.
- Primeiro Master: conta criada por script com service role e inclusão em `platform_admins` pelo SQL Editor, registrada na auditoria. Não existe "o primeiro que chamar vira Master".
- Login: CAPTCHA nativo do Supabase Auth e hooks de tentativa de senha e de MFA (bloqueio progressivo no próprio Auth). Limites na Server Action são complemento, não a proteção principal, porque a API do Auth pode ser chamada diretamente.
- Logout e desativação do Master encerram todas as sessões (`signOut` global).

### Agências: situação, planos e limites

- `organizations` ganha `status` (active|suspended), dados de suspensão, `plan_id`, `logo_path`, `created_by`, `last_activity_at` e endereço. Gatilho impede a agência de alterar campos administrativos.
- Agência suspensa: `is_member`, `has_role` e `current_org` passam a exigir `status = 'active'` (bloqueio total no banco), assim como as funções que leem vínculos diretamente; `authorize()` recusa antes de qualquer ação com service role; o webhook continua gravando mensagens recebidas, sem automações nem envios; o agendador ignora a agência.
- `platform.plans` (limites, sem preço) e `public.organization_limits` (exceções por agência). Limites aplicados por gatilhos em `memberships`, `invitations` e `whatsapp_channels`, que valem também para o service role.
- Criação de agência só por `platform_create_organization`, com convite do proprietário (`created_via = 'platform'`). `create_organization` e o cadastro público deixam de existir.

### Modo suporte

```
Master (aal2) ─► start_support_session(org, justificativa)   [o banco valida tudo]
        │            └─ grava a sessão: Master, agência, session_id do login, expira em até 60 min
        └─ cookie httpOnly assinado = id da sessão (nunca o id da agência)
Cada requisição: cookie válido + Master aal2 + sessão ativa no banco com o mesmo session_id
        └─ papel efetivo "support" (somente leitura)
```

- A sessão fica presa ao `session_id` do login que a iniciou: outro aparelho ou outro token do mesmo Master não herda o acesso.
- `app.is_member` **não** considera o suporte (aparece em regras de escrita). O suporte entra por duas funções usadas só em políticas de leitura:
  - `app.can_read_org(org)`: dados administrativos (agência, equipe, etiquetas, catálogo, etapas, canais sem credenciais, modelos, automações, campanhas);
  - `app.can_read_private(org, escopo)`: dados privados (contatos, oportunidades, propostas, reservas, tarefas, conversas, mensagens), só com autorização ativa da agência para aquele escopo.
- Autorização da agência (`support_grants`): concedida por proprietário ou administrador, escopo "CRM" ou "atendimento", somente leitura, prazo de até 72 h (padrão 4 h), Master nomeado, revogável a qualquer momento.
- Mídia privada em modo suporte: só por rota do servidor que reconfere a autorização a cada requisição e registra a leitura. O suporte não recebe URLs assinadas nem leitura direta do Storage privado.
- Auditoria: ações de plataforma em `platform.platform_audit_logs` (só inclusão; gatilhos cobrem qualquer alteração); ações dentro da agência em `audit_logs` com `support_session_id` e `master_id` carimbados por gatilho; leituras privadas em eventos da sessão. A auditoria do suporte só é gravada por funções: o Master não insere direto em `audit_logs`.
- A agência consulta sessões, eventos e autorizações por funções que filtram a própria agência.
- **Regra para tabelas novas:** toda tabela criada a partir da Fase B nasce classificada como administrativa ou privada, com a política de leitura correspondente.

### Atendimento como entidade

- Tabela de atendimentos, um por ciclo de conversa: protocolo, início, primeira resposta, conclusão, atendente, equipe, origem (canal e, quando a Meta informar, anúncio).
- Base para o relatório geral (pendentes antes do período + novos − concluídos = pendentes depois), capacidade diária, tempo de espera, tempo de resposta e duração.
- Equipe padrão e equipe por canal preenchem a equipe das conversas novas.

### CRM

- Múltiplos funis (se aprovado): `pipelines`, com `pipeline_id` em etapas e oportunidades; migração das etapas atuais para um funil padrão; `move_opportunity` valida o funil.
- Contatos: `archived_at` (arquivados fora de campanhas e automações), `last_interaction_at`, exportação auditada.
- Pacotes: `package_images` (várias fotos, uma de capa).
- Motivos de perda configuráveis, mantendo o texto livre como complemento.

### Envio de mensagens: consentimento por origem

`sendToConversation` continua sendo o único caminho de envio. A regra passa a depender da origem (decisão D3 do plano):

| Origem | Regra |
|---|---|
| Manual (atendente) | Janela de 24 h ou template aprovado |
| Chatbot, em conversa iniciada pelo cliente e dentro da janela | Sem opt-out |
| Template de utilidade a cliente com relação comercial (lembretes) | Sem opt-out |
| Template de marketing, campanha | Consentimento registrado e sem opt-out |

Horário de atendimento configurável por agência substitui a janela fixa de 8h–20h; campanhas e sequências o respeitam; o chatbot responde a qualquer hora.

### Automações

- Sequências: `sequences`, `sequence_steps`, `sequence_enrollments` (uma inscrição viva por entidade, ponteiro de etapa, regras de saída) e registros por etapa com chave única. Reaproveitam a fila `jobs`, as consultas de gatilho e as ações do motor atual.
- Mensagens agendadas: `scheduled_messages` com job próprio (`run_at = scheduled_at`, chave `sched:<id>`); fora da janela de 24 h, só template.
- Respostas rápidas: tabela única com alcance empresa, equipe ou usuário e arquivamento, exibida junto dos modelos da Meta com tipo diferenciado.
- Campanhas: status `paused` com retomada por função; lotes com chave de deduplicação; recuperação de destinatários presos em "enviando".
- `jobs.kind`, `messages.origin` e `messages.type` ampliados numa única migration, já prevendo sequência, agendada, chatbot e interativa.

### Chatbots

- Tabelas: `chatbots` (rascunho em JSON com revisão para concorrência), `chatbot_versions` (imutáveis; publicação só por função), `chatbot_sessions` (no máximo uma viva por conversa, presa à versão de início) e `chatbot_events` (chave de idempotência única, sem conteúdo de mensagens).
- Grafo: nós são **grupos de etapas** em sequência; cada nó tem uma saída por opção ou ramo e uma saída obrigatória de "sem resposta/expirou".
- Validação no servidor (schema estrito, validador estrutural e revalidação de cada id contra a agência) na publicação e na execução. O grafo vindo do navegador nunca é confiável.
- Motor: roda depois da resposta do webhook (erros contidos, sem provocar reentregas da Meta), com trava por conversa, idempotência por mensagem recebida e limite de passos e de mensagens por turno; esperas e expirações viram jobs.
- Atendimento humano: quando um atendente assume, responde ou conclui, a sessão do bot é encerrada e seus jobs cancelados.
- WhatsApp: envio de mensagens interativas (botões até 3, lista até 10 itens) e recebimento de `button_reply`/`list_reply` como entrada de primeira classe.
- O simulador usa o mesmo interpretador, sem efeitos reais.

### Testes adicionais

- `tests/db/helpers.ts` ganha `auth.jwt()` com `aal`, `amr` e `session_id`, e a criação de agências passa a usar a função do Master.
- Testes de burla do modo suporte e da suspensão; teste que percorre todas as funções `security definer` e confere a recusa para agência suspensa; teste de que nenhuma função nova é executável por `anon`.
- Toda tabela nova: isolamento entre agências e classificação de leitura do suporte.
