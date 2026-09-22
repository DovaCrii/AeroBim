/**
 * **Qué se hace con un archivo que alguien acaba de soltar, decidido antes de tocar WASM.**
 *
 * ## El defecto que esto cierra
 *
 * `openFile` repartía así, y la última línea es el problema:
 *
 *     if (nombre.endsWith(".dxf")) return openDxf(file);
 *     if (nombre.endsWith(".laz") || nombre.endsWith(".las")) return openCloud(file);
 *     return openIfc(file);          // ← todo lo demás
 *
 * «Todo lo demás» incluye **un DWG**. Un DWG es binario y `web-ifc` espera texto STEP, así que el
 * lector recorre memoria que no le pertenece y el WebAssembly se cae con:
 *
 *     memory access out of bounds
 *
 * Eso es lo que el usuario vio en la cinta, en rojo. No dice qué archivo, ni por qué, ni qué hacer
 * — y encima **parece un fallo del producto** cuando es una limitación conocida, documentada y
 * decidida: `docs/FORMATOS.md` explica que AeroBim lee IFC, DXF y COPC, y que DWG y DGN son
 * formatos cerrados cuyo único lector abierto es GPL-3 y contagiaría la licencia.
 *
 * El `accept=".ifc,.dxf,.laz,.las"` del selector **no protege**: filtra el diálogo, no el arrastre,
 * y cualquiera puede elegir «todos los archivos».
 *
 * ## Es el mismo arreglo que el de las nubes, un formato más arriba
 *
 * `nubes.ts` ya traduce «COPC info VLR is required» a algo accionable. Esto va un paso antes: hay
 * archivos que **no hace falta intentar** para saber que no se van a poder leer, y probarlos cuesta
 * una caída de WASM en vez de una frase.
 *
 * ## Y por qué esta lista y no una de lo aceptado
 *
 * Porque lo desconocido **sí** se intenta como IFC, y eso es deliberado: un IFC puede llegar con
 * otra extensión —`.ifczip`, o sin extensión desde un sistema de archivos ajeno— y rechazarlo por
 * el nombre sería peor. Lo que se nombra aquí es lo que se sabe que no se puede, que es una lista
 * corta y estable.
 */

/** Qué hacer con el archivo. */
export type Destino =
  | { tipo: "modelo" }
  | { tipo: "plano" }
  | { tipo: "nube" }
  | { tipo: "no-se-puede"; motivo: string };

/**
 * Los formatos de CAD que **no se leen aquí**, con lo que hay que hacer con cada uno.
 *
 * Las dos salidas son reales y están documentadas en `docs/FORMATOS.md`: subirlo al registro —que
 * lo convierte a DXF si el servidor tiene ODA File Converter— o guardarlo como DXF en el propio
 * CAD, que es un «Guardar como» y no depende de nadie.
 */
const CERRADOS: Record<string, string> = {
  dwg: "DWG",
  dgn: "DGN",
  rvt: "RVT",
  nwd: "NWD",
  nwc: "NWC",
  skp: "SKP",
};

/** La extensión, en minúsculas y sin el punto. Cadena vacía si no tiene. */
export function extensionDe(nombre: string): string {
  const limpio = nombre.toLowerCase().trim();
  const punto = limpio.lastIndexOf(".");
  return punto === -1 ? "" : limpio.slice(punto + 1);
}

/**
 * Qué hacer con este archivo, **por su nombre y sin abrirlo**.
 *
 * Devolver el motivo en vez de lanzar es deliberado: quien llama decide si lo enseña en la cinta,
 * en un cartel o en el sitio donde se soltó, y un `throw` obligaría a envolver cada llamada.
 */
export function queHacerCon(nombre: string): Destino {
  const extension = extensionDe(nombre);

  if (extension === "dxf") return { tipo: "plano" };
  if (extension === "laz" || extension === "las") return { tipo: "nube" };

  const cerrado = CERRADOS[extension];
  if (cerrado) {
    return {
      tipo: "no-se-puede",
      motivo:
        `«${nombre}» es un archivo ${cerrado}, y el visor no lo lee. ` +
        `Súbelo al registro del proyecto —si el servidor tiene el conversor, sale su DXF y ese sí se abre— ` +
        `o guárdalo como DXF desde tu CAD. Está explicado en docs/FORMATOS.md.`,
    };
  }

  // Lo desconocido se intenta como IFC: ver el comentario de arriba.
  return { tipo: "modelo" };
}
