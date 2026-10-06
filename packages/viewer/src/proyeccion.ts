/**
 * De un punto de la escena a un píxel del lienzo (`F15.3`): lo que hace falta para colgar un globo
 * numerado de un elemento y que siga al elemento mientras se orbita.
 *
 * Es una función pura sobre una cámara de Three.js, sin escena ni DOM, para poder comprobarla con una
 * cámara en una pose conocida: un punto justo delante cae en el centro, uno detrás no se dibuja.
 */

import * as THREE from "three";

export interface PuntoEnPantalla {
  /** Píxeles desde el borde izquierdo del lienzo. */
  readonly x: number;
  /** Píxeles desde el borde superior del lienzo. */
  readonly y: number;
  /**
   * `false` si el punto queda detrás de la cámara o fuera del volumen de visión en profundidad.
   * **Un punto detrás proyecta a un píxel válido pero invertido**: dibujar ahí un globo lo pondría
   * en el lado contrario de la pantalla, así que quien dibuja tiene que mirar esto.
   */
  readonly delante: boolean;
}

export function aPantalla(
  punto: readonly [number, number, number],
  camara: THREE.Camera,
  anchoPx: number,
  altoPx: number,
): PuntoEnPantalla {
  camara.updateMatrixWorld();
  const ndc = new THREE.Vector3(punto[0], punto[1], punto[2]).project(camara);
  return {
    x: ((ndc.x + 1) / 2) * anchoPx,
    y: ((1 - ndc.y) / 2) * altoPx,
    // Después de `project`, z en [-1, 1] es lo que cae entre el plano cercano y el lejano.
    delante: ndc.z > -1 && ndc.z < 1,
  };
}
