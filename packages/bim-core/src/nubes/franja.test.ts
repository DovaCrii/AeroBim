/**
 * Qué parte de una nube cae en una franja, con un octree escrito a mano.
 *
 * El cubo del archivo es `[0,0,0,8,8,8]` y no lleva desplazamiento, así que un nodo de profundidad 1
 * mide 4 m de lado y la escena es `(x, z, −y)` del archivo: la celda `y = 0` del archivo (norte 0 a
 * 4) cae en la escena en `z` de −4 a 0.
 *
 * La franja corre a lo largo de x en la escena, en `z = −2` —o sea, en `y = 2` del archivo—, de 1 m de
 * espesor: toca las celdas de `y = 0` y no las de `y = 1`.
 */
import { describe, expect, it } from "vitest";

import { franjaDeTramo, tramosDelEje, type EjeDePerfil } from "../perfiles/eje.js";
import type { Cubo } from "./octree.js";
import type { Matriz4 } from "./matriz.js";
import { cajaDeNodoEnEscena, cupoDeUnNodo, nodosDeLaFranja, puntoEnLaFranja } from "./franja.js";

const CUBO: Cubo = [0, 0, 0, 8, 8, 8];
const SIN_DESPLAZAMIENTO = [0, 0, 0] as const;

/** La raíz y los ocho nodos de profundidad 1. */
const NODOS = [
  { clave: { d: 0, x: 0, y: 0, z: 0 }, puntos: 100 },
  ...[0, 1].flatMap((x) =>
    [0, 1].flatMap((y) => [0, 1].map((z) => ({ clave: { d: 1, x, y, z }, puntos: 50 }))),
  ),
];

function franjaA(desde: [number, number], hasta: [number, number], espesorM: number) {
  const eje: EjeDePerfil = { sistema: "escena", verticesM: [desde, hasta] };
  return franjaDeTramo(tramosDelEje(eje)[0]!, espesorM);
}

/** Una matriz de traslación pura, por columnas. */
const traslacion = (x: number, y: number, z: number): Matriz4 => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  y,
  z,
  1,
];

describe("la caja de un nodo en la escena", () => {
  it("cambia los ejes del archivo: la celda y=0 del archivo cae en z de −4 a 0", () => {
    const caja = cajaDeNodoEnEscena(CUBO, { d: 1, x: 0, y: 0, z: 0 }, SIN_DESPLAZAMIENTO, null);

    // `+ 0` normaliza el −0 de negar un cero: es el mismo número, pero `toEqual` los distingue.
    expect(caja.min.map((v) => v + 0)).toEqual([0, 0, -4]);
    expect(caja.max.map((v) => v + 0)).toEqual([4, 4, 0]);
  });

  it("resta el desplazamiento del cargador", () => {
    const caja = cajaDeNodoEnEscena(CUBO, { d: 0, x: 0, y: 0, z: 0 }, [100, 200, 300], null);

    // x = fx − 100; y = fz − 300; z = −(fy − 200) = 200 − fy, que va de 192 a 200.
    expect(caja.min).toEqual([-100, -300, 192]);
    expect(caja.max).toEqual([-92, -292, 200]);
  });

  it("aplica la matriz del calce", () => {
    const caja = cajaDeNodoEnEscena(
      CUBO,
      { d: 1, x: 0, y: 0, z: 0 },
      SIN_DESPLAZAMIENTO,
      traslacion(10, 0, 0),
    );

    expect(caja.min).toEqual([10, 0, -4]);
    expect(caja.max).toEqual([14, 4, 0]);
  });

  it("con un giro de 90° envuelve la caja girada: sigue sin dejar nada fuera", () => {
    // Giro de 90° alrededor de Y, por columnas: x' = z, z' = −x.
    const giro: Matriz4 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
    const caja = cajaDeNodoEnEscena(CUBO, { d: 1, x: 0, y: 0, z: 0 }, SIN_DESPLAZAMIENTO, giro);

    // Una caja de 4 × 4 × 4 girada 90° sigue siendo de 4 × 4 × 4.
    expect(caja.max[0] - caja.min[0]).toBeCloseTo(4, 10);
    expect(caja.max[2] - caja.min[2]).toBeCloseTo(4, 10);
  });
});

