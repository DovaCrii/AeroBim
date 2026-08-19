import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const enRaiz = (ruta: string) => resolve(here, "../../node_modules", ruta);

/**
 * Aislamiento de origen: sin esto el WASM multihilo no puede usarse.
 *
 * `web-ifc-mt.wasm` necesita `SharedArrayBuffer`, y el navegador solo lo expone en un
 * contexto con aislamiento de origen. Con estas dos cabeceras `crossOriginIsolated`
 * pasa a `true` — verificado. El despliegue de producción tiene que servir las mismas
 * dos cabeceras.
 */
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: [
      /**
       * `@thatopen/components` no declara `exports` en su `package.json` y su `main`
       * apunta a `dist/index.cjs`. Este alias fuerza el ESM (`dist/index.mjs`), que es
       * la variante correcta para el navegador y evita el interop CJS→ESM.
       *
       * **No confundir con la causa del cuelgue de `F0.4`**: se probó con y sin este
       * alias y el síntoma no cambia. Se deja porque apuntar al ESM es lo correcto, no
       * porque arregle ese problema — que sigue abierto, ver `MASTER_PLAN.md`.
       *
       * `@thatopen/fragments` sí declara `exports` correctamente y no necesita alias.
       */
      {
        find: /^@thatopen\/components$/,
        replacement: enRaiz("@thatopen/components/dist/index.mjs"),
      },
    ],
  },

  optimizeDeps: {
    // web-ifc carga su WASM por ruta y no sobrevive el pre-bundling.
    exclude: ["web-ifc"],
  },

  worker: {
    format: "es",
  },

  server: {
    headers: crossOriginIsolation,
  },

  preview: {
    headers: crossOriginIsolation,
  },
});
