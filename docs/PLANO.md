# Plano de desenvolvimento — Elozia

Legenda: ☐ pendente · ◐ implementado, falta validar em ambiente real · ☑ concluído

Regra geral de conclusão de qualquer fase: lint, typecheck, testes e build passam; toda tabela nova tem RLS e teste de isolamento; toda tela tem carregamento, erro e vazio; este arquivo é atualizado.

> **Situação em 16/11/2026.** O sistema está publicado em https://elozia.vercel.app, ligado ao projeto Supabase "CRM ELOZIA". As fases 1, 2 e 5 foram validadas em produção pelo teste de ponta a ponta (cadastro, convite, catálogo, contato, oportunidade, proposta, Kanban, reserva, dashboard, relatório) e pela revisão das 22 telas em desktop e celular. As fases 3 e 4 continuam ◐: **o WhatsApp não foi validado com a Meta e o agendador das automações ainda não está ativo.** As marcações ☐ dos critérios abaixo que tratam de cadastro, convite e CRUD em ambiente real estão cumpridas por essa validação. Detalhes e pendências em [RELATORIO_MVP.md](RELATORIO_MVP.md).

## Fase 0 — Planejamento ☑

- ☑ CLAUDE.md, docs/BRIEFING.md, docs/ARQUITETURA.md, docs/PLANO.md
- ☑ Modelo de dados inicial, estratégia de isolamento, serviços externos, MVP × futuro

## Fase 1 — Fundação ◐

- ☑ Projeto Next.js 16 + TypeScript estrito + Tailwind 4, ESLint, Vitest, Playwright, `.env.example`
- ☑ Clientes Supabase (navegador, servidor, admin) e validação de ambiente
- ☑ Migration `0001_fundacao`: organizations, profiles, memberships, invitations, teams, audit_logs + RLS
- ☑ Login, cadastro de agência, recuperação e redefinição de senha, logout, proteção de rotas
- ☑ Convites por link de uso único e papéis (Proprietário, Administrador, Supervisor, Atendente)
- ☑ Design system com a marca, sidebar, header, navegação mobile
- ☑ Configurações: agência, fuso, perfil, equipe e convites, equipes de atendimento, permissões

Critérios
- ☑ Testes de banco provam que a agência A não lê nem altera dados da agência B.
- ☑ Papel insuficiente é recusado no servidor e no banco (testes).
- ☐ Uma agência se cadastra, convida um colaborador e ele entra com o papel definido — **falta rodar em Supabase real** (coberto pelo E2E escrito).

## Fase 2 — CRM comercial ◐

- ☑ Contatos: CRUD, E.164, origem, etiquetas, responsável, consentimento, histórico, busca, filtros, importação CSV
- ☑ Catálogo: pacotes, múltiplas saídas, imagem, situação
- ☑ Funil Kanban: etapas padrão e personalizáveis, cartões, movimentação persistente com histórico
- ☑ Oportunidades, propostas e reservas (pagamento declarado manualmente)
- ☑ Ficha do contato com oportunidades, reservas, tarefas e histórico
- ☑ Dados de demonstração fictícios e identificados

Critérios
- ☑ Testes de CRUD, de movimentação do Kanban e de isolamento passam.
- ☐ CRUDs exercitados pela interface em ambiente real.

## Fase 3 — Atendimento WhatsApp ◐

- ☑ Configurações › Canais: WABA ID, Phone Number ID, token validado na Meta e cifrado; conector preparado para Embedded Signup
- ☑ Webhook: verificação GET, POST com HMAC sobre o corpo bruto, idempotência, roteamento por `phone_number_id`, status
- ☑ Central de atendimento em três áreas, com Realtime
- ☑ Texto, imagem, áudio, documento, notas internas, indicadores de envio e leitura
- ☑ Assumir, transferir (atendente ou equipe), concluir, reabrir
- ☑ Janela de 24 h e templates sincronizados
- ☑ Bucket privado, uploads validados, URLs assinadas, rate limiting
- ☑ Mocks de webhook, script de simulação local e testes

