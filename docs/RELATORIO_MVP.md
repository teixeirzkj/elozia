# Relatório do MVP — Elozia

Data: 16/11/2026. Estado do código: fases 1 a 5 implementadas; módulo de IA apenas planejado.

## Leia isto primeiro

**O sistema ainda não rodou contra um Supabase real nem contra a Meta.** A máquina de desenvolvimento não tinha Docker, projeto Supabase nem credenciais da Meta. O que foi verificado:

- as regras do banco (isolamento, permissões, funções, relatórios) em um Postgres embarcado, com as migrations reais;
- a lógica do servidor em testes unitários, com a rede da Meta simulada;
- o build de produção, o lint e a checagem de tipos;
- as telas públicas (login, cadastro, recuperação) em navegador real, em desktop e celular.

O que **não** foi verificado: as telas autenticadas em funcionamento (dashboard, contatos, funil, atendimento, automações, relatórios), o login de verdade, o Realtime, o Storage e qualquer chamada real à Meta. O código compila e segue a API documentada, mas a primeira execução com serviços reais pode revelar ajustes. O teste de ponta a ponta que cobre esse caminho está escrito e pronto para rodar (`tests/e2e/fluxo-completo.spec.ts`).

## O que está implementado

| Módulo | Entregue |
|---|---|
| Autenticação | Login, cadastro de agência, confirmação de e-mail, recuperação e troca de senha, logout, proteção de rotas |
| Multiempresa | Agências, vínculos, quatro papéis, convites por link de uso único, equipes, RLS em 31 tabelas |
| Painel | Sidebar, header com agência e usuário, menu de perfil, navegação mobile, design system com a marca |
| Configurações | Agência e fuso, perfil, equipe e convites, permissões, etapas do funil, etiquetas, canais |
| Contatos | Cadastro, telefone E.164, origem, etiquetas, responsável, consentimento, histórico, busca, filtros, paginação, importação CSV validada |
| Viagens | Pacotes, múltiplas saídas, valor e moeda, vagas (controle interno), situação, imagem, observações comerciais |
| Funil | Oito etapas padrão personalizáveis, quadro Kanban com arrastar e soltar e alternativa por teclado/toque, persistência, histórico, permissões |
| Oportunidades e reservas | Propostas com valor e situação, motivo de perda, reservas com confirmação e pagamento declarado, ficha do contato integrada |
| WhatsApp | Conexão com validação na Meta e token cifrado, webhook (GET e POST com HMAC), ingestão idempotente, status, mídias em bucket privado, central em três áreas, notas internas, assumir/transferir/concluir/reabrir, janela de 24 h, templates sincronizados, tempo real |
| Automações | Seis gatilhos de follow-up, condições, intervalo configurável, cinco ações, pausa, histórico de execução, cancelamento |
| Campanhas | Por pacote ou saída, público segmentado com consentimento, template aprovado, agendamento, histórico de envios, cancelamento |
| Agendador | Fila persistente com `skip locked`, idempotência, retentativas com espera crescente, horário de envio no fuso da agência, endpoint de cron |
| Dashboard | Dez indicadores calculados dos registros; estado vazio quando não há dados |
| Relatórios | Oito relatórios com filtros de período, atendente e viagem; exportação CSV com permissão e auditoria |
| Operação | Cabeçalhos de segurança, rate limiting, auditoria, log estruturado de erros, verificação de saúde, retenção de registros técnicos |

Dados de demonstração: Configurações › Agência tem um botão para carregar e remover cinco contatos, dois pacotes e cinco oportunidades fictícios, marcados com o selo "Demonstração", fora dos relatórios e impedidos de receber mensagens.

## O que foi testado

Resultado da última execução (16/11/2026):

| Verificação | Resultado |
|---|---|
| `npm run lint` | Sem erros nem avisos |
| `npm run typecheck` | Sem erros |
| `npm test` | 197 testes passando (105 de banco, 92 unitários) |
| `npm run build` | Build de produção concluído |
| `npm run test:e2e` | 14 passando (telas públicas, desktop e celular); 12 pulados (fluxo completo, exige Supabase de testes) |
| `npm audit --omit=dev` | 0 vulnerabilidades |

**Testes de banco** (migrations reais em Postgres embarcado):

- Isolamento: em cada tabela de negócio, a agência A não lê, não grava e não referencia dados da agência B.
- Papéis: atendente não altera catálogo, equipe, automações nem campanhas; hierarquia de papéis; convite só pelo e-mail convidado, uma única vez.
- CRUD de contatos, pacotes, saídas, propostas e reservas; validações do banco.
- Kanban: mover, ordenar, motivo de perda, ganho e perda, histórico, permissão por responsável.
- WhatsApp: roteamento por número, duplicidade, status fora de ordem, descadastro por palavra-chave, contato sem telefone, gestão de atendimentos.
- Automações: uma execução por ocorrência, pausa, condições, os seis gatilhos, fila (reivindicação única, retentativa, job preso, cancelamento).
- Campanhas: público só com consentimento, congelamento de destinatários, reserva única, cancelamento em cascata.
- Relatórios: números exatos de um cenário conhecido, filtros, restrição a gestores, zeros sem dados.

