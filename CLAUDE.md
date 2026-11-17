# Elozia

CRM inteligente para agências de viagens. SaaS multiempresa de atendimento (WhatsApp oficial), CRM, funil de vendas e automações, vendido diretamente a agências de viagens e turismo.

Leia antes de trabalhar: [docs/BRIEFING.md](docs/BRIEFING.md), [docs/ARQUITETURA.md](docs/ARQUITETURA.md), [docs/PLANO.md](docs/PLANO.md).
Operação e estado atual: [docs/DEPLOY.md](docs/DEPLOY.md), [docs/SEGURANCA.md](docs/SEGURANCA.md), [docs/RELATORIO_MVP.md](docs/RELATORIO_MVP.md). Módulo de IA (só plano): [docs/PLANO_IA.md](docs/PLANO_IA.md).
Atualização em andamento: Parte 2 do [docs/PLANO.md](docs/PLANO.md) (etapas 0 e A a F) e seção "Atualização planejada" da arquitetura. Referências de concorrente: só [docs/referencias/ANALISE.md](docs/referencias/ANALISE.md); as imagens têm dados pessoais de terceiros e nunca entram no repositório.

## Regras que não se negociam

1. **Multiempresa.** Toda tabela de negócio tem `organization_id` e RLS ativa. Nenhuma consulta depende só de filtro no frontend.
2. **Autorização no servidor.** Toda Server Action e Route Handler começa por `requireMembership()` (ou `requireRole()`); o papel nunca vem do cliente.
3. **Segredos.** `SUPABASE_SERVICE_ROLE_KEY`, tokens da Meta, `ENCRYPTION_KEY` e `CRON_SECRET` só existem no servidor. Nada com `NEXT_PUBLIC_` além de URL e chave anônima do Supabase. Tokens de WhatsApp ficam criptografados (AES-256-GCM) e nunca voltam ao navegador.
4. **Nada falso.** Sem telas de mentira, botões sem função, números inventados, preços inventados ou conexões simuladas. Módulo não implementado mostra estado vazio verdadeiro.
5. **Sem white-label.** A marca é sempre Elozia. Não há parceiros nem revendedores.
6. **WhatsApp só pela Meta Cloud API oficial.** Nada de WhatsApp Web, QR Code ou bibliotecas não oficiais.
7. **LGPD e políticas da Meta.** Consentimento registrado, opt-out respeitado, janela de 24 h, templates aprovados fora da janela. Logs técnicos não guardam tokens nem conteúdo de conversas.
8. **Português brasileiro** em toda a interface e nas mensagens de erro. Código (identificadores) em inglês; rotas em português.
9. **Dados de exemplo são fictícios** e marcados como demonstração. Nunca dados reais de clientes.
10. **Simplicidade.** MVP primeiro; não adicionar abstrações ou funcionalidades fora do plano sem aprovação.
11. **Agências só pelo Master.** Não existe cadastro público de agência (a partir da Fase B). Privilégio Master vem apenas de `platform.platform_admins` com MFA (aal2) conferido no servidor e no banco; nunca de rota, `user_metadata`, parâmetro ou frontend. Master nunca é membro de agência.
12. **Suporte auditado e somente leitura.** O Master entra numa agência só por sessão de suporte registrada no banco, presa à sessão de login, com justificativa e prazo. Dados privados exigem autorização temporária da agência. Nada de impersonação, troca de senha, sessão compartilhada ou id de agência vindo de URL, formulário ou cabeçalho.
13. **Referências visuais não são copiadas.** Usar só a análise funcional; interface, textos e componentes são originais da Elozia.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript estrito · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Realtime) · Zod 4 · Upstash Redis (rate limiting) · Vitest · Playwright · Vercel.

Versões exatas ficam no `package.json`. Antes de usar uma API de biblioteca, confira a documentação da versão instalada.

## Estrutura

```
src/
  app/
    (auth)/            entrar, cadastro, recuperar-senha, redefinir-senha, convite
    (app)/             área autenticada: dashboard, atendimentos, contatos, funil,
                       viagens, automacoes, campanhas, relatorios, configuracoes
    api/               webhooks/whatsapp, cron/*, exportações
  components/ui/       design system (Button, formulários, Dialog, Drawer, DataList, ...)
  components/layout/   barra superior, mapa de navegação, menu de configurações
  modules/<modulo>/    actions.ts (Server Actions), queries.ts, schemas.ts (Zod),
                       components/, lógica pura testável
  lib/                 supabase/, auth/, permissions.ts, crypto.ts, rate-limit.ts,
                       whatsapp/, env.ts
supabase/migrations/   SQL versionado (única fonte do esquema)
tests/                 db/ (RLS e isolamento com PGlite), unit/, e2e/ (Playwright)
docs/
```

## Convenções

