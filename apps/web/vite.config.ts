import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const enRaiz = (ruta: string) => resolve(here, "../../node_modules", ruta);

/**
 * **NO servir `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`.**
 *
 * Parece contraintuitivo —el aislamiento de origen habilita `SharedArrayBuffer` y con él
 * el WASM multihilo, que sería más rápido— pero rompe el visor. `web-ifc` decide así:
 *
 * ```js
 * if (self.crossOriginIsolated && !forceSingleThread) usar web-ifc-mt.wasm
 * else                                               usar web-ifc.wasm
 * ```
 *
 * Y su variante multihilo **no funciona empaquetada**: Emscripten arranca los workers de
 * pthreads con `new Worker(pthreadMainJs)`, donde `pthreadMainJs` queda `undefined`. El
 * navegador pide `/undefined`, recibe el `index.html`, y falla con
 * `Unexpected token '<'` dentro del worker — la promesa de conversión no se rechaza
 * nunca, así que la interfaz se queda esperando sin un solo error visible.
 *
 * `IfcImporter` no expone el flag `forceSingleThread` de `IfcAPI.Init`, así que **la única
 * palanca es dejar `crossOriginIsolated` en `false`**. El modo monohilo rinde de sobra:
 * 24 ms de parseo y 643 ms de conversión sobre un IFC de 1,5 MB.
 *
 * El visor comprueba esto al arrancar y falla con un mensaje explícito en vez de
 * colgarse — ver `packages/viewer`.
 */

export default defineConfig(({ command }) => ({
  /**
   * **Solo al construir.** Django publica el SPA construido bajo `/static/visor/`, así que
   * los assets tienen que resolverse desde ahí; en desarrollo la aplicación vive en la raíz
   * del servidor de Vite y ponerle prefijo rompería el flujo de siempre —y `diag.html`—.
   *
   * `import.meta.env.BASE_URL` refleja este valor, y de ahí sale la ruta del WASM: ver
   * `RUTA_WASM` en `src/App.tsx`.
   */
  base: command === "build" ? "/static/visor/" : "/",

  build: {
    /**
     * **Dos páginas, un solo build.** El visor de modelos y el del documento (`F8.6`) comparten
     * los assets, el `base`, el WASM y el paso de limpieza; lo único que cambia es qué HTML
     * sirve Django. Un PDF en el visor 3D cargaría Three.js y `web-ifc` para nada, y un
     * proyecto de build aparte duplicaría las cuatro cosas que ya están resueltas aquí.
     */
    rollupOptions: {
      input: {
        index: resolve(here, "index.html"),
        documento: resolve(here, "documento.html"),
      },
    },
  },

  server: {
    /**
     * El registro documental vive en Django, en otro puerto durante el desarrollo. Sin este
     * puente, un `fetch("/api/…")` desde el SPA de Vite pediría a sí mismo y devolvería el
     * `index.html`, que falla con `Unexpected token '<'` — el mismo síntoma que ya costó una
     * sesión con el WASM, y por la misma razón: una ruta que no existe devuelve la página.
     *
     * En producción no hace falta: el mismo origen sirve las dos cosas.
     */
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },

  plugins: [react(), tailwindcss()],

  resolve: {
    /**
     * Una sola copia de Three.js en la página.
     *
     * Sin esto el navegador avisa "Multiple instances of Three.js being imported": los
     * paquetes de That Open están fuera del pre-bundling y resuelven `three` por su ruta de
     * archivo, mientras la aplicación usa la copia pre-empaquetada. Dos copias significan
     * dos jerarquías de clases distintas, así que un `instanceof THREE.Mesh` puede fallar
     * sobre un objeto que sí es un mesh — la clase de fallo que aparece meses después y no
     * se entiende.
     */
    dedupe: ["three"],

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

      /**
       * **`opentype.js` deja de bajarse de un CDN, y esto era la pantalla negra del visor.**
       *
       * `three/examples/jsm/loaders/TTFLoader.js` trae la URL escrita dentro:
       *
       *     import("https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/+esm")
       *
       * y algo de la cadena de arranque de That Open lo importa, así que la petición sale **al
       * cargar la página**. En producción la CSP se aplica —`script-src 'self'`—, el navegador la
       * bloquea, el módulo no resuelve y **la aplicación no llega a montarse**: pantalla negra.
       *
       * Medido el 2026-09-16 poniendo `CSP_REPORT_ONLY=False` en desarrollo, que es lo que
       * reproduce producción: `document.body.innerText` **vacío** y un solo error en la consola.
       *
       * Antes de medirlo dije que esto no bloqueaba el arranque. No tenía prueba: en desarrollo la
       * política es solo un informe, así que la descarga **nunca llegaba a bloquearse** y el visor
       * arrancaba con ella. Es el mismo error de razonamiento que dejó pasar el worker de
       * Fragments — mirar el sitio donde el fallo no ocurre.
       *
       * El alias apunta al paquete de verdad, instalado como dependencia: no se pierde nada, solo
       * deja de salir de internet. Es la regla de `AGENTS.md` y el motivo por el que existe — una
       * faena sin internet habría dado la misma pantalla negra.
       *
       * **Pasa por `src/opentype-local.ts` y no por el paquete directamente**, porque las dos
       * variantes no tienen la misma forma: el bundle `+esm` de jsdelivr expone un `default` y el
       * ESM de npm exporta solo nombres. Apuntando al paquete, el build falla con «Missing
       * export» — el porqué largo está en ese archivo.
       */
      {
        find: "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/+esm",
        replacement: resolve(here, "src/opentype-local.ts"),
      },
    ],
  },

  optimizeDeps: {
    // Ninguno sobrevive el pre-bundling:
    //
    // - `web-ifc` carga su WASM por ruta.
    // - `@thatopen/fragments` expone su worker como subpath (`@thatopen/fragments/worker`)
    //   y lo instancia por referencia a su propio módulo. Empaquetado, esa referencia se
    //   rompe y el worker no responde. `@thatopen/components` lo arrastra.
    // `three` se excluye por otra razón: los paquetes de That Open, al estar fuera del
    // pre-bundling, lo resuelven por su ruta de archivo, mientras la aplicación usaba la
    // copia pre-empaquetada. Dos rutas son **dos módulos distintos**, y el navegador avisa
    // "Multiple instances of Three.js being imported". Con `resolve.dedupe` no basta: hay
    // que sacarlo del pre-bundling para que todos carguen el mismo archivo.
    exclude: ["web-ifc", "@thatopen/fragments", "@thatopen/components", "three"],
  },

  worker: {
    format: "es",
  },
}));
