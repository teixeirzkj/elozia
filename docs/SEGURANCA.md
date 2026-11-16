# Segurança, privacidade e retenção — Elozia

Resultado da auditoria feita no fechamento do MVP (16/11/2026) e regras que o sistema aplica. "Verificado por teste" significa que há teste automatizado no repositório; "revisado no código" significa revisão manual, sem teste dedicado.

## Auditoria

| Item | Situação | Como foi verificado |
|---|---|---|
| RLS em todas as tabelas | Ativa nas 31 tabelas | Teste: nenhuma tabela pública sem RLS; toda tabela tem `organization_id` |
| Isolamento entre agências | Leitura, escrita e referências cruzadas bloqueadas | Testes de banco por módulo (fundação, CRM, WhatsApp, automações, relatórios) |
| Papel anônimo | Sem privilégio em tabela alguma; só lê dados mínimos de um convite válido | Teste |
| Permissões por papel | Servidor (`authorize`) + políticas de RLS + funções do banco | Testes de banco; matriz em teste unitário |
| Escalada de papel | Ninguém altera o próprio vínculo nem o do proprietário; administrador não cria administrador | Teste |
| Tokens da Meta | AES-256-GCM, chave só no servidor; tabela sem acesso para usuários; nunca voltam ao navegador nem a logs | Testes (criptografia, `permission denied`, erro sem token) |
| Webhook | HMAC-SHA256 sobre o corpo bruto, comparação em tempo constante, segredo por canal, eventos só do canal cuja assinatura confere | Testes |
| Idempotência do webhook | Chave única por mensagem e por status; reentregas não geram dados | Testes |
| Roteamento | Agência resolvida pelo `phone_number_id` (único); status de outro número é ignorado | Testes |
| Uploads | Tipo conferido pelos bytes, limite por tipo, nome saneado, pasta da agência, bucket privado | Testes unitários e de política de storage |
| Acesso a mídias | URL assinada com validade de 15 a 60 minutos | Revisado no código |
| Download de mídia da Meta | Somente hosts da Meta, HTTPS, limite de 16 MB | Teste |
| Rate limiting | Login, cadastro, convites, mensagens, uploads, importação, exportação, webhook | Revisado no código (Upstash em produção) |
| Validação de entradas | Zod em toda Server Action; restrições e chaves compostas no banco | Testes unitários e de banco |
| Redirecionamento aberto | Só caminhos internos após login e links de e-mail | Teste |
| Injeção em CSV | Células iniciadas por `= + - @` são neutralizadas | Teste |
| Exposição de dados em erros | Mensagens genéricas ao usuário; log só com código | Revisado no código |
| Cabeçalhos | CSP, HSTS, nosniff, frame deny, referrer, permissions | Teste de navegador |
| Agendador | `CRON_SECRET` em tempo constante; fila inacessível a usuários | Testes |
| Dependências | `npm audit --omit=dev`: 0 vulnerabilidades em 16/11/2026 | Executado |
| Dados de cartão | Não há campo; forma de pagamento é lista fechada; observação com número de cartão é recusada | Testes |

### Correções feitas durante a auditoria

1. O e-mail do perfil podia ser alterado pelo próprio usuário (permitia falsificar a identidade exibida). Agora é imutável para usuários e sincronizado com a conta.
2. Mensagens automáticas com template de utilidade podiam sair sem consentimento registrado. Agora **todo** envio automático exige consentimento.
3. Excluir um contato deixava as mídias das conversas no armazenamento. Agora são removidas junto.
4. O webhook não tinha limite de requisições por origem. Agora tem.
5. O marcador "demonstração" podia ser alterado por um membro, tirando registros reais dos relatórios. Agora só o servidor altera.
6. O menu mostrava Relatórios a quem não tem acesso (a página já recusava). Agora o item é ocultado.

### Riscos conhecidos e aceitos no MVP

