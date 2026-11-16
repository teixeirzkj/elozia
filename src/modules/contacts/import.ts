import { z } from "zod";
import { normalizeHeader, parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/phone";

/** Lógica pura da importação de contatos por CSV (testável sem banco). */

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 1024 * 1024;

const HEADER_ALIASES: Record<string, "name" | "phone" | "email" | "notes" | "consent"> = {
  nome: "name",
  name: "name",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  phone: "phone",
  email: "email",
  e_mail: "email",
  observacoes: "notes",
  observacao: "notes",
  notas: "notes",
  notes: "notes",
  consentimento: "consent",
  autoriza_mensagens: "consent",
};

export type ImportRow = {
  name: string;
  phone_e164: string | null;
  email: string | null;
  notes: string | null;
  consent: boolean;
};

export type ImportIssue = { line: number; reason: string };

export type ImportParseResult =
  | { ok: false; error: string }
  | { ok: true; rows: ImportRow[]; issues: ImportIssue[]; totalLines: number };

const emailCheck = z.email();
const YES = new Set(["sim", "s", "yes", "y", "1", "true", "verdadeiro", "autorizado"]);

export function parseContactsCsv(text: string): ImportParseResult {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "O arquivo precisa ter uma linha de cabeçalho e ao menos um contato." };

  const header = (table[0] ?? []).map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
  if (!header.includes("name")) {
    return { ok: false, error: 'O cabeçalho precisa ter a coluna "nome". Colunas aceitas: nome, telefone, email, observacoes, consentimento.' };
  }
  const body = table.slice(1);
  if (body.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `O arquivo tem ${body.length} linhas. O limite por importação é ${IMPORT_MAX_ROWS}.` };
  }

  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seenPhones = new Set<string>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const get = (key: string) => {
      const col = header.indexOf(key as never);
      return col >= 0 ? (cells[col] ?? "").trim() : "";
    };
    const name = get("name");
    if (!name) return void issues.push({ line, reason: "Nome em branco." });
    if (name.length > 160) return void issues.push({ line, reason: "Nome com mais de 160 caracteres." });

    const rawPhone = get("phone");
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) return void issues.push({ line, reason: `Telefone inválido: ${rawPhone.slice(0, 30)}` });
    if (phone && seenPhones.has(phone)) return void issues.push({ line, reason: "Telefone repetido no arquivo." });

    const rawEmail = get("email").toLowerCase();
    if (rawEmail && !emailCheck.safeParse(rawEmail).success) {
      return void issues.push({ line, reason: `E-mail inválido: ${rawEmail.slice(0, 60)}` });
    }
    if (phone) seenPhones.add(phone);
    rows.push({
      name,
      phone_e164: phone,
      email: rawEmail || null,
      notes: get("notes").slice(0, 5000) || null,
      consent: YES.has(get("consent").toLowerCase()),
    });
  });

  return { ok: true, rows, issues, totalLines: body.length };
}
