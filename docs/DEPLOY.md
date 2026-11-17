# Deploy e operação — Elozia

Guia para colocar a Elozia no ar: Supabase, Vercel, Meta, Upstash, monitoramento e backup. Siga na ordem.

> Use **dois projetos Supabase**: um de testes (E2E, experimentos) e um de produção. Nunca rode testes nem carregue dados de demonstração em produção.

## 1. Variáveis de ambiente

| Variável | Onde é usada | Obrigatória | Observação |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Links de convite e de e-mail, URL do webhook | Sim | Ex.: `https://app.seudominio.com.br`, sem barra no fim |
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador e servidor | Sim | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Navegador e servidor | Sim | Chave anônima (ou *publishable*) |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor: webhook, cron, canais | Sim | **Ignora a RLS.** Nunca usar prefixo `NEXT_PUBLIC_` |
| `ENCRYPTION_KEY` | Criptografia dos tokens da Meta | Sim | 32 bytes em base64: `openssl rand -base64 32`. **Perder a chave inutiliza os tokens salvos** (as agências teriam de reconectar) |
| `META_GRAPH_VERSION` | Chamadas à Graph API | Sim, para WhatsApp | Ex.: `v27.0` (versão corrente em nov/2026). Atualize de forma controlada |
| `META_APP_SECRET` | Assinatura dos webhooks | Se a Elozia tiver aplicativo próprio na Meta | Sem ela, cada agência informa o App Secret do próprio aplicativo |
| `META_WEBHOOK_VERIFY_TOKEN` | Verificação do webhook | Se a Elozia tiver aplicativo próprio | Texto aleatório longo |
| `CRON_SECRET` | Agendador | Sim, para automações e campanhas | Texto aleatório longo. A Vercel envia em `Authorization: Bearer` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | Sim, em produção | Sem elas o limite é por instância e o log avisa |

Variáveis só de teste: `E2E_ENABLED`, `E2E_BASE_URL`, `E2E_PHONE_NUMBER_ID`, `E2E_META_APP_SECRET`.

Na Vercel, cadastre as variáveis em **Production** (e em Preview apontando para o projeto de testes). Marque as secretas como *Sensitive*.

## 2. Checklist do Supabase

- [ ] Criar o projeto (região São Paulo, `sa-east-1`, para menor latência e dados no Brasil).
- [ ] Aplicar as migrations **na ordem** (`0001_fundacao` → `0002_crm` → `0003_whatsapp` → `0004_automacoes` → `0005_relatorios` → `0006_endurecimento`). Com `SUPABASE_DB_URL` no `.env.local` (Connect › Session pooler), use `node scripts/migrate.mjs`: ele aplica o que falta, cada arquivo em uma transação, e registra em `app.schema_migrations`. `node scripts/check-env.mjs` confere o `.env.local` sem exibir valores, e `node scripts/vercel-env.mjs` envia as variáveis para a Vercel.
- [ ] Conferir em *Database › Tables* que **todas** as tabelas mostram RLS ativada.
- [ ] *Storage*: confirmar que o bucket `media` existe e é **privado**.
- [ ] *Authentication › URL Configuration*: `Site URL` = `NEXT_PUBLIC_SITE_URL`; em *Redirect URLs*, adicionar `https://SEU_DOMINIO/auth/confirm`.
- [ ] *Authentication › Sign In / Providers › Email*: manter **Confirm email** ativado em produção; senha mínima de 8 caracteres; ativar proteção contra senhas vazadas, se disponível no plano.
- [ ] *Authentication › Emails › SMTP*: configurar um provedor SMTP próprio (o serviço padrão do Supabase é limitado a poucos e-mails por hora e não serve para produção).
- [ ] Traduzir os modelos de e-mail (confirmação e recuperação) para português.
- [ ] *Database › Replication*: confirmar que `conversations` e `messages` estão na publicação `supabase_realtime` (a migration 0003 faz isso).
- [ ] *Project Settings › API*: a exposição de esquemas deve conter apenas `public`.
- [ ] Ativar *Point-in-Time Recovery* ou, no mínimo, confirmar os backups diários (seção 7).

Validação rápida depois das migrations (SQL Editor) — deve devolver zero linhas:

```sql
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

## 3. Deploy na Vercel

- [ ] Importar o repositório do GitHub na Vercel (framework Next.js detectado automaticamente; nenhum comando personalizado).
- [ ] Node.js 22 ou superior nas configurações do projeto.
- [ ] Cadastrar as variáveis da seção 1 e fazer o deploy.
- [ ] Configurar o domínio próprio e atualizar `NEXT_PUBLIC_SITE_URL` e as URLs do Supabase Auth.
- [ ] **Agendador**: as automações e campanhas dependem de `/api/cron/tick` ser chamado a cada minuto. O cron da Vercel só permite essa frequência no plano **Pro**, por isso o projeto usa `pg_cron` + `pg_net` no Supabase. O script faz tudo (e guarda o `CRON_SECRET` na definição do job, dentro do banco):

```
node scripts/setup-cron.mjs https://SEU_DOMINIO     # agenda ou atualiza
node scripts/setup-cron.mjs --status                 # últimas respostas
node scripts/setup-cron.mjs --remove                 # remove
```

  O equivalente manual, no SQL Editor:

```sql
select cron.schedule('elozia-tick', '* * * * *', $$
  select net.http_get(
    url := 'https://SEU_DOMINIO/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'));
$$);
```

- [ ] Confirmar: `GET https://SEU_DOMINIO/api/health` responde `{"status":"ok"}`; `GET /api/cron/tick` sem cabeçalho responde 401.

### Cabeçalhos de segurança