- **CSP com `'unsafe-inline'`** para scripts e estilos (exigência do Next.js sem *nonce*). Mitigado por não haver HTML dinâmico não escapado.
- **Sem segundo fator de autenticação.** Recomendado antes de escalar; o Supabase Auth oferece TOTP.
- **Sem bloqueio de conta por tentativas**, apenas rate limiting por IP e e-mail.
- **Chave única de criptografia**, sem rotação automática. O formato dos segredos tem versão (`v1`) para permitir rotação futura.
- **Arquivos enviados e nunca usados** (upload feito, envio cancelado) permanecem no bucket. Limpeza periódica é pendência.
- **Antivírus**: arquivos não são escaneados; o tipo é validado e o conteúdo é servido de outra origem, por URL temporária.
- **Chave `service_role`** é necessária no servidor para webhook e cron; um vazamento dela expõe todas as agências. Guardar como *Sensitive* na Vercel e rotacionar se houver suspeita.

## Privacidade (LGPD)

**Papéis.** A agência é a **controladora** dos dados dos seus clientes; a Elozia é a **operadora**. Formalizar em contrato antes do piloto.

**Dados tratados.** Nome, telefone, e-mail, observações, histórico comercial, conteúdo e mídias de conversas do WhatsApp, reservas e pagamentos declarados (sem dados de cartão).

**O que o sistema faz hoje**

- Consentimento para comunicações comerciais por contato, com data e origem; histórico de mudanças na linha do tempo.
- Descadastro (opt-out) manual ou automático quando o contato responde SAIR, PARAR, STOP ou DESCADASTRAR; bloqueia campanhas e mensagens automáticas.
- Campanhas só para quem tem consentimento registrado, conferido de novo no momento de cada envio.
- Exclusão de contato remove oportunidades, reservas, tarefas, conversas, mensagens e mídias (direito de eliminação).
- Contatos importados entram sem consentimento, salvo declaração expressa de quem importa.
- Cada agência só acessa os próprios dados; ações sensíveis ficam em `audit_logs`.
- Logs técnicos não guardam conteúdo de mensagens, tokens nem dados pessoais.

**Pendências para o lançamento**

- Política de Privacidade e Termos de Uso (texto jurídico) e aceite no cadastro.
- Exportação dos dados de um titular (portabilidade) em um arquivo.
- Exclusão completa de uma agência (encerramento de contrato), incluindo arquivos.
- Indicação do encarregado (DPO) e canal de atendimento ao titular.
- Registro das operações de tratamento e avaliação de transferência internacional (Supabase, Vercel, Meta, Upstash).

## Retenção

| Dado | Retenção | Observação |
|---|---|---|
| Registros técnicos de webhooks | 30 dias | Limpeza automática a cada hora |
| Jobs finalizados | 30 dias | Limpeza automática |
| Identificador de mídia na Meta | 7 dias (limite da Meta) | Depois disso a mídia não pode mais ser baixada |
| Convites | 7 dias para aceitar | O registro permanece para auditoria |
| Contatos, conversas, vendas | Enquanto a agência for cliente | A agência exclui contato a contato |
| Auditoria | Sem expiração no MVP | Definir prazo com o jurídico |
| Backups | Conforme o plano do Supabase | Dados excluídos permanecem nos backups até expirarem |

Prazos de guarda de conversas e de auditoria devem ser definidos com assessoria jurídica antes do lançamento comercial.

## Políticas da Meta aplicadas

- Apenas a WhatsApp Cloud API oficial; nenhuma biblioteca de WhatsApp Web ou QR Code.
- Mensagens livres só dentro de 24 horas da última mensagem do cliente (verificado no servidor a cada envio e a cada reenvio).
- Fora da janela, apenas templates com status **Aprovado**.
- Templates de marketing exigem consentimento; opt-out é respeitado.
- Erros de limite e de qualidade interrompem campanhas em vez de insistir.
- Envios automáticos apenas entre 8h e 20h no fuso da agência; campanhas limitadas a 2.000 destinatários e sempre segmentadas.
