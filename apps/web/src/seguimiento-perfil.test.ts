import type { EjeDePerfil } from "@aerobim/bim-core";
import { describe, expect, it } from "vitest";

import {
  balizasConNumero,
  laMasCercana,
  seguimientoDeLamina,
  siluetaDePerfil,
} from "./seguimiento-perfil.js";

const eje: EjeDePerfil = {
  sistema: "escena",
  verticesM: [
    [0, 0],
    [20, 0],
  ],
};

describe("seguimientoDeLamina", () => {
  it("una transversal a mitad del eje queda en 0,5", () => {
    const s = seguimientoDeLamina(eje, 10);
    expect(s?.largoM).toBeCloseTo(20);
    expect(s?.fraccionActual).toBeCloseTo(0.5);
  });

  it("el longitudinal no tiene posición: cubre todo el eje", () => {
    expect(seguimientoDeLamina(eje, undefined)?.fraccionActual).toBeNull();
  });

  it("un PK fuera del eje se recorta a sus extremos", () => {
    expect(seguimientoDeLamina(eje, 99)?.fraccionActual).toBe(1);
    expect(seguimientoDeLamina(eje, -3)?.fraccionActual).toBe(0);
  });

  it("las balizas empiezan en 0, acaban en 1 y están en orden", () => {
    const b = seguimientoDeLamina(eje, 5)?.balizas ?? [];
    expect(b[0]?.fraccion).toBe(0);
    expect(b.at(-1)?.fraccion).toBe(1);
    expect(b.map((x) => x.fraccion)).toEqual([...b.map((x) => x.fraccion)].sort((x, y) => x - y));
  });

  it("un eje sin largo no tiene seguimiento", () => {
    expect(seguimientoDeLamina({ sistema: "escena", verticesM: [[1, 1]] }, 0)).toBeNull();
  });
});

describe("balizasConNumero", () => {
  const muchas = Array.from({ length: 15 }, (_, i) => ({
    pkM: i,
    fraccion: i / 14,
    esFinal: i === 14,
  }));

  it("reparte y conserva el primero y el último", () => {
    const con = balizasConNumero(muchas, 5);
    expect(con.length).toBeLessThanOrEqual(5);
    expect(con[0]?.pkM).toBe(0);
    expect(con.at(-1)?.pkM).toBe(14);
  });

  it("si caben todas, las deja todas", () => {
    expect(balizasConNumero(muchas.slice(0, 4), 6)).toHaveLength(4);
  });
});

describe("laMasCercana", () => {
  it("elige la transversal de PK más próximo y salta las que no lo tienen", () => {
    const laminas: { id: string; pkM?: number }[] = [
      { id: "long" },
      { id: "a", pkM: 2 },
      { id: "b", pkM: 9 },
      { id: "c", pkM: 12 },
    ];
    expect(laMasCercana(laminas, 10)?.id).toBe("b");
    const sinPk: { id: string; pkM?: number }[] = [{ id: "solo" }];
    expect(laMasCercana(sinPk, 1)).toBeUndefined();
  });
});

describe("siluetaDePerfil", () => {
  const cruce = (desdeM: number, hastaM: number, cotaMinM: number, cotaMaxM: number) => ({
    categoria: "IFCWALL",
    nombre: null,
    guid: null,
    desdeM,
    hastaM,
    cotaMinM,
    cotaMaxM,
  });

  it("une las cotas de lo que cruza en cada PK y deja huecos donde no hay nada", () => {
    const s = siluetaDePerfil([cruce(0, 4, 0, 3), cruce(2, 4, -1, 1)], 10, 11);
    expect(s?.cotaMinM).toBe(-1);
    expect(s?.cotaMaxM).toBe(3);
    expect(s?.columnas[0]).toEqual({ minM: 0, maxM: 3 });
    expect(s?.columnas[3]).toEqual({ minM: -1, maxM: 3 });
    expect(s?.columnas[8]).toBeNull();
  });

  it("sin cruces o sin largo no hay silueta", () => {
    expect(siluetaDePerfil([], 10, 10)).toBeNull();
    expect(siluetaDePerfil([cruce(0, 1, 0, 1)], 0, 10)).toBeNull();
  });
});
