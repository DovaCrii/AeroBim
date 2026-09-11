/**
 * Qué punto de la nube se señala. `F2.2`, `F12.14`.
 *
 * **La prueba existe por un defecto que el usuario notó y el diagnóstico tenía medido sin llamarlo
 * defecto:** «está fallando al pickear el punto al que quiero dejar» la nota, y en el registro del
 * modo `nube`, «devolvió un punto a 0 mm del rayo **y a 18,10 m del punto al que se apuntó**» con la
 * nota «lo segundo es normal». No era normal.
 *
 * El primer caso de esta prueba es exactamente esa situación, en pequeño.
 *
 * **Y el segundo bloque es el que faltaba.** El primero prueba el criterio con candidatos escritos a
 * mano, y eso dejó pasar que en el producto los candidatos llegaban todos con la misma coordenada de
 * pantalla —la del cursor—, porque `Points.raycast` devuelve un punto **del rayo**. Un criterio
 * correcto alimentado con datos degenerados. Por eso el segundo bloque lanza el rayo de verdad de
 * Three sobre una nube de verdad: es la única forma de que la prueba vea lo que el producto ve.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  masCercanoAlCursor,
  RADIO_EN_PIXELES,
  verticeDelGolpe,
  type Candidato,
} from "./senalar.js";

/** Un candidato, escrito corto: dónde cae en pantalla, a qué profundidad, y cómo se llama. */
const c = (px: number, py: number, profundidad: number, nombre: string): Candidato<string> => ({
  pixel: [px, py],
  profundidad,
  golpe: nombre,
});

describe("el punto que se señala", () => {
  it("**no es el de delante si no está debajo del cursor** — el defecto", () => {
    // El de delante, pero a treinta píxeles del cursor: es el punto suelto que rozaba la línea de
    // visión y ganaba por estar más cerca de la cámara. Con el criterio de antes salía este.
    const suelto = c(130, 100, 12, "suelto a 18 m por delante");
    // Y el que se estaba mirando: justo bajo el cursor, más lejos.
    const mirado = c(101, 100, 30, "el que se apuntaba");

    expect(masCercanoAlCursor([suelto, mirado], [100, 100])?.golpe).toBe("el que se apuntaba");
  });

  it("y entre dos que sí están debajo del cursor, el de delante", () => {
    // Esta mitad del criterio anterior era correcta y se conserva: dos puntos en la misma dirección
    // de mirada son una superficie delante de otra, y se señala la de delante.
    const delante = c(102, 101, 10, "la superficie de delante");
    const detras = c(100, 100, 40, "el fondo");

    expect(masCercanoAlCursor([delante, detras], [100, 100])?.golpe).toBe(
      "la superficie de delante",
    );
  });

  it("acepta hasta el radio y no más", () => {
    const justo = c(100 + RADIO_EN_PIXELES, 100, 50, "en el borde del radio");
    expect(masCercanoAlCursor([justo], [100, 100])?.golpe).toBe("en el borde del radio");

    // Uno a un pixel mas alla del radio ya no cuenta como «debajo del cursor»: entra por el otro
    // camino, el de la holgura, y por eso sigue saliendo. Lo que no puede es ganarle a uno que si
    // este dentro.
    const fuera = c(100 + RADIO_EN_PIXELES + 1, 100, 1, "fuera del radio y muy delante");
    const dentro = c(100, 100, 99, "dentro del radio y al fondo");
    expect(masCercanoAlCursor([fuera, dentro], [100, 100])?.golpe).toBe(
      "dentro del radio y al fondo",
    );
  });

  it("en zona rala estira el radio, y ahí manda la distancia al cursor", () => {
    // **La parte que hace usable un levantamiento.** Donde los puntos están a más de seis píxeles
    // unos de otros, exigir el radio devolvería `null` y el clic se perdería sin decir nada.
    const cerca = c(112, 100, 80, "a doce pixeles");
    const lejos = c(118, 100, 5, "a dieciocho pixeles, pero delante");

    // Aquí gana la distancia al cursor y **no** la profundidad: ya no se pregunta «cuál de los que
    // veo debajo» sino «a qué apuntaba».
    expect(masCercanoAlCursor([cerca, lejos], [100, 100])?.golpe).toBe("a doce pixeles");
  });

  it("y pasada la holgura no devuelve nada, en vez de inventar", () => {
    // Devolver un punto que está a cien píxeles sería poner la nota en otro sitio y no avisar, que
    // es peor que no ponerla: quien mira vuelve a pinchar.
    const muyLejos = c(200, 200, 1, "a cien pixeles");
    expect(masCercanoAlCursor([muyLejos], [100, 100])).toBeNull();
  });

  it("sin candidatos, nada", () => {
    expect(masCercanoAlCursor([], [100, 100])).toBeNull();
  });
});

/**
 * **Aquí se reproduce el caso malo de punta a punta**, con el rayo de verdad de Three sobre una nube
 * de verdad. Es lo que la primera versión de este arreglo dio por no reproducible: el diagnóstico
 * daba «0,0 px del cursor» con el criterio viejo y con el nuevo, y eso se leyó como «el escenario no
 * toca el caso malo». Lo que pasaba era peor y explica la coincidencia: **todos los candidatos
 * proyectan al cursor exacto**, porque `golpe.point` está sobre el rayo.
 */
