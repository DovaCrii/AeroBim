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

import { readdir, rm, stat } from "node:fs/promises";
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
 * - `aerobim-mark.svg` — la marca, referenciada por las dos páginas.
 *
 * Lo que se queda fuera: `samples/` (archivos de la organización y fixtures de prueba) y
 * `diag.html`, que además apunta a rutas absolutas del equipo de quien lo escribió y no
 * funcionaría en un servidor.
 */
const PERMITIDO = new Set(["assets", "index.html", "documento.html", "wasm", "aerobim-mark.svg"]);

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
