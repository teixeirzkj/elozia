import "server-only";

import { getPhoneNumber, listWabaPhoneNumbers, subscribeApp } from "./graph";
import { describeSendFailure } from "./errors";

/**
 * Formas de conectar um número à Elozia. Hoje existe a conexão manual
 * (a agência informa as credenciais). O Embedded Signup da Meta entrará como
 * outro conector com a mesma saída, sem mudar o restante do sistema.
 */

export type ConnectionMethod = "manual" | "embedded_signup";

export type ConnectedChannel = {
  method: ConnectionMethod;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  displayPhone: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  /** Aviso não impeditivo (ex.: inscrição de webhooks não confirmada). */
  warning: string | null;
};

export type ConnectResult = { ok: true; channel: ConnectedChannel } | { ok: false; error: string };

export interface ChannelConnector<Input> {
  readonly method: ConnectionMethod;
  connect(input: Input): Promise<ConnectResult>;
}

export type ManualInput = { wabaId: string; phoneNumberId: string; token: string };

/** Conexão manual: valida as credenciais na Meta antes de qualquer gravação. */
export const manualConnector: ChannelConnector<ManualInput> = {
  method: "manual",
  async connect({ wabaId, phoneNumberId, token }) {
    try {
      const phone = await getPhoneNumber(token, phoneNumberId);
      if (phone.id !== phoneNumberId) return { ok: false, error: "A Meta não reconheceu este Phone Number ID." };

      const numbers = await listWabaPhoneNumbers(token, wabaId);
      if (!numbers.some((n) => n.id === phoneNumberId)) {
        return { ok: false, error: "Este Phone Number ID não pertence ao WABA ID informado." };
      }

      let warning: string | null = null;
      try {
        await subscribeApp(token, wabaId);
      } catch {
        warning =
          "As credenciais são válidas, mas não foi possível inscrever o aplicativo para receber os webhooks desta conta. Confira a permissão whatsapp_business_management do token e a configuração de webhooks no aplicativo da Meta.";
      }

      return {
        ok: true,
        channel: {
          method: "manual",
          wabaId,
          phoneNumberId,
          token,
          displayPhone: phone.display_phone_number ?? null,
          verifiedName: phone.verified_name ?? null,
          qualityRating: phone.quality_rating ?? null,
          warning,
        },
      };
    } catch (error) {
      const failure = describeSendFailure(error);
      return {
        ok: false,
        error: failure.channelIssue
          ? "A Meta recusou o token informado. Verifique se ele é permanente e tem as permissões whatsapp_business_messaging e whatsapp_business_management."
          : failure.code === "100"
            ? "A Meta não encontrou o WABA ID ou o Phone Number ID com este token."
            : `Não foi possível validar as credenciais na Meta. ${failure.message}`,
      };
    }
  },
};
