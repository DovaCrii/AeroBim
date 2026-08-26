import { describe, expect, it } from "vitest";
import { hatchAngles, hatchLines, type PlanLoop, type PlanPoint } from "./hatch.js";

/** Un cuadrado de lado `lado` con su esquina en el origen. */
const cuadrado = (lado: number): PlanLoop => [
  [0, 0],
  [lado, 0],
  [lado, lado],
  [0, lado],
];

/** El largo total de las rayas, que es la medida que delata un recorte mal hecho. */
const largoTotal = (rayas: readonly (readonly [PlanPoint, PlanPoint])[]): number =>
  rayas.reduce((suma, [a, b]) => suma + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);

describe("hatchAngles", () => {
  it("los patrones de arquitectura, y 45° para lo que no conoce", () => {
    expect(hatchAngles("ANSI31")).toEqual([45]);
    expect(hatchAngles("ansi31")).toEqual([45]);
    // Una malla son dos direcciones, y la separación se reparte entre ellas.
    expect(hatchAngles("ANSI37")).toEqual([45, 135]);
    expect(hatchAngles("NET")).toEqual([0, 90]);
    expect(hatchAngles("UN-PATRON-DE-LA-OFICINA")).toEqual([45]);
    expect(hatchAngles(null)).toEqual([45]);
  });
});

describe("hatchLines", () => {
  it("raya un cuadrado en horizontal, y cada raya lo cruza entero", () => {
    const rayas = hatchLines([cuadrado(10)], [0], 2, 400);

    // De 0 a 10 cada 2, arrancando a media separación: 1, 3, 5, 7 y 9.
    expect(rayas).toHaveLength(5);
    for (const [a, b] of rayas) {
      expect(a[0]).toBeCloseTo(0, 6);
      expect(b[0]).toBeCloseTo(10, 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
    }
  });

  it("raya a 45°, que es como el CAD dibuja un macizo cortado", () => {
    const rayas = hatchLines([cuadrado(10)], [45], 2, 400);

    expect(rayas.length).toBeGreaterThan(3);
    // A 45° toda raya tiene la misma pendiente, y su largo no puede pasar de la diagonal.
    const diagonal = Math.hypot(10, 10);
    for (const [a, b] of rayas) {
      expect(Math.abs(Math.abs(b[0] - a[0]) - Math.abs(b[1] - a[1]))).toBeLessThan(1e-6);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(diagonal + 1e-6);
    }
  });

  it("una malla raya en las dos direcciones", () => {
    const simple = hatchLines([cuadrado(10)], [0], 2, 400);
    const malla = hatchLines([cuadrado(10)], [0, 90], 2, 400);

    expect(malla.length).toBe(simple.length * 2);
  });

  it("**deja el hueco**: un contorno interior no se raya", () => {
    // Un cuadrado de 10 con un agujero centrado de 4: el área rayada baja de 100 a 84.
    const hueco: PlanLoop = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ];
    const conHueco = hatchLines([cuadrado(10), hueco], [0], 1, 400);
    const sinHueco = hatchLines([cuadrado(10)], [0], 1, 400);

    // El largo total es el área rayada dividida por la separación: 84 contra 100.
    expect(largoTotal(sinHueco)).toBeCloseTo(100, 0);
    expect(largoTotal(conHueco)).toBeCloseTo(84, 0);

    // Y ninguna raya atraviesa el hueco de lado a lado.
    for (const [a, b] of conHueco) {
      if (a[1] <= 3 || a[1] >= 7) continue;
      expect(b[0] - a[0]).toBeLessThan(10 - 1e-6);
    }
  });

  it("una raya que pasa por un vértice no invierte la paridad", () => {
    // **El caso que falla en silencio.** Un rombo tiene sus vértices izquierdo y derecho a la altura
    // exacta de una raya; contando ese cruce dos veces, la paridad se invierte a partir de ahí y
    // sale el negativo del relleno — que a primera vista parece un rayado válido.
    const rombo: PlanLoop = [
      [5, 0],
      [10, 5],
      [5, 10],
      [0, 5],
    ];
    // Separación 5 con arranque a media separación cae en v = 2,5 y 7,5; con separación 2,5 cae
    // exactamente en 5, que es la altura de los dos vértices.
    const rayas = hatchLines([rombo], [0], 2.5, 400);

    expect(rayas.length).toBeGreaterThan(0);
    for (const [a, b] of rayas) {
      // Toda raya empieza dentro del rombo y termina dentro: nada asoma fuera de la caja.
      expect(a[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[0]).toBeLessThanOrEqual(10 + 1e-6);
      // Y ninguna es degenerada ni va del revés.
      expect(b[0]).toBeGreaterThan(a[0]);
    }
    // El área del rombo es 50; el largo total tiene que rondar 50 / 2,5 = 20.
    expect(largoTotal(rayas)).toBeGreaterThan(12);
    expect(largoTotal(rayas)).toBeLessThan(28);
  });

  it("ensancha la trama en vez de recortar el relleno a medias", () => {
    // Cabrían mil rayas y el tope son diez: se dibujan diez repartidas, no las diez primeras.
    const rayas = hatchLines([cuadrado(1000)], [0], 1, 10);

    expect(rayas).toHaveLength(10);
    const alturas = rayas.map(([a]) => a[1]);
    // Repartidas por todo el alto, no apiladas al principio.
    expect(Math.max(...alturas) - Math.min(...alturas)).toBeGreaterThan(800);
  });

  it("no lanza ni devuelve basura con entradas imposibles", () => {
    expect(hatchLines([], [45], 1, 400)).toEqual([]);
    expect(hatchLines([cuadrado(10)], [], 1, 400)).toEqual([]);
    expect(hatchLines([cuadrado(10)], [45], 0, 400)).toEqual([]);
    expect(hatchLines([cuadrado(10)], [45], Number.NaN, 400)).toEqual([]);
    // Un contorno de dos puntos no encierra nada.
    expect(
      hatchLines(
        [
          [
            [0, 0],
            [10, 0],
          ],
        ],
        [0],
        1,
        400,
      ),
    ).toEqual([]);
  });
});
