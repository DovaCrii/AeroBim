import { describe, expect, it } from "vitest";

import {
  BYTES_DE_ATRIBUTO,
  bytesPorPunto,
  presupuesto,
  puntosQueCaben,
  saltoParaCaber,
  type Atributo,
} from "./presupuesto.js";

/**
 * El oráculo de los tamaños está **fuera de este archivo**, y a propósito.
 *
 * `bim-core` no importa Three.js —es la regla del paquete—, así que las cifras de
 * `BYTES_DE_ATRIBUTO` se comprobaron contra la propia biblioteca en una medición aparte, leyendo
 * `BufferAttribute.array.byteLength` de una geometría con puntos de verdad. Lo que se prueba acá es
 * la **aritmética**: que sumar, dividir y redondear dé lo que dice la documentación del módulo.
 *
 * Las cifras se repiten literales en las pruebas en vez de calcularlas con las mismas constantes:
 * una prueba que usa la constante que quiere comprobar no comprueba nada.
 */

describe("bytesPorPunto", () => {
  it("suma los atributos que se le dan", () => {
    expect(bytesPorPunto(["posicion"])).toBe(12);
    expect(bytesPorPunto(["posicion", "color"])).toBe(15);
    expect(bytesPorPunto(["posicion", "color", "intensidad", "clase"])).toBe(18);
  });

  it("no cuenta dos veces el mismo atributo", () => {
    // Una geometria tiene UN atributo `position`. Pedirlo dos veces no sube dos buferes.
    expect(bytesPorPunto(["posicion", "posicion", "color", "color"])).toBe(15);
  });

  it("sin atributos no ocupa nada", () => {
    expect(bytesPorPunto([])).toBe(0);
  });

  it("cada atributo declarado tiene un tamano positivo y entero", () => {
    for (const [nombre, bytes] of Object.entries(BYTES_DE_ATRIBUTO)) {
      expect(Number.isInteger(bytes), nombre).toBe(true);
      expect(bytes, nombre).toBeGreaterThan(0);
    }
  });
});

describe("presupuesto", () => {
  it("cuenta la tarjeta y JavaScript por separado, y el total es la suma", () => {
    const p = presupuesto(1_000_000, ["posicion", "color"]);
    expect(p.tarjeta).toBe(15_000_000);
    expect(p.javascript).toBe(15_000_000);
    expect(p.total).toBe(p.tarjeta + p.javascript);
  });

  it("una nube de 50 millones de puntos con color pasa de un giga y medio", () => {
    // El numero que decide la fase: 50 M es un levantamiento corriente de una obra.
    const p = presupuesto(50_000_000, ["posicion", "color"]);
    expect(p.total).toBe(1_500_000_000);
  });

  it("un numero de puntos imposible se trata como cero, no como negativo", () => {
    for (const malo of [-1, -1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = presupuesto(malo, ["posicion"]);
      expect(p.total, String(malo)).toBe(0);
    }
  });

  it("los puntos fraccionarios se truncan", () => {
    expect(presupuesto(10.9, ["posicion"]).tarjeta).toBe(120);
  });
});

describe("puntosQueCaben", () => {
  it("cuenta las dos copias, no solo la de la tarjeta", () => {
    // 15 bytes por punto x 2 copias = 30. En 300 bytes caben 10 puntos, no 20.
    expect(puntosQueCaben(300, ["posicion", "color"])).toBe(10);
  });

  it("y lo que cabe, cabe: el presupuesto de esos puntos no pasa del limite", () => {
    const atributos: Atributo[] = ["posicion", "color", "intensidad"];
    for (const limite of [1_000, 1_048_576, 512 * 1024 * 1024, 3_333_333]) {
      const caben = puntosQueCaben(limite, atributos);
      expect(presupuesto(caben, atributos).total, String(limite)).toBeLessThanOrEqual(limite);
      // Y uno mas ya no cabe: el resultado es el maximo, no una cifra prudente.
      expect(presupuesto(caben + 1, atributos).total, String(limite)).toBeGreaterThan(limite);
    }
  });

  it("sin atributos o sin presupuesto no cabe nada", () => {
    expect(puntosQueCaben(1e9, [])).toBe(0);
    expect(puntosQueCaben(0, ["posicion"])).toBe(0);
    expect(puntosQueCaben(-1e9, ["posicion"])).toBe(0);
    expect(puntosQueCaben(Number.NaN, ["posicion"])).toBe(0);
  });
});

describe("saltoParaCaber", () => {
  it("si ya cabe, no se salta nada", () => {
    expect(saltoParaCaber(1_000, 1_000)).toBe(1);
    expect(saltoParaCaber(999, 1_000)).toBe(1);
  });

  it("el salto hace caber la nube", () => {
    for (const [puntos, cabida] of [
      [50_000_000, 10_000_000],
      [7, 3],
      [1_000_001, 1_000_000],
      [123_456_789, 4_194_304],
    ] as const) {
      const salto = saltoParaCaber(puntos, cabida);
      expect(Math.floor(puntos / salto), `${puntos}/${cabida}`).toBeLessThanOrEqual(cabida);
    }
  });

  it("nunca devuelve menos de uno", () => {
    for (const [puntos, cabida] of [
      [0, 0],
      [-5, 10],
      [10, 0],
      [10, -5],
      [Number.NaN, 10],
    ] as const) {
      expect(saltoParaCaber(puntos, cabida), `${puntos}/${cabida}`).toBeGreaterThanOrEqual(1);
    }
  });
});
