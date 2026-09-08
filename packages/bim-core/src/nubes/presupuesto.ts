/**
 * Cuánta memoria pesa una nube de puntos en la tarjeta, y cuántos puntos caben.
 *
 * ## Por qué este cálculo decide el formato, y no es un detalle de implementación
 *
 * `F2.5` tiene que decidir **qué formato abre el visor**, y la respuesta depende de un solo número:
 * si la nube entera cabe en memoria, basta un lector de un archivo; si no cabe, hace falta un
 * formato **con niveles de detalle** —un octree— y eso cambia el pipeline de conversión entero.
 *
 * El número no se estima: sale de sumar los bytes de los atributos que se suben a la tarjeta. Una
 * nube no es una malla —no tiene índices, ni normales, ni coordenadas de textura—, así que la cuenta
 * es corta y exacta.
 *
 * ## La doble contabilidad, que es la mitad del problema
 *
 * **Un atributo de Three.js vive dos veces**: el `TypedArray` en el montón de JavaScript y su copia
 * subida a la tarjeta. `BufferAttribute` guarda la referencia al arreglo, así que mientras el objeto
 * esté en la escena **las dos copias existen** — salvo que se suelte el arreglo a mano después de
 * subirlo. Contar solo la tarjeta subestima el consumo real a la mitad, y es justo el error que hace
 * que una nube «que cabía» cuelgue la pestaña.
 *
 * De ahí que `presupuesto()` devuelva las tres cifras por separado y no una sola: la de la tarjeta,
 * la de JavaScript, y la suma. Quien decide elige cuál mira, sabiendo qué está mirando.
 *
 * ## Lo que este módulo no sabe
 *
 * **No sabe cuánta memoria tiene el equipo de nadie.** El presupuesto disponible se recibe como
 * argumento porque depende de la tarjeta, del navegador y de lo que ya haya cargado —un IFC de
 * Fragments ocupa lo suyo en la misma escena—. Un valor inventado aquí se leería como medido.
 */

/**
 * Los atributos que se suben por punto, y lo que ocupa cada uno.
 *
 * Los tamaños son los del `TypedArray` correspondiente, que es exactamente lo que Three.js reserva y
 * sube: los atributos van en búferes separados —no entrelazados—, así que no hay relleno de
 * alineación que contar.
 */
export const BYTES_DE_ATRIBUTO = {
  /** `position`: `Float32Array` de 3 componentes. La precisión simple es la que acepta WebGL. */
  posicion: 12,
  /** `color`: `Uint8Array` de 3 componentes, normalizado. Un color de 8 bits por canal basta. */
  color: 3,
  /** `intensity`: `Uint16Array` de 1 componente. Es como la declara LAS. */
  intensidad: 2,
  /** `classification`: `Uint8Array` de 1 componente. LAS la define de 0 a 255. */
  clase: 1,
} as const;

/** Un atributo de los que se pueden subir por punto. */
export type Atributo = keyof typeof BYTES_DE_ATRIBUTO;

/**
 * Las tres cifras de una nube cargada, en bytes.
 *
 * `total` es `tarjeta + javascript` y no una medida aparte: se devuelve calculada para que nadie
 * tenga que volver a sumarla, y para que la suma sea la misma en todas partes.
 */
export interface Presupuesto {
  /** Lo que ocupan los búferes subidos a la tarjeta gráfica. */
  tarjeta: number;
  /** Lo que ocupan los mismos datos en el montón de JavaScript, mientras no se suelten. */
  javascript: number;
  /** La suma de las dos, que es lo que consume de verdad una nube recién cargada. */
  total: number;
}

/**
 * Los bytes que ocupa **un** punto con los atributos dados.
 *
 * Los atributos repetidos se cuentan una sola vez: pedir `["posicion", "posicion"]` no sube nada dos
 * veces, porque un `BufferGeometry` tiene un atributo `position` y no dos.
 */
export function bytesPorPunto(atributos: readonly Atributo[]): number {
  const unicos = new Set(atributos);
  let bytes = 0;
  for (const atributo of unicos) bytes += BYTES_DE_ATRIBUTO[atributo];
  return bytes;
}

/**
 * Lo que consume una nube de `puntos` puntos con esos atributos.
 *
 * Un número de puntos negativo o no entero se trata como cero: es un dato mal leído, y devolver un
 * presupuesto negativo haría que el llamador creyera que le sobra memoria.
 */
export function presupuesto(puntos: number, atributos: readonly Atributo[]): Presupuesto {
  const validos = Number.isFinite(puntos) && puntos > 0 ? Math.floor(puntos) : 0;
  const porPunto = bytesPorPunto(atributos);
  const tarjeta = validos * porPunto;
  return { tarjeta, javascript: tarjeta, total: tarjeta * 2 };
}

/**
 * Cuántos puntos caben en `bytesDisponibles`, contando **las dos copias**.
 *
 * Se cuentan las dos a propósito: es la pregunta que importa al cargar —«¿entra esta nube?»— y
 * responderla con la mitad del consumo es responder que sí a nubes que cuelgan la pestaña. Quien
 * suelte el arreglo después de subirlo puede duplicar el resultado a conciencia.
 *
 * Sin atributos —o con un presupuesto que no da ni para un punto— devuelve cero.
 */
export function puntosQueCaben(bytesDisponibles: number, atributos: readonly Atributo[]): number {
  const porPunto = bytesPorPunto(atributos);
  if (porPunto === 0) return 0;
  if (!Number.isFinite(bytesDisponibles) || bytesDisponibles <= 0) return 0;
  return Math.floor(bytesDisponibles / (porPunto * 2));
}

/**
 * De cuántos en cuántos hay que tomar puntos para que `puntos` quepan en `cabida`.
 *
 * Es el salto de un diezmado regular —uno de cada `n`—, que es el recorte más barato que existe y el
 * que `F2.3` necesita para su control de densidad. Devuelve `1` cuando la nube ya cabe: **nunca
 * menos de uno**, porque un salto de cero no avanza y uno fraccionario no es un salto.
 *
 * Un diezmado regular no es un nivel de detalle: reparte la pérdida por igual en vez de guardar
 * detalle donde se está mirando. Sirve para que una nube grande se pueda ver, no para medir sobre
 * ella.
 */
export function saltoParaCaber(puntos: number, cabida: number): number {
  if (!Number.isFinite(puntos) || puntos <= 0) return 1;
  if (!Number.isFinite(cabida) || cabida <= 0) return Math.ceil(puntos);
  if (puntos <= cabida) return 1;
  return Math.ceil(puntos / cabida);
}