**Testes unitários**: telefone E.164, CSV e importação, valores monetários, permissões, fuso horário, tipos de arquivo, criptografia, assinatura do webhook (inválida, adulterada, de outro canal), leitura do webhook, janela de 24 h, templates, envio pela Graph API com rede simulada (falha, reenvio, token nunca exposto), horário de envio, configuração de regras e campanhas, período e CSV dos relatórios.

**Defeitos encontrados pelos testes e corrigidos**: telefone com prefixo `00` aceito indevidamente; valor não numérico tratado como vazio; ambiguidade de nomes na função de ingestão.

## O que depende de serviços externos

| Serviço | Necessário para | Situação |
|---|---|---|
| Supabase (produção e testes) | Tudo | **Não configurado.** Migrations prontas |
| Vercel | Hospedagem e cron | **Não configurado.** `vercel.json` pronto; cron por minuto exige plano Pro (alternativa com `pg_cron` documentada) |
| Meta (aplicativo, WABA, número, token) | WhatsApp | **Não validado com número real** |
| SMTP no Supabase Auth | E-mails de confirmação e recuperação | Não configurado |
| Upstash Redis | Rate limiting entre instâncias | Não configurado (sem ele, o limite é por instância) |
| Domínio | URL pública e webhook | Não configurado |

Passo a passo em [DEPLOY.md](DEPLOY.md).

## Problemas conhecidos e limitações

1. **Nada foi executado contra Supabase e Meta reais** (ver o início deste relatório). Em especial, as consultas com relacionamentos aninhados e filtros em tabelas relacionadas precisam ser exercitadas no ambiente real.
2. **Convites**: o sistema gera o link e o administrador o envia; não há envio automático de e-mail de convite.
3. **Uma agência por usuário**: quem já tem conta em uma agência não pode ser convidado para outra.
4. **Áudio**: é possível anexar arquivos de áudio; não há gravação pelo navegador.
5. **Templates**: suportados os de texto (corpo e cabeçalho, variáveis numeradas ou nomeadas). Cabeçalho com mídia e botões dinâmicos aparecem como indisponíveis.
6. **Mídias recebidas acima de 16 MB** não são baixadas; arquivos da Meta expiram em 7 dias.
7. **Kanban**: colunas mostram oportunidades abertas e as fechadas nos últimos 30 dias, até 1.000 cartões, sem paginação por coluna.
8. **Valores somados só em reais**: registros em outra moeda aparecem, mas ficam fora das somas (o dashboard avisa quantos).
9. **Automações valem a partir da ativação**: situações que venceram antes de ativar a regra não disparam (proteção contra disparo em massa).
10. **Tipos gerados do banco**: as consultas usam tipos escritos à mão; gerar os tipos com a CLI do Supabase é uma melhoria recomendada.
11. **CSP** com `'unsafe-inline'`; sem segundo fator de autenticação (detalhes em [SEGURANCA.md](SEGURANCA.md)).
12. **Embedded Signup da Meta** não implementado; a conexão é manual.

## Pendências para o lançamento

- [ ] Criar os projetos Supabase, aplicar as migrations e configurar Auth e SMTP.
- [ ] Deploy na Vercel com as variáveis e o agendador.
- [ ] Rodar o fluxo completo E2E no projeto de testes e corrigir o que aparecer.
- [ ] Validar o WhatsApp com número real: receber, responder, mídia, template fora da janela, status, automação e uma campanha pequena.
- [ ] Revisar manualmente todas as telas autenticadas em desktop, tablet e celular.
- [ ] Termos de Uso, Política de Privacidade e contrato de tratamento de dados.
- [ ] Exportação de dados do titular e exclusão completa de agência (LGPD).
- [ ] Definir planos e preços; a cobrança recorrente não está implementada.
- [ ] Ensaiar a restauração de backup.
- [ ] Decidir o modo de operação na Meta (aplicativo da agência ou da Elozia) e, se for o segundo, iniciar a verificação como Tech Provider.

## Recomendações para o piloto comercial

1. **Uma agência, por quatro a seis semanas**, com poucos usuários e um número dedicado ao piloto — de preferência um número novo, para não arriscar o número principal da agência.
2. **Começar pelo CRM e pelo atendimento.** Ligar automações com a ação "criar tarefa" primeiro; mensagens automáticas e campanhas só depois de duas semanas estáveis.
3. **Primeira campanha pequena** (algumas dezenas de contatos com consentimento claro), observando a qualidade do número na Meta.
4. **Registrar o consentimento desde o primeiro dia**: sem ele, campanhas e mensagens automáticas não saem.
5. **Combinar com a agência o que medir**: tempo de primeira resposta, propostas enviadas, vendas confirmadas e o que deixou de se perder por falta de retorno.
6. **Acompanhar diariamente na primeira semana**: fila de jobs, webhooks com erro, canal em estado de erro e os logs da Vercel.
7. **Canal direto de suporte** e uma lista única de problemas e pedidos; nada de funcionalidade nova durante o piloto sem aprovação.
8. **Não usar o plano gratuito do Supabase com dados reais** (sem backup automático).

O agente de IA só deve ser iniciado depois deste piloto, conforme [PLANO_IA.md](PLANO_IA.md).
