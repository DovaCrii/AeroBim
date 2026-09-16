/**
 * `opentype.js` servido por nosotros, con la forma que espera quien lo importa.
 *
 * ## Por qué existe este archivo de dos líneas
 *
 * `three/examples/jsm/loaders/TTFLoader.js` trae la URL escrita dentro:
 *
 *     import opentype from "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/+esm";
 *
 * y algo de la cadena de arranque de That Open lo importa, así que la petición sale **al cargar la
 * página**. Con la CSP aplicada —`script-src 'self'`— el navegador la bloquea, el módulo no
 * resuelve y la aplicación **no llega a montarse**: la pantalla negra del visor en producción.
 *
 * El alias de `vite.config.ts` manda esa URL aquí. Y hace falta este intermediario en vez de
 * apuntar al paquete directamente porque **las dos variantes no tienen la misma forma**: el bundle
 * `+esm` de jsdelivr expone un `default`, y el ESM que publica npm exporta solo nombres. Apuntando
 * al paquete, el build falla con «Missing export» — que al menos falla ruidosamente, al contrario
 * que todo lo demás de esta historia.
 *
 * `import * as` y reexportar como `default` es exactamente lo que hacía el bundle del CDN.
 */

import * as opentype from "opentype.js";

export default opentype;
