/**
 * Copia el WASM de `web-ifc` a `public/wasm/`.
 *
 * AeroBim es local-first: la aplicación tiene que abrir un modelo en una faena sin
 * internet. That Open descarga este WASM de un CDN por defecto, así que se sirve
 * desde el propio despliegue. Los archivos son artefactos de `node_modules` y no se
 * confirman al repositorio — este script los repone en cada `dev` y `build`.
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
