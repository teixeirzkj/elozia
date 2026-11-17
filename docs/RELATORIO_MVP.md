# Relatório do MVP — Elozia

Data: 16/11/2026. Estado do código: fases 1 a 5 implementadas; módulo de IA apenas planejado.

## Leia isto primeiro

**O sistema está publicado em https://elozia.vercel.app, ligado ao projeto Supabase "CRM ELOZIA", e o fluxo principal foi validado em produção. O WhatsApp ainda não foi validado com a Meta.**

Validado no ambiente real (16/11/2026):

- as seis migrations aplicadas no Supabase: 31 tabelas, todas com RLS;
- o fluxo completo em navegador, contra a produção: login, criação da agência, convite aceito por um atendente com as restrições do papel, pacote com saída, contato, oportunidade, proposta, tarefa, movimentação no Kanban, reserva, dashboard e relatório com os valores corretos, exportação CSV;
- as 22 telas autenticadas, em desktop e celular, com dados de demonstração: sem erro de carregamento, sem erro de console e sem estouro de layout (dois estouros encontrados e corrigidos);
- saúde da aplicação, cabeçalhos de segurança e recusa de chamadas sem credencial ao webhook, ao agendador e à exportação.

Os dados de teste criados nessas execuções foram removidos; o banco ficou sem agências e sem usuários.

**Ainda não verificado em ambiente real:**

- qualquer chamada à Meta: conexão de canal, recebimento de webhook real, envio de mensagens, templates, mídias;
- Realtime da central de atendimento e upload de arquivos (imagem de pacote, anexos), que dependem de uso com canal conectado ou não foram exercitados;
- e-mails reais: confirmação de cadastro e recuperação de senha (os testes criaram contas já confirmadas para não disparar e-mails a endereços fictícios);
- automações e campanhas executadas pelo agendador em produção — **o agendador ainda não está ativo** (ver Pendências);
- importação de CSV e os formulários de automação e campanha além do carregamento da tela.

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
| `npm run test:e2e` contra a produção | 13 passando no perfil desktop: 7 de telas públicas e as 6 etapas do fluxo completo |
| Revisão das telas autenticadas | 22 telas × 2 tamanhos, sem erros nem estouro de layout |
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
| Supabase | Tudo | **Configurado**: projeto "CRM ELOZIA" com as migrations aplicadas. É o único projeto; não há um separado para testes. Falta ajustar as URLs de autenticação (ver Pendências) |
| Vercel | Hospedagem | **Publicado** em https://elozia.vercel.app (time `teixeira`, plano Hobby). O deploy foi feito pela linha de comando; o repositório do GitHub ainda não está conectado para deploy automático |
| Agendador | Automações e campanhas | **Não ativo.** O plano Hobby não permite cron por minuto; o script `scripts/setup-cron.mjs` agenda pelo `pg_cron` do Supabase e aguarda autorização para ser executado |
| Meta (aplicativo, WABA, número, token) | WhatsApp | **Não validado com número real** |
| SMTP no Supabase Auth | E-mails de confirmação e recuperação | Não configurado: vale o serviço padrão do Supabase, limitado a poucos e-mails por hora |
| Upstash Redis | Rate limiting entre instâncias | Não configurado (sem ele, o limite é por instância) |
| Domínio próprio | URL definitiva e webhook | Não configurado; em uso o endereço `elozia.vercel.app` |

Passo a passo em [DEPLOY.md](DEPLOY.md).

## Problemas conhecidos e limitações

1. **WhatsApp, Realtime, uploads e e-mails ainda não foram exercitados em ambiente real** (ver o início deste relatório). As consultas da central de atendimento, com filtros em tabelas relacionadas, só foram executadas com a central vazia.
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

- [x] Criar o projeto Supabase e aplicar as migrations.
- [x] Deploy na Vercel com as variáveis.
- [x] Rodar o fluxo completo E2E e revisar as telas autenticadas em desktop e celular.
- [ ] **Supabase › Authentication › URL Configuration**: definir Site URL como `https://elozia.vercel.app` e adicionar `https://elozia.vercel.app/auth/confirm` em Redirect URLs. Sem isso, os links dos e-mails de confirmação e de recuperação apontam para `localhost` e o cadastro pela tela não se completa.
- [ ] Ativar o agendador: `node scripts/setup-cron.mjs https://elozia.vercel.app`.
- [ ] Configurar SMTP próprio no Supabase e testar cadastro e recuperação de senha com um e-mail real.
- [ ] Criar um segundo projeto Supabase só para testes antes de haver dados de clientes.
- [ ] Conectar o repositório do GitHub ao projeto da Vercel para deploy automático.
- [ ] Validar o WhatsApp com número real: receber, responder, mídia, template fora da janela, status, automação e uma campanha pequena.
- [ ] Revisão manual das telas em tablet e dos formulários de automação, campanha e importação.
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
