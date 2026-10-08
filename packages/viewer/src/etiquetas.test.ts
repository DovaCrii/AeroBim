import { describe, expect, it } from "vitest";

import { CUBRIMIENTO_MAXIMO, cubrimientoDeMarcas } from "./etiquetas.js";

describe("cubrimientoDeMarcas", () => {
  it("sin marcas o sin área no cubre nada", () => {
    expect(cubrimientoDeMarcas(0, 16, 1000)).toBe(0);
    expect(cubrimientoDeMarcas(10, 16, 0)).toBe(0);
  });

  it("crece con la cantidad y baja con el cuadrado del acercamiento", () => {
    const lejos = cubrimientoDeMarcas(433, 16, 245_000);
    const cerca = cubrimientoDeMarcas(433, 16, 245_000 * 9);
    expect(lejos).toBeGreaterThan(CUBRIMIENTO_MAXIMO);
    expect(cerca).toBeCloseTo(lejos / 9, 6);
  });

  it("un plano con pocos rótulos en una pantalla grande se dibuja entero", () => {
    expect(cubrimientoDeMarcas(30, 16, 800_000)).toBeLessThan(CUBRIMIENTO_MAXIMO);
  });
});
