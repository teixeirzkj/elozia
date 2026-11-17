# Plano de desenvolvimento — Elozia

Legenda: ☐ pendente · ◐ em andamento ou implementado sem validação real · ☑ concluído

Regra de conclusão de qualquer etapa: lint, typecheck, testes e build passam; toda tabela nova tem RLS, classificação de acesso do suporte e teste de isolamento; toda tela tem carregamento, erro e vazio; este arquivo é atualizado; a etapa seguinte só começa com aprovação.

---

## Parte 1 — MVP (concluído em 16/11/2026)

Publicado em https://elozia.vercel.app, ligado ao projeto Supabase "CRM ELOZIA". Detalhes em [RELATORIO_MVP.md](RELATORIO_MVP.md).

| Fase | Situação |
|---|---|
| 0 — Planejamento | ☑ |
| 1 — Fundação (auth, multiempresa, papéis, convites, configurações) | ☑ validada em produção |
| 2 — CRM (contatos, catálogo, funil Kanban, oportunidades, propostas, reservas) | ☑ validada em produção |
| 3 — Atendimento WhatsApp | ◐ código pronto; **não validado com a Meta** |
| 4 — Automações e campanhas | ◐ código pronto; **agendador (pg_cron) inativo** |
| 5 — Dashboard, relatórios, auditoria, documentação | ☑ |

---

## Parte 2 — Atualização completa (planejada em 16/11/2026)

Escopo pedido pelo dono do produto: nova navegação e design system, painel Master com criação de agências e acesso de suporte auditado, ampliação dos módulos da agência, sequências, mensagens agendadas, modelos e respostas rápidas, construtor visual de chatbots, relatórios ampliados, usuários, equipes e configurações.

Fontes deste plano: diagnóstico do código (5 auditorias por fase, desenho de segurança do Master com 2 revisões adversariais e revisão de completude) e as referências em [referencias/ANALISE.md](referencias/ANALISE.md). Modelo técnico em [ARQUITETURA.md](ARQUITETURA.md), seção "Atualização".

### Diagnóstico resumido

| Área | Existe | Parcial | Ausente | Esforço |
|---|---:|---:|---:|---|
| A — Visual, navegação, login | 5 | 11 | 7 | grande |
| B — Master e suporte | 0 | 2 | quase tudo | muito grande |
| C — Dashboard, atendimento, contatos, CRM, viagens | 17 | 11 | 7 | grande |
| D — Campanhas, sequências, agendadas, modelos | 9 | 6 | 5 | muito grande |
| E — Construtor de chatbot e motor | 0 | 4 | 17 | muito grande |
| F — Relatórios, usuários, equipes, configurações | 16 | 18 | 12 | muito grande |

O que já sustenta a atualização: RLS em 31 tabelas com testes de isolamento, fila persistente de jobs, envio único por `sendToConversation` (janela de 24 h, opt-out), ingestão idempotente do webhook, Kanban, campanhas por viagem, relatórios em SQL e o design system inicial.

Bloqueios e riscos que mudam a ordem pedida:

1. **Remover o cadastro público depende do Master.** Hoje qualquer conta autenticada pode chamar `create_organization` pela API, mesmo sem a tela (`0001_fundacao.sql:367`). Só dá para revogar quando existir a criação de agência pelo Master e o convite de proprietário. Por isso a remoção sai da Fase A e vai para a Fase B.
2. **Não existe projeto Supabase de testes.** Toda migration das fases B a F rodaria direto em produção. A Fase B troca `app.is_member`, base de toda a RLS: um erro esconde dados de todas as agências.
3. **A regra de consentimento bloqueia chatbot e lembretes.** Hoje toda mensagem automática exige consentimento de marketing (`service.ts:132-133`), e contatos novos nascem sem ele. Um chatbot de primeira resposta e um lembrete de pagamento seriam recusados quase sempre.
4. **Janela fixa de envio 8h–20h** (`automations/types.ts:145`) conflita com horário de atendimento configurável e com um chatbot que responde a qualquer hora.
5. **WhatsApp não validado e agendador inativo.** As fases D e E não podem ser validadas sem os dois. Antes de ligar o agendador há dois defeitos a corrigir: lotes de campanha sem chave de deduplicação e destinatários presos em "enviando", que podem gerar repetição infinita de lotes (`engine.ts:349`, `engine.ts:427`).
6. **Respostas interativas do WhatsApp** (botões e listas) chegam hoje como "não suportadas" e não há envio de mensagens interativas. O construtor de chatbot precisa dos dois.
7. **Métricas de atendimento** da referência (pendentes antes/depois, tempo de espera, duração por atendimento) exigem registrar cada atendimento como entidade própria; hoje a conversa guarda só o ciclo atual.

