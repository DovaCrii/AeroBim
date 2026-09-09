/**
 * La rotación que lleva lo proyectado al papel. `F7.1`.
 *
 * **Existe porque el defecto que fija estuvo meses sin verse.** Los dos alzados salían con todos
 * sus trazos —2 349 y 2 526 sobre `Piso 5.ifc`— aplastados en una raya: el oráculo que había
 * contaba trazos y medía la extensión del DXF, y la extensión la marca el recuadro del papel, así
 * que las dos comprobaciones pasaban sobre un dibujo colapsado.
 *
 * Aquí no hay navegador ni proyección: es aritmética de una matriz, y se comprueba **dónde acaba
 * cada eje del mundo**. La Y del papel es `−Z` —convención de la librería, ver `matrizAPapel`— así
 * que «arriba en el papel» es el vector `(0, 0, −1)`.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { matrizAPapel } from "./drawings.js";

/** A dónde manda la matriz un eje del mundo, redondeado para poder compararlo. */
function imagen(view: Parameters<typeof matrizAPapel>[0], eje: [number, number, number]) {
  const vector = new THREE.Vector3(...eje).applyMatrix4(matrizAPapel(view));
  return [vector.x, vector.y, vector.z].map((n) => Math.round(n * 1e6) / 1e6);
}

const ARRIBA_DEL_PAPEL = [0, 0, -1];
const DERECHA_DEL_PAPEL = [1, 0, 0];
/** Hacia dentro de la hoja: es la normal, y es la coordenada que después se pone a cero. */
const DENTRO_DEL_PAPEL = [0, -1, 0];

describe("la planta", () => {
  it("no gira nada: es el caso que ya funcionaba", () => {
    // La proyección de la librería vuelve en el XZ cuando se mira desde arriba, y el XZ **es** el
    // papel. Si esta prueba se pusiera roja, lo que se habría roto es la planta, no los alzados.
    expect(matrizAPapel("plan").elements).toEqual(new THREE.Matrix4().identity().elements);
  });
});

describe("el alzado frontal", () => {
  it("pone la vertical del mundo en la vertical del papel", () => {
    // **Es el defecto, en una línea.** Sin girar, la altura del edificio se quedaba en la Y del
    // mundo, que el exportador no lee: leyendo X y Z, un alzado de 21,75 × 2,98 m salía de
    // 21,75 × 0,00 y sus 2 349 trazos caían todos sobre la misma raya.
    expect(imagen("front", [0, 1, 0])).toEqual(ARRIBA_DEL_PAPEL);
  });

  it("deja el ancho donde estaba, mirando de frente", () => {
    expect(imagen("front", [1, 0, 0])).toEqual(DERECHA_DEL_PAPEL);
  });

  it("y manda la profundidad hacia dentro de la hoja", () => {
    expect(imagen("front", [0, 0, 1])).toEqual([0, 1, 0]);
  });
});

describe("el alzado lateral", () => {
  it("también pone arriba arriba, y no tumbado", () => {
    // **La rotación mínima entre la dirección y `(0, −1, 0)` no sirve aquí**: para el lateral lleva
    // la vertical del mundo al eje X del papel, o sea el alzado tumbado 90°. De ahí que el «arriba»
    // de cada vista esté escrito a mano en `VISTAS` en vez de deducirse.
    expect(imagen("side", [0, 1, 0])).toEqual(ARRIBA_DEL_PAPEL);
  });

  it("y el ancho del papel es la profundidad del modelo", () => {
    // Mirando hacia −X con arriba en +Y, la derecha del observador es −Z. Lo que se comprueba es
    // que el lateral se dibuja recorriendo el eje Z, que es el que no se ve en el frontal.
    expect(imagen("side", [0, 0, -1])).toEqual(DERECHA_DEL_PAPEL);
  });
});

describe("las tres", () => {
  it("giran y no reflejan: un plano en espejo se lee bien y está mal", () => {
    // **Un espejo no se nota mirando**, y es el error más caro que podría dejar esto: un alzado
    // reflejado tiene las mismas cotas y el edificio al revés. El determinante lo dice: `+1` es una
    // rotación, `−1` lleva reflexión dentro.
    for (const view of ["plan", "front", "side"] as const) {
      expect(matrizAPapel(view).determinant()).toBeCloseTo(1, 9);
    }
  });

  it("y llevan su dirección de mirada hacia dentro de la hoja", () => {
    // Es lo que hace que aplastar la Y sea una proyección y no una pérdida: la coordenada que se
    // tira es la que va en la dirección en que se mira.
    expect(imagen("plan", [0, -1, 0])).toEqual(DENTRO_DEL_PAPEL);
    expect(imagen("front", [0, 0, -1])).toEqual(DENTRO_DEL_PAPEL);
    expect(imagen("side", [-1, 0, 0])).toEqual(DENTRO_DEL_PAPEL);
  });
});
