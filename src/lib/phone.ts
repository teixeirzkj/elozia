/**
 * Normalização de telefones para E.164.
 * Números sem código de país são tratados como brasileiros (+55).
 */

const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}

/** Devolve o telefone em E.164 ou null quando não é possível normalizar. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits === "") return null;

  if (hasPlus) {
    const candidate = `+${digits}`;
    if (!isE164(candidate)) return null;
    return candidate.startsWith("+55") ? validBrazilian(candidate) : candidate;
  }

  // Prefixos de discagem: 00 (internacional) e 0 antes do DDD.
  if (digits.startsWith("00")) {
    // Com o prefixo 00 exigimos código de país + número completo (10 dígitos ou mais).
    const candidate = `+${digits.slice(2)}`;
    return digits.length >= 12 && isE164(candidate) ? candidate : null;
  }
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (digits.length === 10 || digits.length === 11) return validBrazilian(`+55${digits}`);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return validBrazilian(`+${digits}`);
  return null;
}

function validBrazilian(e164: string): string | null {
  const national = e164.slice(3);
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  // Celulares têm 9 dígitos e começam com 9; fixos têm 8 e começam de 2 a 5.
  if (national.length === 11 && national[2] !== "9") return null;
  if (national.length === 10 && !/[2-5]/.test(national[2] ?? "")) return null;
  return e164;
}

/** Identificador usado pela Meta (E.164 sem o sinal de mais). */
export function toWaId(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Converte o identificador da Meta em E.164. Para celulares brasileiros a Meta
 * pode omitir o nono dígito; nesse caso ele é reposto para casar com o cadastro.
 */
export function fromWaId(waId: string): string | null {
  const digits = waId.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 12 && /[6-9]/.test(digits[4] ?? "")) {
    return `+${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  const candidate = `+${digits}`;
  return isE164(candidate) ? candidate : null;
}
