#!/usr/bin/env node
// Lee `MASTER_PLAN.md` por filas, sin cargarlo entero, y busca también en el historial archivado
// (`docs/historial/plan/*.md`, donde viven las fases cerradas).
//
// Uso:
//   node scripts/claude/plan-fila.mjs F2.4              filas de tabla y encabezados que lo nombran
//   node scripts/claude/plan-fila.mjs F2.4 --seccion    además, las primeras 40 líneas de su sección
//   node scripts/claude/plan-fila.mjs --abiertas        filas con estado abierto (⬜ 🔶 ◐ ❓)
//   node scripts/claude/plan-fila.mjs --siguiente       lo abierto, por quién lo cierra: qué hace el agente ya
//
// Solo lee. Para editar, usa el archivo y el número de línea (`Lnnn`) que imprime y edita ESA fila.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = process.env.VERIFICAR_RAIZ
  ? resolve(process.env.VERIFICAR_RAIZ)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVO = join(RAIZ, "MASTER_PLAN.md");
const HISTORIAL = join(RAIZ, "docs", "historial", "plan");
if (!existsSync(ARCHIVO)) {
  console.error(`No existe ${ARCHIVO}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const conSeccion = args.includes("--seccion");
const abiertas = args.includes("--abiertas");
const siguiente = args.includes("--siguiente");
const codigo = args.find((a) => !a.startsWith("--"));
if (!abiertas && !siguiente && !codigo) {
  console.error("Uso: plan-fila.mjs <código, p. ej. F2.4> [--seccion] | --abiertas | --siguiente");
  process.exit(2);
}

const leer = (ruta) => readFileSync(ruta, "utf8").split("\n");
const lineas = leer(ARCHIVO);
const corto = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const nivel = (l) => /^(#{1,6})\s/.exec(l)?.[1].length ?? 0;
const celdas = (l) =>
  l
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

if (abiertas) {
  const ABIERTO = /[⬜🔶◐❓]/u;
  const CODIGO = /`(F\d+\.\d+)`/;
  const vistas = new Set();
  lineas.forEach((l, i) => {
    if (!l.startsWith("|") || !ABIERTO.test(l)) return;
    const m = CODIGO.exec(l);
    if (!m) return;
    const clave = `${m[1]}|${l.match(ABIERTO)[0]}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    console.log(`L${i + 1}  ${corto(l.replace(/\s+/g, " "), 200)}`);
  });
  console.log(`\n${vistas.size} filas abiertas. Detalle de una: plan-fila.mjs <código> --seccion`);
  process.exit(0);
}

if (siguiente) {
  // La tabla «Lo que queda, por fase»: | Fase | Filas abiertas | Quién la cierra |
  const inicio = lineas.findIndex((l) => l.startsWith("## Lo que queda, por fase"));
  if (inicio < 0) {
    console.error("No encuentro «## Lo que queda, por fase» en MASTER_PLAN.md");
    process.exit(2);
  }
  const quedan = lineas.slice(inicio, inicio + 8).find((l) => /\*\*Quedan [^*]+\*\*/.test(l));
  if (quedan) console.log(quedan.match(/\*\*Quedan [^*]+\*\*/)[0], "(según el plan)\n");
  const grupos = new Map();
  for (let i = inicio + 1; i < lineas.length && nivel(lineas[i]) === 0; i += 1) {
    const l = lineas[i];
    if (!l.startsWith("|") || /^\|[\s:-]+\|/.test(l)) continue;
    const [fase, filas, quien] = celdas(l);
    if (!quien || quien === "Quién la cierra" || quien === "—") continue;
    const clave = quien.replace(/\*\*/g, "");
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(`L${i + 1}  ${fase.replace(/\*\*/g, "")}: ${corto(filas, 190)}`);
  }
  const delAgente = (q) => q.startsWith("El agente");
  const orden = [...grupos.keys()].sort((a, b) => Number(delAgente(b)) - Number(delAgente(a)));
  for (const q of orden) {
    console.log(`${delAgente(q) ? "▶ " : "· "}${q}`);
    for (const f of grupos.get(q)) console.log(`    ${f}`);
  }
  console.log(
    "\nEmpieza por «▶». Detalle de una fila: plan-fila.mjs <código> --seccion. Cierre: /cerrar-tarea <código>.",
  );
  process.exit(0);
}

// Las fuentes: el tablero y, detrás, el historial de las fases cerradas.
const fuentes = [{ nombre: "MASTER_PLAN.md", lineas }];
if (existsSync(HISTORIAL)) {
  for (const f of readdirSync(HISTORIAL).sort()) {
    if (f.endsWith(".md"))
      fuentes.push({
        nombre: relative(RAIZ, join(HISTORIAL, f)).replace(/\\/g, "/"),
        lineas: leer(join(HISTORIAL, f)),
      });
  }
}

const esc = codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`(?<![\\w.])${esc}(?!\\d)`);
let encontrada = false;

for (const { nombre, lineas: ls } of fuentes) {
  const filas = [];
  const encabezados = [];
  const otras = [];
  ls.forEach((l, i) => {
    if (!re.test(l)) return;
    if (l.startsWith("|")) filas.push(i);
    else if (nivel(l) > 0) encabezados.push(i);
    else otras.push(i);
  });
  if (!filas.length && !encabezados.length && !otras.length) continue;
  // En el historial, solo si el tablero no dijo nada: lo archivado es de lectura, no de edición.
  if (nombre !== "MASTER_PLAN.md" && encontrada && !conSeccion) continue;
  if (!encontrada) console.log(`## ${codigo}`);
  encontrada = true;
  console.log(`— ${nombre}`);
  for (const i of filas.slice(0, 8))
    console.log(`L${i + 1}  ${corto(ls[i].replace(/\s+/g, " "), 260)}`);
  if (filas.length > 8) console.log(`… ${filas.length - 8} filas más`);
  for (const i of encabezados.slice(0, 4)) {
    console.log(`L${i + 1}  ${ls[i]}`);
    if (conSeccion) {
      const n = nivel(ls[i]);
      let fin = i + 1;
      while (fin < ls.length && fin < i + 41 && !(nivel(ls[fin]) > 0 && nivel(ls[fin]) <= n))
        fin += 1;
      for (let j = i + 1; j < fin; j += 1) console.log(`      ${corto(ls[j], 300)}`);
      if (fin === i + 41)
        console.log("      … (sección más larga; léela por rangos con el número de línea)");
    }
  }
  if (otras.length) {
    const lista = otras
      .slice(0, 6)
      .map((i) => `L${i + 1}`)
      .join(" ");
    console.log(
      `Otras menciones en el texto: ${otras.length} (${lista}${otras.length > 6 ? " …" : ""})`,
    );
  }
}

if (!encontrada) {
  console.log(`Sin menciones de ${codigo} en MASTER_PLAN.md ni en docs/historial/plan/`);
  process.exit(1);
}