Definidos em `next.config.ts` para todas as rotas: `Content-Security-Policy` (somente a própria origem e o projeto Supabase; `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. A CSP usa `'unsafe-inline'` em scripts e estilos, exigência do Next.js sem *nonce*; endurecer com *nonce* é uma melhoria futura.

## 4. Checklist da Meta (WhatsApp Cloud API)

Há dois modos de operar. Escolha um para o piloto.

**Modo A — aplicativo da agência (funciona hoje, sem aprovação da Meta para a Elozia).**
Cada agência cria um aplicativo em developers.facebook.com e informa as credenciais em Configurações › Canais.

- [ ] Agência: ter um Portfólio Empresarial (Business Manager) verificado e uma conta do WhatsApp Business (WABA) com um número registrado na Cloud API.
- [ ] Agência: criar um aplicativo do tipo *Empresa* e adicionar o produto WhatsApp.
- [ ] Agência: criar um **usuário do sistema** e gerar um **token permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, com acesso à WABA.
- [ ] Na Elozia: informar WABA ID, Phone Number ID, token e o **App Secret** do aplicativo (Configurações do aplicativo › Básico).
- [ ] No aplicativo da Meta, em WhatsApp › Configuração › Webhook: informar a **URL de callback** e o **token de verificação** exibidos na tela de Canais; assinar o campo `messages`.
- [ ] Enviar uma mensagem para o número e conferir, na tela de Canais, que "Último webhook recebido" foi preenchido.

**Modo B — aplicativo da Elozia (recomendado para escala; exige a Elozia como Tech Provider).**
A Elozia mantém um único aplicativo; `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` ficam no servidor e as agências não lidam com App Secret. Depende de verificação do negócio e de *App Review* da Meta para as permissões avançadas. O Embedded Signup entra nesse modo (previsto na arquitetura, não implementado).

Em ambos os modos:

- [ ] Criar e aprovar os templates no Gerenciador do WhatsApp e usar **Sincronizar templates**.
- [ ] Conferir o limite de mensagens e a qualidade do número antes de qualquer campanha.
- [ ] Cadastrar forma de pagamento na WABA (mensagens de template são cobradas pela Meta).
- [ ] Coletar e registrar o consentimento (opt-in) dos contatos antes de enviar templates.

## 5. Upstash e e-mail

- [ ] Criar um banco Redis no Upstash (região próxima) e copiar URL e token REST.
- [ ] Configurar o SMTP no Supabase (item da seção 2) e testar cadastro e recuperação de senha com um e-mail real.

## 6. Monitoramento básico

- **Erros do servidor**: todo erro não tratado gera uma linha JSON no log (`"source":"elozia"`, com rota e código, sem dados pessoais). Veja em Vercel › Logs; para alertas, configure um *Log Drain* ou as notificações da Vercel.
- **Saúde**: aponte um monitor externo (UptimeRobot, Better Stack ou similar) para `GET /api/health`.
- **Agendador**: a resposta de `/api/cron/tick` traz quantos jobs foram concluídos, reagendados e falhos. Consulta para acompanhar a fila:

```sql
select status, count(*) from jobs group by status;
select kind, last_error, attempts, created_at from jobs where status = 'failed' order by created_at desc limit 20;
```

- **Webhooks**: `select outcome, count(*) from webhook_events where received_at > now() - interval '1 day' group by outcome;`
- **Canal**: um canal em estado "Com erro" aparece em Configurações › Canais com a mensagem da Meta.
- **Auditoria**: a tabela `audit_logs` registra criação de agência, convites, mudanças de papel, conexão de canais, importações, exportações e campanhas.

## 7. Backup e recuperação

- **Banco**: o Supabase faz backup diário nos planos pagos (retenção conforme o plano). Para um piloto com dados reais, ative **Point-in-Time Recovery**. O plano gratuito não tem backup automático: não use em produção.
- **Backup próprio (recomendado semanalmente)**: `supabase db dump --linked -f backup.sql` (estrutura e dados), guardado fora do Supabase, criptografado.
- **Arquivos**: o bucket `media` não entra no dump do banco. Para cópia, use a API de Storage ou um cliente S3 compatível.
- **Segredos**: guarde `ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` em um cofre de senhas. Sem a `ENCRYPTION_KEY` original, um banco restaurado não consegue ler os tokens dos canais.
- **Recuperação**: (1) restaurar o banco pelo painel do Supabase (ou `psql -f backup.sql` em um projeto novo); (2) restaurar os arquivos; (3) apontar as variáveis da Vercel para o projeto restaurado; (4) conferir `/api/health`, login e recebimento de um webhook. **Ensaiar a restauração uma vez antes do piloto.**
- **Migrations**: nunca editar uma migration já aplicada em produção; toda mudança é um arquivo novo.

## 8. Testes

```
npm run lint && npm run typecheck && npm test && npm run build
npx playwright install chromium     # uma vez
npm run test:e2e                     # telas públicas; fluxo completo com E2E_ENABLED=1
node scripts/mock-webhook.mjs --phone-number-id ID --secret APP_SECRET --text "Olá"
```

O fluxo completo E2E (`tests/e2e/fluxo-completo.spec.ts`) cria contas reais no projeto apontado por `.env.local`: use somente o projeto de **testes**, com a confirmação de e-mail desativada.

## 9. Antes de liberar para a agência piloto

- [ ] Nenhum dado de demonstração ou de teste no projeto de produção.
- [ ] Termos de Uso e Política de Privacidade publicados e ligados na tela de cadastro.
- [ ] Contrato de tratamento de dados com a agência (a Elozia é operadora; a agência, controladora).
- [ ] Restauração de backup ensaiada.
- [ ] Um ciclo completo com número real: receber, responder, template fora da janela, status de leitura, automação e uma campanha pequena.
