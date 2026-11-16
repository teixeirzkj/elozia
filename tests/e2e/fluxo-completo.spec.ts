import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Fluxo completo do MVP, de ponta a ponta, em um navegador real:
 *
 *   agência cria conta → convida atendente → cadastra pacote → recebe lead →
 *   cria oportunidade → envia proposta → follow-up → confirma venda → relatório
 *
 * PRÉ-REQUISITOS (ambiente de TESTES, nunca produção — veja docs/DEPLOY.md):
 *   - projeto Supabase de testes com as migrations aplicadas e a confirmação
 *     de e-mail DESATIVADA (Authentication › Sign In / Providers › Email);
 *   - .env.local apontando para esse projeto;
 *   - E2E_ENABLED=1 para habilitar esta suíte.
 *
 * O WhatsApp é exercitado com webhook SIMULADO (assinado com E2E_META_APP_SECRET)
 * quando E2E_PHONE_NUMBER_ID aponta para um canal já conectado nesse ambiente.
 * Sem essas variáveis, o lead é cadastrado manualmente e o passo de webhook é
 * pulado — nunca se simula uma conexão que não existe.
 */

const enabled = process.env.E2E_ENABLED === "1";
const run = randomBytes(4).toString("hex");
const owner = { name: "Dona Teste", email: `dona.${run}@exemplo.test`, password: `Senha${run}123` };
const agent = { name: "Atendente Teste", email: `atendente.${run}@exemplo.test`, password: `Senha${run}456` };
const agency = `Agência E2E ${run}`;
const pkg = `Pacote E2E ${run}`;
const lead = `Lead E2E ${run}`;

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.configure({ mode: "serial" });

