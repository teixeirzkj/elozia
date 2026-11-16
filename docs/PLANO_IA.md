# Plano técnico — Agente de IA (módulo opcional)

**Situação: planejado, não implementado.** Este documento atende à etapa "primeiro apresentar um plano técnico e estimativa de componentes e custos variáveis". A implementação só começa depois de (1) o CRM e o WhatsApp estarem validados com a agência piloto e (2) aprovação explícita deste plano.

## Objetivo

Cada agência configura um assistente que ajuda o atendimento e a qualificação: sugere respostas, identifica destino, datas, número de viajantes e orçamento, consulta o catálogo da própria agência e passa a conversa para uma pessoa quando necessário.

## Princípios

1. **Modo assistido primeiro.** A IA só sugere; um atendente aprova, edita ou descarta. Nenhuma mensagem sai sem aprovação humana na primeira versão.
2. **Só afirma o que está no cadastro.** Preço, data e vagas vêm de consultas ao catálogo; sem dado, a IA diz que vai verificar com a equipe. Nunca confirma reserva, desconto ou condição comercial.
3. **Isolamento.** Cada execução recebe o `organization_id` do servidor; ferramentas e base de conhecimento filtram por ele. O modelo nunca recebe dados de outra agência.
4. **Regras da Meta continuam valendo.** A IA não envia nada fora da janela de 24 horas e não escolhe templates sozinha.
5. **Tudo registrado.** Cada sugestão, ferramenta chamada e decisão humana fica em histórico.
6. **Custo sob controle.** Limite mensal por agência, com bloqueio automático ao atingir.

## Arquitetura

```
Mensagem recebida (webhook) ──► job "ai_suggest" (fila existente)
                                   │
                                   ▼
                          Orquestrador (servidor)
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                  ▼
          Provedor de IA      Ferramentas        Guardas
          (interface)       (somente leitura    (limite de custo,
                             + propostas de      IA desligada,
                             alteração)          conteúdo permitido)
                                   │
                                   ▼
                    ai_suggestions (rascunho de resposta
                    + campos extraídos + motivo)
                                   │
                                   ▼
            Central de atendimento: painel "Sugestão da IA"
            [Usar] [Editar] [Descartar] — o envio usa o fluxo atual
```

### Camada de provedor

Interface única, para trocar ou combinar provedores sem tocar no restante:

```ts
interface AiProvider {
  readonly id: string;
  generate(input: {
    system: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    maxOutputTokens: number;
  }): Promise<{ text: string | null; toolCalls: ToolCall[]; usage: { inputTokens: number; outputTokens: number } }>;
}
```

Primeira implementação sugerida: Anthropic Claude (modelo da família atual, com um modelo menor para extração e um maior para redigir, se o custo justificar). A escolha do provedor e do modelo é uma **decisão em aberto** e fica em configuração, não no código.

### Ferramentas disponíveis ao modelo

| Ferramenta | O que faz | Tipo |
|---|---|---|
| `buscar_pacotes(destino?, mes?)` | Lista pacotes ativos e saídas futuras da agência, com valor cadastrado | Leitura |
| `ver_saida(saida_id)` | Datas, valor e vagas cadastradas (marcadas como controle interno) | Leitura |
| `buscar_conhecimento(pergunta)` | Trechos da base de conhecimento da agência | Leitura |
| `ver_contato()` | Nome, etiquetas e oportunidades abertas do contato da conversa | Leitura |
| `propor_qualificacao(destino, datas, viajantes, orcamento)` | Grava os campos como **proposta** para o atendente aceitar | Proposta |
| `pedir_humano(motivo)` | Marca a conversa para atendimento humano | Ação segura |

Não haverá ferramenta que envie mensagem, crie reserva, altere valor ou mova oportunidade sem aprovação.

### Base de conhecimento

Textos e documentos da agência (políticas, perguntas frequentes, roteiros), divididos em trechos e indexados com `pgvector` no próprio Supabase, com `organization_id` e RLS. Busca sempre filtrada pela agência.

### Novas tabelas (todas com `organization_id` e RLS)

- `ai_settings` — ligado/desligado, nome do assistente, instruções da agência, provedor/modelo, limite mensal.
- `ai_knowledge_documents`, `ai_knowledge_chunks` — base de conhecimento e vetores.
- `ai_suggestions` — conversa, mensagem de origem, rascunho, campos extraídos, situação (pendente, usada, editada, descartada), quem decidiu.
- `ai_actions` — histórico de cada execução: ferramentas chamadas, resultado, erro.
- `ai_usage` — tokens de entrada e saída por execução, para custo e limite.
- `conversations.ai_enabled` — desligar a IA por conversa.

