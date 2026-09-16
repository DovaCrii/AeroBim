/**
 * Copia a `public/wasm/` los WASM que la aplicación tiene que servir ella misma.
 *
 * AeroBim es local-first: la aplicación tiene que abrir un modelo en una faena sin
 * internet. That Open descarga su WASM de un CDN por defecto, así que se sirve
 * desde el propio despliegue. Los archivos son artefactos de `node_modules` y no se
 * confirman al repositorio — este script los repone en cada `dev` y `build`.
 *
 * **Son dos paquetes, y el segundo llegó con las nubes de puntos (`F2.1`).** `laz-perf` es
 * quien descomprime un LAZ, y hace lo mismo: su WASM va en un archivo aparte y por defecto
 * lo busca al lado de su propio JavaScript, que empaquetado no está donde él cree. Si no se
 * copia aquí, la nube abre en la máquina de quien lo escribió —donde el archivo quedó a
 * mano— y falla en todas las demás. `packages/viewer/src/nubes.ts` le dice dónde está.
 *
 * **El de PDFium no está aquí, y es a propósito.** También sale de un CDN por defecto y
 * también hay que servirlo local (`F8.6`), pero ese lo resuelve Vite con un `import
 * "…/pdfium.wasm?url"`: así la ruta la calcula el empaquetador, con el prefijo
 * `/static/visor/` incluido, en vez de componerla a mano. `web-ifc` no admite ese camino
 * porque decide la ruta de su WASM en tiempo de ejecución.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "..", "public", "wasm");

// El paquete declara cada .wasm como subpath en sus `exports`, así que se resuelve uno
// por uno. No sirve pedirle `web-ifc/package.json`: eso no está exportado y Node lo
// rechaza con ERR_PACKAGE_PATH_NOT_EXPORTED.
const files = ["web-ifc.wasm", "web-ifc-mt.wasm"];

await mkdir(target, { recursive: true });
for (const file of files) {
  await copyFile(require.resolve(`web-ifc/${file}`), join(target, file));
}

// `laz-perf` sí exporta su `package.json`, pero se resuelve por la ruta del archivo dentro del
// paquete y **por la variante `web`**: las de `node` y `worker` son el mismo WASM con otro
// pegamento de JavaScript, y la que carga el navegador es esta.
await copyFile(require.resolve("laz-perf/lib/web/laz-perf.wasm"), join(target, "laz-perf.wasm"));

// ══════════════════════════════════════════════════════════════════════════════════════════
// **El worker de Fragments, y este no es un WASM: es la avería que dejaba el visor en negro.**
//
// `OBC.FragmentsManager.getWorker()` —la forma que la propia documentación de That Open
// recomienda— **se descarga el worker de unpkg en tiempo de ejecución**:
//
//     https://unpkg.com/@thatopen/fragments@3.4.7/dist/worker/worker.mjs
//
// En desarrollo eso funciona, y por el peor motivo posible: `CSP_REPORT_ONLY=True`, así que la
// violación se **anota y se permite**. En producción la política se aplica —`connect-src 'self'`—
// la descarga se bloquea, `init()` no termina nunca y el visor se queda en «Iniciando visor…»
// **sin un solo error en pantalla**. Medido en `p340` el 2026-09-16: pantalla negra.
//
// Es exactamente el fallo que `AGENTS.md` prohíbe —nada se descarga de un CDN— y la razón por la
// que la regla existe: una faena sin internet habría dado el mismo negro.
//
// Se copia igual que el WASM de `web-ifc` y por lo mismo: la biblioteca decide la URL **en tiempo
// de ejecución**, así que no vale el `import "…?url"` que Vite resuelve para PDFium.
//
// Se pide por el subpath `@thatopen/fragments/worker`, que es el que el paquete **exporta**. La
// ruta literal del archivo —`dist/worker.mjs`— la rechaza Node con `ERR_PACKAGE_PATH_NOT_EXPORTED`,
// y además el directorio real lleva mayúscula (`dist/Worker/`): en Windows daría igual y en la VM
// no. Dejar que los `exports` resuelvan es lo que hace que esto funcione en las dos.
await copyFile(require.resolve("@thatopen/fragments/worker"), join(target, "fragments-worker.mjs"));

console.log(
  `WASM copiados a public/wasm/: ${files.join(", ")}, laz-perf.wasm, fragments-worker.mjs`,
);
