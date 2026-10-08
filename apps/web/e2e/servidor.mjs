// Levanta Django con una base SQLite temporal y datos de prueba, para el e2e (`F14.6`).
//
// Sirve el SPA ya construido (`apps/web/dist`): corre antes `npm run build`.
// Se queda en primer plano; Playwright lo termina al acabar.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const api = resolve(aqui, "../../../services/api");
const dist = resolve(aqui, "../dist");
const puerto = process.env.E2E_PUERTO ?? "8765";

if (!existsSync(join(dist, "index.html"))) {
  console.error("Falta apps/web/dist: corre `npm run build` antes de `npm run e2e`.");
  process.exit(1);
}

const carpeta = mkdtempSync(join(tmpdir(), "aerobim-e2e-"));
const limpiar = () => rmSync(carpeta, { recursive: true, force: true });
const env = {
  ...process.env,
  DJANGO_SETTINGS_MODULE: "config.settings.dev",
  PYTHONPATH: api,
  DB_PATH: join(carpeta, "e2e.sqlite3"),
  VISOR_DIST: dist,
  ALLOWED_HOSTS: "127.0.0.1,localhost",
};

const uv = (...args) => spawnSync("uv", ["run", ...args], { cwd: api, env, stdio: "inherit" });
for (const paso of [
  ["python", "manage.py", "migrate", "--noinput"],
  ["python", "manage.py", "bootstrap_roles"],
  ["python", resolve(aqui, "sembrar.py")],
]) {
  if (uv(...paso).status !== 0) {
    limpiar();
    process.exit(1);
  }
}

const servidor = spawn(
  "uv",
  ["run", "python", "manage.py", "runserver", `127.0.0.1:${puerto}`, "--noreload"],
  { cwd: api, env, stdio: "inherit" },
);
const salir = () => {
  servidor.kill();
  limpiar();
  process.exit(0);
};
process.on("SIGTERM", salir);
process.on("SIGINT", salir);
servidor.on("exit", (codigo) => {
  limpiar();
  process.exit(codigo ?? 0);
});
