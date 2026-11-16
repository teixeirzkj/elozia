# Plano de desenvolvimento — Elozia

Legenda: ☐ pendente · ◐ em andamento · ☑ concluído

Regra geral de conclusão de qualquer fase: lint, typecheck, testes e build passam; toda tabela nova tem RLS e teste de isolamento; toda tela tem carregamento, erro e vazio; este arquivo é atualizado.

## Fase 0 — Planejamento ☑

- ☑ CLAUDE.md, docs/BRIEFING.md, docs/ARQUITETURA.md, docs/PLANO.md
- ☑ Modelo de dados inicial, estratégia de isolamento, serviços externos, MVP × futuro

## Fase 1 — Fundação ☐

Tarefas
- ☐ Projeto Next.js + TypeScript estrito + Tailwind, ESLint, Vitest, Playwright, `.env.example`
- ☐ Clientes Supabase (navegador, servidor, admin) e validação de ambiente
- ☐ Migration: organizations, profiles, memberships, invitations, teams, audit_logs + RLS
- ☐ Login, cadastro de agência, recuperação/redefinição de senha, logout, proteção de rotas
- ☐ Convites de colaboradores e papéis (Proprietário, Administrador, Supervisor, Atendente)
- ☐ Design system e layout: sidebar, header, navegação mobile
- ☐ Configurações: agência, fuso, perfil, equipe e convites, permissões
- ☐ Módulos futuros com estado vazio verdadeiro

Critérios de conclusão
- Uma agência se cadastra, entra, convida um colaborador e ele entra com o papel definido.
- Usuário sem sessão não acessa a área autenticada; papel insuficiente é recusado no servidor.
- Testes de banco provam que a agência A não lê nem altera dados da agência B.

## Fase 2 — CRM comercial ☐

Tarefas
- ☐ Contatos: CRUD, E.164, origem, etiquetas, responsável, consentimento, histórico, busca/filtros, importação CSV
- ☐ Catálogo: pacotes e múltiplas saídas, imagem, situação
- ☐ Funil Kanban: etapas padrão e personalizáveis, cartões, movimentação persistente com histórico
- ☐ Oportunidades, propostas e reservas (pagamento declarado manualmente)
- ☐ Ficha do contato com oportunidades, reservas e histórico
- ☐ Dados de demonstração fictícios, claramente identificados

Critérios de conclusão
- CRUDs funcionam ponta a ponta com validação e permissões.
- Mover um cartão persiste, grava histórico e respeita papéis.
- Testes de CRUD, de movimentação do Kanban e de isolamento passam.

## Fase 3 — Atendimento WhatsApp ☐

Tarefas
- ☐ Configurações › Canais: WABA ID, Phone Number ID, token validado na Meta e criptografado
- ☐ Webhook: verificação GET, POST com HMAC sobre corpo bruto, idempotência, roteamento por phone_number_id, status
- ☐ Central de atendimento em três colunas, com Realtime
- ☐ Texto, imagem, áudio, documento, notas internas, indicadores de envio/leitura
- ☐ Assumir, transferir (atendente/equipe), concluir, reabrir
- ☐ Janela de 24 h e templates sincronizados
- ☐ Bucket privado, uploads validados, URLs assinadas, rate limiting de envio
- ☐ Mocks de webhook e testes (assinatura, duplicidade, roteamento, permissões, janela, falhas)

Critérios de conclusão
- Com credenciais reais, uma agência recebe e responde mensagens. Sem credenciais, o sistema mostra o canal como não conectado — nunca simula conexão.
- Eventos duplicados ou com assinatura inválida não geram dados.
- **Validação com número real da Meta depende do proprietário do produto** e é registrada à parte.

## Fase 4 — Automações e campanhas ☐

Tarefas
- ☐ Fila persistente `jobs` + endpoint de cron (idempotência, concorrência, retentativas, cancelamento)
- ☐ Regras: gatilho, condições, ações, intervalo, status, histórico
- ☐ Follow-ups: lead sem atendimento, proposta sem resposta, oportunidade parada, pagamento pendente, viagem próxima, pós-viagem
- ☐ Ações: criar tarefa, alterar responsável, adicionar etiqueta, mover oportunidade, agendar template
- ☐ Campanhas por viagem com segmentação, consentimento, template e agendamento
- ☐ Opt-out, limites de envio, tratamento de erros da Meta
- ☐ Telas: automações, formulário guiado, campanhas, histórico de envios

Critérios de conclusão
- Uma regra ativa gera exatamente uma execução por ocorrência, mesmo com ticks concorrentes.
- Nenhuma mensagem sai para contato sem consentimento ou com opt-out.
- Testes de agendamento, reprocessamento, duplicidade, cancelamento, janela e isolamento passam.

## Fase 5 — Dashboard, relatórios e fechamento do MVP ☐

Tarefas
- ☐ Dashboard com indicadores calculados de dados reais
- ☐ Relatórios com filtros (período, atendente, viagem) e exportação CSV com controle de acesso
- ☐ Revisão de usabilidade, responsividade e acessibilidade
- ☐ Auditoria de segurança (RLS, permissões, tokens, uploads, webhooks, rate limiting, dependências)
- ☐ Teste E2E do fluxo completo
- ☐ Documentação de deploy, variáveis, checklists Supabase e Meta, cabeçalhos, monitoramento, backup
- ☐ docs/RELATORIO_MVP.md

Critérios de conclusão
- Nenhum indicador usa número fictício; sem dados, mostra estado vazio.
- Relatório do MVP separa com clareza o que foi testado do que depende de serviço externo.

## Futuro — fora do MVP

### Fase 6 — Agente de IA (somente após validação do CRM e do WhatsApp com a agência piloto)

Plano técnico e estimativa em docs/PLANO_IA.md. **Implementação só começa depois de aprovação explícita.**

### Demais itens

- Integração com n8n (webhooks de saída e API).
- Cobrança recorrente das agências.
- Embedded Signup da Meta.
- Gateway de pagamento e integrações com fornecedores.

## Decisões em aberto (do proprietário do produto)

- Planos e preços da assinatura.
- Provedor de e-mail transacional.
- Plano da Vercel (cron por minuto exige Pro) ou uso de pg_cron no Supabase.
- Textos jurídicos: Termos de Uso e Política de Privacidade.
