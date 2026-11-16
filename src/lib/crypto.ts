import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Criptografia de segredos em repouso (tokens da Meta): AES-256-GCM.
 * Formato: v1.<iv>.<tag>.<cifra>, tudo em base64url. A chave vem de
 * ENCRYPTION_KEY (32 bytes em base64) e nunca sai do servidor.
 */

const VERSION = "v1";

export function parseKey(raw: string | undefined | null): Buffer {
  if (!raw) throw new Error("ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY deve ter 32 bytes codificados em base64.");
  return key;
}

function key(): Buffer {
  if (typeof window !== "undefined") throw new Error("Criptografia disponível somente no servidor.");
  return parseKey(process.env.ENCRYPTION_KEY);
}

export function encryptSecret(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, k: Buffer = key()): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Segredo em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Comparação em tempo constante de duas strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Confere o cabeçalho X-Hub-Signature-256 da Meta: HMAC-SHA256 do corpo BRUTO
 * com o App Secret, no formato "sha256=<hex>".
 */
export function verifyMetaSignature(rawBody: string | Buffer, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(header.slice("sha256=".length).toLowerCase(), expected);
}

export function signMetaPayload(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}
