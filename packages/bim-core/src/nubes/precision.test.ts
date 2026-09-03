import { describe, expect, it } from "vitest";

import {
  desplazamientoLocal,
  errorEnFloat32,
  escalonDeFloat32,
  seSostieneEnFloat32,
} from "./precision.js";

/**
 * Los vectores de esta prueba **no son inventados**: salen de medir la misma aritmética con `numpy`
 * y `struct` de Python sobre una nube sintética en UTM 19S, que es el oráculo independiente. Si
 * `Math.fround` de V8 y el `float32` de C dieran cosas distintas, esta prueba lo diría.
 */

const UTM19S_ESTE = 345_000;
const UTM19S_NORTE = 6_298_000;

describe("errorEnFloat32", () => {
  it("reproduce lo medido en Python sobre una coordenada UTM 19S", () => {
    // 6298012.345 -> 6298012.5 en float32. Medido: 155,00 mm.
    expect(errorEnFloat32(6_298_012.345) * 1000).toBeCloseTo(155.0, 2);
    // 345012.345 -> 345012.34375. Medido: 1,25 mm.
    expect(errorEnFloat32(345_012.345) * 1000).toBeCloseTo(1.25, 3);
    // 561.234 cabe: medido 0,01 mm.
    expect(errorEnFloat32(561.234) * 1000).toBeLessThan(0.02);
  });

  it("una coordenada local no pierde nada apreciable", () => {
    for (const metros of [0, 0.001, 1.5, 12.345, 99.6, 100]) {
      expect(errorEnFloat32(metros) * 1000, String(metros)).toBeLessThan(0.01);
    }
  });

  it("no devuelve negativos ni se traga lo que no es un numero", () => {
    expect(errorEnFloat32(-6_298_012.345)).toBeGreaterThan(0);
    expect(Number.isNaN(errorEnFloat32(Number.NaN))).toBe(true);
    expect(Number.isNaN(errorEnFloat32(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe("escalonDeFloat32", () => {
  it("el escalon en la coordenada norte de Santiago pasa de un centimetro", () => {
    const escalon = escalonDeFloat32(UTM19S_NORTE);
    expect(escalon * 1000).toBeGreaterThan(100); // mas de 100 mm
    expect(escalon).toBe(0.5); // 6.298e6 esta entre 2^22 y 2^23: el escalon es 2^-1
  });

  it("y en el este es mucho menor, pero tampoco milimetrico", () => {
    // 345 000 esta entre 2^18 y 2^19: escalon 2^-5 = 0,03125 m.
    expect(escalonDeFloat32(UTM19S_ESTE)).toBe(0.03125);
  });

  it("en coordenadas locales el escalon es microscopico", () => {
    expect(escalonDeFloat32(100)).toBeLessThan(1e-5);
    expect(escalonDeFloat32(1)).toBeLessThan(1e-6);
  });

  it("ningun error medido supera el escalon de su magnitud", () => {
    // La relacion que define el escalon: el redondeo nunca se aleja mas de un paso.
    for (const metros of [345_012.345, 6_298_012.345, 561.234, 12.345, 1_000_000.5]) {
      expect(errorEnFloat32(metros), String(metros)).toBeLessThanOrEqual(escalonDeFloat32(metros));
    }
  });

  it("el escalon es de verdad la distancia al float32 siguiente", () => {
    for (const metros of [1, 100, 345_000, 6_298_000, 0.5, 1024]) {
      const v = Math.fround(metros);
      const paso = escalonDeFloat32(metros);
      // Sumar el escalon cambia el numero; sumar la mitad menos un pelo, no.
      expect(Math.fround(v + paso), String(metros)).not.toBe(v);
      expect(Math.fround(v + paso / 4), String(metros)).toBe(v);
    }
  });
});

describe("seSostieneEnFloat32", () => {
  it("al medio centimetro, una nube en UTM no se sostiene y una local si", () => {
    expect(seSostieneEnFloat32(UTM19S_NORTE, 0.005)).toBe(false);
    expect(seSostieneEnFloat32(UTM19S_ESTE, 0.005)).toBe(false);
    expect(seSostieneEnFloat32(100, 0.005)).toBe(true);
    expect(seSostieneEnFloat32(10_000, 0.005)).toBe(true);
  });

  it("una tolerancia imposible es siempre un no", () => {
    for (const mala of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(seSostieneEnFloat32(10, mala), String(mala)).toBe(false);
    }
  });
});

describe("desplazamientoLocal", () => {
  it("redondea hacia abajo al metro, para que sea un numero que se pueda anotar", () => {
    expect(desplazamientoLocal([345_000.123, 6_298_000.987, 560.5])).toEqual([
      345_000, 6_298_000, 560,
    ]);
  });

  it("y con el desplazamiento restado, la nube si se sostiene al milimetro", () => {
    const minimo: [number, number, number] = [345_000.123, 6_298_000.987, 560.5];
    const maximo: [number, number, number] = [345_099.6, 6_298_099.6, 563.0];
    const off = desplazamientoLocal(minimo);
    for (let eje = 0; eje < 3; eje += 1) {
      const local = (maximo[eje] as number) - (off[eje] as number);
      expect(seSostieneEnFloat32(local, 0.001), `eje ${eje}`).toBe(true);
    }
  });

  it("coordenadas negativas tambien bajan, no se acercan a cero", () => {
    // Hemisferio sur sin falso norte, o un IFC con el origen desplazado: la parte entera baja.
    expect(desplazamientoLocal([-12.3, -0.7, -1_000.01])).toEqual([-13, -1, -1_001]);
  });
});
