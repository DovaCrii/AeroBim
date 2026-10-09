import { describe, expect, it } from "vitest";
import {
  HOJAS,
  escalaQueCabe,
  medirEnLamina,
  pxPorMetroAEscala,
  rotuloDeEscala,
  sugerirHoja,
} from "./hojaDeLamina.js";

const A3 = HOJAS.find((h) => h.nombre === "A3")!;

describe("escalaQueCabe", () => {
  it("elige la mayor escala normalizada que cabe en el área útil", () => {
    // A3 útil: 400 × 277 mm. 36,2 × 28 m a 1:200 son 181 × 140 mm: cabe; a 1:100, 362 × 280: no (alto 280 > 277).
    expect(escalaQueCabe(36.2, 28, A3)).toBe(200);
    // Lo que ocupa 20 × 10 m cabe a 1:50 (400 × 200 mm), y a 1:25 no.
    expect(escalaQueCabe(20, 10, A3)).toBe(50);
  });

  it("devuelve null si no cabe ni a la menor, o si las medidas no valen", () => {
    expect(escalaQueCabe(1_000_000, 10, A3)).toBeNull();
    expect(escalaQueCabe(0, 10, A3)).toBeNull();
    expect(escalaQueCabe(Number.NaN, 10, A3)).toBeNull();
  });
});

describe("sugerirHoja", () => {
  it("toma la hoja más pequeña en la que cabe a 1:200 o mayor", () => {
    // 36,2 × 28 m: en A4 (277 × 190 útiles) a 1:200 son 181 × 140: cabe.
    expect(sugerirHoja(36.2, 28)).toEqual({ hoja: HOJAS[0], escala: 200 });
    // 69 × 36,2 m: en A4 a 1:250 sería 276 × 145 y 1:250 es más pequeña que 1:200, así que sube a A3 a 1:200.
    expect(sugerirHoja(69, 36.2)).toEqual({ hoja: A3, escala: 200 });
  });

  it("cae a la mayor hoja con la escala que quepa cuando ninguna llega a 1:200", () => {
    const grande = sugerirHoja(300, 100);
    expect(grande?.hoja.nombre).toBe("A0");
    expect(grande?.escala).toBeGreaterThan(200);
  });

  it("es null sin medidas", () => {
    expect(sugerirHoja(0, 0)).toBeNull();
  });
});

describe("escala en pantalla", () => {
  it("rotula como 1:N", () => {
    expect(rotuloDeEscala(100)).toBe("1:100");
  });

  it("a 1:100 un metro del modelo son 10 mm de papel, unos 37,8 px a 96 ppp", () => {
    expect(pxPorMetroAEscala(100)).toBeCloseTo(37.795, 2);
    expect(pxPorMetroAEscala(50)).toBeCloseTo(2 * pxPorMetroAEscala(100), 9);
  });
});

describe("medirEnLamina", () => {
  it("da la recta, sus componentes y los milímetros de papel", () => {
    const m = medirEnLamina({ pkM: 0, cotaM: 0 }, { pkM: 3, cotaM: 4 }, 100);
    expect(m.distanciaM).toBe(5);
    expect(m.dHorizontalM).toBe(3);
    expect(m.dVerticalM).toBe(4);
    // 5 m a 1:100 son 50 mm.
    expect(m.enPapelMm).toBeCloseTo(50, 9);
  });

  it("no inventa papel sin escala y no depende del orden de los puntos", () => {
    const a = { pkM: 10, cotaM: 2 };
    const b = { pkM: 4, cotaM: -6 };
    expect(medirEnLamina(a, b, null).enPapelMm).toBeNull();
    expect(medirEnLamina(a, b, 50).distanciaM).toBe(medirEnLamina(b, a, 50).distanciaM);
  });
});
