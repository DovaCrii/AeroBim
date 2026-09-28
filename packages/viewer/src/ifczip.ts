/**
 * Abrir un `.ifczip` desde el disco: **el tramo del modelo, descomprimido por el navegador**.
 *
 * El índice lo lee `bim-core` (`modeloDelZip`), que dice dónde están los datos y cuánto ocuparán;
 * aquí solo se descomprimen, con el `DecompressionStream` nativo —sin librerías, y sin pedir nada a
 * un CDN, que es la regla 10 de `AGENTS.md`—. `deflate-raw` es exactamente el método 8 del ZIP.
 */
import { esZip, modeloDelZip } from "@aerobim/bim-core";

/**
 * El mismo tope que el servidor (`AEROBIM_IFCZIP_MAXIMO_MB`, 2 GB por omisión): `web-ifc` corre en
 * WebAssembly de 32 bits y no abre un modelo mucho mayor, así que mejor decirlo antes.
 */
export const IFCZIP_MAXIMO_BYTES = 2048 * 1024 * 1024;

/** `true` si estos bytes son un zip y no un IFC. */
export { esZip };

/** Los bytes del IFC que trae un `.ifczip`. Lanza con un motivo legible si no se puede. */
export async function ifcDelZip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const modelo = modeloDelZip(bytes, IFCZIP_MAXIMO_BYTES);
  const tramo = bytes.subarray(modelo.inicio, modelo.fin);
  if (modelo.metodo === 0) return tramo.slice();

  // `slice` y no el `subarray` tal cual: `Blob` pide un búfer propio, no una vista que podría ser
  // de un `SharedArrayBuffer`. Copia lo comprimido, que es lo pequeño.
  const salida = new Blob([tramo.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const descomprimido = new Uint8Array(await new Response(salida).arrayBuffer());
  // **El índice dice cuánto ocupa, y se comprueba**: un zip que miente en su tamaño es un zip roto,
  // y abrir a medias un modelo afirmaría una obra que no es la que vino.
  if (descomprimido.length !== modelo.bytesDescomprimidos) {
    throw new Error(
      "El .ifczip está dañado: el modelo descomprimido no mide lo que dice su índice.",
    );
  }
  return descomprimido;
}
