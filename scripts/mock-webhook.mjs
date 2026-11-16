#!/usr/bin/env node
/**
 * Envia um webhook SIMULADO da Meta para o ambiente local, assinado com o App
 * Secret, para testar o recebimento sem depender da Meta.
 *
 * Uso (PowerShell ou bash), com o servidor rodando em outra janela:
 *   node scripts/mock-webhook.mjs --phone-number-id 123 --secret SEU_APP_SECRET --text "Olá"
 *   node scripts/mock-webhook.mjs --phone-number-id 123 --secret X --status read --wamid wamid.ABC
 *   node scripts/mock-webhook.mjs --phone-number-id 123 --secret errado        (deve responder 401)
 *
 * Opções: --url (padrão http://localhost:3000/api/webhooks/whatsapp), --from 5511911110001,
 *         --name "Cliente Fictício", --wamid (padrão: aleatório).
 * Só use contra ambientes de desenvolvimento ou de testes. Os dados são fictícios.
 */
import { createHmac, randomBytes } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => (arg.startsWith("--") ? [...acc, [arg.slice(2), all[i + 1] ?? ""]] : acc), []),
);

const url = args.url || "http://localhost:3000/api/webhooks/whatsapp";
const phoneNumberId = args["phone-number-id"];
const secret = args.secret;
if (!phoneNumberId || !secret) {
  console.error("Informe --phone-number-id e --secret. Veja o cabeçalho deste arquivo.");
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) && args["permitir-remoto"] !== "sim") {
  console.error("Por segurança, este script só envia para localhost. Para um ambiente de testes remoto, acrescente --permitir-remoto sim.");
  process.exit(1);
}

const from = args.from || "5511911110001";
const wamid = args.wamid || `wamid.TESTE${randomBytes(6).toString("hex").toUpperCase()}`;
const now = String(Math.floor(Date.now() / 1000));

const value = args.status
  ? { statuses: [{ id: wamid, status: args.status, timestamp: now, recipient_id: from }] }
  : {
      contacts: [{ profile: { name: args.name || "Cliente Fictício" }, wa_id: from }],
      messages: [{ from, id: wamid, timestamp: now, type: "text", text: { body: args.text || "Mensagem de teste" } }],
    };

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "0",
      changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "0", phone_number_id: phoneNumberId }, ...value } }],
    },
  ],
});

const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body });
console.log(`${response.status} ${await response.text()} (wamid: ${wamid})`);
