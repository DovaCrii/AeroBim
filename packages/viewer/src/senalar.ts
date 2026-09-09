/**
 * Elegir **qué punto de la nube es el que se señaló**. `F2.2`, `F12.14`.
 *
 * ## El defecto que esto arregla
 *
 * El usuario lo dijo así: «está fallando al pickear el punto al que quiero dejar» la nota. Y el
 * diagnóstico lo tenía medido sin llamarlo defecto: sobre el levantamiento del Camino Agrícola,
 * señalar «devolvió un punto a 0 mm del rayo **y a 18,10 m del punto al que se apuntó**», con la
 * nota «lo segundo es normal: se atrapa la superficie de delante, no la del fondo».
 *
 * No era normal. `Points.raycast` de Three acepta los puntos que caen dentro de un radio **en
 * metros del mundo** alrededor de la recta, y los devuelve **ordenados por profundidad**. Con eso,
 * el que gana es el más cercano a la cámara de entre todos los que rozan la línea de visión —no el
 * que está debajo del cursor—. Un punto suelto dieciocho metros por delante y a medio metro de la
 * línea le gana al que se estaba mirando.
 *
 * Y el radio en metros no tiene arreglo por sí solo: es el mismo a todas las profundidades, así que
 * un valor que a diez metros son seis píxeles, a ciento cuarenta son ochenta.
 *
 * ## Lo que hace en su lugar
 *
 * Lo que hace cualquier visor de nubes: de entre los candidatos, quedarse con los que caen **dentro
 * de un radio de píxeles del cursor** y, entre esos, tomar **el más cercano a la cámara**. Así el
 * punto elegido es uno que se está viendo debajo del ratón, y de los que hay ahí, el de delante —
 * que es el que la persona cree estar señalando.
 *
 * ## Lo que NO está demostrado, y conviene decirlo
 *
 * Que esto sea la causa del fallo que describió el usuario **no está reproducido de punta a punta**.
 * El modo `nube` del diagnóstico pincha sobre la proyección de un punto real de la nube, y en ese
 * escenario los dos criterios —el viejo y este— devuelven el mismo punto: comprobado revirtiendo el
 * cambio y volviendo a medir, los dos dan «0,0 px del cursor». O sea que el escenario del
 * diagnóstico no toca el caso malo, que necesita un punto suelto cerca de la línea de visión y
 * lejos del cursor — lo que pasa mirando en oblicuo sobre vegetación o un poste, no clicando encima
 * de un punto.
 *
 * Así que lo que hay es: un defecto **de algoritmo** cierto y arreglado, con su prueba de unidad
 * fijando el caso que falla —`senalar.test.ts`, primer caso—, y la confirmación de que sobre el
 * levantamiento real el punto devuelto cae a 0,0 px del cursor. Si el fallo del usuario persiste,
 * la causa es otra y hay que buscarla en otro sitio: dónde se dibuja la marca, o qué punto guarda
 * la nota frente al que devuelve esto.
 */

/** Un candidato ya proyectado a pantalla, con su profundidad. */
export interface Candidato<T> {
  /** Dónde cae en el lienzo, en píxeles desde su esquina superior izquierda. */
  readonly pixel: readonly [number, number];
  /** Distancia a la cámara. Menor es más cerca. */
  readonly profundidad: number;
  /** Lo que se quiera arrastrar consigo: el golpe del rayo, un índice, lo que sea. */
  readonly golpe: T;
}

/**
 * Cuántos píxeles de radio se aceptan alrededor del cursor.
 *
 * Seis: un poco más que el tamaño con el que se pintan los puntos. Con uno hay que acertar el
 * centro exacto de un punto de 2 px, que es cazar un píxel; con seis se señala la esquina que se
 * está mirando.
 */
export const RADIO_EN_PIXELES = 6;

/**
 * Hasta dónde se estira el radio cuando no hay **ningún** candidato debajo del cursor.
 *
 * Tres veces. Sirve para la zona rala de un levantamiento —donde los puntos están a más de seis
 * píxeles unos de otros— sin llegar a devolver un punto que está claramente en otro sitio: pasado
 * ese margen, la respuesta honesta es que ahí no había nada y quien mira lo vuelve a intentar.
 */
const HOLGURA = 3;

/**
 * El candidato que se señaló, o `null` si no había ninguno lo bastante cerca del cursor.
 *
 * `cursor` va en píxeles del lienzo, igual que `pixel` de cada candidato.
 */
export function masCercanoAlCursor<T>(
  candidatos: readonly Candidato<T>[],
  cursor: readonly [number, number],
  radio = RADIO_EN_PIXELES,
): Candidato<T> | null {
  const conDistancia = candidatos.map((candidato) => ({
    candidato,
    px: Math.hypot(candidato.pixel[0] - cursor[0], candidato.pixel[1] - cursor[1]),
  }));

  const dentro = conDistancia.filter((uno) => uno.px <= radio);
  if (dentro.length > 0) {
    // **Entre los que están debajo del cursor, el de delante.** Es la única parte que se parece a
    // lo de antes, y es la correcta: dos puntos en la misma dirección de mirada son una superficie
    // delante de otra, y se señala la de delante.
    let mejor = dentro[0] as (typeof dentro)[number];
    for (const uno of dentro)
      if (uno.candidato.profundidad < mejor.candidato.profundidad) mejor = uno;
    return mejor.candidato;
  }

  // Nada bajo el cursor: se estira el radio y se toma **el más cercano en pantalla**, no el de
  // delante. Aquí la pregunta ya no es «cuál de los que veo» sino «a qué apuntaba», y eso lo
  // contesta la distancia al cursor.
  let mejor: (typeof conDistancia)[number] | null = null;
  for (const uno of conDistancia) {
    if (uno.px > radio * HOLGURA) continue;
    if (mejor === null || uno.px < mejor.px) mejor = uno;
  }
  return mejor === null ? null : mejor.candidato;
}
