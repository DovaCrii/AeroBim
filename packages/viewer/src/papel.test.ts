/**
 * Que el dibujo esté orientado, y qué significa eso. `F7.1`.
 *
 * **Existe porque el defecto que fija estuvo meses sin verse.** Los dos alzados salían con todos
 * sus trazos —2 349 y 2 526 sobre `Piso 5.ifc`— aplastados en una raya: el oráculo que había
 * contaba trazos y medía la extensión del DXF, y la extensión la marca el recuadro del papel, así
 * que las dos comprobaciones pasaban sobre un dibujo colapsado.
 *
 * Aquí no hay navegador ni proyección: se orienta un `TechnicalDrawing` de verdad —`orientTo` no
 * toca ni la escena ni los componentes— y se pregunta **dónde acaba cada eje del mundo** al pasarlo
 * a sus coordenadas locales, que es donde tiene que estar la geometría proyectada. El plano del
 * dibujo es su XZ local y su Y local es la normal, así que «arriba en el papel» es `(0, 0, −1)`.
 *
 * Se prueba contra la librería y no contra una matriz nuestra a propósito: lo que faltaba era
 * **llamar a `orientTo`**, y una prueba de aritmética propia habría seguido pasando sin la llamada.
 */

import { describe, expect, it } from "vitest";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import type { DrawingView } from "./drawings.js";

/** Las mismas direcciones que usa `drawings.ts`; si divergen, esta prueba deja de decir nada. */
const DIRECCIONES: Record<DrawingView, [number, number, number]> = {
  plan: [0, -1, 0],
  front: [0, 0, -1],
  side: [-1, 0, 0],
};

/** El paso del mundo a las coordenadas del dibujo, tal como lo hace `orientarYTraerAlPapel`. */
function aLocal(view: DrawingView): THREE.Matrix4 {
  // `orientTo` solo escribe el cuaternión del contenedor: no necesita mundo ni componentes, y por
  // eso se puede preguntar sin montar media aplicación.
  const dibujo = new OBC.TechnicalDrawing(undefined as never);
  dibujo.orientTo(new THREE.Vector3(...DIRECCIONES[view]));
  dibujo.three.updateMatrixWorld(true);
  return dibujo.three.matrixWorld.clone().invert();
}

/**
 * A dónde manda el dibujo un eje del mundo, redondeado para poder compararlo.
 *
 * El `+ 0` no es adorno: un cuaternión da `-0` donde la geometría dice cero, y `-0` no es `0` para
 * una comparación profunda. Sumar cero lo normaliza sin tocar ningún otro valor.
 */
function imagen(view: DrawingView, eje: [number, number, number]) {
  const vector = new THREE.Vector3(...eje).applyMatrix4(aLocal(view));
  return [vector.x, vector.y, vector.z].map((n) => Math.round(n * 1e6) / 1e6 + 0);
}

const ARRIBA_DEL_PAPEL = [0, 0, -1];
const DERECHA_DEL_PAPEL = [1, 0, 0];
/** Hacia dentro de la hoja: es la normal, y es la coordenada que después se pone a cero. */
const DENTRO_DEL_PAPEL = [0, -1, 0];

describe("la planta", () => {
  it("no gira nada: es el caso que ya funcionaba", () => {
    // La proyección de la librería vuelve en el XZ del mundo cuando se mira desde arriba, y el XZ
    // **es** el papel. Si esta prueba se pusiera roja, lo que se habría roto es la planta.
    expect(aLocal("plan").elements).toEqual(new THREE.Matrix4().identity().elements);
  });
});

describe("el alzado frontal", () => {
  it("pone la vertical del mundo en la vertical del papel", () => {
    // **Es el defecto, en una línea.** Sin orientar el dibujo, la altura del edificio se quedaba en
    // la Y del mundo, que el exportador no lee: leyendo X y Z, un alzado de 21,75 × 2,98 m salía de
    // 21,75 × 0,00 y sus 2 349 trazos caían todos sobre la misma raya.
    expect(imagen("front", [0, 1, 0])).toEqual(ARRIBA_DEL_PAPEL);
  });

  it("deja el ancho donde estaba, mirando de frente", () => {
    expect(imagen("front", [1, 0, 0])).toEqual(DERECHA_DEL_PAPEL);
  });
});

describe("el alzado lateral", () => {
  it("también pone arriba arriba, y no tumbado", () => {
    // Girar por la rotación mínima entre la dirección y `(0, −1, 0)` —la tentación al escribirlo a
    // mano— lleva la vertical del mundo al eje X del papel: el alzado sale tumbado 90°.
    expect(imagen("side", [0, 1, 0])).toEqual(ARRIBA_DEL_PAPEL);
  });

  it("y el ancho del papel es la profundidad del modelo", () => {
    // Lo que se comprueba es que el lateral se dibuja recorriendo el eje Z, que es el que no se ve
    // en el frontal. El signo lo decide `orientTo` para que los números no salgan al revés.
    const derecha = imagen("side", [0, 0, 1]);
    expect([Math.abs(derecha[0]!), derecha[1], derecha[2]]).toEqual(DERECHA_DEL_PAPEL);
  });
});

describe("las tres", () => {
  it("giran y no reflejan: un plano en espejo se lee bien y está mal", () => {
    // **Un espejo no se nota mirando**, y es el error más caro que podría dejar esto: un alzado
    // reflejado tiene las mismas cotas y el edificio al revés. El determinante lo dice: `+1` es una
    // rotación, `−1` lleva reflexión dentro.
    for (const view of ["plan", "front", "side"] as const) {
      expect(aLocal(view).determinant()).toBeCloseTo(1, 9);
    }
  });

  it("y llevan su dirección de mirada hacia dentro de la hoja", () => {
    // Es lo que hace que aplastar la Y sea una proyección y no una pérdida: la coordenada que se
    // tira es la que va en la dirección en que se mira.
    for (const view of ["plan", "front", "side"] as const) {
      expect(imagen(view, DIRECCIONES[view])).toEqual(DENTRO_DEL_PAPEL);
    }
  });
});
