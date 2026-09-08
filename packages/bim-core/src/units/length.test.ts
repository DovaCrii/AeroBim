import { describe, expect, it } from "vitest";
import {
  fromMeters,
  METRE,
  MILLIMETRE,
  metersPerUnit,
  parseLengthUnit,
  toMeters,
} from "./length.js";

describe("metersPerUnit", () => {
  it("el metro sin prefijo vale 1", () => {
    expect(metersPerUnit(METRE)).toBe(1);
  });

  it("aplica los prefijos SI", () => {
    expect(metersPerUnit(MILLIMETRE)).toBe(1e-3);
    expect(metersPerUnit({ kind: "si", prefix: "CENTI" })).toBe(1e-2);
    expect(metersPerUnit({ kind: "si", prefix: "KILO" })).toBe(1e3);
  });

  it("usa los factores imperiales exactos por definicion", () => {
    // Acuerdo internacional de la yarda (1959): una pulgada es 25,4 mm exactos.
    // No son aproximaciones y no deben redondearse.
    expect(metersPerUnit({ kind: "conversion", name: "INCH" })).toBe(0.0254);
    expect(metersPerUnit({ kind: "conversion", name: "FOOT" })).toBe(0.3048);
    expect(metersPerUnit({ kind: "conversion", name: "YARD" })).toBe(0.9144);
    expect(metersPerUnit({ kind: "conversion", name: "MILE" })).toBe(1609.344);
  });

  it("un pie son doce pulgadas", () => {
    const inch = metersPerUnit({ kind: "conversion", name: "INCH" });
    const foot = metersPerUnit({ kind: "conversion", name: "FOOT" });
    expect(foot).toBeCloseTo(inch * 12, 12);
  });
});

describe("toMeters", () => {
  it("convierte un modelo en milimetros", () => {
    // El caso mas comun: un muro de 3000 unidades en un IFC de arquitectura son 3 m,
    // no 3 km. Confundirlo no produce un error, produce un modelo absurdo.
    expect(toMeters(3000, MILLIMETRE)).toBeCloseTo(3, 12);
  });

  it("convierte un modelo en pies", () => {
    expect(toMeters(10, { kind: "conversion", name: "FOOT" })).toBeCloseTo(3.048, 12);
  });

  it("deja intacto un modelo ya en metros", () => {
    expect(toMeters(42.5, METRE)).toBe(42.5);
  });
});

describe("fromMeters", () => {
  it("es la inversa de toMeters", () => {
    for (const unit of [METRE, MILLIMETRE, { kind: "conversion", name: "FOOT" } as const]) {
      expect(fromMeters(toMeters(1234.5, unit), unit)).toBeCloseTo(1234.5, 9);
    }
  });
});

describe("parseLengthUnit", () => {
  it("interpreta IfcSIUnit con y sin prefijo", () => {
    expect(parseLengthUnit("METRE")).toEqual(METRE);
    expect(parseLengthUnit("METRE", "MILLI")).toEqual(MILLIMETRE);
    expect(parseLengthUnit("METRE", "")).toEqual(METRE);
    expect(parseLengthUnit("METRE", null)).toEqual(METRE);
  });

  it("tolera la grafia estadounidense y las minusculas", () => {
    expect(parseLengthUnit("meter")).toEqual(METRE);
    expect(parseLengthUnit("Metre", "milli")).toEqual(MILLIMETRE);
  });

  it("interpreta IfcConversionBasedUnit, en singular y plural", () => {
    expect(parseLengthUnit("FOOT")).toEqual({ kind: "conversion", name: "FOOT" });
    expect(parseLengthUnit("INCH")).toEqual({ kind: "conversion", name: "INCH" });
    expect(parseLengthUnit("MILES")).toEqual({ kind: "conversion", name: "MILE" });
    // "FEET" es plural irregular: no se obtiene quitando una "S", asi que no se
    // reconoce y devuelve null. Preferible a inventar una regla de plurales ingleses.
    expect(parseLengthUnit("FEET")).toBeNull();
  });

  it("devuelve null ante una unidad desconocida, en vez de asumir metros", () => {
    // Asumir metros aqui es la decision que coloca un modelo en el lugar equivocado
    // sin que nadie se entere. Un null obliga a la capa de arriba a informarlo.
    expect(parseLengthUnit("PARSEC")).toBeNull();
    expect(parseLengthUnit("METRE", "MEGAMILLI")).toBeNull();
    expect(parseLengthUnit("")).toBeNull();
  });
});
