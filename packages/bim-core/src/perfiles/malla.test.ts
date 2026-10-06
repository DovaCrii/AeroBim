/** La malla de un perfil, con respuestas calculables a mano. */
import { describe, expect, it } from "vitest";

import { decimalesDelPaso, mallaDePerfil, pasoLimpio, rotulosDeMalla } from "./malla.js";

describe("pasoLimpio", () => {
  it("elige 1, 2 o 5 por una potencia de diez", () => {
    expect(pasoLimpio(100, 10)).toBe(10);
    expect(pasoLimpio(1000, 10)).toBe(100);
    expect(pasoLimpio(24, 6)).toBe(5); // crudo 4 → 5
    expect(pasoLimpio(12, 6)).toBe(2);
    expect(pasoLimpio(0.5, 10)).toBeCloseTo(0.05);
  });

  it("devuelve 1 cuando no hay extensión que repartir", () => {
    expect(pasoLimpio(0, 10)).toBe(1);
    expect(pasoLimpio(-5, 10)).toBe(1);
    expect(pasoLimpio(Number.NaN, 10)).toBe(1);
  });
});

describe("mallaDePerfil", () => {
  const rango = { sMinM: 0, sMaxM: 100, cotaMinM: 0, cotaMaxM: 12 };

  it("no hay malla sin extensión", () => {
    expect(mallaDePerfil({ ...rango, sMaxM: 0 })).toBeNull();
    expect(mallaDePerfil({ ...rango, cotaMaxM: 0 })).toBeNull();
  });

  it("pone las verticales en múltiplos del paso de PK, de borde a borde", () => {
    const malla = mallaDePerfil(rango)!;
    expect(malla.pasoPkM).toBe(10);
    // 11 verticales (0, 10, …, 100), de cota 0 a 12.
    const verticales = [];
    for (let i = 0; i < malla.cuadricula.length; i += 4) {
      const [s1, c1, s2, c2] = malla.cuadricula.slice(i, i + 4);
      if (s1 === s2) verticales.push([s1, c1, c2]);
    }
    expect(verticales).toHaveLength(11);
    expect(verticales[0]).toEqual([0, 0, 12]);
    expect(verticales[10]).toEqual([100, 0, 12]);
  });

  it("las horizontales caen en cotas múltiplos del paso, no a partir del borde", () => {
    const malla = mallaDePerfil({ ...rango, cotaMinM: 101.3, cotaMaxM: 113.3 })!;
    expect(malla.pasoCotaM).toBe(2);
    const cotas = [];
    for (let i = 0; i < malla.cuadricula.length; i += 4) {
      const [s1, c1, s2, c2] = malla.cuadricula.slice(i, i + 4);
      if (c1 === c2 && s1 !== s2) cotas.push(c1);
    }
    expect(cotas).toEqual([102, 104, 106, 108, 110, 112]);
  });

  it("la regla marca cada paso/5, larga en los pasos y corta entre ellos, hacia dentro", () => {
    const malla = mallaDePerfil(rango)!;
    // paso 10 → marcas cada 2: 51 en total.
    expect(malla.regla).toHaveLength(51 * 4);
    const largas = [];
    for (let i = 0; i < malla.regla.length; i += 4) {
      const alto = malla.regla[i + 3]! - malla.regla[i + 1]!;
      expect(malla.regla[i + 1]).toBe(0); // arranca en el borde inferior
      expect(alto).toBeGreaterThan(0);
      if (Math.abs(alto - 0.36) < 1e-9) largas.push(malla.regla[i]);
    }
    expect(largas).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe("decimalesDelPaso", () => {
  it("cuenta los decimales justos para no perder el paso", () => {
    expect(decimalesDelPaso(5)).toBe(0);
    expect(decimalesDelPaso(20)).toBe(0);
    expect(decimalesDelPaso(0.5)).toBe(1);
    expect(decimalesDelPaso(0.05)).toBe(2);
    expect(decimalesDelPaso(0.25)).toBe(2);
  });
  it("un paso inválido no rompe", () => {
    expect(decimalesDelPaso(0)).toBe(0);
    expect(decimalesDelPaso(Number.NaN)).toBe(0);
  });
});

describe("rotulosDeMalla", () => {
  const rango = { sMinM: 0, sMaxM: 100, cotaMinM: 101.3, cotaMaxM: 113.3 };
  const malla = mallaDePerfil(rango)!;
  const formato = (s: number, d: number) => `PK${s.toFixed(d)}`;

  it("hay un PK por cada línea vertical, en los mismos valores", () => {
    const { pk } = rotulosDeMalla(rango, malla, formato);
    expect(pk.map((r) => r.sM)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(pk[1]!.texto).toBe("PK10");
  });

  it("hay una cota por cada línea horizontal, con los decimales del paso", () => {
    const { cotas } = rotulosDeMalla(rango, malla, formato);
    expect(cotas.map((r) => r.cotaM)).toEqual([102, 104, 106, 108, 110, 112]);
    expect(cotas.map((r) => r.texto)).toEqual(["102", "104", "106", "108", "110", "112"]);
  });

  it("con un paso fraccionario las cotas llevan sus decimales", () => {
    const fino = { sMinM: 0, sMaxM: 6, cotaMinM: 0, cotaMaxM: 0.6 };
    const m = mallaDePerfil(fino)!;
    const { cotas } = rotulosDeMalla(fino, m, formato);
    expect(m.pasoCotaM).toBeCloseTo(0.1);
    expect(cotas[1]!.texto).toBe("0.1");
  });
});
