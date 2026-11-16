/**
 * Corpos de webhook no formato da Meta WhatsApp Cloud API, para testes.
 * Todos os números e nomes são fictícios.
 */

type MessageOptions = {
  phoneNumberId?: string;
  from?: string | null;
  userId?: string;
  name?: string;
  id?: string;
  timestamp?: number;
  type?: "text" | "image" | "audio" | "document" | "sticker";
  text?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
  caption?: string;
};

function envelope(phoneNumberId: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "900000000000000",
        changes: [
          {
            field: "messages",
            value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5511900000000", phone_number_id: phoneNumberId }, ...value },
          },
        ],
      },
    ],
  };
}

export function inboundMessage(options: MessageOptions = {}) {
  const {
    phoneNumberId = "100000000000001",
    from = "5511911110001",
    userId,
    name = "Cliente Fictício",
    id = "wamid.TESTE0001",
    timestamp = 1_800_000_000,
    type = "text",
    text = "Olá, quero saber sobre o pacote",
    mediaId = "media-0001",
    mime,
    filename,
    caption,
  } = options;

  const message: Record<string, unknown> = { id, timestamp: String(timestamp), type };
  if (from) message.from = from;
  if (userId) message.from_user_id = userId;
  if (type === "text") message.text = { body: text };
  if (type === "image") message.image = { id: mediaId, mime_type: mime ?? "image/jpeg", sha256: "abc", ...(caption ? { caption } : {}) };
  if (type === "audio") message.audio = { id: mediaId, mime_type: mime ?? "audio/ogg; codecs=opus", voice: true };
  if (type === "document") message.document = { id: mediaId, mime_type: mime ?? "application/pdf", filename: filename ?? "roteiro.pdf" };
  if (type === "sticker") message.sticker = { id: mediaId, mime_type: "image/webp" };

  const contact: Record<string, unknown> = { profile: { name } };
  if (from) contact.wa_id = from;
  if (userId) contact.user_id = userId;
  return envelope(phoneNumberId, { contacts: [contact], messages: [message] });
}

export function statusUpdate(options: { phoneNumberId?: string; id?: string; status?: string; timestamp?: number; errorCode?: number } = {}) {
  const { phoneNumberId = "100000000000001", id = "wamid.SAIDA0001", status = "delivered", timestamp = 1_800_000_100, errorCode } = options;
  const item: Record<string, unknown> = { id, status, timestamp: String(timestamp), recipient_id: "5511911110001" };
  if (errorCode) item.errors = [{ code: errorCode, title: "Erro informado pela Meta", error_data: { details: "detalhe" } }];
  return envelope(phoneNumberId, { statuses: [item] });
}
