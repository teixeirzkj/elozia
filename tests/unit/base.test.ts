import { describe, expect, it } from "vitest";
import { optMoney, parseMoneyToCents } from "@/lib/action";
import { parseCsv } from "@/lib/csv";
import { detectFileType, safeFileName, validateImage } from "@/lib/files";
import { assignableRoles, can, isManager, ROLES } from "@/lib/permissions";
import { fromWaId, normalizePhone, toWaId } from "@/lib/phone";
import { csvCell, formatPhone, toCsv, utcToZonedParts, zonedToUtc } from "@/lib/utils";
import { newPasswordSchema, safeNextPath, signUpSchema } from "@/modules/auth/schemas";
import { parseContactsCsv } from "@/modules/contacts/import";
import { contactSchema } from "@/modules/contacts/schemas";
import { bookingSchema } from "@/modules/pipeline/schemas";

describe("telefone E.164", () => {
  it.each([
    ["(11) 91234-5678", "+5511912345678"],
    ["11912345678", "+5511912345678"],
    ["011 91234 5678", "+5511912345678"],
    ["5511912345678", "+5511912345678"],
    ["+55 11 91234-5678", "+5511912345678"],
    ["(11) 3123-4567", "+551131234567"],
    ["+351 912 345 678", "+351912345678"],
    ["00 351 912345678", "+351912345678"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "   ", "123", "abc", "(00) 91234-5678", "11 81234-5678", "+55119", "99999999999999999999"])(
    "recusa %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it("converte de e para o identificador da Meta", () => {
    expect(toWaId("+5511912345678")).toBe("5511912345678");
    expect(fromWaId("5511912345678")).toBe("+5511912345678");
    // celular brasileiro sem o nono dígito, como a Meta às vezes envia
    expect(fromWaId("554891234567")).toBe("+5548991234567");
    // fixo brasileiro permanece com 8 dígitos
    expect(fromWaId("551131234567")).toBe("+551131234567");
    expect(fromWaId("351912345678")).toBe("+351912345678");
    expect(fromWaId("12")).toBeNull();
  });

  it("formata para exibição", () => {
    expect(formatPhone("+5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatPhone(null)).toBe("—");
  });
});

describe("CSV", () => {
  it("lê aspas, separador ; e quebras de linha em campos", () => {
    expect(parseCsv('nome;obs\r\n"Silva; Ana";"linha 1\nlinha 2"\r\n"Diz ""oi""";x\r\n')).toEqual([
      ["nome", "obs"],
      ["Silva; Ana", "linha 1\nlinha 2"],
      ['Diz "oi"', "x"],
    ]);
  });

  it("detecta vírgula e ignora BOM e linhas vazias", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("neutraliza fórmulas e escapa separadores na exportação", () => {
    expect(csvCell("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(csvCell("+5511")).toBe("'+5511");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(toCsv(["x"], [[1], [null]])).toBe("﻿x\r\n1\r\n");
  });
});

describe("importação de contatos", () => {
  it("valida linha a linha e relata os problemas", () => {
    const result = parseContactsCsv(
      [
        "Nome;Telefone;E-mail;Consentimento",
        "Ana Teste;(11) 91234-5678;ana@exemplo.test;sim",
        ";(11) 91234-0000;;",
        "Bruno Teste;123;;",
        "Carla Teste;11912345678;;não",
        "Diego Teste;;email-invalido;",
        "Elisa Teste;;;",
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { name: "Ana Teste", phone_e164: "+5511912345678", email: "ana@exemplo.test", notes: null, consent: true },
      { name: "Elisa Teste", phone_e164: null, email: null, notes: null, consent: false },
    ]);
    expect(result.issues.map((i) => [i.line, i.reason.split(":")[0]])).toEqual([
      [3, "Nome em branco."],
      [4, "Telefone inválido"],
      [5, "Telefone repetido no arquivo."],
      [6, "E-mail inválido"],
    ]);
  });

  it("exige a coluna nome e ao menos um contato", () => {
    expect(parseContactsCsv("telefone\n11912345678")).toMatchObject({ ok: false });
    expect(parseContactsCsv("nome")).toMatchObject({ ok: false });
  });

  it("recusa arquivos acima do limite de linhas", () => {
    const big = "nome\n" + Array.from({ length: 2001 }, (_, i) => `Contato ${i}`).join("\n");
    expect(parseContactsCsv(big)).toMatchObject({ ok: false });
  });
});

describe("valores e formulários", () => {
  it("converte reais digitados em centavos", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 99,9")).toBe(9990);
    expect(parseMoneyToCents("1234.5")).toBe(123450);
    expect(parseMoneyToCents("")).toBeNull();
    expect(optMoney.safeParse("abc").success).toBe(false);
    expect(optMoney.parse("0,10")).toBe(10);
  });

  it("contato: normaliza telefone e recusa telefone inválido", () => {
    const base = { name: " Ana ", source: "manual", marketing_consent: "unknown", tags: [] };
    const ok = contactSchema.parse({ ...base, phone: "(11) 91234-5678", email: " ANA@Exemplo.test " });
    expect(ok).toMatchObject({ name: "Ana", phone: "+5511912345678", email: "ana@exemplo.test", owner_id: null, notes: null });
    expect(contactSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("reserva: recusa número de cartão nas observações", () => {
    const base = {
      contact_id: "4b7c1c3e-5c53-4d6e-9d55-0b1f3f6f8a11",
      travelers: "2",
      total: "1000,00",
      status: "confirmed",
      payment_status: "paid",
      payment_method: "cartao",
    };
    expect(bookingSchema.safeParse({ ...base, payment_notes: "Pago em 3x" }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, payment_notes: "cartão 4111 1111 1111 1111" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...base, total: "" }).success).toBe(false);
  });
});

describe("autenticação", () => {
  it("só aceita destinos internos após o login", () => {
    expect(safeNextPath("/contatos?x=1")).toBe("/contatos?x=1");
    for (const bad of ["https://malicioso.test", "//malicioso.test", "/\\malicioso.test", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });

  it("exige senha com letras, números e 8 caracteres", () => {
    const base = { full_name: "Ana", agency_name: "Agência Teste", email: "Ana@Exemplo.test" };
    expect(signUpSchema.safeParse({ ...base, password: "abc12345" }).success).toBe(true);
    expect(signUpSchema.parse({ ...base, password: "abc12345" }).email).toBe("ana@exemplo.test");
    for (const password of ["curta1", "somenteletras", "12345678"]) {
      expect(signUpSchema.safeParse({ ...base, password }).success).toBe(false);
    }
    expect(newPasswordSchema.safeParse({ password: "abc12345", confirm: "abc12346" }).success).toBe(false);
  });
});

describe("permissões", () => {
  it("segue a matriz de papéis", () => {
    expect(can("agent", "crm.write")).toBe(true);
    expect(can("agent", "crm.delete")).toBe(false);
    expect(can("agent", "reports.view")).toBe(false);
    expect(can("supervisor", "catalog.manage")).toBe(true);
    expect(can("supervisor", "team.manage")).toBe(false);
    expect(can("admin", "channels.manage")).toBe(true);
    for (const role of ROLES) expect(can(role, "inbox.attend")).toBe(true);
    expect(ROLES.filter(isManager)).toEqual(["owner", "admin", "supervisor"]);
  });

  it("ninguém atribui o papel de proprietário; administrador não cria administrador", () => {
    expect(assignableRoles("owner")).toEqual(["admin", "supervisor", "agent"]);
    expect(assignableRoles("admin")).toEqual(["supervisor", "agent"]);
    expect(assignableRoles("supervisor")).toEqual([]);
    expect(assignableRoles("agent")).toEqual([]);
  });
});

describe("fuso horário", () => {
  it("converte horário local da agência em UTC e de volta", () => {
    expect(zonedToUtc("2026-03-10", "09:30", "America/Sao_Paulo").toISOString()).toBe("2026-03-10T12:30:00.000Z");
    expect(zonedToUtc("2026-03-10", "09:30", "America/Manaus").toISOString()).toBe("2026-03-10T13:30:00.000Z");
    expect(zonedToUtc("2026-03-10", "23:00", "America/Noronha").toISOString()).toBe("2026-03-11T01:00:00.000Z");
    expect(utcToZonedParts("2026-03-11T01:00:00.000Z", "America/Noronha")).toEqual({ date: "2026-03-10", time: "23:00" });
  });
});

describe("arquivos", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(32).fill(0)]);

  it("identifica o tipo pela assinatura, não pela extensão", () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7 ..."))?.mime).toBe("application/pdf");
    expect(detectFileType(new TextEncoder().encode("OggS........"))?.mime).toBe("audio/ogg");
    expect(detectFileType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(detectFileType(bytes(0x4d, 0x5a))).toBeNull(); // executável
  });

  it("valida imagens e limpa nomes de arquivo", () => {
    expect(validateImage(bytes(0xff, 0xd8, 0xff)).ok).toBe(true);
    expect(validateImage(new TextEncoder().encode("%PDF-1.7")).ok).toBe(false);
    expect(validateImage(new Uint8Array(0)).ok).toBe(false);
    expect(safeFileName("../../etc/passwd")).not.toContain("..");
    expect(safeFileName("Orçamento Família (v2).pdf")).toBe("Orcamento Familia _v2_.pdf");
  });
});
