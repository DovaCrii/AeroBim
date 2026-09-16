/**
 * **El visor no puede depender de internet para arrancar, y dependía.**
 *
 * ## La avería
 *
 * `OBC.FragmentsManager.getWorker()` —la forma que la documentación de That Open recomienda— se
 * descarga el worker de `unpkg.com` **en tiempo de ejecución**. En `p340`, el 2026-09-16, eso dejó
 * el visor en **pantalla negra**: la CSP de producción aplica `connect-src 'self'`, la descarga se
 * bloquea, `init()` no termina nunca y el estado se queda en «Iniciando visor…».
 *
 * ## Por qué ningún oráculo lo vio
 *
 * Porque en desarrollo **funciona**, y por el peor motivo posible: `CSP_REPORT_ONLY=True`, así que
 * el navegador **anota la violación y la permite**. La línea estaba en la consola desde el primer
 * día, como un `[info]` entre otros dos. Nadie mira un informe que no rompe nada *ahí*.
 *
 * Es el patrón exacto que este repositorio ya conoce con otros nombres: una diferencia entre
 * desarrollo y producción que **no falla en ninguno de los dos sitios donde se mira**.
 *
 * ## Qué fija esta prueba, y qué no
 *
 * No arranca un visor —eso pide un navegador con WebGL— sino que comprueba **el código fuente**:
 * que no quede ninguna URL de CDN escrita, y que la que se usa sea del propio origen. Es poco, y es
 * justo lo que habría bastado: la avería era una llamada a una función cuyo nombre no dice que
 * descargue nada.
 *
 * `AGENTS.md` ya prohibía esto —«nada descarga su contenido de un CDN»— y era una regla escrita sin
 * nadie que la comprobara.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FUENTE = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

/**
 * `index.ts` **sin sus comentarios**, que es lo único que se ejecuta.
 *
 * **No es una comodidad: sin esto la prueba se lee a sí misma.** El porqué de este arreglo está
 * escrito ahí y nombra justo lo que se prohíbe —`FragmentsManager.getWorker`, `unpkg.com`— así que
 * midiendo el archivo entero falla por su propia explicación. Comprobado: fallaba.
 */
const CODIGO = FUENTE.split("\n")
  .filter((linea) => !/^\s*(\*|\/\/|\/\*)/.test(linea))
  .join("\n");

describe("el visor arranca sin internet", () => {
  it("no pide el worker de Fragments a un CDN", () => {
    // `getWorker()` no lleva la URL escrita: la compone dentro. Por eso se prohíbe **la llamada**,
    // que es lo único visible desde aquí — y lo único que había que ver.
    expect(CODIGO).not.toContain("FragmentsManager.getWorker");
  });

  it("lo pide a una ruta del propio origen", () => {
    expect(CODIGO).toContain('"/wasm/fragments-worker.mjs"');
  });

  it("no escribe ninguna URL de CDN", () => {
    for (const cdn of ["unpkg.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "esm.sh"]) {
      expect(CODIGO).not.toContain(cdn);
    }
  });
});
