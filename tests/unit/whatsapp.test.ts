import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKey, sha256Hex, signMetaPayload, verifyMetaSignature } from "@/lib/crypto";
import { describeMetaError, describeSendFailure, MetaApiError } from "@/lib/whatsapp/errors";
import { __setFetchForTests, buildMessagePayload, downloadMedia, listTemplates, sendMessage } from "@/lib/whatsapp/graph";
import { classifyOutboundFile } from "@/lib/whatsapp/service";
import { buildTemplateComponents, describeTemplate, resolveVariables } from "@/lib/whatsapp/templates";
import { dedupeKey, parseWebhook, serviceWindow } from "@/lib/whatsapp/webhook";
import { authenticateWebhook, verifySubscription } from "@/lib/whatsapp/webhook-handler";
import { inboundMessage, statusUpdate } from "../mocks/whatsapp";

const GLOBAL_SECRET = "segredo-global-de-teste";
const OWN_SECRET = "segredo-proprio-da-agencia-b";
const PHONE_A = "100000000000001"; // usa o aplicativo global
const PHONE_B = "200000000000002"; // usa aplicativo próprio

const secrets = {
  globalAppSecret: GLOBAL_SECRET,
  channelSecret: async (phone: string) => (phone === PHONE_A ? null : phone === PHONE_B ? OWN_SECRET : undefined),
};

describe("criptografia dos tokens", () => {
  const key = randomBytes(32);

  it("cifra e decifra; cada cifra é diferente", () => {
    const a = encryptSecret("EAAG-token-ficticio", key);
    const b = encryptSecret("EAAG-token-ficticio", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("EAAG");
    expect(decryptSecret(a, key)).toBe("EAAG-token-ficticio");
  });

  it("recusa chave errada e conteúdo adulterado", () => {
    const payload = encryptSecret("segredo", key);
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow();
    const parts = payload.split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret("texto-puro", key)).toThrow();
  });

  it("exige chave de 32 bytes", () => {
    expect(() => parseKey(undefined)).toThrow();
    expect(() => parseKey(Buffer.from("curta").toString("base64"))).toThrow();
    expect(parseKey(key.toString("base64"))).toHaveLength(32);
  });
});

describe("assinatura do webhook", () => {
  const body = JSON.stringify(inboundMessage());

  it("aceita assinatura correta sobre o corpo bruto", () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, GLOBAL_SECRET), GLOBAL_SECRET)).toBe(true);
  });

  it("recusa assinatura ausente, malformada, de outro segredo ou corpo alterado", () => {
    const good = signMetaPayload(body, GLOBAL_SECRET);
    expect(verifyMetaSignature(body, null, GLOBAL_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, good.replace("sha256=", ""), GLOBAL_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=00", GLOBAL_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, signMetaPayload(body, "outro"), GLOBAL_SECRET)).toBe(false);
    expect(verifyMetaSignature(body + " ", good, GLOBAL_SECRET)).toBe(false);
    // o mesmo JSON reformatado não confere: a conferência é sobre os bytes recebidos
    expect(verifyMetaSignature(JSON.stringify(JSON.parse(body), null, 2), good, GLOBAL_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, good, "")).toBe(false);
  });
});

