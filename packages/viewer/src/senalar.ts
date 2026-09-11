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
 * ## Y la mitad que faltaba: **el punto que devuelve la librería no es un punto de la nube**
 *
 * Esto se escribió primero diciendo que la causa del fallo del usuario «no está reproducida de punta
 * a punta», porque revirtiendo el criterio el diagnóstico daba lo mismo —«0,0 px del cursor» con los
 * dos—. **Esa coincidencia era el síntoma, no el consuelo.** `Points.raycast` de Three, en
 * `testPoint`, hace esto con cada vértice que entra en el umbral:
 *
 * ```js
 * _ray.closestPointToPoint( point, intersectPoint );   // ← el pie de la perpendicular, SOBRE EL RAYO
 * intersects.push( { point: intersectPoint, distanceToRay: …, index: … } );
 * ```
 *
 * O sea que `golpe.point` **está siempre sobre la línea de visión**, y el vértice de verdad se
 * recupera por `golpe.index`. Dos consecuencias, las dos medidas con tres puntos a 20 m y el cursor
 * en el centro (`senalar.test.ts`):
 *
 * 1. **La coordenada que se devolvía no era la del punto levantado.** Está corrida hacia el rayo
 *    tanto como diga `distanceToRay` —medio metro, metro y pico, lo que permita el umbral—. En
 *    pantalla no se nota, porque por construcción cae bajo el cursor; se nota **al orbitar**, con la
 *    marca flotando al lado del punto. Y es lo que guarda la nota.
 * 2. **El criterio de más arriba estaba recibiendo píxeles inútiles.** Los tres candidatos
 *    proyectaban a `(800,0 · 450,0)`, el cursor exacto, mientras sus vértices caían a 800, 819,5 y
 *    846,8 px. Con todas las distancias en cero, el filtro no distinguía nada y la elección
 *    degeneraba en «el de delante» — el comportamiento viejo. **Por eso revertir no cambiaba la
 *    medida.**
 *
 * Se arregla leyendo el vértice: {@link verticeDelGolpe}. Con él, el criterio de píxeles distingue de
 * verdad y la coordenada que viaja a la nota es la del punto que se levantó en terreno.
 *
 * ## Y esta vez sí está reproducido de punta a punta
 *
 * Sobre el levantamiento real del Camino Agrícola —15 366 674 puntos—, con el oráculo nuevo del modo
 * `nube` («¿lo devuelto **es** un punto de la nube?»), y revirtiendo el arreglo para comprobar que
 * falla:
 *
 * | | distancia al vértice más cercano | px del cursor |
 * | --- | --- | --- |
 * | Como estaba | **0,5915 m — NO (mal)** | 0,0 |
 * | Arreglado | **0,0000 m — sí** | 5,9 |
 *
 * Cincuenta y nueve centímetros de error en una nota de obra, y en pantalla no se veía: la marca cae
 * bajo el cursor porque está sobre la línea de visión. Se ve al orbitar, y se ve en la coordenada.
 */

import * as THREE from "three";

/**
 * **El vértice de la nube que produjo un golpe del rayo**, en coordenadas del mundo.
 *
 * `golpe.point` no sirve para esto: es el pie de la perpendicular sobre el rayo, no el punto. El
 * vértice está en el atributo `position` del objeto, en la posición `golpe.index`, y hay que llevarlo
 * al mundo con la matriz del objeto — que en una nube calzada **no es la identidad**.
 *
 * Devuelve `null` cuando el golpe no viene de un `Points` con índice (no debería pasar aquí, y si
 * pasa lo honesto es que quien llama use `golpe.point` y lo sepa).
 */
export function verticeDelGolpe(golpe: THREE.Intersection): THREE.Vector3 | null {
  if (golpe.index === undefined) return null;
  const geometria = (golpe.object as Partial<THREE.Points>).geometry;
  if (geometria === undefined) return null;
  const posicion = geometria.getAttribute("position");
  if (posicion === undefined || golpe.index >= posicion.count) return null;
  return new THREE.Vector3()
    .fromBufferAttribute(posicion as THREE.BufferAttribute, golpe.index)
    .applyMatrix4(golpe.object.matrixWorld);
}

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
