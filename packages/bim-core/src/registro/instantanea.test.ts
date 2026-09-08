import { describe, expect, it } from "vitest";
import { pareceEnBlanco, RANGO_MINIMO } from "./instantanea.js";

/** Un lienzo de un solo color, en RGBA. */
function liso(cuantos: number, [r, g, b, a]: [number, number, number, number]): number[] {
  return Array.from({ length: cuantos * 4 }, (_, i) => [r, g, b, a][i % 4] as number);
}

describe("pareceEnBlanco", () => {
  it("un búfer que nunca se dibujó es blanco", () => {
    // Es el caso que hay que cazar: `toDataURL` devuelve un PNG válido y todo transparente, sin
    // fallar. Un tema de BCF con esa imagen afirma «así se ve el problema» sobre nada.
    expect(pareceEnBlanco(liso(1000, [0, 0, 0, 0]))).toBe(true);
  });

  it("sin píxeles también", () => {
    expect(pareceEnBlanco([])).toBe(true);
  });

  it("un rectángulo de un solo color es blanco aunque sea opaco", () => {
    // El fondo del visor sin modelo: opaco, válido, y sin nada que enseñar.
    expect(pareceEnBlanco(liso(1000, [24, 24, 32, 255]))).toBe(true);
  });

  it("una imagen con modelo dibujado no lo es", () => {
    // Mitad fondo oscuro, mitad gris de un modelo: es el caso normal.
    const pixeles = [...liso(500, [24, 24, 32, 255]), ...liso(500, [180, 180, 190, 255])];
    expect(pareceEnBlanco(pixeles)).toBe(false);
  });

  it("una variación imperceptible no cuenta como dibujo", () => {
    // Un degradado de compresión o un ruido de un par de niveles no es un modelo. El umbral está
    // bajo a propósito —no se pide que la imagen sea bonita— pero no en cero.
    const casi = RANGO_MINIMO - 1;
    const pixeles = [...liso(500, [24, 24, 32, 255]), ...liso(500, [24 + casi, 24, 32, 255])];
    expect(pareceEnBlanco(pixeles)).toBe(true);
  });

  it("justo en el umbral ya cuenta", () => {
    const pixeles = [
      ...liso(500, [24, 24, 32, 255]),
      ...liso(500, [24 + RANGO_MINIMO, 24, 32, 255]),
    ];
    expect(pareceEnBlanco(pixeles)).toBe(false);
  });

  it("no cuenta el color de los píxeles transparentes", () => {
    // El lienzo sin dibujar deja RGB en cero con alfa en cero. Contarlo como negro haría pasar por
    // «dibujada» cualquier imagen con una esquina transparente y otra pintada.
    const pixeles = [...liso(500, [0, 0, 0, 0]), ...liso(500, [24, 24, 32, 255])];
    expect(pareceEnBlanco(pixeles)).toBe(true);
  });

  it("aguanta un lienzo grande sin recorrerlo entero", () => {
    // 1600 × 900 son 1,44 millones de píxeles: se muestrea a saltos, y el muestreo tiene que
    // seguir encontrando la mitad dibujada.
    const grande = [...liso(720_000, [24, 24, 32, 255]), ...liso(720_000, [200, 200, 210, 255])];
    expect(pareceEnBlanco(grande)).toBe(false);
  });
});
