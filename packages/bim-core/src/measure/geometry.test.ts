import { describe, expect, it } from "vitest";
import {
  angleAtDeg,
  distanceM,
  distancePartsM,
  perimeterM,
  polygonAreaM2,
  type Point3,
} from "./geometry.js";

/**
 * El oráculo de estas pruebas es la geometría elemental: cuadrados de lado conocido,
 * triángulos rectángulos con lados enteros, ángulos rectos. Son comprobables a mano, que es
 * justo lo que hace falta en cálculos cuyo resultado alguien va a usar para pedir material.
 */

describe("distanceM", () => {
  it("mide el 3-4-5 de siempre", () => {
    expect(distanceM([0, 0, 0], [3, 4, 0])).toBeCloseTo(5, 12);
  });

  it("mide la diagonal del cubo unitario", () => {
    expect(distanceM([0, 0, 0], [1, 1, 1])).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("la distancia de un punto a sí mismo es cero", () => {
    expect(distanceM([7, -2, 3], [7, -2, 3])).toBe(0);
  });
});

describe("distancePartsM", () => {
  it("separa la rampa: 3 de avance, 4 de subida, 5 en línea recta", () => {
    // Y es la vertical, así que la subida va en la segunda coordenada.
    expect(distancePartsM([0, 0, 0], [3, 4, 0])).toEqual({
      directM: 5,
      horizontalM: 3,
      verticalM: 4,
    });
  });

  it("en horizontal las tres coinciden salvo la vertical, que es cero", () => {
    const partes = distancePartsM([1, 2, 3], [4, 2, 7]);
    expect(partes.directM).toBeCloseTo(5, 12);
    expect(partes.horizontalM).toBeCloseTo(5, 12);
    expect(partes.verticalM).toBe(0);
  });

  it("en vertical la horizontal es cero y el desnivel es toda la distancia", () => {
    expect(distancePartsM([2, 10, -5], [2, 3, -5])).toEqual({
      directM: 7,
      horizontalM: 0,
      verticalM: 7,
    });
  });

  it("el desnivel no tiene signo: da igual desde qué punto se mida", () => {
    expect(distancePartsM([0, 5, 0], [0, 0, 0]).verticalM).toBe(5);
    expect(distancePartsM([0, 0, 0], [0, 5, 0]).verticalM).toBe(5);
  });

  it("coincide con distanceM en la componente directa", () => {
    const a: Point3 = [1.5, -2.25, 0.75];
    const b: Point3 = [-3, 4.5, 8];
    expect(distancePartsM(a, b).directM).toBeCloseTo(distanceM(a, b), 12);
  });
});

describe("angleAtDeg", () => {
  it("reconoce el ángulo recto", () => {
    expect(angleAtDeg([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90, 10);
  });

  it("reconoce los 180° de tres puntos alineados", () => {
    expect(angleAtDeg([-1, 0, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(180, 10);
  });

  it("reconoce los 0° de dos lados en la misma dirección", () => {
    expect(angleAtDeg([1, 0, 0], [0, 0, 0], [5, 0, 0])).toBeCloseTo(0, 10);
  });

  it("reconoce los 45° de la diagonal", () => {
    expect(angleAtDeg([1, 0, 0], [0, 0, 0], [1, 1, 0])).toBeCloseTo(45, 10);
  });

  it("no depende de dónde esté el vértice", () => {
    // El mismo ángulo recto, trasladado lejos del origen.
    expect(angleAtDeg([101, 100, 50], [100, 100, 50], [100, 101, 50])).toBeCloseTo(90, 10);
  });

  it("devuelve 0 en vez de NaN cuando un lado tiene largo cero", () => {
    // Sin dirección no hay ángulo. Un NaN acá llegaría hasta la pantalla.
    expect(angleAtDeg([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBe(0);
  });
});

describe("perimeterM", () => {
  it("suma los lados de una polilínea", () => {
    expect(
      perimeterM([
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ]),
    ).toBeCloseTo(7, 12);
  });

  it("un solo punto no tiene perímetro", () => {
    expect(perimeterM([[1, 2, 3]])).toBe(0);
  });
});

describe("polygonAreaM2", () => {
  it("el cuadrado unitario mide 1 m²", () => {
    const cuadrado: Point3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    expect(polygonAreaM2(cuadrado)).toBeCloseTo(1, 12);
  });

  it("no depende de la posición respecto al origen", () => {
    // El mismo cuadrado, lejos del origen: en un contorno cerrado la traslación se cancela.
    // Es el error clásico de esta fórmula si se implementa mal.
    const lejos: Point3[] = [
      [100, 200, 300],
      [101, 200, 300],
      [101, 201, 300],
      [100, 201, 300],
    ];
    expect(polygonAreaM2(lejos)).toBeCloseTo(1, 9);
  });

  it("el triángulo 3-4-5 mide 6 m²", () => {
    expect(
      polygonAreaM2([
        [0, 0, 0],
        [3, 0, 0],
        [0, 4, 0],
      ]),
    ).toBeCloseTo(6, 12);
  });

  it("mide el área real de un plano inclinado, no su sombra en planta", () => {
    // Un faldón de 1 m de ancho que sube 1 m en 1 m de fondo: su superficie es la diagonal,
    // √2 m², mientras su proyección en planta mediría 1 m². Pedir material por la sombra
    // deja la obra corta, y por eso este caso está acá.
    const faldon: Point3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
      [0, 1, 1],
    ];
    expect(polygonAreaM2(faldon)).toBeCloseTo(Math.SQRT2, 12);
  });

  it("es indiferente al sentido de recorrido", () => {
    const horario: Point3[] = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ];
    expect(polygonAreaM2(horario)).toBeCloseTo(1, 12);
  });

  it("con menos de tres vértices no hay superficie", () => {
    expect(polygonAreaM2([])).toBe(0);
    expect(polygonAreaM2([[0, 0, 0]])).toBe(0);
    expect(
      polygonAreaM2([
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toBe(0);
  });

  it("un polígono degenerado (todos los puntos alineados) mide 0", () => {
    expect(
      polygonAreaM2([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
    ).toBeCloseTo(0, 12);
  });
});