### Ordem das etapas

Mantida a sequência A → F pedida, com dois ajustes: uma **Etapa 0** de pré-requisitos e a remoção do cadastro público movida da A para a B.

```
0 Pré-requisitos ─► A Visual e navegação ─► B Master e suporte ─► C Agência
                                                                    │
         F Finalização ◄─ E Chatbot ◄─ D Automações ◄─ (operação real validada)
```

---

### Etapa 0 — Ambientes ☑ (decidido em 16/11/2026)

O dono do produto definiu que **o projeto Supabase atual ("CRM ELOZIA") e a publicação em `elozia.vercel.app` são o ambiente de testes**. As migrations das fases B a F podem ser aplicadas nele. O ambiente de produção será criado depois, na etapa de lançamento.

Pendências que passam para a etapa de lançamento (criação da produção): novo projeto Supabase de produção, URLs de autenticação, SMTP próprio, Upstash, rotina de backup antes de cada migration, e nenhum dado de teste levado para lá.

As decisões D1 a D12 seguem a recomendação, salvo indicação em contrário do dono do produto.

### Fase A — Fundação visual e navegação ☑ (concluída em 16/11/2026)

Não altera o banco. Não remove o cadastro público (vai para a Fase B).

- ☑ Tokens completos em `globals.css` (`@theme`): escala de verdes (green-700 com contraste 5,45:1), cinzas, estados, status de negócio (lead, andamento, proposta, ganho, perdido), barra superior, foco, raios, sombras, escala tipográfica nomeada (caption → metric), medidas nomeadas (topbar, drawer, inbox-list, touch, content) e movimento. Valores arbitrários e hex soltos substituídos; ficam só `grid-cols-[...]`, `has-[:checked]`, a lista de propriedades de transição do botão, `themeColor` do viewport, o padrão do seletor de cor das etiquetas (dado) e `global-error.tsx` (renderiza sem CSS).
- ☑ Componentes base: Drawer (sobre `<dialog>`), DropdownMenu acessível, PasswordField, Breadcrumbs, DataList (tabela no desktop, cartões no celular), skeletons por tipo de página (`loading.tsx` por rota), toasts, modais animados. **Tooltip não criado**: nenhuma tela precisa hoje; entra com o construtor de chatbots (Fase E).
- ☑ Motion (`motion@14.14.0`) só em componentes cliente (menus, indicador ativo da barra), com `MotionConfig reducedMotion="user"` e `prefers-reduced-motion` no CSS.
- ☑ Barra superior escura com os 8 itens, submenus suspensos, indicador ativo animado, sinal de navegação pendente (`useLinkStatus`) e gaveta escura no celular. Sem sobreposição medida de 1024 a 1920 px.
- ☑ Submenus só com o que existe: CRM › Contatos, Funil, Oportunidades, Tarefas; Viagens › Pacotes, Reservas; Configurações com menu lateral (título + descrição), Usuários e Equipes separados, Modelos com filtros.
- ☑ Novas listas: `/oportunidades` (filtros, paginação) e `/tarefas` (global, com contagens e conclusão inline).
- ☑ Login renovado: tela dividida, mostrar/ocultar senha em todas as telas, erros e carregamento.
- ☑ Central de atendimento sem rolagem dupla na nova altura; testada com conversa fictícia em 375, 768, 1280 e 1536 px.
- ☑ Revisão visual de 28 rotas em 375, 768 e 1280 px (sem erro de console, sem estouro horizontal); E2E atualizado (seletores de senha por `/^Senha/`, por causa do botão "Mostrar senha").

