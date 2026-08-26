/**
 * Copia el WASM de `web-ifc` a `public/wasm/`.
 *
 * AeroBim es local-first: la aplicación tiene que abrir un modelo en una faena sin
 * internet. That Open descarga este WASM de un CDN por defecto, así que se sirve
 * desde el propio despliegue. Los archivos son artefactos de `node_modules` y no se
 * confirman al repositorio — este script los repone en cada `dev` y `build`.
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

console.log(`web-ifc: ${files.length} archivos WASM copiados a public/wasm/`);
