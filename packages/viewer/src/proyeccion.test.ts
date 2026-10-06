import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { aPantalla } from "./proyeccion.js";

/** Una cámara en (0, 0, 10) mirando al origen: lo que está sobre el eje queda en el centro. */
function camara(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  c.position.set(0, 0, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe("aPantalla", () => {
  it("un punto justo delante cae en el centro del lienzo", () => {
    const p = aPantalla([0, 0, 0], camara(), 800, 400);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(200);
    expect(p.delante).toBe(true);
  });

  it("lo que está a la derecha cae a la derecha, y lo de arriba cae arriba", () => {
    const c = camara();
    expect(aPantalla([2, 0, 0], c, 800, 400).x).toBeGreaterThan(400);
    expect(aPantalla([0, 2, 0], c, 800, 400).y).toBeLessThan(200);
  });

  it("el desplazamiento es el que da la óptica: tan(30°)·10 m de alto en el borde", () => {
    // Fov vertical de 60° a 10 m: el borde superior está a 10·tan(30°) ≈ 5,7735 m sobre el eje.
    const alto = 10 * Math.tan((30 * Math.PI) / 180);
    const p = aPantalla([0, alto, 0], camara(), 800, 400);
    expect(p.y).toBeCloseTo(0, 3);
  });

  it("un punto detrás de la cámara no está delante", () => {
    expect(aPantalla([0, 0, 20], camara(), 800, 400).delante).toBe(false);
  });

  it("un punto más allá del plano lejano no está delante", () => {
    expect(aPantalla([0, 0, -200], camara(), 800, 400).delante).toBe(false);
  });
});