test.describe("fluxo completo do MVP", () => {
  test.skip(!enabled, "Defina E2E_ENABLED=1 com um projeto Supabase de testes configurado.");
  test.skip(({ isMobile }) => isMobile, "O fluxo completo roda no perfil desktop; o celular é coberto pelos testes de layout.");

  let inviteLink = "";

  test("1. agência cria conta", async ({ page }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Nome da agência").fill(agency);
    await page.getByLabel("Seu nome").fill(owner.name);
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByLabel("Senha").fill(owner.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/boas-vindas/);
    await expect(page.getByLabel("Nome da agência")).toHaveValue(agency);
    await page.getByRole("button", { name: "Criar agência" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(agency)).toBeVisible();
    await expect(page.getByText("Ainda não há dados para mostrar")).toBeVisible();
  });

  test("2. convida atendente, que entra com o papel definido", async ({ page, browser }) => {
    await signIn(page, owner);
    await page.goto("/configuracoes/equipe");
    await page.getByRole("button", { name: "Convidar" }).click();
    await page.getByLabel("E-mail").fill(agent.email);
    await page.getByLabel("Papel").selectOption("agent");
    await page.getByRole("button", { name: "Criar convite" }).click();
    inviteLink = await page.getByLabel("Link do convite").inputValue();
    expect(inviteLink).toContain("/convite/");

    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(inviteLink);
    await expect(guestPage.getByRole("heading", { name: `Convite para ${agency}` })).toBeVisible();
    await guestPage.getByLabel("Seu nome").fill(agent.name);
    await guestPage.getByLabel("Crie uma senha").fill(agent.password);
    await guestPage.getByRole("button", { name: "Criar conta e aceitar" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);
    // Atendente não vê relatórios nem gerencia a equipe.
    await expect(guestPage.getByRole("link", { name: "Relatórios" })).toHaveCount(0);
    await guestPage.goto("/relatorios");
    await expect(guestPage).toHaveURL(/\/dashboard\?aviso=sem-permissao/);
    await guestPage.goto("/configuracoes/equipe");
    await expect(guestPage.getByRole("button", { name: "Convidar" })).toHaveCount(0);
    await guest.close();

    // O convite não pode ser usado de novo.
    const again = await browser.newContext();
    const againPage = await again.newPage();
    await againPage.goto(inviteLink);
    await expect(againPage.getByRole("heading", { name: "Convite indisponível" })).toBeVisible();
    await again.close();
  });

  test("3. cadastra pacote com saída", async ({ page }) => {
    await signIn(page, owner);
    await page.goto("/viagens");
    await page.getByRole("button", { name: "Novo pacote" }).click();
    await page.getByLabel("Nome do pacote").fill(pkg);
    await page.getByLabel("Destino").fill("Destino Fictício");
    await page.getByLabel("Valor por pessoa").fill("2.500,00");
    await page.getByRole("button", { name: "Salvar pacote" }).click();
    await expect(page.getByRole("heading", { name: pkg })).toBeVisible();

    await page.getByRole("button", { name: "Nova saída" }).click();
    const departure = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    await page.getByLabel("Data de saída").fill(departure);
    await page.getByLabel("Vagas").fill("20");
    await page.getByRole("button", { name: "Salvar saída" }).click();
    await expect(page.getByRole("cell", { name: /Ativa/ })).toBeVisible();
  });

  test("4. recebe lead", async ({ page, request }) => {
    await signIn(page, owner);
    const phoneNumberId = process.env.E2E_PHONE_NUMBER_ID;
    const secret = process.env.E2E_META_APP_SECRET;

    if (phoneNumberId && secret) {
      // Webhook SIMULADO da Meta, assinado como o original.
      const body = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ id: "0", changes: [{ field: "messages", value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "0", phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: lead }, wa_id: `55119${run.replace(/\D/g, "1").padEnd(8, "7").slice(0, 8)}` }],
          messages: [{ from: `55119${run.replace(/\D/g, "1").padEnd(8, "7").slice(0, 8)}`, id: `wamid.E2E${run}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Quero saber do pacote" } }],
        } }] }],
      });
      const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      const ok = await request.post("/api/webhooks/whatsapp", { data: body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature } });
      expect(ok.status()).toBe(200);
      const forged = await request.post("/api/webhooks/whatsapp", { data: body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=00" } });
      expect(forged.status()).toBe(401);
      await page.goto("/atendimentos");
      await expect(page.getByRole("link", { name: new RegExp(lead) })).toBeVisible();
    } else {
      await page.goto("/contatos");
      await page.getByRole("button", { name: "Novo contato" }).click();
      await page.getByLabel("Nome").fill(lead);
      await page.getByLabel("Origem").selectOption("instagram");
      await page.getByRole("button", { name: "Salvar contato" }).click();
      await expect(page.getByRole("heading", { name: lead })).toBeVisible();
    }
    await page.goto(`/contatos?q=${encodeURIComponent(lead)}`);
    await expect(page.getByRole("link", { name: lead })).toBeVisible();
  });

  test("5. cria oportunidade, envia proposta, agenda follow-up e confirma a venda", async ({ page }) => {
    await signIn(page, owner);
    await page.goto(`/contatos?q=${encodeURIComponent(lead)}`);
    await page.getByRole("link", { name: lead }).click();

    await page.getByRole("button", { name: "Nova oportunidade" }).click();
    await page.getByLabel("Pacote").selectOption({ label: `${pkg} — Destino Fictício` });
    await page.getByLabel("Valor estimado").fill("5.000,00");
    await page.getByLabel("Viajantes").fill("2");
    await page.getByRole("button", { name: "Salvar oportunidade" }).click();
    await expect(page).toHaveURL(/\/funil\/[0-9a-f-]{36}/);
    const opportunityUrl = page.url();

    await page.getByRole("button", { name: "Nova proposta" }).click();
    await page.getByLabel("Valor oferecido").fill("4.800,00");
    await page.getByLabel("Situação").selectOption("sent");
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.getByText("Enviada")).toBeVisible();

    // Follow-up: tarefa para retomar o contato.
    await page.getByRole("button", { name: "Nova tarefa" }).click();
    await page.getByLabel("O que precisa ser feito").fill("Retomar proposta");
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByText("Retomar proposta")).toBeVisible();

    // Confirma a venda movendo no quadro e registrando a reserva.
    await page.goto("/funil");
    await page.getByLabel(`Mover ${lead} para outra etapa`).selectOption({ label: "Mover para Venda confirmada" });
    await page.goto(opportunityUrl);
    await expect(page.getByText("Venda confirmada").first()).toBeVisible();
    await page.getByRole("button", { name: "Nova reserva" }).click();
    await page.getByLabel("Valor total").fill("4.800,00");
    await page.getByLabel("Situação da reserva").selectOption("confirmed");
    await page.getByRole("button", { name: "Salvar reserva" }).click();
    await expect(page.getByText("Confirmada")).toBeVisible();

    // A movimentação persiste após recarregar e fica no histórico.
    await page.reload();
    await expect(page.getByText(/→ Venda confirmada/)).toBeVisible();
  });

  test("6. visualiza dashboard e relatório com os números reais", async ({ page }) => {
    await signIn(page, owner);
    await expect(page.getByText("Ainda não há dados para mostrar")).toHaveCount(0);
    await expect(page.getByText("R$ 4.800,00")).toBeVisible();

    await page.goto("/relatorios");
    const packages = page.locator("div", { has: page.getByRole("heading", { name: "Vendas por pacote" }) }).last();
    await expect(packages.getByRole("cell", { name: pkg })).toBeVisible();
    await expect(packages.getByRole("cell", { name: "R$ 4.800,00" })).toBeVisible();

    const download = page.waitForEvent("download");
    await packages.getByRole("link", { name: "Exportar CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^elozia-packages-.*\.csv$/);
  });
});
