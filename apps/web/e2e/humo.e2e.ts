import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const MURO = resolve(import.meta.dirname, "../public/samples/muro-minimo.ifc");

/** Solo las violaciones que importan: lo serio y lo crítico, como pide la fila del plan. */
async function violacionesSerias(page: Page) {
  const resultado = await new AxeBuilder({ page }).analyze();
  return resultado.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodo(s)`);
}

async function entrar(page: Page) {
  await page.goto("/accounts/login/");
  await page.locator("input[name=username]").fill("e2e");
  await page.locator("input[name=password]").fill("clave-e2e-solo-para-pruebas-77");
  await page.locator("form button[type=submit], form input[type=submit]").first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/accounts/login"));
}

test("axe: la página de login no tiene violaciones serias", async ({ page }) => {
  await page.goto("/accounts/login/");
  expect(await violacionesSerias(page)).toEqual([]);
});

test("login, obra, lista de documentos y visor con muro-minimo.ifc", async ({ page }) => {
  const errores: string[] = [];
  const externas: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errores.push(m.text());
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol.startsWith("http"))
      externas.push(r.url());
  });

  await entrar(page);

  // Una obra: la lista la enlaza y su página abre.
  await page.goto("/proyectos/");
  await page
    .getByRole("link", { name: /Obra de humo e2e|E2E-001/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/proyectos\/[0-9a-f-]{36}\//);

  // La lista de documentos.
  await page.goto("/documentos/entregables/");
  await expect(page.locator("body")).toBeVisible();
  expect(await violacionesSerias(page), "axe en la lista de documentos").toEqual([]);

  // El visor: el SPA se monta y el IFC entra por el selector de archivos.
  await page.goto("/visor/");
  const entrada = page.locator("input[type=file]");
  await expect(entrada).toBeEnabled({ timeout: 60_000 });
  await entrada.setInputFiles(MURO);
  await expect(page.getByText(/muro-minimo/i).first()).toBeVisible({ timeout: 60_000 });
  // Mientras carga, el selector queda deshabilitado: que vuelva a habilitarse es que terminó, y
  // un fallo de lectura aparece como alerta en vez de dejar el modelo en la lista.
  await expect(entrada).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Listo", { exact: true })).toBeVisible();

  expect(errores, "errores de consola").toEqual([]);
  expect(externas, "peticiones fuera del origen (regla 10)").toEqual([]);
});