Critérios
- ☑ Eventos duplicados ou com assinatura inválida não geram dados (testes).
- ☑ Sem credenciais, o sistema mostra o canal como não conectado; nunca simula conexão.
- ☐ **Validação com número real da Meta** — depende do proprietário do produto.

## Fase 4 — Automações e campanhas ◐

- ☑ Fila persistente `jobs` + endpoint de cron (idempotência, concorrência, retentativas, cancelamento)
- ☑ Regras: gatilho, condições, ações, intervalo, situação, histórico
- ☑ Seis follow-ups: lead sem atendimento, proposta sem resposta, oportunidade parada, pagamento pendente, viagem próxima, pós-viagem
- ☑ Ações: criar tarefa, alterar responsável, adicionar etiqueta, mover oportunidade, enviar template aprovado
- ☑ Campanhas por viagem com segmentação, consentimento, template e agendamento
- ☑ Opt-out, limites, horário de envio no fuso da agência, tratamento de erros da Meta
- ☑ Telas: automações, formulário guiado, campanhas, histórico de envios

Critérios
- ☑ Uma regra ativa gera exatamente uma execução por ocorrência (teste).
- ☑ Nenhuma mensagem automática sai sem consentimento ou com opt-out (regra no servidor; público testado no banco).
- ☐ Execução real pelo agendador da Vercel e envio real de template.

## Fase 5 — Dashboard, relatórios e fechamento do MVP ◐

- ☑ Dashboard com indicadores calculados de dados reais
- ☑ Oito relatórios com filtros e exportação CSV com controle de acesso
- ☑ Auditoria de segurança com seis correções ([SEGURANCA.md](SEGURANCA.md))
- ☑ Teste E2E do fluxo completo escrito; testes de navegador das telas públicas executados
- ☑ Documentação de deploy, variáveis, checklists Supabase e Meta, cabeçalhos, monitoramento, backup ([DEPLOY.md](DEPLOY.md))
- ☑ [RELATORIO_MVP.md](RELATORIO_MVP.md)
- ☐ Revisão manual de usabilidade das telas autenticadas em desktop, tablet e celular (exige ambiente real)
- ☐ Execução do E2E completo em projeto de testes

## Próximos passos (do proprietário do produto)

1. No Supabase, em Authentication › URL Configuration: Site URL `https://elozia.vercel.app` e Redirect URL `https://elozia.vercel.app/auth/confirm`.
2. Ativar o agendador: `node scripts/setup-cron.mjs https://elozia.vercel.app`.
3. Configurar SMTP próprio, Upstash e, se desejado, domínio próprio.
4. Conectar um número real e validar o WhatsApp.
5. Criar um projeto Supabase separado para testes e iniciar o piloto com uma agência.

## Futuro — fora do MVP

### Fase 6 — Agente de IA ☐ (planejado, não implementado)

Plano técnico, componentes e modelo de custos em [PLANO_IA.md](PLANO_IA.md). **Só começa depois de o CRM e o WhatsApp estarem validados com a agência piloto e de aprovação explícita do plano.**

### Demais itens

- Integração com n8n (webhooks de saída e API).
- Cobrança recorrente das agências.
- Embedded Signup da Meta.
- Gateway de pagamento e integrações com fornecedores.
- LGPD: exportação de dados do titular e exclusão completa de agência.
- Segundo fator de autenticação.

## Decisões em aberto (do proprietário do produto)

- Planos e preços da assinatura.
- Provedor de e-mail transacional.
- Plano da Vercel (cron por minuto exige Pro) ou uso de `pg_cron` no Supabase.
- Modo de operação na Meta: aplicativo de cada agência ou aplicativo único da Elozia (Tech Provider).
- Textos jurídicos: Termos de Uso e Política de Privacidade.
- Provedor e modelos do agente de IA.