- ☑ Revisão independente (acessibilidade e correção) dos componentes base, com 17 correções: foco visível ao abrir a gaveta, conteúdo da gaveta mantido durante a saída, clique no fundo só fecha se começou no fundo, foco devolvido ao botão ao escolher item de menu, menu fecha ao trocar de rota e com toque no iPhone, contraste do texto secundário (4,80:1) e do placeholder, link dentro de link evitado no DataList, alvos de 44px na barra, modal longo rola só o corpo.
- Pendências registradas para a Fase F (decisão visual): borda dos campos e botões secundários (gray-300, 1,48:1) abaixo dos 3:1 de componentes de interface; cabeçalho do menu do perfil como texto solto dentro de `role="menu"`.

Critério atendido: tsc e eslint limpos, 197 testes unitários e de banco, build, E2E 20 passando (6 pulados por desenho no perfil celular).

### Fase B — Administração Master e acesso de suporte ☐

Inclui as correções das revisões de segurança. Detalhes técnicos em ARQUITETURA.md.

**B1 — Base de segurança**
- ☐ Esquema `platform` (fora da API pública): administradores Master (papéis owner, operator, viewer), MFA TOTP obrigatório (aal2 conferido no servidor e no banco).
- ☐ Provisionamento do primeiro Master por procedimento administrativo documentado (script com service role + SQL), nunca por cadastro.
- ☐ Master **nunca** é membro de agência (gatilhos nos dois sentidos).
- ☐ `organizations.status` (ativa/suspensa); `is_member`, `has_role`, `current_org` e as funções que leem vínculos diretamente passam a exigir agência ativa; `authorize()` recusa agência suspensa antes de qualquer ação com service role.
- ☐ Campos administrativos da agência (situação, plano, razão social, CNPJ) protegidos contra alteração pela própria agência.
- ☐ Planos e limites sem preço (`platform.plans` + exceções por agência), aplicados por gatilhos no banco (usuários, convites, canais) e antecipados na interface ("N de N usuários").
- ☐ Auditoria de plataforma só de inclusão, com gatilhos que registram qualquer alteração em agências, planos, limites e Masters.
- ☐ Proteção de login no próprio Supabase Auth: CAPTCHA nativo e hook de tentativas de senha e MFA (o limite na Server Action pode ser contornado pela API do Auth).
- ☐ Revogar `EXECUTE` padrão de funções novas para `anon`; teste que confere isso.

**B2 — Painel Master e fim do cadastro público**
- ☐ `/master/entrar` e área `/master` com layout próprio: visão geral (indicadores reais e gráficos), agências (tabela, filtros, painel lateral, criar, editar, suspender, reativar, plano e limites), usuários administrativos, planos e limites, consumo, auditoria, configurações da plataforma.
- ☐ Criação de agência pelo Master com convite do administrador inicial.
- ☐ Aceite de convite reescrito sem `auth.signUp` público; tela "sem acesso / agência suspensa" no lugar de `/boas-vindas`.
- ☐ Remover `/cadastro`, `/boas-vindas`, `signUpAction` e `create_organization`; desligar o cadastro aberto no Supabase Auth.
- ☐ Testes de banco e E2E reescritos ("Master cria agência e convida o proprietário").

