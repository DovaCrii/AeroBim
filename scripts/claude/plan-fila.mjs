#!/usr/bin/env node
// Lee `MASTER_PLAN.md` por filas, sin cargarlo entero (son ~5.000 líneas, >100 mil tokens).
//
// Uso:
//   node scripts/claude/plan-fila.mjs F2.4              filas de tabla y encabezados que lo nombran
//   node scripts/claude/plan-fila.mjs F2.4 --seccion    además, las primeras 40 líneas de su sección
//   node scripts/claude/plan-fila.mjs --abiertas        filas con estado abierto (⬜ 🔶 ◐ ❓)
//
// Solo lee. Para editar, usa el número de línea (`Lnnn`) que imprime y edita ESA fila.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = process.env.VERIFICAR_RAIZ
  ? resolve(process.env.VERIFICAR_RAIZ)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVO = join(RAIZ, "MASTER_PLAN.md");
if (!existsSync(ARCHIVO)) {
  console.error(`No existe ${ARCHIVO}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const conSeccion = args.includes("--seccion");
const abiertas = args.includes("--abiertas");
const codigo = args.find((a) => !a.startsWith("--"));
if (!abiertas && !codigo) {
  console.error("Uso: plan-fila.mjs <código, p. ej. F2.4> [--seccion] | --abiertas");
  process.exit(2);
}

const lineas = readFileSync(ARCHIVO, "utf8").split("\n");
const corto = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const nivel = (l) => /^(#{1,6})\s/.exec(l)?.[1].length ?? 0;

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

const esc = codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`(?<![\\w.])${esc}(?!\\d)`);
const filas = [];
const encabezados = [];
const otras = [];
lineas.forEach((l, i) => {
  if (!re.test(l)) return;
  if (l.startsWith("|")) filas.push(i);
  else if (nivel(l) > 0) encabezados.push(i);
  else otras.push(i);
});

if (!filas.length && !encabezados.length && !otras.length) {
  console.log(`Sin menciones de ${codigo} en MASTER_PLAN.md`);
  process.exit(1);
}

console.log(`## ${codigo}`);
for (const i of filas.slice(0, 8))
  console.log(`L${i + 1}  ${corto(lineas[i].replace(/\s+/g, " "), 260)}`);
if (filas.length > 8) console.log(`… ${filas.length - 8} filas más`);
for (const i of encabezados.slice(0, 4)) {
  console.log(`L${i + 1}  ${lineas[i]}`);
  if (conSeccion) {
    const n = nivel(lineas[i]);
    let fin = i + 1;
    while (
      fin < lineas.length &&
      fin < i + 41 &&
      !(nivel(lineas[fin]) > 0 && nivel(lineas[fin]) <= n)
    )
      fin += 1;
    for (let j = i + 1; j < fin; j += 1) console.log(`      ${corto(lineas[j], 300)}`);
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
