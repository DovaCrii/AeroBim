import { defineConfig } from "@playwright/test";

/**
 * Humo e2e (`F14.6`). **No entra en `npm test` ni en el build**: se corre con `npm run e2e`.
 *
 * Playwright baja su Chromium con `npx playwright install chromium`, **solo en desarrollo y en
 * el CI**; la aplicación nunca descarga un navegador ni un WASM en ejecución (regla 10).
 */
const puerto = process.env.E2E_PUERTO ?? "8765";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.e2e.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${puerto}`,
    locale: "es-CL",
    // Local sin descarga de Chromium: `E2E_CANAL=chrome` (o `msedge`) usa el navegador instalado.
    channel: process.env.E2E_CANAL || undefined,
  },
  webServer: {
    command: "node e2e/servidor.mjs",
    url: `http://127.0.0.1:${puerto}/accounts/login/`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
