/**
 * Medir del modelo a la nube: `F2.4`, el objetivo de salida de la Fase 2.
 *
 * ## La pregunta que contesta
 *
 * **«Lo que dice el proyecto, ¿está construido así?»** Se toma una zona —la caja de un elemento, o
 * una que se dibuje—, se miden todos los puntos del levantamiento que caen dentro contra la
 * superficie del modelo, y sale la desviación: cuánto, dónde, y de qué lado.
 *
 * Es la comparación por la que existe el producto, y hoy nadie la puede hacer sin software de pago.
 *
 * ## Por qué se mide por zonas y no de golpe
 *
 * Un levantamiento del proyecto son 15 millones de puntos y un modelo, decenas de miles de
 * triángulos. Medir todos contra todos son **cientos de miles de millones** de operaciones: no es
 * que tarde, es que no acaba. Los visores que lo hacen construyen antes un árbol sobre los
 * triángulos.
 *
 * Acá se resuelve de otra forma, que además es la que quiere quien coordina: **se acota a una
 * caja**. Los nodos del octree que no la tocan no se miran —eso ya lo sabe hacer `F2.3`— y del
 * modelo solo se toman los triángulos que la cruzan. Sobre un muro o un pilar eso son cientos de
 * triángulos y miles de puntos: se mide en un instante y el resultado se atribuye **a ese
 * elemento**, que es lo que hace falta para abrir una observación.
 *
 * ## Y dos topes, para que no se cuelgue en silencio
 *
 * Si la caja es enorme —el modelo entero— los dos límites cortan y **se dice cuánto se dejó fuera**.
 * Un resumen que no avisa de que midió una décima parte es un resumen que miente.
 */

import * as THREE from "three";

import {
  colorDeDesviacion,
  distanciaAlModelo,
  resumirDesviaciones,
  SIN_MEDIR,
  type Distancia,
  type ResumenDeDesviacion,
  type Triangulo,
} from "@aerobim/bim-core";

/**
 * Cuántos triángulos del modelo se aceptan en una medición.
 *
 * Cincuenta mil: sobre esa cifra la medición pasa de un instante a varios segundos, y una caja que
 * abarca tantos triángulos no es «un elemento» sino medio modelo — el resultado no se podría
 * atribuir a nada. Se corta y se avisa.
 */
export const MAXIMO_TRIANGULOS = 50_000;

/**
 * Cuántos puntos de la nube se miden como mucho.
 *
 * Doscientos mil. Con cincuenta mil triángulos eso son diez mil millones de comparaciones en el
 * peor caso, así que en la práctica manda el número de triángulos; el tope está para que una caja
 * mal puesta no bloquee la pestaña.
 */
export const MAXIMO_PUNTOS = 200_000;

/** El resultado de una medición, con lo que se midió y lo que se dejó fuera. */
export interface MedicionDeDesviacion {
  resumen: ResumenDeDesviacion;
  /** Cuántos triángulos del modelo entraron en la cuenta. */
  triangulos: number;
  /** Cuántos puntos de la nube se midieron. */
  puntos: number;
  /** Cuántos puntos había en la caja y **no** se midieron por el tope. */
  puntosFuera: number;
  /** Cuántos triángulos cruzaban la caja y **no** se usaron por el tope. */
  triangulosFuera: number;
  /** La tolerancia con la que se resumió, en metros. La pone quien mide. */
  toleranciaM: number;
  ms: number;
}

/** Nada medido, con los topes a cero: para cuando no hay ni modelo ni nube en la caja. */
export const NADA_MEDIDO: MedicionDeDesviacion = {
  resumen: SIN_MEDIR,
  triangulos: 0,
  puntos: 0,
  puntosFuera: 0,
  triangulosFuera: 0,
  toleranciaM: 0,
  ms: 0,
};

/**
 * Los triángulos de una lista de mallas de Fragments, **en coordenadas del mundo**.
 *
 * ## Por qué no se recorre la escena
 *
 * La primera versión traversaba `scene.three` buscando `THREE.Mesh`, y **no encontraba ninguna**:
 * con un IFC cargado, la escena tiene una `Scene`, tres luces y dos `Object3D` vacíos. Fragments 3.x
 * **no cuelga la geometría del grafo de Three.js** —dibuja por su propio camino— así que la
 * geometría hay que pedírsela a él con `getItemsGeometry`.
 *
 * `EdgeProjector`, que es lo que usa el generador de planos, tampoco vale aquí: **lee la escena
 * dibujada**, y en un navegador que no compone fotogramas no resuelve nunca — está documentado en
 * `drawings.ts`, que le pone un corte por falta de latido justamente por eso.
 *
 * ## Y la matriz de cada malla se aplica
 *
 * `MeshData` trae `positions`, `indices` y `transform`. Un modelo con cien pilares iguales guarda
 * **una** malla y cien matrices: quedarse con las posiciones sin transformar mediría contra el
 * primero y daría la desviación de los otros noventa y nueve como si estuvieran todos en el mismo
 * sitio.
 */
