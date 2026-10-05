/**
 * Qué parte de una nube cae dentro de **una franja de perfil**, sin mirar la cámara (2026-10-05).
 *
 * ## Por qué esto no es `nodosVisibles`
 *
 * `nodosVisibles` decide qué bajar **para dibujar lo que se ve**: recorta por el tronco de visión y
 * descarta lo que ocupa pocos píxeles. Un perfil pregunta otra cosa —«todo lo que hay a lo largo de
 * este trazado»— y su respuesta **no puede depender de dónde esté la cámara**: el mismo eje con dos
 * posiciones de cámara tiene que dar el mismo perfil. Con el criterio de pantalla, acercarse a la
 * nube cambiaba lo que se medía.
 *
 * ## Los tres sistemas, y dónde se hace cada cosa
 *
 * El octree vive en **coordenadas del archivo** (cota en Z), los puntos cargados en las **locales de
 * la nube** (archivo menos desplazamiento, ejes cambiados) y la franja en las **de la escena**. Entre
 * las dos últimas hay una matriz afín —la del calce—, que es un giro alrededor del eje vertical, una
 * escala y una traslación.
 *
 * En vez de invertir la franja, **se llevan a la escena las cajas de los nodos** y, después, los
 * puntos. La matriz sí se puede aplicar: la inversa es la que invita a equivocarse de signo, y una
 * caja girada alrededor de Y sigue siendo una caja alineada con los ejes una vez envuelta, así que el
 * resultado es un **superconjunto seguro**: nunca se deja fuera un nodo que toque la franja.
 */

import {
  cajaTocaFranja,
  rangoDeS,
  sDe,
  type Franja,
  type PuntoDeEscenaM,
} from "../perfiles/eje.js";
import type { CajaDeEscenaM } from "../perfiles/eje.js";
import { aplicar, archivoAEscena, type Matriz4 } from "./matriz.js";
import { cajaDeNodo, type Cubo, type NodoDelArbol } from "./octree.js";

/**
 * La caja de un nodo **en la escena**: del archivo a las coordenadas locales de la nube, y de ahí a
 * la escena con la matriz del calce, si la hay.
 *
 * Se transforman las ocho esquinas y se envuelven: con un giro alrededor de Y la caja ya no queda
 * alineada con los ejes, y la envolvente es la que no deja nada fuera.
 */
export function cajaDeNodoEnEscena(
  cubo: Cubo,
  clave: { d: number; x: number; y: number; z: number },
  desplazamiento: readonly [number, number, number],
  matriz: Matriz4 | null,
): CajaDeEscenaM {
  const c = cajaDeNodo(cubo, clave);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of [c[0], c[3]]) {
    for (const y of [c[1], c[4]]) {
      for (const z of [c[2], c[5]]) {
        const local = archivoAEscena([x, y, z], desplazamiento);
        const enEscena = matriz === null ? local : aplicar(matriz, local);
        for (let i = 0; i < 3; i += 1) {
          min[i] = Math.min(min[i]!, enEscena[i]!);
          max[i] = Math.max(max[i]!, enEscena[i]!);
        }
      }
    }
  }
  return { min, max };
}

/** Cómo se pide la selección de nodos de una franja. */
export interface CriterioDeFranja {
  readonly cubo: Cubo;
  /** El desplazamiento que el cargador restó a la nube, en coordenadas del archivo. */
  readonly desplazamiento: readonly [number, number, number];
  /** La matriz del calce, o `null` si la nube está donde la dejó el cargador. */
  readonly matriz: Matriz4 | null;
  readonly franja: Franja;
}

/** Qué nodos hay que bajar para una franja. */
export interface SeleccionDeFranja {
  /** Los nodos que tocan la franja, **lo menos profundo primero**. */
  readonly elegidos: NodoDelArbol[];
  /** Cuántos puntos suman, **dentro o fuera de la franja**: un nodo trae todos los suyos. */
  readonly puntos: number;
  /** Nodos que no tocan la franja. */
  readonly fueraDeLaFranja: number;
}

