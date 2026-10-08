/**
 * El balizado del eje, con respuestas que se calculan a mano.
 *
 * El eje de las pruebas es la **L** de `eje.test.ts`: 3 m hacia +x y luego 4 m hacia +z (7 m).
 */
import { describe, expect, it } from "vitest";

import { balizasDelEje, intervaloDeBalizasM, MAXIMO_DE_BALIZAS } from "./balizado.js";
import type { EjeDePerfil } from "./eje.js";

const L: EjeDePerfil = {
  sistema: "escena",
  verticesM: [
    [0, 0],
    [3, 0],
    [3, 4],
  ],
};

function recta(largoM: number): EjeDePerfil {
  return {
    sistema: "escena",
    verticesM: [
      [0, 0],
      [largoM, 0],
    ],
  };
}

describe("intervaloDeBalizasM", () => {
  it("elige el menor de la serie que deja a lo sumo 15 tramos", () => {
    expect(intervaloDeBalizasM(7)).toBe(1);
    expect(intervaloDeBalizasM(15.9)).toBe(1);
    expect(intervaloDeBalizasM(16)).toBe(2);
    expect(intervaloDeBalizasM(18.9)).toBe(2);
    expect(intervaloDeBalizasM(60)).toBe(5);
    expect(intervaloDeBalizasM(120)).toBe(10);
    expect(intervaloDeBalizasM(600)).toBe(50);
    expect(intervaloDeBalizasM(1000)).toBe(100);
  });

  it("nunca pasa de MAXIMO_DE_BALIZAS tramos, ni con ejes enormes", () => {
    for (const largoM of [0.5, 3, 17, 99, 340, 1234, 8000, 45000]) {
      expect(Math.floor(largoM / intervaloDeBalizasM(largoM))).toBeLessThanOrEqual(
        MAXIMO_DE_BALIZAS,
      );
    }
  });

  it("un eje sin largo da 1 m y no revienta", () => {
    expect(intervaloDeBalizasM(0)).toBe(1);
    expect(intervaloDeBalizasM(Number.NaN)).toBe(1);
  });
});

describe("balizasDelEje", () => {
  it("la L de 7 m lleva una baliza por metro, del PK 0 al 7", () => {
    const balizas = balizasDelEje(L);
    expect(balizas.map((b) => b.pkM)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(balizas[3]!.puntoM).toEqual([3, 0]);
    // Después del codo el eje apunta a +z.
    expect(balizas[5]!.puntoM).toEqual([3, 2]);
    expect(balizas[5]!.direccion).toEqual([0, 1]);
    expect(balizas[7]!.esFinal).toBe(true);
    expect(balizas.filter((b) => b.esFinal)).toHaveLength(1);
  });

  it("el final entra aunque no sea múltiplo del intervalo", () => {
    const balizas = balizasDelEje(recta(18.9));
    expect(balizas.map((b) => b.pkM)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 18.9]);
  });

  it("si el final queda pegado a la baliza anterior, esta le cede el sitio", () => {
    const balizas = balizasDelEje(recta(10.2));
    expect(balizas.map((b) => b.pkM)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.2]);
  });

  it("acepta un intervalo explícito", () => {
    expect(balizasDelEje(recta(25), 10).map((b) => b.pkM)).toEqual([0, 10, 20, 25]);
  });

  it("un eje sin largo no tiene balizas", () => {
    expect(balizasDelEje({ sistema: "escena", verticesM: [[1, 1]] })).toEqual([]);
    expect(
      balizasDelEje({
        sistema: "escena",
        verticesM: [
          [1, 1],
          [1, 1],
        ],
      }),
    ).toEqual([]);
  });
});
