# Elozia

CRM inteligente para agências de viagens: atendimento pelo WhatsApp oficial (Meta Cloud API), contatos, funil de vendas, catálogo de viagens, automações, campanhas e relatórios, em um SaaS multiempresa.

## Estado

MVP implementado e testado localmente (lint, typecheck, 197 testes e build). **Ainda não validado contra Supabase e Meta reais.** Veja [docs/RELATORIO_MVP.md](docs/RELATORIO_MVP.md).

## Começar

Requisitos: Node.js 22 ou superior e um projeto Supabase.

```
npm install
cp .env.example .env.local      # preencha as variáveis
# aplique as migrations de supabase/migrations no projeto Supabase, na ordem
npm run dev
```

Passo a passo completo de Supabase, Vercel, Meta e backup em [docs/DEPLOY.md](docs/DEPLOY.md).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor local |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos |
| `npm test` | Testes unitários e de banco (Postgres embarcado, sem Docker) |
| `npm run test:e2e` | Testes de navegador (fluxo completo com `E2E_ENABLED=1` e Supabase de testes) |
| `npm run build` | Build de produção |
| `node scripts/mock-webhook.mjs` | Envia um webhook simulado e assinado para o ambiente local |

## Documentação

- [Briefing](docs/BRIEFING.md) — produto, público e escopo
- [Arquitetura](docs/ARQUITETURA.md) — isolamento entre agências, modelo de dados, WhatsApp, agendador
- [Plano](docs/PLANO.md) — fases, situação e próximos passos
- [Deploy e operação](docs/DEPLOY.md)
- [Segurança, privacidade e retenção](docs/SEGURANCA.md)
- [Relatório do MVP](docs/RELATORIO_MVP.md)
- [Plano do agente de IA](docs/PLANO_IA.md) — planejado, não implementado