const ANCHO = 1600;
const ALTO = 900;

/** La cámara del escenario: en el origen, mirando a −Z, fov 60, 1600 × 900. */
function camaraDePrueba(): THREE.PerspectiveCamera {
  const camara = new THREE.PerspectiveCamera(60, ANCHO / ALTO, 0.1, 1000);
  camara.position.set(0, 0, 0);
  camara.lookAt(0, 0, -1);
  camara.updateMatrixWorld(true);
  return camara;
}

/** Dónde cae un punto del mundo en la pantalla, en píxeles. */
function enPantalla(mundo: THREE.Vector3, camara: THREE.Camera): [number, number] {
  const ndc = mundo.clone().project(camara);
  return [((ndc.x + 1) / 2) * ANCHO, ((1 - ndc.y) / 2) * ALTO];
}

/** Una nube con los vértices dados, ya con su matriz al día. */
function nubeCon(vertices: readonly (readonly [number, number, number])[]): THREE.Points {
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertices.flat()), 3),
  );
  geometria.computeBoundingSphere();
  const nube = new THREE.Points(geometria, new THREE.PointsMaterial());
  nube.updateMatrixWorld(true);
  return nube;
}

describe("el rayo sobre una nube de verdad", () => {
  const camara = camaraDePrueba();

  // A treinta metros, un píxel mide 30/779,4 m; a doce, 12/779,4. El factor 779,4 es
  // `alto / (2·tan(fov/2))` = 900 / (2·tan 30°), el mismo de `factorDeProyeccionDe`.
  const PIXELES_POR_METRO_A_DOCE = 779.4 / 12;

  /** El que se está mirando: justo bajo el cursor, al fondo. */
  const MIRADO = [0, 0, -30] as const;
  /** El punto suelto: **por delante** y a treinta píxeles del cursor. Vegetación, un poste. */
  const SUELTO = [30 / PIXELES_POR_METRO_A_DOCE, 0, -12] as const;

  function golpes(): THREE.Intersection[] {
    const nube = nubeCon([MIRADO, SUELTO]);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(new THREE.Vector2(0, 0), camara); // el cursor, en el centro exacto
    rayo.params.Points = { threshold: 1.0 }; // de sobra: recoge los dos
    return rayo.intersectObject(nube, false);
  }

  it("**`golpe.point` no es el punto de la nube: está sobre el rayo**", () => {
    const golpe = golpes().find((uno) => uno.distance < 20);
    expect(golpe).toBeDefined();
    const vertice = verticeDelGolpe(golpe as THREE.Intersection);
    expect(vertice).not.toBeNull();

    // Medio metro largo de diferencia entre lo que devuelve la librería y el punto levantado.
    const corrimiento = (vertice as THREE.Vector3).distanceTo((golpe as THREE.Intersection).point);
    expect(corrimiento).toBeCloseTo(SUELTO[0], 3);
    expect(corrimiento).toBeGreaterThan(0.4);
  });

  it("y por eso **todos los candidatos proyectan al cursor exacto**", () => {
    for (const golpe of golpes()) {
      const [px, py] = enPantalla(golpe.point, camara);
      expect(px).toBeCloseTo(ANCHO / 2, 3);
      expect(py).toBeCloseTo(ALTO / 2, 3);
    }
  });

  it("con `golpe.point` el criterio no distingue nada y gana el de delante — el defecto", () => {
    // Esta es la cadena de antes, escrita tal cual estaba. Sale el punto suelto: el fallo.
    const elegido = masCercanoAlCursor(
      golpes().map((golpe) => ({
        pixel: enPantalla(golpe.point, camara),
        profundidad: golpe.distance,
        golpe,
      })),
      [ANCHO / 2, ALTO / 2],
    );
    expect(elegido?.golpe.distance).toBeCloseTo(12, 1);
  });

  it("con el vértice sale el que se estaba mirando", () => {
    const elegido = masCercanoAlCursor(
      golpes().flatMap((golpe) => {
        const vertice = verticeDelGolpe(golpe);
        if (vertice === null) return [];
        return [{ pixel: enPantalla(vertice, camara), profundidad: golpe.distance, golpe }];
      }),
      [ANCHO / 2, ALTO / 2],
    );
    expect(elegido?.golpe.distance).toBeCloseTo(30, 1);

    // Y el vértice del elegido es el punto levantado, no un punto del rayo.
    const vertice = verticeDelGolpe(elegido?.golpe as THREE.Intersection);
    expect([vertice?.x, vertice?.y, vertice?.z]).toEqual([MIRADO[0], MIRADO[1], MIRADO[2]]);
  });

  it("el vértice se lleva la matriz del objeto, que en una nube calzada no es la identidad", () => {
    const nube = nubeCon([[1, 2, -20]]);
    nube.position.set(10, 0, 0);
    nube.updateMatrixWorld(true);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(new THREE.Vector2(0, 0), camaraDePrueba());
    rayo.params.Points = { threshold: 100 };
    const golpe = rayo.intersectObject(nube, false)[0];
    expect(golpe).toBeDefined();
    const vertice = verticeDelGolpe(golpe as THREE.Intersection);
    expect([vertice?.x, vertice?.y, vertice?.z]).toEqual([11, 2, -20]);
  });
});
