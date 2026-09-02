import { describe, expect, it } from "vitest";
import {
  AA_NO_TEXTO,
  AA_TEXTO,
  contrastRatio,
  parseHex,
  pasaAA,
  relativeLuminance,
} from "./contraste.js";

describe("parseHex", () => {
  it("lee un color del sistema de diseño", () => {
    expect(parseHex("#9b5de5")).toEqual([155, 93, 229]);
    expect(parseHex("#000000")).toEqual([0, 0, 0]);
    expect(parseHex("#ffffff")).toEqual([255, 255, 255]);
  });

  it("lanza con lo que no es un color, en vez de devolver negro", () => {
    // Devolver negro en silencio convertiría la prueba de contraste en una prueba de que el negro
    // contrasta. Acá lo que se lee es una constante del repositorio: si está mal, es un error.
    expect(() => parseHex("9b5de5")).toThrow();
    expect(() => parseHex("#abc")).toThrow();
    expect(() => parseHex("rebeccapurple")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("va de cero a uno, con los extremos exactos", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("pesa el verde más que el rojo y el rojo más que el azul", () => {
    // Son los coeficientes de la norma, y el orden es lo que hace que un azul saturado sea casi
    // negro para el contraste aunque a la vista parezca vivo.
    const rojo = relativeLuminance("#ff0000");
    const verde = relativeLuminance("#00ff00");
    const azul = relativeLuminance("#0000ff");
    expect(verde).toBeGreaterThan(rojo);
    expect(rojo).toBeGreaterThan(azul);
  });
});

describe("contrastRatio", () => {
  it("los vectores conocidos de la norma", () => {
    // **Es lo que fija la fórmula.** Los 21:1 de blanco sobre negro salen solo si la
    // linealización y los pesos son los correctos, y el 4,48 de `#777777` sobre blanco es el
    // ejemplo con el que se comprueba el umbral de corte —el famoso 0,03928 contra 0,04045—.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 10);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("no depende de cuál se pase primero", () => {
    // Así quien llama no tiene que acordarse de cuál era el fondo.
    expect(contrastRatio("#18202f", "#eef2f8")).toBeCloseTo(
      contrastRatio("#eef2f8", "#18202f"),
      10,
    );
  });

  it("acepta la terna además del hexadecimal", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 2);
  });
});

describe("pasaAA", () => {
  it("el violeta de marca no sirve para texto, y el de acento sí", () => {
    // Es la regla del sistema de diseño, comprobada en vez de escrita: `--ab-brand` pinta y
    // `--ab-accent` se lee. Sobre `--ab-surface` el primero da 3,96 y el segundo 7,80.
    expect(pasaAA("#9b5de5", "#18202f")).toBe(false);
    expect(pasaAA("#c3a6f0", "#18202f")).toBe(true);
  });

  it("los dos umbrales son los de la norma", () => {
    expect(AA_TEXTO).toBe(4.5);
    expect(AA_NO_TEXTO).toBe(3);
  });
});
