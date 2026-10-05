/**
 * El eje de un perfil, con respuestas que se calculan a mano.
 *
 * El eje de casi todas las pruebas es una **L**: 3 m hacia +x y luego 4 m hacia +z. Sus números son
 * enteros y se verifican de cabeza: el PK final es 7, el codo está en el PK 3, y un punto a 2 m del
 * codo en el segundo tramo está en el PK 5.
 */
import { describe, expect, it } from "vitest";

import {
  cajaTocaFranja,
  estacionesCada,
  franjaDeTramo,
  franjaTransversal,
  largoDelEjeM,
  pkEn,
  puntoEn,
  rangoDeS,
  recortarSegmentos,
  sDe,
  tramosDelEje,
  type CajaDeEscenaM,
  type EjeDePerfil,
} from "./eje.js";

const L: EjeDePerfil = {
  sistema: "escena",
  verticesM: [
    [0, 0],
    [3, 0],
    [3, 4],
  ],
};

const caja = (
  x: [number, number],
  z: [number, number],
  y: [number, number] = [0, 3],
): CajaDeEscenaM => ({
  min: [x[0], y[0], z[0]],
  max: [x[1], y[1], z[1]],
});

describe("los tramos del eje", () => {
  it("acumulan el PK: la L son 3 + 4", () => {
    const tramos = tramosDelEje(L);

    expect(tramos.map((t) => [t.pkInicialM, t.largoM])).toEqual([
      [0, 3],
      [3, 4],
    ]);
    expect(largoDelEjeM(L)).toBe(7);
    expect(tramos[1]!.direccion).toEqual([0, 1]);
  });

  it("se saltan los tramos de largo cero: dos clics en el mismo sitio no son un tramo", () => {
    const doble: EjeDePerfil = {
      sistema: "escena",
      verticesM: [
        [0, 0],
        [0, 0],
        [5, 0],
      ],
    };

    expect(tramosDelEje(doble)).toHaveLength(1);
    expect(largoDelEjeM(doble)).toBe(5);
  });

  it("un eje de un solo vértice no tiene tramos", () => {
    expect(tramosDelEje({ sistema: "escena", verticesM: [[1, 1]] })).toEqual([]);
  });
});

describe("el PK de un punto", () => {
  it("un punto sobre el segundo tramo, a 2 m del codo, está en el PK 5", () => {
    const posicion = pkEn(L, [3, 2])!;

    expect(posicion.pkM).toBeCloseTo(5, 10);
    expect(posicion.lateralM).toBeCloseTo(0, 10);
    expect(posicion.tramo).toBe(1);
  });

  it("dice a qué lado cae, con signo: la derecha del avance es positiva", () => {
    // Avanzando hacia +z en el segundo tramo, la derecha es -x.
    expect(pkEn(L, [2.5, 2])!.lateralM).toBeCloseTo(0.5, 10);
    expect(pkEn(L, [3.5, 2])!.lateralM).toBeCloseTo(-0.5, 10);
  });

  it("más allá del extremo el PK se queda en el del extremo", () => {
    expect(pkEn(L, [-10, 0])!.pkM).toBe(0);
    expect(pkEn(L, [3, 50])!.pkM).toBe(7);
  });

  it("un eje sin tramos no tiene PK", () => {
    expect(pkEn({ sistema: "escena", verticesM: [] }, [0, 0])).toBeNull();
  });
});

describe("el punto en un PK", () => {
  it("el codo pertenece al segundo tramo", () => {
    const codo = puntoEn(L, 3)!;

    expect(codo.puntoM).toEqual([3, 0]);
    expect(codo.tramo).toBe(1);
  });

  it("el PK final pertenece al último tramo, y uno que se pasa no existe", () => {
    expect(puntoEn(L, 7)!.puntoM).toEqual([3, 4]);
    expect(puntoEn(L, 7.01)).toBeNull();
    expect(puntoEn(L, -1)).toBeNull();
  });
});

