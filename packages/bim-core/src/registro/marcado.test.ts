import { describe, expect, it } from "vitest";
import type { Point3 } from "../measure/geometry.js";
import { escenaAIfc } from "./viewpoint.js";
import { lineasDesdeMediciones, MAXIMO_LINEAS, type MedicionDibujada } from "./marcado.js";

/** Un contorno cuadrado de `lado` metros en el plano horizontal de la escena. */
function cuadrado(lado: number): Point3[] {
  return [
    [0, 0, 0],
    [lado, 0, 0],
    [lado, 0, lado],
    [0, 0, lado],
  ];
}

describe("lineasDesdeMediciones", () => {
  it("una distancia da un segmento, y ya en el sistema del IFC", () => {
    // La conversión es la misma que usan la cámara y los cortes: no hay dos formas de llevar un
    // punto al sistema del modelo.
    const medicion: MedicionDibujada = {
      kind: "distance",
      puntos: [
        [0, 0, 0],
        [1, 2, 3],
      ],
    };

    expect(lineasDesdeMediciones([medicion])).toEqual([
      { inicio: escenaAIfc([0, 0, 0]), fin: escenaAIfc([1, 2, 3]) },
    ]);
  });

  it("una perpendicular también: es un tramo del punto al pie", () => {
    const medicion: MedicionDibujada = {
      kind: "perpendicular",
      puntos: [
        [0, 1, 0],
        [0, 0, 0],
      ],
    };
    expect(lineasDesdeMediciones([medicion])).toHaveLength(1);
  });

  it("un ángulo da dos segmentos, los dos lados desde el vértice", () => {
    const medicion: MedicionDibujada = {
      kind: "angle",
      puntos: [
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 1],
      ],
    };

    const lineas = lineasDesdeMediciones([medicion]);
    expect(lineas).toHaveLength(2);
    // El segundo arranca donde acabó el primero: es el vértice, y por eso se ve el ángulo.
    expect(lineas[1]?.inicio).toEqual(lineas[0]?.fin);
  });

  it("un área da su contorno **cerrado**", () => {
    // Cuatro vértices y cuatro segmentos: el último vuelve al primero. Con tres segmentos el
    // cuadrado saldría abierto, que es una forma que nadie dibujó.
    const lineas = lineasDesdeMediciones([{ kind: "area", puntos: cuadrado(2) }]);

    expect(lineas).toHaveLength(4);
    expect(lineas.at(-1)?.fin).toEqual(lineas[0]?.inicio);
  });

  it("sin mediciones no hay marcado, y no es un fallo", () => {
    // La mayoría de las observaciones se abren sin haber medido nada.
    expect(lineasDesdeMediciones([])).toEqual([]);
  });

  it("descarta los tramos que no dibujan nada", () => {
    // Dos clics en el mismo sitio. Un segmento de largo cero no se ve y ensucia el archivo.
    const medicion: MedicionDibujada = {
      kind: "distance",
      puntos: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    };
    expect(lineasDesdeMediciones([medicion])).toEqual([]);
  });

  it("una medida con menos puntos de los que necesita se ignora", () => {
    expect(lineasDesdeMediciones([{ kind: "distance", puntos: [[0, 0, 0]] }])).toEqual([]);
    expect(
      lineasDesdeMediciones([
        {
          kind: "area",
          puntos: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("con el tope alcanzado deja fuera la medición entera, no los segmentos que sobran", () => {
    // **Es la regla que importa.** Medio contorno de un área es una polilínea abierta que afirma
    // una forma que nadie dibujó; una medición menos es simplemente una medición menos.
    const contornoGrande: MedicionDibujada = {
      kind: "area",
      puntos: Array.from({ length: MAXIMO_LINEAS - 1 }, (_, i): Point3 => [i, 0, 0 + (i % 2)]),
    };
    const otroContorno: MedicionDibujada = { kind: "area", puntos: cuadrado(1) };

    const lineas = lineasDesdeMediciones([contornoGrande, otroContorno]);

    // Entra el primero completo y el segundo no cabe: no queda ningún contorno a medias.
    expect(lineas.length).toBe(MAXIMO_LINEAS - 1);
    expect(lineas.length).toBeLessThanOrEqual(MAXIMO_LINEAS);
  });

  it("y sigue aceptando las que sí caben después de una que no", () => {
    // No se corta en la primera que no entra: una cota pequeña detrás de un contorno enorme sigue
    // valiendo, y perderla sería peor.
    const enorme: MedicionDibujada = {
      kind: "area",
      puntos: Array.from({ length: MAXIMO_LINEAS + 5 }, (_, i): Point3 => [i, 0, i % 2]),
    };
    const pequena: MedicionDibujada = {
      kind: "distance",
      puntos: [
        [0, 0, 0],
        [5, 0, 0],
      ],
    };

    expect(lineasDesdeMediciones([enorme, pequena])).toHaveLength(1);
  });
});