export function triangulosEnLaCaja(
  mallas: readonly MallaDeFragments[],
  caja: THREE.Box3,
  maximo = MAXIMO_TRIANGULOS,
): { triangulos: Triangulo[]; fuera: number } {
  const triangulos: Triangulo[] = [];
  let fuera = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cajaDelTriangulo = new THREE.Box3();

  for (const malla of mallas) {
    const posiciones = malla.positions;
    if (posiciones === undefined || posiciones.length === 0) continue;
    const indices = malla.indices;
    const cuantos = indices !== undefined ? indices.length : posiciones.length / 3;
    const matriz = malla.transform;

    const leer = (destino: THREE.Vector3, indice: number): THREE.Vector3 =>
      destino
        .set(
          posiciones[indice * 3] as number,
          posiciones[indice * 3 + 1] as number,
          posiciones[indice * 3 + 2] as number,
        )
        .applyMatrix4(matriz);

    for (let i = 0; i + 2 < cuantos; i += 3) {
      const i0 = indices !== undefined ? (indices[i] as number) : i;
      const i1 = indices !== undefined ? (indices[i + 1] as number) : i + 1;
      const i2 = indices !== undefined ? (indices[i + 2] as number) : i + 2;

      leer(a, i0);
      leer(b, i1);
      leer(c, i2);

      cajaDelTriangulo.makeEmpty().expandByPoint(a).expandByPoint(b).expandByPoint(c);
      if (!cajaDelTriangulo.intersectsBox(caja)) continue;

      if (triangulos.length >= maximo) {
        fuera += 1;
        continue;
      }
      triangulos.push([
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
      ]);
    }
  }

  return { triangulos, fuera };
}

/**
 * Lo que hace falta de una malla de Fragments, y nada más.
 *
 * Es la forma de `MeshData` de `@thatopen/fragments` reducida a los tres campos que se usan, para
 * que este módulo no dependa del paquete entero y se pueda alimentar con mallas escritas a mano en
 * una prueba.
 */
export interface MallaDeFragments {
  positions?: Float32Array | Float64Array;
  indices?: Uint8Array | Uint16Array | Uint32Array;
  transform: THREE.Matrix4;
}

/**
 * Mide la desviación de los puntos de la nube que caen en la caja, contra el modelo.
 *
 * `tolerancia` es la exigencia en metros, y **la pone quien mide**: el módulo no decide qué es un
 * defecto. `pintar` colorea la nube por desviación en el sitio, lo que hace visible de un golpe
 * dónde está el problema — y se puede pedir que no, para no perder el color que estuviera puesto.
 *
 * Los puntos se toman **en coordenadas del mundo**, con la matriz del calce aplicada: medir contra
 * los puntos sin calzar daría la desviación de la nube mal puesta, que es un número real de una
 * pregunta que nadie hizo.
 */
export function medirDesviacion(
  mallas: readonly MallaDeFragments[],
  nube: THREE.Object3D,
  caja: THREE.Box3,
  opciones: { toleranciaM: number; pintar?: boolean } = { toleranciaM: 0.02 },
): MedicionDeDesviacion {
  const t0 = performance.now();
  const { triangulos, fuera: triangulosFuera } = triangulosEnLaCaja(mallas, caja);
  if (triangulos.length === 0) {
    return {
      ...NADA_MEDIDO,
      triangulosFuera,
      toleranciaM: opciones.toleranciaM,
      ms: performance.now() - t0,
    };
  }

  nube.updateMatrixWorld(true);

  const distancias: Distancia[] = [];
  let puntosFuera = 0;
  const punto = new THREE.Vector3();

  for (const hijo of nube.children) {
    if (!(hijo instanceof THREE.Points)) continue;
    const geometria = hijo.geometry;
    // La caja del nodo, ya en el mundo: si no toca, no se mira un punto. Es el mismo recorte de
    // `F2.3`, aplicado aquí para no recorrer millones de puntos por nada.
    const suCaja = new THREE.Box3().setFromObject(hijo);
    if (!suCaja.intersectsBox(caja)) continue;

    const posicion = geometria.getAttribute("position") as THREE.BufferAttribute;
    const color = geometria.getAttribute("color") as THREE.BufferAttribute | undefined;
    const tinta =
      opciones.pintar === true && color !== undefined ? (color.array as Uint8Array) : null;

    for (let i = 0; i < posicion.count; i += 1) {
      punto.fromBufferAttribute(posicion, i).applyMatrix4(hijo.matrixWorld);
      if (!caja.containsPoint(punto)) continue;

      if (distancias.length >= MAXIMO_PUNTOS) {
        puntosFuera += 1;
        continue;
      }

      const d = distanciaAlModelo([punto.x, punto.y, punto.z], triangulos);
      if (d === null) continue;
      distancias.push(d);

      if (tinta !== null) {
        const [r, g, b] = colorDeDesviacion(d.metros, opciones.toleranciaM);
        tinta[i * 3] = r;
        tinta[i * 3 + 1] = g;
        tinta[i * 3 + 2] = b;
      }
    }

    if (tinta !== null && color !== undefined) color.needsUpdate = true;
  }

  return {
    resumen: resumirDesviaciones(distancias, opciones.toleranciaM),
    triangulos: triangulos.length,
    puntos: distancias.length,
    puntosFuera,
    triangulosFuera,
    toleranciaM: opciones.toleranciaM,
    ms: performance.now() - t0,
  };
}