describe("autenticação e roteamento do webhook", () => {
  it("recusa sem assinatura ou com assinatura inválida, sem devolver eventos", async () => {
    const body = JSON.stringify(inboundMessage({ phoneNumberId: PHONE_A }));
    expect(await authenticateWebhook(body, null, secrets)).toMatchObject({ ok: false, status: 401 });
    expect(await authenticateWebhook(body, signMetaPayload(body, "errado"), secrets)).toMatchObject({ ok: false, status: 401 });
    expect(await authenticateWebhook("{não é json", signMetaPayload("{não é json", GLOBAL_SECRET), secrets)).toMatchObject({ ok: false, status: 400 });
  });

  it("aceita o aplicativo global para canal que usa o aplicativo global", async () => {
    const body = JSON.stringify(inboundMessage({ phoneNumberId: PHONE_A }));
    const result = await authenticateWebhook(body, signMetaPayload(body, GLOBAL_SECRET), secrets);
    expect(result.ok && result.events).toHaveLength(1);
  });

  it("canal com aplicativo próprio só aceita o próprio segredo", async () => {
    const body = JSON.stringify(inboundMessage({ phoneNumberId: PHONE_B }));
    expect(await authenticateWebhook(body, signMetaPayload(body, GLOBAL_SECRET), secrets)).toMatchObject({ ok: false, status: 401 });
    const result = await authenticateWebhook(body, signMetaPayload(body, OWN_SECRET), secrets);
    expect(result.ok && result.events).toHaveLength(1);
  });

  it("o segredo de uma agência não autentica eventos para o número de outra", async () => {
    const body = JSON.stringify(inboundMessage({ phoneNumberId: PHONE_A }));
    expect(await authenticateWebhook(body, signMetaPayload(body, OWN_SECRET), secrets)).toMatchObject({ ok: false, status: 401 });
  });

  it("em um lote misto, só passam os eventos do canal cuja assinatura confere", async () => {
    const a = inboundMessage({ phoneNumberId: PHONE_A, id: "wamid.A" });
    const b = inboundMessage({ phoneNumberId: PHONE_B, id: "wamid.B" });
    const body = JSON.stringify({ ...a, entry: [...a.entry, ...b.entry] });
    const result = await authenticateWebhook(body, signMetaPayload(body, OWN_SECRET), secrets);
    expect(result.ok && result.events.map((e) => e.waMessageId)).toEqual(["wamid.B"]);
  });

  it("número desconhecido nunca é confiável", async () => {
    const body = JSON.stringify(inboundMessage({ phoneNumberId: "999999999999999" }));
    expect(await authenticateWebhook(body, signMetaPayload(body, GLOBAL_SECRET), secrets)).toMatchObject({ ok: false, status: 401 });
  });

  it("verificação do endereço responde o desafio só com token válido", async () => {
    const exists = async (hash: string) => hash === sha256Hex("token-do-canal");
    const params = (token: string, mode = "subscribe") => new URLSearchParams({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": "12345" });
    expect(await verifySubscription(params("token-global"), "token-global", exists)).toBe("12345");
    expect(await verifySubscription(params("token-do-canal"), "token-global", exists)).toBe("12345");
    expect(await verifySubscription(params("errado"), "token-global", exists)).toBeNull();
    expect(await verifySubscription(params("token-global", "unsubscribe"), "token-global", exists)).toBeNull();
    expect(await verifySubscription(new URLSearchParams(), "token-global", exists)).toBeNull();
  });
});

describe("leitura do webhook", () => {
  it("extrai mensagem de texto com telefone em E.164", () => {
    const { events, phoneNumberIds } = parseWebhook(inboundMessage({ from: "5511911110001", text: "Bom dia" }));
    expect(phoneNumberIds).toEqual([PHONE_A]);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "message", phoneNumberId: PHONE_A, waId: "5511911110001", phoneE164: "+5511911110001",
        profileName: "Cliente Fictício", type: "text", body: "Bom dia", mediaId: null,
      }),
    ]);
  });

  it("extrai mídia com tipo, legenda e nome de arquivo", () => {
    const [image] = parseWebhook(inboundMessage({ type: "image", caption: "Foto do passaporte" })).events;
    expect(image).toMatchObject({ type: "image", mediaId: "media-0001", mediaMime: "image/jpeg", body: "Foto do passaporte" });
    const [audio] = parseWebhook(inboundMessage({ type: "audio" })).events;
    expect(audio).toMatchObject({ type: "audio", mediaMime: "audio/ogg" });
    const [doc] = parseWebhook(inboundMessage({ type: "document" })).events;
    expect(doc).toMatchObject({ type: "document", mediaName: "roteiro.pdf" });
  });

  it("aceita contato identificado só pelo identificador de usuário da Meta", () => {
    const [event] = parseWebhook(inboundMessage({ from: null, userId: "BR.123456" })).events;
    expect(event).toMatchObject({ waId: null, phoneE164: null, waUserId: "BR.123456" });
  });

  it("tipo desconhecido vira mensagem não suportada, sem quebrar", () => {
    const [event] = parseWebhook(inboundMessage({ type: "sticker" })).events;
    expect(event).toMatchObject({ kind: "message", type: "unsupported", mediaId: null });
  });

  it("extrai status com código de erro e ignora status desconhecido", () => {
    expect(parseWebhook(statusUpdate({ status: "failed", errorCode: 131047 })).events).toEqual([
      expect.objectContaining({ kind: "status", status: "failed", errorCode: "131047" }),
    ]);
    expect(parseWebhook(statusUpdate({ status: "deleted" })).events).toEqual([]);
  });

  it("ignora corpos que não são do WhatsApp", () => {
    for (const body of [null, {}, { object: "page", entry: [] }, { object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update", value: {} }] }] }]) {
      expect(parseWebhook(body).events).toEqual([]);
    }
  });

  it("gera a mesma chave para reentregas do mesmo evento", () => {
    const first = parseWebhook(inboundMessage({ id: "wamid.X" })).events[0]!;
    const again = parseWebhook(inboundMessage({ id: "wamid.X", text: "outro texto" })).events[0]!;
    expect(dedupeKey(first)).toBe(dedupeKey(again));
    const sent = parseWebhook(statusUpdate({ id: "wamid.X", status: "sent" })).events[0]!;
    const read = parseWebhook(statusUpdate({ id: "wamid.X", status: "read" })).events[0]!;
    expect(dedupeKey(sent)).not.toBe(dedupeKey(read));
  });
});

