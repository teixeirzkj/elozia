import { z } from "zod";
import { fromWaId } from "@/lib/phone";

/**
 * Leitura do corpo dos webhooks da Meta (campo "messages").
 * Transforma o JSON em eventos simples; tudo que não é reconhecido é ignorado,
 * nunca derruba o processamento.
 */

const mediaSchema = z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional(), filename: z.string().optional() }).loose();

const messageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().optional(),
    from_user_id: z.string().optional(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).loose().optional(),
    image: mediaSchema.optional(),
    audio: mediaSchema.optional(),
    document: mediaSchema.optional(),
    video: mediaSchema.optional(),
    button: z.object({ text: z.string().optional() }).loose().optional(),
    interactive: z.unknown().optional(),
  })
  .loose();

const statusSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    timestamp: z.string().optional(),
    errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() }).loose()).optional(),
  })
  .loose();

const valueSchema = z
  .object({
    metadata: z.object({ phone_number_id: z.string().min(1) }).loose(),
    contacts: z
      .array(z.object({ wa_id: z.string().optional(), user_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).loose().optional() }).loose())
      .optional(),
    messages: z.array(z.unknown()).optional(),
    statuses: z.array(z.unknown()).optional(),
  })
  .loose();

const payloadSchema = z
  .object({
    object: z.string(),
    entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.unknown() }).loose()).optional() }).loose()),
  })
  .loose();

export type MessageType = "text" | "image" | "audio" | "document" | "video" | "unsupported";

export type InboundMessageEvent = {
  kind: "message";
  phoneNumberId: string;
  waMessageId: string;
  waId: string | null;
  phoneE164: string | null;
  waUserId: string | null;
  profileName: string | null;
  type: MessageType;
  body: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  sentAt: string | null;
};

export type StatusEvent = {
  kind: "status";
  phoneNumberId: string;
  waMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  at: string | null;
};

export type WebhookEvent = InboundMessageEvent | StatusEvent;

function toIso(timestamp: string | undefined): string | null {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

const MEDIA_TYPES = ["image", "audio", "document", "video"] as const;

export function parseWebhook(raw: unknown): { events: WebhookEvent[]; phoneNumberIds: string[] } {
  const payload = payloadSchema.safeParse(raw);
  if (!payload.success || payload.data.object !== "whatsapp_business_account") return { events: [], phoneNumberIds: [] };

  const events: WebhookEvent[] = [];
  const phoneNumberIds = new Set<string>();

  for (const entry of payload.data.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = valueSchema.safeParse(change.value);
      if (!value.success) continue;
      const phoneNumberId = value.data.metadata.phone_number_id;
      phoneNumberIds.add(phoneNumberId);
      const contacts = value.data.contacts ?? [];

      for (const item of value.data.messages ?? []) {
        const message = messageSchema.safeParse(item);
        if (!message.success) continue;
        const m = message.data;
        const contact = contacts.find((c) => (m.from && c.wa_id === m.from) || (m.from_user_id && c.user_id === m.from_user_id)) ?? contacts[0];
        const waId = m.from ?? contact?.wa_id ?? null;

        let type: MessageType = "unsupported";
        let body: string | null = null;
        let media: z.infer<typeof mediaSchema> | undefined;
        if (m.type === "text" && m.text) {
          type = "text";
          body = m.text.body;
        } else if (m.type === "button" && m.button?.text) {
          type = "text";
          body = m.button.text;
        } else if ((MEDIA_TYPES as readonly string[]).includes(m.type)) {
          media = m[m.type as (typeof MEDIA_TYPES)[number]];
          if (media) {
            type = m.type as MessageType;
            body = media.caption ?? null;
          }
        }
        if (type === "unsupported") body = "Mensagem de um tipo que o sistema ainda não exibe. Veja no aplicativo do WhatsApp.";

        events.push({
          kind: "message",
          phoneNumberId,
          waMessageId: m.id,
          waId,
          phoneE164: waId ? fromWaId(waId) : null,
          waUserId: m.from_user_id ?? contact?.user_id ?? null,
          profileName: contact?.profile?.name?.slice(0, 160) ?? null,
          type,
          body,
          mediaId: media?.id ?? null,
          mediaMime: media?.mime_type?.split(";")[0]?.trim() ?? null,
          mediaName: media?.filename ?? null,
          sentAt: toIso(m.timestamp),
        });
      }

      for (const item of value.data.statuses ?? []) {
        const status = statusSchema.safeParse(item);
        if (!status.success) continue;
        const s = status.data;
        if (s.status !== "sent" && s.status !== "delivered" && s.status !== "read" && s.status !== "failed") continue;
        const error = s.errors?.[0];
        events.push({
          kind: "status",
          phoneNumberId,
          waMessageId: s.id,
          status: s.status,
          errorCode: error?.code != null ? String(error.code) : null,
          errorMessage: error?.title ?? error?.message ?? null,
          at: toIso(s.timestamp),
        });
      }
    }
  }
  return { events, phoneNumberIds: [...phoneNumberIds] };
}

export function dedupeKey(event: WebhookEvent): string {
  return event.kind === "message" ? `msg:${event.waMessageId}` : `st:${event.waMessageId}:${event.status}`;
}

// --- Janela de atendimento --------------------------------------------------

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Janela de atendimento da Meta: mensagens livres só dentro de 24 horas desde
 * a última mensagem do cliente. Fora dela, apenas templates aprovados.
 */
export function serviceWindow(lastInboundAt: string | null | undefined, now: number = Date.now()): { open: boolean; expiresAt: string | null } {
  if (!lastInboundAt) return { open: false, expiresAt: null };
  const expires = new Date(lastInboundAt).getTime() + SERVICE_WINDOW_MS;
  return { open: now < expires, expiresAt: new Date(expires).toISOString() };
}
