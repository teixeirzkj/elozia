# Análise das referências

Capturas de uma plataforma de CRM e atendimento usada como **referência de organização e de funcionalidades**, recebidas em 16/11/2026.

**Regras de uso**
- As imagens **não são versionadas**: contêm dados pessoais reais de terceiros (nomes, telefones, e-mails, documentos, endereço e foto). O `.gitignore` bloqueia imagens nesta pasta.
- Este documento registra apenas estrutura e comportamento, sem nenhum dado pessoal.
- A Elozia **não copia** layout, textos, ícones, cores nem componentes. A interface é original, com a identidade Elozia (preto, verde `#00DF73`, Plus Jakarta Sans).
- Itens de parceiros e revenda vistos na referência (ex.: "Portal de parceiros") estão **fora do escopo**: a Elozia não é white-label.

## 1. Navegação

- Barra superior escura e fina com os módulos principais (atendimentos, CRM, aplicativos, relatórios, ajustes, administração) e menus suspensos.
- Menu suspenso de administração agrupado em blocos separados por divisórias: cadastros (contas, planos, canais), administração (usuários administrativos, configurações da plataforma), personalização, e relatórios da plataforma (auditoria, faturamento, custo de infraestrutura, consumo de mensagens, cancelamentos).
- À direita: notificações, troca de conta, ajuda e avatar.

**Para a Elozia:** barra superior escura com menus suspensos agrupados é a base da nova navegação. O menu de administração vira o painel **Master**, em área separada (`/master`), e não um item no menu das agências.

## 2. Configurações da conta

- Página com **menu lateral contextual**: cada item tem título e uma linha de descrição (ex.: Conta, Horário de atendimento, Canais, Consumo de mensagens).
- Formulário de conta em seções: dados da empresa (nome, tipo de empresa, razão social, CNPJ), administrador da conta (seleção), situação da conta, dados para contato (e-mail, telefone com ícones) e endereço (CEP, rua, bairro, estado, número, complemento, cidade).
- **Razão social, CNPJ e situação da conta aparecem somente leitura** para a agência: são definidos pela administração da plataforma.

**Para a Elozia:** menu lateral com título e descrição; campos cadastrais definidos pelo Master ficam só leitura na agência; endereço com preenchimento pelo CEP (a decidir: serviço de CEP é integração externa).

## 3. Modelos de mensagem

- Cabeçalho com contagem ("N modelos encontrados"), busca, filtro por tipo, filtro por canal e chave "Arquivados".
- Ações: atualizar, **Sincronizar** com a Meta, **Permissões** (quem pode criar/usar) e **Novo**.
- Colunas: modelo (nome, selo de categoria e o texto completo com variáveis), **tipo** (modelo de atendimento × resposta rápida), **disponibilidade** (canal e alcance, ex.: toda a empresa) e situação.
- Paginação no rodapé.

**Para a Elozia:** uma única tela com dois tipos claramente diferenciados — modelos oficiais da Meta (situação vinda da Meta, nunca marcada manualmente como aprovada) e respostas rápidas internas; alcance por empresa, equipe ou usuário; arquivamento.

## 4. Equipes

- Lista agrupada por letra inicial, com avatar de iniciais, nome e quantidade de usuários.
- Selo **"Padrão"** na equipe padrão.
- Busca, filtro por canal, Novo e atualizar.

**Para a Elozia:** equipe padrão (para onde vão conversas sem destino), associação de equipes a canais e filtro por canal.

## 5. Usuários

- Contador de licenças ("N de N usuários contratados") e **aviso quando o limite do plano é atingido**, orientando a pedir alteração do plano.
- Lista com avatar, nome, apelido e selos de papel; destaque para o **administrador da conta**.
- **Painel lateral de detalhes**: foto, identificador, data de criação, agência e papel, apelido usado no atendimento, e-mail, telefone, **disponibilidade** (ex.: disponível), equipes (com o papel do usuário em cada equipe), **permissões granulares** com descrição (ex.: criar campanhas sem disparar, criar respostas rápidas) e **dispositivos conectados** com "sair de todos" e saída por dispositivo.
- Na referência, usuários da administração da plataforma aparecem dentro da lista da agência.