describe("janela de atendimento de 24 horas", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("aberta até 24 horas depois da última mensagem do cliente", () => {
    expect(serviceWindow("2026-11-15T12:00:01Z", now).open).toBe(true);
    expect(serviceWindow("2026-11-16T11:59:00Z", now)).toEqual({ open: true, expiresAt: "2026-11-17T11:59:00.000Z" });
  });
  it("fechada depois de 24 horas ou sem mensagem do cliente", () => {
    expect(serviceWindow("2026-11-15T12:00:00Z", now).open).toBe(false);
    expect(serviceWindow("2026-11-10T12:00:00Z", now).open).toBe(false);
    expect(serviceWindow(null, now)).toEqual({ open: false, expiresAt: null });
  });
});

describe("templates", () => {
  const positional = [
    { type: "HEADER", format: "TEXT", text: "Olá, {{1}}" },
    { type: "BODY", text: "Sua viagem para {{1}} sai em {{2}}." },
    { type: "FOOTER", text: "Agência" },
  ];

  it("identifica variáveis e monta os componentes", () => {
    const spec = describeTemplate(positional);
    expect(spec).toMatchObject({ supported: true, headerParams: ["1"], bodyParams: ["1", "2"], named: false });
    const built = buildTemplateComponents(spec, { header_1: "Ana", body_1: "Serra Fictícia", body_2: "10/01/2030" });
    expect(built).toEqual({
      ok: true,
      components: [
        { type: "header", parameters: [{ type: "text", text: "Ana" }] },
        { type: "body", parameters: [{ type: "text", text: "Serra Fictícia" }, { type: "text", text: "10/01/2030" }] },
      ],
      rendered: "Olá, Ana\n\nSua viagem para Serra Fictícia sai em 10/01/2030.\n\nAgência",
    });
  });

  it("recusa variável vazia ou com quebra de linha", () => {
    const spec = describeTemplate(positional);
    expect(buildTemplateComponents(spec, { header_1: "Ana", body_1: "Serra" })).toMatchObject({ ok: false });
    expect(buildTemplateComponents(spec, { header_1: "Ana", body_1: "a\nb", body_2: "x" })).toMatchObject({ ok: false });
  });

  it("suporta variáveis nomeadas", () => {
    const spec = describeTemplate([{ type: "BODY", text: "Oi {{first_name}}, tudo bem?" }]);
    expect(spec.named).toBe(true);
    expect(buildTemplateComponents(spec, { body_first_name: "Ana" })).toMatchObject({
      ok: true,
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana", parameter_name: "first_name" }] }],
    });
  });

  it("marca como não suportado o que o sistema não sabe enviar", () => {
    expect(describeTemplate([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }]).supported).toBe(false);
    expect(describeTemplate([{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://exemplo.test/{{1}}" }] }]).supported).toBe(false);
    expect(describeTemplate([{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY" }] }]).supported).toBe(true);
    expect(describeTemplate([]).supported).toBe(false);
  });

  it("resolve variáveis automáticas a partir do contato e da viagem", () => {
    expect(
      resolveVariables(
        { body_1: { source: "contact_first_name" }, body_2: { source: "package_destination" }, body_3: { source: "departure_date" }, body_4: { source: "fixed", value: "Até logo" } },
        { contactName: "Ana Maria Teste", packageDestination: "Serra Fictícia", departureDate: "2030-01-10", agencyName: "Agência Demo" },
      ),
    ).toEqual({ body_1: "Ana", body_2: "Serra Fictícia", body_3: "10/01/2030", body_4: "Até logo" });
  });
});

describe("envio pela Graph API (rede simulada)", () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let responses: Array<() => Response> = [];

  beforeEach(() => {
    process.env.META_GRAPH_VERSION = "v27.0";
    calls.length = 0;
    __setFetchForTests(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses.shift();
      if (!next) throw new Error("rede indisponível");
      return next();
    });
  });
  afterEach(() => __setFetchForTests(null));

  const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("monta o corpo oficial para texto, mídia e template", () => {
    expect(buildMessagePayload({ waId: "5511911110001", userId: null }, { type: "text", body: "Oi" })).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "+5511911110001", type: "text", text: { preview_url: false, body: "Oi" },
    });
    expect(buildMessagePayload({ waId: null, userId: "BR.1" }, { type: "document", mediaId: "m1", filename: "roteiro.pdf", caption: "Segue" })).toMatchObject({
      recipient: "BR.1", type: "document", document: { id: "m1", filename: "roteiro.pdf", caption: "Segue" },
    });
    expect(buildMessagePayload({ waId: "1", userId: null }, { type: "audio", mediaId: "m2", caption: "ignorada" })).toMatchObject({ audio: { id: "m2" } });
    expect(buildMessagePayload({ waId: "1", userId: null }, { type: "template", name: "boas_vindas", language: "pt_BR", components: [] })).toMatchObject({
      type: "template", template: { name: "boas_vindas", language: { code: "pt_BR" } },
    });
    expect(() => buildMessagePayload({ waId: null, userId: null }, { type: "text", body: "x" })).toThrow();
  });

  it("envia com o token no cabeçalho e devolve o identificador da Meta", async () => {
    responses = [json({ messaging_product: "whatsapp", messages: [{ id: "wamid.OK" }] })];
    const id = await sendMessage("token-ficticio", PHONE_A, { waId: "5511911110001", userId: null }, { type: "text", body: "Oi" });
    expect(id).toBe("wamid.OK");
    expect(calls[0]!.url).toBe(`https://graph.facebook.com/v27.0/${PHONE_A}/messages`);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer token-ficticio");
    expect(calls[0]!.url).not.toContain("token-ficticio");
  });

  it("falha de envio vira erro tratável e o reenvio funciona", async () => {
    responses = [json({ error: { code: 130429, message: "Rate limit hit" } }, 400), json({ messages: [{ id: "wamid.RETRY" }] })];
    const attempt = () => sendMessage("t", PHONE_A, { waId: "5511911110001", userId: null }, { type: "text", body: "Oi" });
    const error = await attempt().catch((e) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(describeSendFailure(error)).toMatchObject({ code: "130429", retryable: true, channelIssue: false });
    expect(await attempt()).toBe("wamid.RETRY");
  });

  it("classifica erros: janela fechada, token expirado, indisponibilidade e rede", async () => {
    expect(describeSendFailure(new MetaApiError(131047, 400, ""))).toMatchObject({ retryable: false, channelIssue: false });
    expect(describeSendFailure(new MetaApiError(190, 401, ""))).toMatchObject({ retryable: false, channelIssue: true });
    expect(describeSendFailure(new MetaApiError(null, 503, ""))).toMatchObject({ retryable: true });
    expect(describeSendFailure(new Error("rede"))).toMatchObject({ retryable: true, code: null });
    expect(describeMetaError("131026").stopContact).toBe(true);
    responses = [];
    const error = await sendMessage("t", PHONE_A, { waId: "1", userId: null }, { type: "text", body: "x" }).catch((e) => e);
    expect(describeSendFailure(error).retryable).toBe(true);
  });

  it("a mensagem de erro nunca carrega o token", async () => {
    responses = [json({ error: { code: 190, message: "Invalid OAuth access token: token-ficticio-secreto" } }, 401)];
    const error = (await sendMessage("token-ficticio-secreto", PHONE_A, { waId: "1", userId: null }, { type: "text", body: "x" }).catch((e) => e)) as MetaApiError;
    expect(error.message).not.toContain("token-ficticio-secreto");
    expect(describeSendFailure(error).message).not.toContain("token-ficticio-secreto");
  });

  it("só baixa mídia de endereços da Meta e respeita o limite de tamanho", async () => {
    await expect(downloadMedia("t", "https://malicioso.test/arquivo", 1000)).rejects.toBeInstanceOf(MetaApiError);
    await expect(downloadMedia("t", "http://lookaside.fbsbx.com/x", 1000)).rejects.toBeInstanceOf(MetaApiError);
    responses = [() => new Response(new Uint8Array(2000))];
    await expect(downloadMedia("t", "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", 1000)).rejects.toBeInstanceOf(MetaApiError);
    responses = [() => new Response(new Uint8Array(10))];
    expect(await downloadMedia("t", "https://lookaside.fbsbx.com/x", 1000)).toHaveLength(10);
  });

  it("segue a paginação ao listar templates", async () => {
    responses = [
      json({ data: [{ id: "1", name: "a", language: "pt_BR", status: "APPROVED", category: "UTILITY" }], paging: { cursors: { after: "c1" }, next: "https://graph.facebook.com/next" } }),
      json({ data: [{ id: "2", name: "b", language: "pt_BR", status: "PENDING", category: "MARKETING" }], paging: { cursors: { after: "c2" } } }),
    ];
    expect((await listTemplates("t", "900000000000")).map((t) => t.name)).toEqual(["a", "b"]);
    expect(calls[1]!.url).toContain("after=c1");
  });
});

describe("arquivos enviados pelo atendente", () => {
  const pad = (head: number[] | string, size = 64) => {
    const bytes = new Uint8Array(size);
    bytes.set(typeof head === "string" ? new TextEncoder().encode(head) : head);
    return bytes;
  };

  it("aceita os tipos permitidos pelo conteúdo real", () => {
    expect(classifyOutboundFile(pad([0xff, 0xd8, 0xff]), "foto.jpg")).toMatchObject({ ok: true, type: "image", mime: "image/jpeg" });
    expect(classifyOutboundFile(pad("%PDF-1.7"), "roteiro.pdf")).toMatchObject({ ok: true, type: "document" });
    expect(classifyOutboundFile(pad("OggS"), "audio.ogg")).toMatchObject({ ok: true, type: "audio" });
    expect(classifyOutboundFile(pad([0x50, 0x4b, 0x03, 0x04]), "proposta.docx")).toMatchObject({ ok: true, type: "document" });
  });

  it("recusa executável renomeado, ZIP genérico, HTML e arquivo acima do limite", () => {
    expect(classifyOutboundFile(pad([0x4d, 0x5a]), "foto.jpg")).toMatchObject({ ok: false });
    expect(classifyOutboundFile(pad([0x50, 0x4b, 0x03, 0x04]), "arquivos.zip")).toMatchObject({ ok: false });
    expect(classifyOutboundFile(pad("<html><script>"), "pagina.pdf")).toMatchObject({ ok: false });
    expect(classifyOutboundFile(pad([0xff, 0xd8, 0xff], 6 * 1024 * 1024), "grande.jpg")).toMatchObject({ ok: false });
  });
});
