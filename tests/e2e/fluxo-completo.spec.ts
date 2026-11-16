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

/** Com a chave de serviço disponível, os usuários de teste são criados já confirmados. */
const adminMode = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

async function adminCreateUser(user: { email: string; password: string }, metadata: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password, email_confirm: true, user_metadata: metadata }),
  });
  if (!response.ok) throw new Error(`Não foi possível criar o usuário de teste (${response.status}).`);
}

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

  test.afterAll(async () => {
    // Remove a agência e os usuários criados por esta execução.
    if (!adminMode || !process.env.SUPABASE_DB_URL) return;
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query("delete from public.organizations where name = $1", [agency]);
      await client.query("delete from auth.users where email = any ($1)", [[owner.email, agent.email]]);
    } finally {
      await client.end();
    }
  });

  test("1. agência cria conta", async ({ page }) => {
    if (adminMode) {
      // Projeto com confirmação de e-mail ativa: a conta nasce confirmada pela API
      // de administração (nenhum e-mail é enviado a endereços fictícios) e segue o
      // mesmo caminho de quem acabou de confirmar o e-mail.
      await adminCreateUser(owner, { full_name: owner.name, agency_name: agency });
      await page.goto("/entrar");
      await page.getByLabel("E-mail").fill(owner.email);
      await page.getByLabel("Senha").fill(owner.password);
      await page.getByRole("button", { name: "Entrar" }).click();
    } else {
      await page.goto("/cadastro");
      await page.getByLabel("Nome da agência").fill(agency);
      await page.getByLabel("Seu nome").fill(owner.name);
      await page.getByLabel("E-mail").fill(owner.email);
      await page.getByLabel("Senha").fill(owner.password);
      await page.getByRole("button", { name: "Criar conta" }).click();
    }

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
    inviteLink = await page.getByRole("textbox", { name: "Link do convite" }).inputValue();
    expect(inviteLink).toContain("/convite/");

    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(inviteLink);
    await expect(guestPage.getByRole("heading", { name: `Convite para ${agency}` })).toBeVisible();
    if (adminMode) {
      // Conta confirmada criada pela API; a pessoa entra e aceita o convite.
      await adminCreateUser(agent, { full_name: agent.name });
      await guestPage.getByRole("link", { name: "Entrar para aceitar" }).click();
      await guestPage.getByLabel("E-mail").fill(agent.email);
      await guestPage.getByLabel("Senha").fill(agent.password);
      await guestPage.getByRole("button", { name: "Entrar" }).click();
      await guestPage.getByRole("button", { name: "Aceitar convite" }).click();
    } else {
      await guestPage.getByLabel("Seu nome").fill(agent.name);
      await guestPage.getByLabel("Crie uma senha").fill(agent.password);
      await guestPage.getByRole("button", { name: "Criar conta e aceitar" }).click();
    }
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
      await page.getByRole("dialog").getByLabel("Nome", { exact: false }).fill(lead);
      await page.getByRole("dialog").getByLabel("Origem", { exact: false }).selectOption("instagram");
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
    await page.getByRole("dialog").getByLabel("Pacote", { exact: false }).selectOption({ label: `${pkg} — Destino Fictício` });
    await page.getByRole("dialog").getByLabel("Valor estimado", { exact: false }).fill("5.000,00");
    await page.getByRole("dialog").getByLabel("Viajantes", { exact: false }).fill("2");
    await page.getByRole("button", { name: "Salvar oportunidade" }).click();
    await expect(page).toHaveURL(/\/funil\/[0-9a-f-]{36}/);
    const opportunityUrl = page.url();

    await page.getByRole("button", { name: "Nova proposta" }).click();
    await page.getByRole("dialog").getByLabel("Valor oferecido", { exact: false }).fill("4.800,00");
    await page.getByRole("dialog").getByLabel("Situação", { exact: false }).selectOption("sent");
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.getByText("Enviada", { exact: true }).first()).toBeVisible();

    // Follow-up: tarefa para retomar o contato.
    await page.getByRole("button", { name: "Nova tarefa" }).click();
    await page.getByRole("dialog").getByLabel("O que precisa ser feito", { exact: false }).fill("Retomar proposta");
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByText("Retomar proposta").first()).toBeVisible();

    // Confirma a venda movendo no quadro e registrando a reserva.
    await page.goto("/funil");
    await page.getByLabel(`Mover ${lead} para outra etapa`).selectOption({ label: "Mover para Venda confirmada" });
    await page.goto(opportunityUrl);
    await expect(page.getByText("Venda confirmada").first()).toBeVisible();
    await page.getByRole("button", { name: "Nova reserva" }).click();
    await page.getByRole("dialog").getByLabel("Valor total", { exact: false }).fill("4.800,00");
    await page.getByRole("dialog").getByLabel("Situação da reserva", { exact: false }).selectOption("confirmed");
    await page.getByRole("button", { name: "Salvar reserva" }).click();
    await expect(page.getByText("Confirmada", { exact: true }).first()).toBeVisible();

    // A movimentação persiste após recarregar e fica no histórico.
    await page.reload();
    await expect(page.getByText(/→ Venda confirmada/).first()).toBeVisible();
  });

  test("6. visualiza dashboard e relatório com os números reais", async ({ page }) => {
    await signIn(page, owner);
    await expect(page.getByText("Ainda não há dados para mostrar")).toHaveCount(0);
    await expect(page.getByText("R$ 4.800,00").first()).toBeVisible();

    await page.goto("/relatorios");
    // Vendas por pacote: uma oportunidade ganha, uma reserva confirmada, dois viajantes.
    const row = page.getByRole("row", { name: new RegExp(pkg) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: "R$ 4.800,00" })).toBeVisible();
    // Desempenho comercial: a venda aparece para a responsável.
    await expect(page.getByRole("row", { name: new RegExp(owner.name) }).first()).toBeVisible();

    const download = page.waitForEvent("download");
    await page.locator('a[href*="relatorio=packages"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^elozia-packages-.*\.csv$/);
    const { readFileSync } = await import("node:fs");
    const csv = readFileSync(await file.path(), "utf8");
    expect(csv).toContain(pkg);
    expect(csv).toContain("4800,00");
  });
});