**Para a Elozia:** limite de usuários do plano aplicado no servidor e no banco; apelido de atendimento; disponibilidade; equipes por usuário; permissões granulares além do papel (avaliar após a Fase B); sessões ativas com encerramento remoto. **Diferença deliberada:** usuários Master nunca aparecem como membros da agência — o acesso deles é o modo suporte, auditado.

## 6. Relatório de atendimentos (lista)

- Cada atendimento tem **protocolo** próprio e situação (pendente, em andamento, concluído).
- Colunas: protocolo, contato (nome e telefone), usuário e equipe, origem (canal; também origem por anúncio da Meta), início e conclusão, tempo de inatividade, primeira resposta e tempo total.
- Ações: concluir atendimentos em lote, exportar, atualizar; filtros.

**Para a Elozia:** introduzir a entidade **atendimento** (um ciclo de conversa com protocolo, início, primeira resposta, conclusão, atendente, equipe e origem). Hoje a conversa guarda só o ciclo atual (`cycle_started_at`, `first_response_at`), o que não permite este relatório nem o histórico por ciclo. A origem por anúncio exige ler o campo de referência do anúncio no webhook da Meta (a confirmar na documentação).

## 7. Relatório geral de atendimentos

- Abas (geral, por usuário, resultados), critérios, filtro de equipes e período.
- Quatro indicadores: **pendentes antes do período, novos, concluídos e pendentes após o período** — a conta fecha (antes + novos − concluídos = depois).
- Gráfico **"capacidade de atendimento"**: barras diárias de novos × concluídos e linha de pendentes em eixo secundário; ao lado, média por dia e **desempenho** (concluídos ÷ novos).
- Seções de **tempo de espera** e **duração do atendimento**, com a regra de cálculo descrita abaixo do título.

**Para a Elozia:** os mesmos conceitos com dados reais, a partir da entidade atendimento; descrever o critério de cada métrica na própria tela; gráficos com a identidade Elozia.

## 8. Construtor de chatbot

- Tela de visualização de um fluxo publicado: barra superior com voltar, nome, **selo de situação**, ajuda, ver código, **testar**, **histórico** e **Editar** (visualização e edição são modos separados).
- Canvas com grade pontilhada, controles de zoom e "ajustar à tela" no canto.
- Bloco **Início** com configuração geral do fluxo (limite de espera e tolerância).
- Os nós são **grupos de etapas em sequência**, não um passo por nó. Etapas vistas: enviar modelo de mensagem, enviar mensagem com variáveis do contato (ex.: primeiro nome), condicional, enviar menu com opções, aguardar mensagem do contato, esperar alguns segundos, concluir atendimento.
- Saídas: **uma por opção** do menu ou ramo da condição (ex.: sim, não, caso padrão) e **uma saída de exceção** (sem resposta ou erro) em destaque.
- Conexões tracejadas com roteamento ortogonal.

**Para a Elozia:** adotar o conceito de **grupo de etapas** (reduz a quantidade de nós e deixa o fluxo legível), saídas por opção, saída obrigatória de "sem resposta/expirou", configuração geral de tempo de espera no início, variáveis do contato inseridas como selos, modos de visualização e edição separados, testar e histórico de versões. Visual próprio: blocos com cor por tipo, conexões com animação discreta durante a simulação, painel lateral de configuração.

## Itens da referência fora do escopo da Elozia

- Portal de parceiros, revenda e white-label.
- Canais além do WhatsApp oficial (a referência mostra Instagram): fora do MVP.
- Relatório de faturamento e custo de infraestrutura no Master: dependem da cobrança recorrente, que é fase futura.
