/**
 * Erros da Meta Cloud API traduzidos para o atendente, com a decisão de
 * reprocessar ou não. Códigos conforme a documentação oficial de erros.
 */

export class MetaApiError extends Error {
  constructor(
    readonly code: number | null,
    readonly httpStatus: number,
    readonly detail: string,
  ) {
    super(`Meta API ${httpStatus}${code === null ? "" : ` (${code})`}`);
    this.name = "MetaApiError";
  }
}

export type MetaErrorInfo = {
  message: string;
  /** Vale tentar de novo mais tarde sem mudar nada? */
  retryable: boolean;
  /** O problema é do canal (token, conta), não desta mensagem. */
  channelIssue: boolean;
  /** Não insistir com este contato. */
  stopContact: boolean;
};

const info = (message: string, flags: Partial<Omit<MetaErrorInfo, "message">> = {}): MetaErrorInfo => ({
  message,
  retryable: false,
  channelIssue: false,
  stopContact: false,
  ...flags,
});

const KNOWN: Record<number, MetaErrorInfo> = {
  0: info("O token de acesso do WhatsApp é inválido ou expirou. Reconecte o canal em Configurações › Canais.", { channelIssue: true }),
  190: info("O token de acesso do WhatsApp expirou. Reconecte o canal em Configurações › Canais.", { channelIssue: true }),
  3: info("O token não tem permissão para esta operação na conta do WhatsApp.", { channelIssue: true }),
  10: info("O token não tem permissão para esta operação na conta do WhatsApp.", { channelIssue: true }),
  200: info("O token não tem permissão para esta operação na conta do WhatsApp.", { channelIssue: true }),
  4: info("Limite de requisições do aplicativo atingido. Tente novamente em alguns minutos.", { retryable: true }),
  80007: info("Limite de requisições da conta do WhatsApp atingido. Tente novamente em alguns minutos.", { retryable: true }),
  130429: info("Limite de envio do número atingido. Tente novamente em instantes.", { retryable: true }),
  131056: info("Muitas mensagens para este contato em pouco tempo. Aguarde antes de enviar de novo.", { retryable: true }),
  131048: info("A Meta restringiu o envio deste número por sinais de spam. Reduza os envios e verifique a qualidade do número.", { channelIssue: true }),
  131064: info("A Meta limitou os envios por classificação incorreta de templates.", { channelIssue: true }),
  131031: info("A conta do WhatsApp está restrita pela Meta.", { channelIssue: true }),
  368: info("A conta do WhatsApp está restrita por violação de política da Meta.", { channelIssue: true }),
  131042: info("Há um problema de pagamento na conta do WhatsApp na Meta.", { channelIssue: true }),
  131045: info("O número não está registrado corretamente na Meta.", { channelIssue: true }),
  131047: info("Passaram mais de 24 horas desde a última mensagem do cliente. Envie um template aprovado."),
  131026: info("Não foi possível entregar: o número não usa WhatsApp ou não pode receber esta mensagem.", { stopContact: true }),
  130403: info("O contato bloqueou o número da agência.", { stopContact: true }),
  131050: info("O contato optou por não receber mensagens de marketing.", { stopContact: true }),
  131049: info("A Meta não entregou esta mensagem de marketing para preservar a experiência do contato. Aguarde ao menos 24 horas."),
  131021: info("O destinatário é o próprio número da agência."),
  131051: info("Tipo de mensagem não suportado."),
  131052: info("Não foi possível baixar a mídia enviada pelo contato."),
  131053: info("A Meta recusou o arquivo enviado. Verifique o formato e o tamanho."),
  131063: info("Templates de marketing estão desativados para este número na Meta.", { channelIssue: true }),
  131008: info("A mensagem está incompleta para a Meta."),
  131009: info("Algum valor da mensagem é inválido para a Meta."),
  100: info("Algum valor da mensagem é inválido para a Meta."),
  132000: info("A quantidade de variáveis não corresponde ao template."),
  132001: info("O template não existe, não está aprovado ou não tem este idioma. Sincronize os templates."),
  132005: info("O texto do template ficou longo demais com as variáveis informadas."),
  132007: info("O template viola as políticas da Meta."),
  132012: info("O formato de uma variável do template está incorreto."),
  132015: info("O template foi pausado pela Meta por baixa qualidade."),
  132016: info("O template foi desativado permanentemente pela Meta."),
  137000: info("A identidade do contato mudou e precisa ser confirmada."),
};

export function describeMetaError(code: number | string | null | undefined): MetaErrorInfo {
  const numeric = typeof code === "string" ? Number(code) : code;
  if (numeric != null && Number.isFinite(numeric) && KNOWN[numeric]) return KNOWN[numeric];
  return info("A Meta recusou o envio desta mensagem. Tente novamente; se continuar, verifique o canal.", { retryable: true });
}

export function describeSendFailure(error: unknown): MetaErrorInfo & { code: string | null } {
  if (error instanceof MetaApiError) {
    if (error.httpStatus >= 500 || error.httpStatus === 429) {
      return { ...info("A Meta está indisponível no momento. Tente novamente em instantes.", { retryable: true }), code: error.code === null ? null : String(error.code) };
    }
    return { ...describeMetaError(error.code), code: error.code === null ? null : String(error.code) };
  }
  return { ...info("Não foi possível falar com a Meta. Verifique a conexão e tente novamente.", { retryable: true }), code: null };
}
