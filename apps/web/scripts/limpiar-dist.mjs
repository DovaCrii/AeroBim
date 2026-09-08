/**
 * Deja en `dist/` **solo lo que la aplicación necesita para funcionar**.
 *
 * **Por qué existe, y es un defecto que se encontró midiendo.** Vite copia todo lo que hay en
 * `public/` al build, y en `public/` viven los archivos de prueba: los IFC y los DXF reales de
 * la organización. Al servir `dist/` como estático desde Django —que es lo que hace que el
 * visor viva detrás del login— esos archivos quedaron accesibles **sin autenticar**:
 * comprobado, `HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc` devolvía 200 y 34 MB.
 *
 * `AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era: no
 * están confirmados. Lo que faltaba decir es lo otro: **lo que se pone en `public/` se
 * publica**, y publicar no es lo mismo que confirmar.
 *
 * **Es una lista blanca y no una lista negra**, y esa es la decisión que importa. Una lista de
 * lo prohibido —`samples/`, `diag.html`— habría funcionado hoy y se habría quedado atrás con
 * lo siguiente que alguien deje en `public/`. Con la lista de lo permitido, lo nuevo se queda
 * fuera por defecto y hay que pedirlo.
 */

import { readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const dist = resolve(aqui, "..", "dist");

/**
 * Lo único que sobrevive, y por qué cada cosa:
 *
 * - `assets/` — el JavaScript y el CSS con su nombre con hash. Es la aplicación.
 * - `index.html` — el visor de modelos, que sirve Django detrás del login.
 * - `documento.html` — el visor del documento (`F8.6`), servido igual.
 * - `wasm/` — el WASM de `web-ifc` y el de PDFium, servidos **locales** porque la aplicación
 *   tiene que abrir un modelo en una faena sin internet, y porque la CSP de la página no deja
 *   pedirle nada a otro origen.
 * - `aerobim-mark.svg` — la marca en su variante original: el favicon de las dos páginas.
 * - `aerobim-mark-oscuro.svg` — **la que dibuja la cabecera del visor**, y faltaba.
 *
 * Lo que se queda fuera: `samples/` (archivos de la organización y fixtures de prueba) y
 * `diag.html`, que además apunta a rutas absolutas del equipo de quien lo escribió y no
 * funcionaría en un servidor.
 *
 * ## El defecto que la lista blanca dejó pasar, y por qué se le añadió una comprobación
 *
 * **La marca del visor faltaba en el build desde que existe.** `App.tsx` dibuja la cabecera con
 * `aerobim-mark-oscuro.svg` —la variante de trazo claro, porque la original daba 1,15:1 sobre la
 * cinta— y esta lista solo dejaba pasar la original. En `vite dev` funcionaba, porque sirve
 * `public/` entero; servido por Django devolvía **404** y la cabecera salía sin logo. Lo vio el
 * usuario, no el gate.
 *
 * Es exactamente el riesgo que el encabezado ya advertía —«lo nuevo se queda fuera por defecto y hay
 * que pedirlo»— y la advertencia no basta: nadie se acuerda de venir aquí al añadir un archivo. Así
 * que ahora **el propio script comprueba que no falte nada de lo que el build referencia**, y falla
 * si falta. Una lista blanca sin verificación es una promesa.
 */
const PERMITIDO = new Set([
  "assets",
  "index.html",
  "documento.html",
  "wasm",
  "aerobim-mark.svg",
  "aerobim-mark-oscuro.svg",
]);

try {
  await stat(dist);
} catch {
  console.error("limpiar-dist: no hay `dist/`. ¿Se corrió `vite build` antes?");
  process.exit(1);
}

const quitados = [];
for (const nombre of await readdir(dist)) {
  if (PERMITIDO.has(nombre)) continue;
  await rm(join(dist, nombre), { recursive: true, force: true });
  quitados.push(nombre);
}

// Se dice lo que se quitó. Un paso de build silencioso es un paso que nadie sabe que existe,
// y el día que borre algo que hacía falta, nadie sabrá por qué desapareció.
console.log(
  quitados.length === 0
    ? "limpiar-dist: no había nada que quitar."
    : `limpiar-dist: fuera del build ${quitados.map((n) => `\`${n}\``).join(", ")}.`,
);

/**
 * Y ahora la comprobación: **que no falte nada de lo que el build referencia**.
 *
 * Se leen el HTML y el JavaScript empaquetados buscando rutas absolutas a archivos de `public/` —
 * las que empiezan por `/` o por la base del despliegue— y se exige que cada una exista en `dist`.
 * Es lo que habría cazado la marca del visor el día que se escribió, en vez de meses después y a
 * ojo del usuario.
 *
 * **No pretende encontrar todas las referencias posibles.** Una ruta compuesta en tiempo de
 * ejecución a partir de trozos no aparece aquí, y eso queda dicho: lo que atrapa es el caso normal
 * —una constante con el nombre del archivo— que es justamente el que falló.
 */
const EXTENSIONES = /\.(svg|png|jpe?g|webp|wasm|woff2?|json|ico|css)/i;

const aRevisar = [];
for (const nombre of await readdir(dist)) {
  const ruta = join(dist, nombre);
  if ((await stat(ruta)).isDirectory()) {
    if (nombre !== "assets") continue;
    for (const hijo of await readdir(ruta)) {
      if (/\.(js|css)$/.test(hijo)) aRevisar.push(join(ruta, hijo));
    }
    continue;
  }
  if (nombre.endsWith(".html")) aRevisar.push(ruta);
}

const referencias = new Set();
for (const ruta of aRevisar) {
  const texto = await readFile(ruta, "utf8");
  // Rutas entre comillas que apuntan a la raíz del despliegue y llevan extensión de recurso.
  for (const m of texto.matchAll(/["'`](\/[^"'`\s)]*?\.[a-z0-9]{2,5})["'`]/gi)) {
    const referencia = m[1];
    if (!EXTENSIONES.test(referencia)) continue;
    // `/static/visor/` es el prefijo con el que Django sirve esto; se quita para buscar en `dist`.
    referencias.add(referencia.replace(/^\/static\/visor\//, "/").replace(/^\//, ""));
  }
}

const faltan = [];
for (const referencia of referencias) {
  // Los `assets/` con hash los emite Vite y siempre están; lo que se comprueba es `public/`.
  if (referencia.startsWith("assets/")) continue;
  try {
    await stat(join(dist, referencia));
  } catch {
    faltan.push(referencia);
  }
}

if (faltan.length > 0) {
  console.error(
    `limpiar-dist: el build referencia ${faltan.length} archivo(s) que NO están en \`dist/\`:\n` +
      faltan.map((n) => `  - ${n}`).join("\n") +
      `\n\nSi hacen falta, añádelos a PERMITIDO en este mismo archivo.`,
  );
  process.exit(1);
}

console.log(`limpiar-dist: comprobadas ${referencias.size} referencias del build; ninguna falta.`);
