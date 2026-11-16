/**
 * Validação de arquivos enviados: o tipo é conferido pelos primeiros bytes
 * (assinatura), não pela extensão nem pelo tipo declarado pelo navegador.
 */

export type DetectedFile = { mime: string; ext: string };

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

export function detectFileType(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (ascii(bytes, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0 && ((bytes[1] ?? 0) & 0x06) !== 0)) {
    return { mime: "audio/mpeg", ext: "mp3" };
  }
  if (ascii(bytes, 0, 6) === "#!AMR\n") return { mime: "audio/amr", ext: "amr" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand.startsWith("M4A")) return { mime: "audio/mp4", ext: "m4a" };
    return { mime: "video/mp4", ext: "mp4" };
  }
  // Documentos do Office modernos são arquivos ZIP; a distinção vem da extensão informada.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { mime: "application/x-ole-storage", ext: "ole" };
  return null;
}

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export function validateImage(bytes: Uint8Array): { ok: true; file: DetectedFile } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: "Arquivo vazio." };
  if (bytes.byteLength > IMAGE_MAX_BYTES) return { ok: false, error: "A imagem excede 4 MB." };
  const file = detectFileType(bytes);
  if (!file || !IMAGE_MIMES.includes(file.mime)) return { ok: false, error: "Envie uma imagem JPG, PNG ou WebP." };
  return { ok: true, file };
}

/** Nome de arquivo seguro para exibição e armazenamento. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim();
  return cleaned.slice(-120) || "arquivo";
}