/**
 * Los nodos del octree que tocan la franja, **todos**, lo menos profundo primero.
 *
 * El orden decide qué pasa cuando el techo se queda corto: lo que se pierde es el detalle fino y no
 * un trozo del trazado. Una muestra más rala de **todo** el perfil es un perfil; el detalle completo
 * de la mitad, no.
 *
 * **Aquí no hay techo, y es a propósito.** Un nodo trae todos sus puntos y solo una parte cae en la
 * franja: contar los del nodo contra el techo dejaba fuera hasta la raíz —que tiene más puntos que
 * cualquier techo razonable— y el perfil salía vacío con una nube llena. El techo cuenta los puntos
 * **aceptados**, y lo aplica {@link cupoDeUnNodo} a medida que se leen.
 */
export function nodosDeLaFranja(
  nodos: readonly NodoDelArbol[],
  criterio: CriterioDeFranja,
): SeleccionDeFranja {
  const elegidos: NodoDelArbol[] = [];
  let fueraDeLaFranja = 0;
  let puntos = 0;
  for (const nodo of nodos) {
    const caja = cajaDeNodoEnEscena(
      criterio.cubo,
      nodo.clave,
      criterio.desplazamiento,
      criterio.matriz,
    );
    if (cajaTocaFranja(criterio.franja, caja)) {
      elegidos.push(nodo);
      puntos += nodo.puntos;
    } else {
      fueraDeLaFranja += 1;
    }
  }
  elegidos.sort((a, b) => a.clave.d - b.clave.d);
  return { elegidos, puntos, fueraDeLaFranja };
}

/** Cuántos puntos de un nodo entran, y de cuánto en cuánto se toman. */
export interface CupoDeNodo {
  /** `1` toma todos; `k`, uno de cada `k`. */
  readonly paso: number;
  /** Cuántos puntos entran. */
  readonly admitidos: number;
  /** `true` si ya no cabe nada más: los nodos siguientes, más profundos, se quedan fuera. */
  readonly agotado: boolean;
}

/**
 * Cuántos de los `enElNodo` puntos que caen en la franja se aceptan, dado el techo y los que ya
 * entraron.
 *
 * Si caben, todos. Si no, **se adelgaza el nodo** —uno de cada `k`, repartido a lo largo de todo él— y
 * se da por agotado el techo. Tomar los primeros que llegaran sesgaría la muestra hacia el principio
 * del nodo; descartar el nodo entero, que es lo que se hacía, dejaba el perfil vacío.
 */
export function cupoDeUnNodo(aceptados: number, enElNodo: number, maximo: number): CupoDeNodo {
  const queda = Math.max(0, maximo - aceptados);
  if (enElNodo <= queda) return { paso: 1, admitidos: enElNodo, agotado: enElNodo === queda };
  if (queda === 0) return { paso: 1, admitidos: 0, agotado: true };
  const paso = Math.ceil(enElNodo / queda);
  return { paso, admitidos: Math.ceil(enElNodo / paso), agotado: true };
}

/**
 * Dónde cae un punto de la escena respecto a la franja: su coordenada horizontal del dibujo `s`, o
 * `null` si queda fuera de ella, a lo largo o a lo ancho.
 *
 * El espesor se mide **a ambos lados** del eje: `espesorM` es el grosor total, no el de cada lado.
 */
export function puntoEnLaFranja(franja: Franja, punto: PuntoDeEscenaM): number | null {
  const s = sDe(franja, punto);
  const [sMin, sMax] = rangoDeS(franja);
  if (s < sMin || s > sMax) return null;
  const lateralM =
    (punto[0] - franja.centroM[0]) * franja.miraHaciaM[0] +
    (punto[2] - franja.centroM[1]) * franja.miraHaciaM[1];
  return Math.abs(lateralM) <= franja.espesorM / 2 ? s : null;
}
