# Briefing — Elozia

## O produto

**Elozia — CRM inteligente para agências de viagens.**

Plataforma SaaS que reúne atendimento por WhatsApp, CRM, funil de vendas, catálogo de viagens e automações em um só ambiente, feita especificamente para agências de viagens e turismo.

## Para quem

Agências de viagens e turismo que vendem pacotes e saídas em grupo e atendem principalmente pelo WhatsApp. Usuários dentro da agência: proprietário, administradores, supervisores e atendentes/vendedores.

## Problema

O atendimento acontece em celulares individuais, o histórico do cliente se perde, ninguém sabe em que etapa está cada negociação, follow-ups dependem da memória do vendedor e as campanhas de uma viagem são feitas à mão.

## Modelo de negócio

- Venda direta para agências. Cada agência contrata, cadastra sua equipe e conecta o próprio número de WhatsApp Business pela API oficial da Meta.
- Cada agência tem usuários e dados próprios; nenhuma agência vê dados de outra.
- A marca é Elozia para todas. **Não há white-label, parceiros ou revendedores.**
- Preços e planos ainda não definidos — nada no sistema deve exibir valores de assinatura até que sejam decididos. Cobrança recorrente é funcionalidade futura.

## Identidade visual

| Item | Definição |
|---|---|
| Nome | Elozia |
| Assinatura | CRM inteligente para agências de viagens. |
| Estilo | SaaS moderno, premium, profissional, minimalista |
| Preto | `#0A0A0A` |
| Branco | `#FFFFFF` |
| Verde de destaque | `#00DF73` |
| Neutros | escala de cinzas para bordas e superfícies |
| Fonte | Plus Jakarta Sans |

Design system próprio com variáveis CSS, componentes reutilizáveis, responsivo e acessível. Não copiar identidade ou código de outras plataformas.

## Funcionalidades

### MVP

1. Login, cadastro de agência, recuperação de senha, convites e papéis.
2. Painel com navegação completa e configurações (agência, usuário, equipe, fuso).
3. CRM de contatos: cadastro, etiquetas, origem, responsável, consentimento, histórico, busca, filtros, importação CSV.
4. Catálogo de viagens: pacotes com múltiplas saídas.
5. Funil de vendas em Kanban com etapas personalizáveis.
6. Oportunidades, propostas e reservas (pagamento apenas declarado manualmente).
7. Central de atendimento WhatsApp (Meta Cloud API): conexão por credenciais, webhook, conversas, mídias, notas internas, janela de 24 h, templates.
8. Distribuição de conversas: assumir, transferir, concluir, reabrir.
9. Follow-ups automáticos e regras de automação (gatilho, condições, ações).
10. Campanhas por viagem com público segmentado, consentimento e template aprovado.
11. Etiquetas, filtros e segmentação.
12. Dashboard e relatórios comerciais e operacionais com exportação CSV.

### Futuro (fora do MVP)

- Agente de IA por agência (modo assistido) e integração com n8n.
- Cobrança recorrente das agências.
- Embedded Signup da Meta (conexão do WhatsApp sem copiar credenciais).
- Gateway de pagamento, integrações com fornecedores/operadoras, aplicativo móvel.

## Restrições

- Arquitetura multiempresa com `organization_id` e Row Level Security.
- Permissões verificadas no servidor; segredos nunca expostos.
- Sem dados, resultados ou preços inventados; sem telas falsas.
- Interface em português brasileiro.
- LGPD e políticas da Meta (consentimento, opt-out, janela de 24 h, templates).
- Vagas cadastradas no catálogo são informação interna da agência, não disponibilidade confirmada por fornecedores.
- Não armazenar dados de cartão.

## Critério de sucesso do MVP

Uma agência piloto consegue, sem ajuda técnica além da configuração da Meta: criar conta, convidar a equipe, cadastrar pacotes, receber leads pelo WhatsApp, conduzir oportunidades pelo funil, enviar propostas, receber follow-ups, confirmar vendas e ver os números reais em relatórios.
