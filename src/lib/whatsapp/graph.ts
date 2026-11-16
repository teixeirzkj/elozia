import "server-only";

import { metaGraphVersion } from "@/lib/env";
import { MetaApiError } from "./errors";

/**
 * Cliente mínimo da Graph API da Meta (WhatsApp Cloud API oficial).
 * O token nunca é registrado em log nem devolvido em mensagens de erro.
 */

const GRAPH_HOST = "https://graph.facebook.com";
const TIMEOUT_MS = 20_000;

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);

/** Somente para testes: troca a função de rede. */
export function __setFetchForTests(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

function assertId(id: string): string {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new MetaApiError(null, 400, "Identificador inválido.");
  return id;
}

async function parseError(res: Response): Promise<MetaApiError> {
  let code: number | null = null;
  let detail = "";
  try {
    const json = (await res.json()) as { error?: { code?: number; message?: string; error_data?: { details?: string } } };
    code = typeof json.error?.code === "number" ? json.error.code : null;
    detail = json.error?.error_data?.details ?? json.error?.message ?? "";
  } catch {
    // corpo não era JSON
  }
  return new MetaApiError(code, res.status, detail.slice(0, 300));
}

async function graph<T>(token: string, path: string, init: { method?: string; json?: unknown; form?: FormData; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${GRAPH_HOST}/${metaGraphVersion()}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init.json ? { "Content-Type": "application/json" } : {}) },
      body: init.json ? JSON.stringify(init.json) : init.form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new MetaApiError(null, 0, "Falha de rede ao chamar a Meta.");
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

// --- Número e conta ---------------------------------------------------------

export type PhoneNumberInfo = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
};

export function getPhoneNumber(token: string, phoneNumberId: string): Promise<PhoneNumberInfo> {
  return graph(token, assertId(phoneNumberId), { query: { fields: "id,display_phone_number,verified_name,quality_rating,status" } });
}

export async function listWabaPhoneNumbers(token: string, wabaId: string): Promise<PhoneNumberInfo[]> {
  const res = await graph<{ data?: PhoneNumberInfo[] }>(token, `${assertId(wabaId)}/phone_numbers`, {
    query: { fields: "id,display_phone_number,verified_name,quality_rating", limit: "100" },
  });
  return res.data ?? [];
}

/** Inscreve o aplicativo dono do token para receber os webhooks desta conta. */
export function subscribeApp(token: string, wabaId: string): Promise<{ success?: boolean }> {
  return graph(token, `${assertId(wabaId)}/subscribed_apps`, { method: "POST" });
}

// --- Mensagens --------------------------------------------------------------

/** Destinatário: telefone (wa_id) ou, quando não houver, o identificador de usuário da Meta. */
export type Recipient = { waId: string | null; userId: string | null };

function recipientFields(recipient: Recipient): Record<string, string> {
  if (recipient.waId) return { to: recipient.waId.startsWith("+") ? recipient.waId : `+${recipient.waId}` };
  if (recipient.userId) return { recipient: recipient.userId };
  throw new MetaApiError(null, 400, "Conversa sem destinatário.");
}

export type OutboundContent =
  | { type: "text"; body: string }
  | { type: "image" | "audio" | "document" | "video"; mediaId: string; caption?: string | null; filename?: string | null }
  | { type: "template"; name: string; language: string; components: unknown[] };

export function buildMessagePayload(recipient: Recipient, content: OutboundContent): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", ...recipientFields(recipient) };
  if (content.type === "text") return { ...base, type: "text", text: { preview_url: false, body: content.body } };
  if (content.type === "template") {
    return {
      ...base,
      type: "template",
      template: { name: content.name, language: { code: content.language }, ...(content.components.length ? { components: content.components } : {}) },
    };
  }
  const media: Record<string, string> = { id: content.mediaId };
  if (content.caption && (content.type === "image" || content.type === "document" || content.type === "video")) media.caption = content.caption;
  if (content.filename && content.type === "document") media.filename = content.filename;
  return { ...base, type: content.type, [content.type]: media };
}

export async function sendMessage(token: string, phoneNumberId: string, recipient: Recipient, content: OutboundContent): Promise<string> {
  const res = await graph<{ messages?: Array<{ id?: string }> }>(token, `${assertId(phoneNumberId)}/messages`, {
    method: "POST",
    json: buildMessagePayload(recipient, content),
  });
  const id = res.messages?.[0]?.id;
  if (!id) throw new MetaApiError(null, 502, "A Meta não devolveu o identificador da mensagem.");
  return id;
}

export async function markAsRead(token: string, phoneNumberId: string, waMessageId: string): Promise<void> {
  await graph(token, `${assertId(phoneNumberId)}/messages`, {
    method: "POST",
    json: { messaging_product: "whatsapp", status: "read", message_id: waMessageId },
  });
}

// --- Mídia ------------------------------------------------------------------

export async function uploadMedia(token: string, phoneNumberId: string, bytes: Uint8Array, mime: string, filename: string): Promise<string> {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mime);
  form.set("file", new Blob([bytes as BlobPart], { type: mime }), filename);
  const res = await graph<{ id?: string }>(token, `${assertId(phoneNumberId)}/media`, { method: "POST", form });
  if (!res.id) throw new MetaApiError(null, 502, "A Meta não devolveu o identificador da mídia.");
  return res.id;
}

export type MediaInfo = { url: string; mime_type?: string; file_size?: number };

export function getMediaInfo(token: string, mediaId: string): Promise<MediaInfo> {
  return graph(token, assertId(mediaId));
}

/** Baixa a mídia de uma URL temporária da Meta (exige o token; só aceita hosts da Meta). */
export async function downloadMedia(token: string, url: string, maxBytes: number): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !/(^|\.)(facebook\.com|fbcdn\.net|whatsapp\.net|fbsbx\.com)$/.test(parsed.hostname)) {
    throw new MetaApiError(null, 400, "Endereço de mídia inesperado.");
  }
  let res: Response;
  try {
    res = await fetchImpl(parsed, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new MetaApiError(null, 0, "Falha de rede ao baixar a mídia.");
  }
  if (!res.ok) throw new MetaApiError(null, res.status, "Falha ao baixar a mídia.");
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new MetaApiError(131052, 413, "Mídia maior que o limite.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new MetaApiError(131052, 413, "Mídia maior que o limite.");
  return bytes;
}

// --- Templates --------------------------------------------------------------

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: unknown[];
};

/** Lista todos os templates da conta, seguindo a paginação por cursor. */
export async function listTemplates(token: string, wabaId: string): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 30; page++) {
    const res = await graph<{ data?: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      token,
      `${assertId(wabaId)}/message_templates`,
      { query: { fields: "id,name,language,status,category,components", limit: "100", ...(after ? { after } : {}) } },
    );
    out.push(...(res.data ?? []));
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}