describe("la coordenada horizontal del dibujo", () => {
  it("en un tramo longitudinal es el PK: x = 2 en el primer tramo es el PK 2", () => {
    const franja = franjaDeTramo(tramosDelEje(L)[0]!, 2);

    expect(sDe(franja, [2, 99, 0])).toBeCloseTo(2, 10);
    expect(sDe(franja, [0, 0, 0])).toBeCloseTo(0, 10);
    expect(sDe(franja, [3, 0, 0])).toBeCloseTo(3, 10);
  });

  it("en el segundo tramo continúa donde acabó el primero", () => {
    const franja = franjaDeTramo(tramosDelEje(L)[1]!, 2);

    expect(sDe(franja, [3, 0, 0])).toBeCloseTo(3, 10);
    expect(sDe(franja, [3, 0, 4])).toBeCloseTo(7, 10);
  });

  it("el rango de s de un tramo es [PK inicial, PK final]", () => {
    const [min, max] = rangoDeS(franjaDeTramo(tramosDelEje(L)[1]!, 2));

    expect(min).toBeCloseTo(3, 10);
    expect(max).toBeCloseTo(7, 10);
  });

  it("en una transversal es el desplazamiento lateral, con la derecha positiva", () => {
    // PK 5: en (3, 2), mirando hacia +z. La derecha de quien mira es -x.
    const franja = franjaTransversal(L, 5, 10, 1)!;

    expect(sDe(franja, [3, 0, 2])).toBeCloseTo(0, 10);
    expect(sDe(franja, [1, 0, 2])).toBeCloseTo(2, 10);
    expect(sDe(franja, [5, 0, 2])).toBeCloseTo(-2, 10);
    expect(rangoDeS(franja)).toEqual([-5, 5]);
  });

  it("una transversal fuera del eje no existe", () => {
    expect(franjaTransversal(L, 99, 10, 1)).toBeNull();
  });
});

describe("qué elementos toca una franja", () => {
  const primerTramo = franjaDeTramo(tramosDelEje(L)[0]!, 2); // x ∈ [0,3], z ∈ [-1,1]

  it("toca lo que cae dentro, lo que la cruza y lo que la roza", () => {
    expect(cajaTocaFranja(primerTramo, caja([1, 2], [-0.5, 0.5]))).toBe(true);
    expect(cajaTocaFranja(primerTramo, caja([1, 2], [0.5, 3]))).toBe(true);
    expect(cajaTocaFranja(primerTramo, caja([-5, 8], [-0.1, 0.1]))).toBe(true);
  });

  it("no toca lo que queda fuera de su ancho ni de su largo", () => {
    expect(cajaTocaFranja(primerTramo, caja([1, 2], [1.5, 3]))).toBe(false);
    expect(cajaTocaFranja(primerTramo, caja([4, 5], [-0.5, 0.5]))).toBe(false);
  });

  it("no mira la altura: una franja es vertical", () => {
    expect(cajaTocaFranja(primerTramo, caja([1, 2], [-0.5, 0.5], [500, 510]))).toBe(true);
  });

  it("un tramo en diagonal se compara contra su rectángulo y no contra la caja que lo envuelve", () => {
    // El eje a 45°: la franja es una tira de 1 m de ancho a lo largo de x = z.
    const diagonal: EjeDePerfil = {
      sistema: "escena",
      verticesM: [
        [0, 0],
        [4, 4],
      ],
    };
    const franja = franjaDeTramo(tramosDelEje(diagonal)[0]!, 1);

    // Sobre la diagonal: toca.
    expect(cajaTocaFranja(franja, caja([2, 2.4], [1.8, 2.2]))).toBe(true);
    // Dentro de la caja que envuelve a la franja, pero a 2,1 m de la diagonal: no toca. Una prueba
    // que solo mirara cajas alineadas con los ejes daría true aquí.
    expect(cajaTocaFranja(franja, caja([3, 3.2], [0, 0.2]))).toBe(false);
    // En la dirección de la diagonal, pero más allá del extremo.
    expect(cajaTocaFranja(franja, caja([4.6, 5], [4.6, 5]))).toBe(false);
  });

  it("una caja en la prolongación del eje, dentro de su espesor, no toca si pasa del extremo", () => {
    // Este caso lo atrapa **solo** la comprobación sobre el eje largo de la franja: cae dentro del
    // espesor (a 0 m del eje), y sus coordenadas en x y en z quedan dentro de la caja que envuelve
    // a la franja. Quitar esa línea no hacía fallar nada hasta que se añadió: una mutación lo delató.
    const diagonal: EjeDePerfil = {
      sistema: "escena",
      verticesM: [
        [0, 0],
        [4, 4],
      ],
    };
    const franja = franjaDeTramo(tramosDelEje(diagonal)[0]!, 1);

    expect(cajaTocaFranja(franja, caja([4.25, 4.35], [4.25, 4.35]))).toBe(false);
    // Y el mismo tamaño de caja dentro del largo sí toca.
    expect(cajaTocaFranja(franja, caja([3.65, 3.75], [3.65, 3.75]))).toBe(true);
  });

  it("una transversal es estrecha a lo largo del eje y ancha a través", () => {
    const franja = franjaTransversal(L, 5, 10, 1)!; // centro (3,2); x ∈ [-2,8], z ∈ [1.5,2.5]

    expect(cajaTocaFranja(franja, caja([0, 1], [1.8, 2.2]))).toBe(true);
    expect(cajaTocaFranja(franja, caja([0, 1], [3, 3.5]))).toBe(false);
    expect(cajaTocaFranja(franja, caja([9, 10], [1.8, 2.2]))).toBe(false);
  });
});

