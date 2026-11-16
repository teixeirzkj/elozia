import { expect, test } from "@playwright/test";

/**
 * Telas públicas: não dependem de banco. Exigem apenas que as variáveis
 * NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY estejam definidas
 * (podem ser de um projeto de testes).
 */

for (const [path, heading] of [
  ["/entrar", "Entrar"],
  ["/cadastro", "Cadastrar minha agência"],
  ["/recuperar-senha", "Recuperar senha"],
] as const) {
  test(`${path} carrega sem erros e sem rolagem horizontal`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByAltText(/Elozia/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("login valida os campos e associa o erro ao campo", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Informe o e-mail.")).toBeVisible();
  await expect(page.getByText("Informe a senha.")).toBeVisible();
  await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
});

test("rotas internas exigem login e guardam o destino", async ({ page }) => {
  await page.goto("/contatos");
  await expect(page).toHaveURL(/\/entrar\?proximo=%2Fcontatos/);
});

test("webhook e cron recusam chamadas sem credencial", async ({ request }) => {
  const webhook = await request.post("/api/webhooks/whatsapp", { data: "{}" });
  expect([401, 503]).toContain(webhook.status());
  const cron = await request.get("/api/cron/tick");
  expect([401, 503]).toContain(cron.status());
  const exportar = await request.get("/api/relatorios/exportar?relatorio=sales");
  expect(exportar.status()).toBe(403);
});

test("cabeçalhos de segurança estão presentes", async ({ request }) => {
  const response = await request.get("/entrar");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age");
  expect(headers["x-powered-by"]).toBeUndefined();
});