**B3 — Acesso como suporte**
- ☐ Sessão de suporte no banco: justificativa, prazo (até 60 min, inatividade de 15 min), presa à **sessão de login** que a iniciou, TOTP recente para iniciar.
- ☐ Cookie httpOnly assinado com o id da sessão (nunca o id da agência); banco como fonte da verdade a cada requisição.
- ☐ Papel efetivo "suporte" **somente leitura**; escrita futura só por funções específicas e auditadas.
- ☐ Leitura administrativa (cadastros, configurações) liberada na sessão; **dados privados** (contatos, oportunidades, conversas, mensagens, mídia) só com autorização temporária da agência, com escopo, prazo, Master nomeado e revogação.
- ☐ Mídia privada em modo suporte servida por rota que reconfere a autorização e registra a leitura (sem URLs assinadas).
- ☐ Banner "Modo suporte Elozia", "Voltar ao Master", encerramento por prazo também pelo agendador.
- ☐ Tela da agência para autorizar, revogar e consultar o histórico de acessos do suporte.
- ☐ Testes de tentativa de burla: sem sessão, sessão expirada, de outra agência, de outro aparelho, autorização revogada, cookie forjado, Master rebaixado, agência suspensa.

Critério: nenhuma conta comum cria agência por nenhum caminho; o suporte só lê o que a agência autorizou, enquanto autorizou, com tudo registrado.

### Fase C — Sistema da agência ☐

- ☐ **Entidade atendimento** (um por ciclo de conversa): protocolo, início, primeira resposta, conclusão, atendente, equipe, origem.
- ☐ Equipe padrão e equipe por canal (conversas novas entram com equipe).
- ☐ Dashboard com gráficos (biblioteca única, `recharts@3`): atendimentos por período, evolução comercial, conversão, desempenho de atendentes (só gestores), vendas por viagem, etapas do funil; filtro de datas livre.
- ☐ Central: etiquetas na lista, observações e etiquetas no painel, criar oportunidade sem sair da conversa, modelos e respostas rápidas no compositor.
- ☐ Contatos: última interação, exportar (com permissão e auditoria), arquivar, detalhes em painel lateral (a página `/contatos/[id]` continua existindo).
- ☐ Funil: cartões com próximas atividades; motivos de perda configuráveis.
- ☐ **Múltiplos funis** (se aprovado): migração ensaiada no projeto de testes antes da produção.
- ☐ Viagens: várias fotos, visão tabela e cartões, página do pacote com oportunidades, reservas e campanhas relacionadas.

### Etapa de operação real (entre C e D) ☐

- ☐ Corrigir lotes de campanha sem deduplicação e destinatários presos em "enviando".
- ☐ Revisar o que está agendado em produção e ativar o agendador (`scripts/setup-cron.mjs`).
- ☐ Validar o WhatsApp com número real (receber, responder, mídia, template fora da janela, status).

### Fase D — Automações ☐

- ☐ Regra de consentimento por origem (ver decisão D3) aplicada em `sendToConversation`.
- ☐ Horário de atendimento configurável, substituindo a janela fixa de 8h–20h (decisão D4).
- ☐ Campanhas: pausa e retomada, busca e filtros, segmentação ampliada.
- ☐ **Sequências** de várias etapas com inscrição única, regras de saída e anti-duplicidade entre sequências (decisão D5 sobre as automações atuais).
- ☐ **Mensagens agendadas**: lista, agendar, cancelar, detalhes; aviso quando a janela de 24 h exigir template.
- ☐ **Modelos e respostas rápidas** numa tela única, tipos diferenciados, alcance (empresa, equipe, usuário), arquivamento; status de modelo sempre vindo da Meta.

### Fase E — Construtor visual de chatbots ☐