describe("las estaciones", () => {
  it("una cada paso, y el final siempre", () => {
    expect(estacionesCada(L, 2)).toEqual([0, 2, 4, 6, 7]);
    expect(estacionesCada(L, 7)).toEqual([0, 7]);
    expect(estacionesCada(L, 100)).toEqual([0, 7]);
  });

  it("un paso decimal no acumula error: 0,1 m por 70 pasos llega a 7", () => {
    const pks = estacionesCada(L, 0.1);

    expect(pks).toHaveLength(71);
    expect(pks[69]).toBeCloseTo(6.9, 10);
    expect(pks[70]).toBe(7);
  });

  it("un paso que no es positivo no pide nada", () => {
    expect(estacionesCada(L, 0)).toEqual([]);
    expect(estacionesCada(L, -2)).toEqual([]);
    expect(estacionesCada(L, Number.NaN)).toEqual([]);
  });
});

describe("recortar al rango del tramo", () => {
  it("corta un segmento donde cruza el borde, con la altura interpolada", () => {
    expect(recortarSegmentos([0, 0, 10, 10], 2, 5)).toEqual([2, 2, 5, 5]);
  });

  it("deja intacto lo que cae dentro y descarta lo que cae fuera", () => {
    expect(recortarSegmentos([3, 1, 4, 2], 2, 5)).toEqual([3, 1, 4, 2]);
    expect(recortarSegmentos([6, 0, 9, 3], 2, 5)).toEqual([]);
    expect(recortarSegmentos([-4, 0, 1, 3], 2, 5)).toEqual([]);
  });

  it("un segmento vertical se queda o se va entero", () => {
    expect(recortarSegmentos([3, 0, 3, 5], 2, 5)).toEqual([3, 0, 3, 5]);
    expect(recortarSegmentos([7, 0, 7, 5], 2, 5)).toEqual([]);
  });

  it("respeta el sentido del segmento: el que va hacia atrás sigue yendo hacia atrás", () => {
    expect(recortarSegmentos([10, 10, 0, 0], 2, 5)).toEqual([5, 5, 2, 2]);
  });

  it("procesa varios segmentos de una vez", () => {
    expect(recortarSegmentos([0, 0, 10, 10, 3, 1, 4, 2], 2, 5)).toEqual([2, 2, 5, 5, 3, 1, 4, 2]);
  });
});