describe("los nodos de una franja", () => {
  const franja = franjaA([0, -2], [8, -2], 1);

  it("elige la raíz y los cuatro nodos que tocan el norte 0–4, y deja fuera los otros cuatro", () => {
    const seleccion = nodosDeLaFranja(NODOS, {
      cubo: CUBO,
      desplazamiento: SIN_DESPLAZAMIENTO,
      matriz: null,
      franja,
    });

    expect(seleccion.elegidos).toHaveLength(5);
    expect(seleccion.fueraDeLaFranja).toBe(4);
    expect(seleccion.elegidos.filter((n) => n.clave.d === 1).every((n) => n.clave.y === 0)).toBe(
      true,
    );
    expect(seleccion.puntos).toBe(100 + 4 * 50);
  });

  it("no depende de dónde esté la cámara: no hay cámara en la pregunta", () => {
    // Es la propiedad que pedía el plan: el mismo eje da el mismo resultado. Aquí lo sujeta el tipo
    // —`CriterioDeFranja` no tiene cámara— y esta igualdad entre dos llamadas.
    const pedir = () =>
      nodosDeLaFranja(NODOS, {
        cubo: CUBO,
        desplazamiento: SIN_DESPLAZAMIENTO,
        matriz: null,
        franja,
      });

    expect(pedir()).toEqual(pedir());
  });

  it("devuelve todos los que tocan, lo menos profundo primero: el techo no es de la selección", () => {
    // Antes el techo contaba los puntos del nodo y dejaba fuera hasta la raíz: con una nube real, el
    // perfil salía vacío. Los nodos que tocan entran todos; el techo lo aplica `cupoDeUnNodo`.
    const seleccion = nodosDeLaFranja(NODOS, {
      cubo: CUBO,
      desplazamiento: SIN_DESPLAZAMIENTO,
      matriz: null,
      franja,
    });

    expect(seleccion.elegidos.map((n) => n.clave.d)).toEqual([0, 1, 1, 1, 1]);
  });

  it("el orden lo pone la profundidad y no el de entrada: con la lista al revés, la raíz sigue primero", () => {
    // Una prueba con la raíz ya al principio no distingue «ordené» de «me llegó ordenado»: una
    // mutación que quitaba el orden pasaba en verde hasta que se añadió este caso.
    const seleccion = nodosDeLaFranja([...NODOS].reverse(), {
      cubo: CUBO,
      desplazamiento: SIN_DESPLAZAMIENTO,
      matriz: null,
      franja,
    });

    expect(seleccion.elegidos.map((n) => n.clave.d)).toEqual([0, 1, 1, 1, 1]);
  });

  it("con el calce puesto sigue a la nube: la franja se corre con ella", () => {
    const corrida = franjaA([10, -2], [18, -2], 1);
    const seleccion = nodosDeLaFranja(NODOS, {
      cubo: CUBO,
      desplazamiento: SIN_DESPLAZAMIENTO,
      matriz: traslacion(10, 0, 0),
      franja: corrida,
    });

    expect(seleccion.elegidos).toHaveLength(5);

    // Y la franja original, sin el calce, ya no toca nada de la nube corrida.
    const sinCalce = nodosDeLaFranja(NODOS, {
      cubo: CUBO,
      desplazamiento: SIN_DESPLAZAMIENTO,
      matriz: traslacion(100, 0, 0),
      franja,
    });
    expect(sinCalce.elegidos).toHaveLength(0);
  });
});

describe("un punto en la franja", () => {
  const franja = franjaA([0, -2], [8, -2], 1);

  it("devuelve su PK si cae dentro", () => {
    expect(puntoEnLaFranja(franja, [3, 5, -2.3])).toBeCloseTo(3, 10);
  });

  it("lo descarta si se pasa del espesor, a cualquiera de los dos lados", () => {
    expect(puntoEnLaFranja(franja, [3, 5, -3])).toBeNull();
    expect(puntoEnLaFranja(franja, [3, 5, -1])).toBeNull();
    // Justo en el borde entra: el espesor es cerrado.
    expect(puntoEnLaFranja(franja, [3, 5, -2.5])).not.toBeNull();
  });

  it("lo descarta si se pasa del largo del tramo", () => {
    expect(puntoEnLaFranja(franja, [9, 5, -2])).toBeNull();
    expect(puntoEnLaFranja(franja, [-0.1, 5, -2])).toBeNull();
  });

  it("no mira la altura: el perfil es vertical", () => {
    expect(puntoEnLaFranja(franja, [3, 500, -2])).not.toBeNull();
    expect(puntoEnLaFranja(franja, [3, -500, -2])).not.toBeNull();
  });
});

describe("el cupo de un nodo", () => {
  it("si caben, entran todos y el techo no se da por agotado", () => {
    expect(cupoDeUnNodo(0, 100, 1000)).toEqual({ paso: 1, admitidos: 100, agotado: false });
  });

  it("si caben justo, entran todos y ya no queda nada", () => {
    expect(cupoDeUnNodo(900, 100, 1000)).toEqual({ paso: 1, admitidos: 100, agotado: true });
  });

  it("un nodo mayor que el techo se adelgaza y no se descarta: es el caso de la raíz", () => {
    // El defecto que tapó el perfil de una nube real: 100 000 puntos en la franja contra un techo de
    // 40 000 daban cero. Ahora uno de cada tres, repartido por todo el nodo.
    const cupo = cupoDeUnNodo(0, 100_000, 40_000);
    expect(cupo.paso).toBe(3);
    expect(cupo.admitidos).toBeLessThanOrEqual(40_000);
    expect(cupo.admitidos).toBeGreaterThan(30_000);
    expect(cupo.agotado).toBe(true);
  });

  it("el adelgazado nunca pasa del techo, para cualquier combinación", () => {
    for (const aceptados of [0, 1, 999, 5000]) {
      for (const enElNodo of [1, 7, 1000, 123_457]) {
        const cupo = cupoDeUnNodo(aceptados, enElNodo, 10_000);
        expect(aceptados + cupo.admitidos).toBeLessThanOrEqual(10_000);
      }
    }
  });

  it("con el techo ya lleno no entra nada", () => {
    expect(cupoDeUnNodo(1000, 50, 1000)).toEqual({ paso: 1, admitidos: 0, agotado: true });
  });
});