- ☐ Envio e recebimento de mensagens interativas (botões e listas) no WhatsApp.
- ☐ Modelo versionado: chatbot, versões imutáveis, sessão por conversa, eventos com chave de idempotência.
- ☐ Nós como **grupos de etapas** (referência), uma saída por opção e saída obrigatória de "sem resposta/expirou".
- ☐ Editor (`@xyflow/react@12.12.1`, carregado só na rota do construtor): biblioteca de blocos, canvas, painel de configuração, desfazer/refazer, copiar, duplicar, rascunho, alterações não salvas, histórico de versões, modos visualizar e editar.
- ☐ Validação no servidor antes de publicar (início, conexões, saídas, incompletos, inalcançáveis, ciclos sem espera, limites do canal, ids revalidados contra a agência).
- ☐ Simulador sem envio real, com o mesmo interpretador do motor.
- ☐ Motor fora do caminho de erro do webhook, com trava por conversa, limite de passos por turno, pausa automática quando um atendente assume ou responde.
- ☐ Listagem com filtros (rascunhos, publicados, pausados, arquivados).
- ☐ Bloco IA: oculto até a Fase de IA ([PLANO_IA.md](PLANO_IA.md)).

### Fase F — Finalização ☐

- ☐ Relatórios: atendimentos (lista com protocolo e relatório geral com pendentes antes/depois e capacidade diária), atendentes, equipes, conversões, vendas, viagens, campanhas, chatbots, sequências; tempo de espera, de resposta e duração com o critério descrito na tela; exportação.
- ☐ Usuários: telefone, apelido de atendimento, equipes, disponibilidade, painel lateral, limite do plano.
- ☐ Equipes: lista com equipe padrão e filtro por canal.
- ☐ Configurações: endereço, horário de atendimento, notificações, preferências.
- ☐ Itens invasivos, se aprovados: permissões granulares, sessões e dispositivos, distribuição automática, notificações in-app.
- ☐ Revisão final de responsividade, acessibilidade, animações e auditoria de segurança.

---

## Decisões do produto

Cada item tem uma recomendação. Sem resposta, sigo a recomendação ao chegar na etapa correspondente.

| # | Decisão | Recomendação | Afeta |
|---|---|---|---|
| D1 | Remover o cadastro público só na Fase B (depende da criação pelo Master) | Sim | A, B |
| D2 | Ambiente de testes | **Decidido:** o projeto atual é o de testes; a produção será criada no lançamento | B em diante |
| D3 | Consentimento por origem | Dentro da janela de 24 h, em conversa iniciada pelo cliente (chatbot, resposta), e templates de **utilidade** para cliente com relação comercial: basta não ter opt-out. Templates de **marketing** e campanhas: exigem consentimento registrado. | D, E |
| D4 | Janela fixa 8h–20h | Substituir por horário de atendimento configurável por agência; campanhas e sequências respeitam; chatbot responde a qualquer hora | D, E |
| D5 | Sequências × automações atuais | Sequências substituem a tela de automações; cada automação existente vira sequência de 1 etapa, migrada sem perder histórico | D |
| D6 | Múltiplos funis por agência | Sim, mas por último na Fase C (mudança mais invasiva) | C |
| D7 | Painel Master em origem separada | `master.<domínio-próprio>` quando houver domínio; até lá, mesma origem com CSP por nonce e sem cliente Supabase no navegador em modo suporte | B |
| D8 | Itens de menu ainda não construídos | Ocultos até existirem (regra: nada de botão sem função) | A |
| D9 | Papéis | Manter os 4 papéis fixos; permissões granulares só na Fase F, se aprovadas | B, F |
| D10 | Autorização de suporte da agência | Escopos "CRM" e "atendimento", somente leitura, até 72 h (padrão 4 h), Master nomeado | B |
| D11 | Quem vê gráficos de desempenho de atendentes | Só gestores; atendente vê os próprios números | C |
| D12 | "Faturamento registrado" | Soma das reservas confirmadas em reais; outras moedas informadas à parte | C |

Pendências antigas que continuam valendo: planos e preços, textos jurídicos, provedor de e-mail, plano da Vercel, modo de operação na Meta.

## Futuro — fora desta atualização

- Agente de IA ([PLANO_IA.md](PLANO_IA.md)), integração com n8n, cobrança recorrente, Embedded Signup da Meta, canais além do WhatsApp, gateway de pagamento.
- Itens da referência deliberadamente excluídos: portal de parceiros, revenda, white-label.