### Telas

- Configurações › Assistente de IA (nome, instruções, base de conhecimento, limite, ligar/desligar).
- Central de atendimento: cartão de sugestão acima do campo de mensagem, com os dados extraídos e os botões Usar, Editar e Descartar; chave "IA nesta conversa".
- Histórico de ações da IA por conversa e relatório de uso (sugestões geradas, aproveitadas, descartadas, consumo).

## Segurança e privacidade

- Instruções do sistema fixas pela Elozia; as instruções da agência entram como conteúdo delimitado e não podem remover as regras (não inventar preço, não confirmar reserva, não prometer desconto).
- Texto de clientes e de documentos é tratado como dado, nunca como instrução (defesa contra injeção de prompt); as ferramentas são somente leitura ou de proposta.
- Verificação de saída antes de exibir: valores monetários e datas citados precisam ter vindo de uma ferramenta na mesma execução; caso contrário a sugestão é marcada para revisão.
- Minimização: só as últimas mensagens necessárias da conversa vão ao provedor; sem documentos de identidade ou dados de pagamento.
- Contrato com o provedor: sem uso dos dados para treinamento e com cláusulas de tratamento de dados; avaliar transferência internacional (LGPD) e informar na Política de Privacidade.
- Contatos com descadastro e conversas com a IA desligada nunca são enviados ao provedor.

## Componentes e esforço estimado

| Componente | Conteúdo | Esforço relativo |
|---|---|---|
| Fundação | Migrations, configurações, camada de provedor, limite de custo, job na fila | Médio |
| Ferramentas e orquestrador | Seis ferramentas, laço de execução, verificação de saída | Médio |
| Base de conhecimento | Upload, divisão, vetores, busca | Médio |
| Interface | Configuração, cartão de sugestão, histórico, chave por conversa | Médio |
| Avaliação | Conjunto de conversas fictícias com respostas esperadas; testes de isolamento e de "não inventar" | Médio |
| Piloto assistido | Acompanhamento com uma agência, ajuste de instruções | Contínuo |

Ordem sugerida: fundação → ferramentas → interface em modo assistido → base de conhecimento → avaliação → piloto. O modo autônomo (responder sem aprovação) é uma etapa posterior, sujeita a nova aprovação e a métricas do piloto.

## Custos variáveis

Não há preço neste documento: valores de provedores mudam e **não devem ser presumidos**. O custo se calcula assim:

```
custo por sugestão = tokens de entrada × preço de entrada + tokens de saída × preço de saída
custo mensal da agência = sugestões no mês × custo por sugestão
                        + indexação da base de conhecimento (uma vez por documento)
```

O que determina o volume (a medir no piloto, não estimado aqui):

| Fator | De onde vem |
|---|---|
| Sugestões por mês | Mensagens recebidas com a IA ligada |
| Tokens de entrada por sugestão | Instruções + histórico recente + resultados das ferramentas + trechos da base |
| Tokens de saída por sugestão | Tamanho do rascunho e das chamadas de ferramenta |
| Chamadas por sugestão | Uma, mais uma por rodada de ferramentas |

Alavancas de redução: histórico curto e resumido, cache de instruções no provedor (quando houver), modelo menor para extração, não gerar sugestão para mensagens triviais, limite mensal por agência.

Outros custos variáveis: armazenamento dos vetores (cresce com a base de conhecimento) e tempo de execução das funções. As mensagens do WhatsApp aprovadas a partir de sugestões seguem a cobrança normal da Meta.

**Antes de aprovar**, levantar com o provedor escolhido a tabela de preços vigente e rodar o conjunto de avaliação para medir tokens reais por sugestão; só então definir o limite padrão e o impacto no preço da assinatura.

## Decisões necessárias para começar

1. Provedor e modelos iniciais.
2. Se o módulo será cobrado à parte e qual o limite mensal padrão.
3. Agência piloto e período de modo assistido.
4. Texto de transparência ao cliente final (se e como informar que há assistência de IA).

## Critérios de conclusão da fase

- Em modo assistido, nenhuma mensagem é enviada sem ação humana (teste automatizado).
- Testes de isolamento: a IA de uma agência não recebe nem cita dados de outra.
- Conjunto de avaliação: nenhuma resposta com preço, data ou vaga que não esteja no catálogo.
- Limite de consumo bloqueia novas sugestões ao ser atingido e avisa o administrador.
- IA desligada por agência e por conversa funciona imediatamente.
