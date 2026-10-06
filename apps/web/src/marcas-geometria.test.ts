import { describe, expect, it } from "vitest";

import { arcosEnLado, ordenada, puntaDeFlecha, trazoDeNube } from "./marcas-geometria.js";

describe("ordenada", () => {
  it("pone las esquinas en orden sea cual sea el sentido del arrastre", () => {
    expect(ordenada({ x1: 80, y1: 60, x2: 10, y2: 20 })).toEqual({
      x1: 10,
      y1: 20,
      x2: 80,
      y2: 60,
    });
  });
});

describe("arcosEnLado", () => {
  it("cabe un arco por cada dos radios, y nunca menos de dos", () => {
    expect(arcosEnLado(100, 5)).toBe(10);
    expect(arcosEnLado(3, 5)).toBe(2);
  });
});

describe("trazoDeNube", () => {
  const caja = { x1: 0, y1: 0, x2: 100, y2: 50 };
  const trazo = trazoDeNube(caja, 5);

  it("arranca en la esquina, cierra, y tiene un arco por cada tramo", () => {
    expect(trazo.startsWith("M 0 0")).toBe(true);
    expect(trazo.endsWith("Z")).toBe(true);
    // 100 → 10 arcos, 50 → 5 arcos: dos lados de cada: 2·10 + 2·5 = 30.
    expect(trazo.match(/ A /g)).toHaveLength(30);
  });

  it("todos los arcos abultan hacia fuera: sweep 1 y semicírculo", () => {
    const arcos = [...trazo.matchAll(/A ([\d.]+) ([\d.]+) 0 0 (\d) /g)];
    expect(arcos.every((a) => a[3] === "1")).toBe(true);
    // El primer lado: 100/10/2 = 5 de radio.
    expect(Number(arcos[0]![1])).toBeCloseTo(5);
  });

  it("termina el recorrido donde empezó", () => {
    const ultimo = [...trazo.matchAll(/ A [\d.]+ [\d.]+ 0 0 1 ([\d.-]+) ([\d.-]+)/g)].at(-1)!;
    expect([Number(ultimo[1]), Number(ultimo[2])]).toEqual([0, 0]);
  });

  it("da lo mismo arrastrar de una esquina a otra que a la inversa", () => {
    expect(trazoDeNube({ x1: 100, y1: 50, x2: 0, y2: 0 }, 5)).toBe(trazo);
  });
});

describe("puntaDeFlecha", () => {
  it("la punta está en el destino y las alas, detrás y a ambos lados", () => {
    // Hacia la derecha: las alas quedan a la izquierda de la punta, una arriba y otra abajo.
    const [punta, a, b] = puntaDeFlecha(0, 0, 100, 0, 10);
    expect(punta).toEqual([100, 0]);
    expect(a![0]).toBeLessThan(100);
    expect(b![0]).toBeCloseTo(a![0]);
    expect(a![1]).toBeCloseTo(-b![1]);
    // Largo de cada ala: el pedido.
    expect(Math.hypot(100 - a![0], 0 - a![1])).toBeCloseTo(10);
  });

  it("sin recorrido no hay flecha", () => {
    expect(puntaDeFlecha(5, 5, 5, 5, 10)).toEqual([]);
  });
});
