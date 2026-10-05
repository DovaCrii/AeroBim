#!/usr/bin/env node
// Verificación con salida corta, para agentes (Claude Code / Codex) y para personas.
//
// Corre los mismos pasos que el CI y escribe el registro completo en
// `.claude/tmp/verificar/<paso>.log`; por pantalla solo imprime una línea por paso y, si algo
// falla, la cola del fallo. La puerta real sigue siendo `services/api/scripts/verify.ps1` +
// `npm test` + el CI: esto no la sustituye, la resume.
//
// Uso:
//   node scripts/claude/verificar.mjs [todo|web|api] [--seguir]
//
//   web     prettier, oxlint, build y pruebas de TypeScript (como el trabajo `verify` del CI)
//   api     el gate de services/api (como el trabajo `api` del CI); necesita `pwsh` y `uv`
//   todo    ambos (por omisión)
//   --seguir  no se detiene en el primer fallo
//
// Variables (para probar el propio script): VERIFICAR_RAIZ, VERIFICAR_API_CMD.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = process.env.VERIFICAR_RAIZ
  ? resolve(process.env.VERIFICAR_RAIZ)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOGS = join(RAIZ, ".claude", "tmp", "verificar");

const args = process.argv.slice(2);
const seguir = args.includes("--seguir");
const modo = args.find((a) => !a.startsWith("--")) ?? "todo";
if (!["todo", "web", "api"].includes(modo)) {
  console.error("Uso: node scripts/claude/verificar.mjs [todo|web|api] [--seguir]");
  process.exit(2);
}

const apiCmd =
  process.env.VERIFICAR_API_CMD ?? "pwsh -NoProfile -File services/api/scripts/verify.ps1";

const pasos = [];
if (modo !== "api") {
  pasos.push(
    { id: "fmt", nombre: "prettier (fmt:check)", cmd: "npm run fmt:check" },
    { id: "lint", nombre: "oxlint", cmd: "npm run lint" },
    { id: "build", nombre: "build (tsc + vite)", cmd: "npm run build" },
    { id: "test", nombre: "pruebas TypeScript", cmd: "npm test" },
  );
}
if (modo !== "web") {
  pasos.push({ id: "api", nombre: "gate de services/api", cmd: apiCmd, tipo: "api" });
}

const limpiar = (s) =>
  s
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "");

function correr(cmd) {
  return new Promise((listo) => {
    const t0 = Date.now();
    const trozos = [];
    const hijo = spawn(cmd, {
      cwd: RAIZ,
      shell: true,
      env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    hijo.stdout.on("data", (d) => trozos.push(d));
    hijo.stderr.on("data", (d) => trozos.push(d));
    hijo.on("error", (e) =>
      listo({ codigo: 127, salida: String(e), seg: (Date.now() - t0) / 1000 }),
    );
    hijo.on("close", (codigo) =>
      listo({
        codigo: codigo ?? 1,
        salida: limpiar(Buffer.concat(trozos).toString("utf8")),
        seg: (Date.now() - t0) / 1000,
      }),
    );
  });
}

// Líneas que dicen "cuánto pasó" en las herramientas que usa el repo.
const PISTAS = [
  /Test Files\s+\d+/i,
  /Tests?\s+\d+.*(passed|failed)/i,
  /\d+ passed/i,
  /built in /i,
  /Gate en verde/i,
];

function pistas(salida) {
  const vistas = new Set();
  for (const linea of salida.split("\n")) {
    // `npm run` repite el comando con «> »: no es resultado, es el eco.
    if (/^\s*[>$]/.test(linea)) continue;
    if (PISTAS.some((re) => re.test(linea))) vistas.add(linea.trim().replace(/^=+\s*|\s*=+$/g, ""));
  }
  return [...vistas].slice(-4);
}

// Las líneas que nombran el fallo (pytest, tsc, vitest, verify.ps1), para verlas sin leer la cola.
const CLAVES = /^(FAILED |ERROR |FALLO )|error TS\d+|^\s*(FAIL|×)\s/;
function claves(salida) {
  const vistas = new Set();
  for (const l of salida.split("\n")) if (CLAVES.test(l)) vistas.add(l.trim());
  return [...vistas].slice(0, 12);
}

function cola(salida, tipo) {
  const lineas = salida
    .split("\n")
    .filter((l, i, a) => !(l.trim() === "" && a[i - 1]?.trim() === ""));
  let desde = Math.max(0, lineas.length - 30);
  if (tipo === "api") {
    // verify.ps1 imprime «== paso ==» antes de cada paso: el último es el que falló.
    const cabeceras = lineas.map((l) => /^== .* ==\s*$/.test(l));
    const i = cabeceras.lastIndexOf(true);
    if (i >= 0) desde = i;
  }
  const sel = lineas.slice(desde);
  return sel.length > 40
    ? ["... (recortado; el registro completo está en el log)", ...sel.slice(-40)]
    : sel;
}

mkdirSync(LOGS, { recursive: true });
const rel = (p) => relative(RAIZ, p).split("\\").join("/");
const ancho = Math.max(...pasos.map((p) => p.nombre.length));
let verdes = 0;
let fallos = 0;
let ejecutados = 0;

for (const paso of pasos) {
  ejecutados += 1;
  const r = await correr(paso.cmd);
  const log = join(LOGS, `${paso.id}.log`);
  writeFileSync(log, `$ ${paso.cmd}\n(código ${r.codigo})\n\n${r.salida}`, "utf8");
  const etiqueta = paso.nombre.padEnd(ancho);
  if (r.codigo === 0) {
    verdes += 1;
    const extra = pistas(r.salida);
    console.log(
      `OK     ${etiqueta}  ${r.seg.toFixed(1)} s${extra.length ? "  · " + extra.join(" · ") : ""}`,
    );
  } else {
    fallos += 1;
    console.log(`FALLO  ${etiqueta}  ${r.seg.toFixed(1)} s  (código ${r.codigo})`);
    const ks = claves(r.salida);
    if (ks.length) {
      console.log("   Lo que falló:");
      for (const k of ks) console.log(`   * ${k}`);
    }
    console.log("   Final de la salida:");
    for (const l of cola(r.salida, paso.tipo)) console.log(`   | ${l}`);
    console.log(`   log completo: ${rel(log)}`);
    if (!seguir) break;
  }
}

const omitidos = pasos.length - ejecutados;
console.log(
  `\n${verdes} de ${pasos.length} pasos en verde` +
    (fallos ? `, ${fallos} con fallo` : "") +
    (omitidos ? `, ${omitidos} sin correr (usa --seguir para no parar)` : "") +
    ".",
);
process.exit(fallos ? 1 : 0);