- Server Components por padrão; `"use client"` só onde há interação.
- Mutação = Server Action que: valida com Zod → `requireMembership/requireRole` → executa com o cliente Supabase do usuário (RLS vale) → devolve `{ ok: true, data } | { ok: false, error }`.
- Cliente `service_role` (`lib/supabase/admin.ts`) só em webhook, cron, convites e leitura de credenciais; sempre filtrando por `organization_id` explicitamente.
- Toda tela tem estado de carregamento (`loading.tsx`/skeleton), erro (`error.tsx`) e vazio (`EmptyState`).
- Cores e medidas vêm das variáveis CSS do design system em `src/app/globals.css`; não usar hex solto nos componentes.
- Dinheiro em centavos (`bigint`) + moeda ISO; telefones em E.164; datas em `timestamptz` (UTC) e exibidas no fuso da agência.
- Mudança de esquema = nova migration; nunca editar migration já aplicada em produção.
- Toda tabela nova entra em `tests/db` com teste de isolamento entre agências.
- Em migrations novas, conceda privilégios só às tabelas criadas nelas (`grant ... on public.<tabela>`). Nunca `grant ... on all tables`: isso reabriria `whatsapp_credentials`, `webhook_events` e `jobs`, que são só do servidor.
- Mensagens do WhatsApp saem sempre por `sendToConversation` (`src/lib/whatsapp/service.ts`), que aplica janela de 24 h, consentimento e opt-out. Não chame a Graph API direto dos módulos.
- Os testes de banco rodam em PGlite (sem Docker). O que depende de PostgREST, Auth, Storage ou Realtime só é coberto pelo E2E em um projeto Supabase de testes.
- No E2E, localize campos de senha por regex (`getByLabel(/^Senha/)`): o rótulo acessível inclui o asterisco e o botão "Mostrar senha" também casa com "Senha". Textos que aparecem duas vezes (versão celular e desktop) pedem `.filter({ visible: true }).first()`.
- Funções novas em `public`: revogar `EXECUTE` de `public` e `anon` explicitamente; liberar só a quem precisa.
- A partir da Fase B, toda tabela nova é classificada como **administrativa** (leitura por `app.can_read_org`) ou **privada** (leitura por `app.can_read_private`). `app.is_member` nunca passa a considerar o suporte, porque aparece em regras de escrita.
- `createAdminClient()` (ignora a RLS) só depois de `authorize(capability)` e com `organization_id` explícito; o papel "support" é recusado em toda ação que escreve.
- Animações com `motion` respeitam `prefers-reduced-motion`; bibliotecas pesadas (`motion`, `recharts`, `@xyflow/react`) só em componentes cliente da rota que as usa.
- Itens de menu só aparecem quando a funcionalidade existe.

## Design system

Fonte única: `src/app/globals.css` (variáveis `--elz-*` em `:root`, expostas ao Tailwind em `@theme`).

- **Tipografia:** `text-caption` 11 · `text-label` 13 · `text-body` 14 · `text-title` 15 · `text-heading` 20 · `text-display` 24 · `text-metric` 28 (px). Além disso, a escala padrão do Tailwind (`text-xs`, `text-sm`, `text-base`).
- **Cores:** `ink`, `brand` (#00DF73), `green-50…900`, superfícies (`bg`, `surface`, `muted`, `hover`, `pressed`), texto (`fg`, `fg-muted`, `fg-subtle`, `fg-disabled`), funcionais (`success`, `danger`, `warning`, `info` + `-soft`), status de negócio (`status-lead|progress|proposal|won|lost` + `-soft`), barra superior (`topbar*`).
- **Medidas nomeadas:** `h-topbar`, `h-header`, `w-drawer`, `w-drawer-lg`, `w-settings-nav`, `w-aside`, `w-inbox-list`, `min-h-touch` (44 px), `max-w-content`.
- **Proibido:** hex e valores arbitrários (`text-[13px]`, `w-[340px]`, `bg-[var(--x)]`). Exceções aceitas: templates de grade (`grid-cols-[...]`) e variantes (`has-[:checked]`). Precisa de um valor novo? Crie o token no `globals.css`.
- **Componentes base** em `src/components/ui/`: `Button`/`LinkButton`, formulários (`ActionForm`, `TextField`, `PasswordField`, `SelectField`...), `Dialog`/`ConfirmButton`, `Drawer` (painel lateral), `DropdownMenu`, `Breadcrumbs`, `DataList` (tabela no desktop, cartões no celular), `Badge` (inclui tons de status), `Stat`, `EmptyState` e esqueletos (`PageSkeleton`, `TableSkeleton`, `CardGridSkeleton`, `DetailSkeleton`, `BoardSkeleton`). Use-os antes de criar outro.
- **Navegação:** `src/components/layout/nav.ts` é o mapa único do menu; só entra o que existe.
- **Movimento:** transições curtas (`--elz-duration*`, `ease-elz`), `animate-rise-in` para entrada, `motion/react` só onde agrega; `prefers-reduced-motion` respeitado pelo CSS global e pelo `MotionConfig`.

## Papéis

`owner` (Proprietário) · `admin` (Administrador) · `supervisor` (Supervisor) · `agent` (Atendente). Matriz em `src/lib/permissions.ts` e em docs/ARQUITETURA.md.

Planejados (Fase B): papéis Master `owner`, `operator`, `viewer` em `platform.platform_admins`, e o papel efetivo `support` (só no servidor, somente leitura), que nunca entra no enum `member_role`.

## Comandos

```
npm run dev          servidor local
npm run lint         ESLint
npm run typecheck    tsc --noEmit
npm test             Vitest (unitários + banco/RLS em PGlite)
npm run test:e2e     Playwright (exige ambiente Supabase configurado)
npm run build        build de produção
```

Ao terminar uma fase: lint, typecheck, testes e build; atualizar docs/PLANO.md; não iniciar a fase seguinte sem autorização.
