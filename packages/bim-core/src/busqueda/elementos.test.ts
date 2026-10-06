import { describe, expect, it } from "vitest";

import {
  buscarElementos,
  normalizarParaBuscar,
  puntajeDeElemento,
  terminosDe,
  type ElementoBuscable,
} from "./elementos.js";

const el = (nombre: string | null, categoria = "IFCWALL", guid: string | null = null) => ({
  nombre,
  categoria,
  guid,
});

describe("normalizarParaBuscar", () => {
  it("quita mayúsculas, acentos y espacios de más", () => {
    expect(normalizarParaBuscar("  Pilár   CENTRAL ")).toBe("pilar central");
    expect(normalizarParaBuscar("Ñandú")).toBe("nandu");
  });
});

describe("terminosDe", () => {
  it("parte la consulta y ignora lo vacío", () => {
    expect(terminosDe("  viga   eje C ")).toEqual(["viga", "eje", "c"]);
    expect(terminosDe("   ")).toEqual([]);
  });
});

describe("puntajeDeElemento", () => {
  it("sin términos no coincide nada", () => {
    expect(puntajeDeElemento([], el("Muro"))).toBe(0);
  });

  it("todos los términos tienen que aparecer", () => {
    const viga = el("Viga eje C", "IFCBEAM");
    expect(puntajeDeElemento(["viga", "eje"], viga)).toBeGreaterThan(0);
    expect(puntajeDeElemento(["viga", "losa"], viga)).toBe(0);
  });

  it("el nombre que empieza por lo escrito pesa más que el que lo contiene, y este más que la clase", () => {
    const empieza = puntajeDeElemento(["muro"], el("Muro exterior"));
    const contiene = puntajeDeElemento(["muro"], el("Panel de muro"));
    const clase = puntajeDeElemento(["wall"], el("Sin nombre útil", "IFCWALL"));
    expect(empieza).toBeGreaterThan(contiene);
    expect(contiene).toBeGreaterThan(clase);
    expect(clase).toBeGreaterThan(0);
  });

  it("el GUID exacto es lo más claro, y un trozo corto de GUID no vale", () => {
    const guid = "2sOaC0lzL6JhvIR8y_YCPM";
    const e = el("Viga", "IFCBEAM", guid);
    expect(puntajeDeElemento([guid.toLowerCase()], e)).toBeGreaterThanOrEqual(100);
    expect(puntajeDeElemento(["2soac0"], e)).toBeGreaterThan(0); // seis o más
    expect(puntajeDeElemento(["2so"], el("Otro", "IFCSLAB", guid))).toBe(0); // tres letras sueltas
  });

  it("un elemento sin nombre se encuentra por su clase y no revienta", () => {
    expect(puntajeDeElemento(["beam"], el(null, "IFCBEAM"))).toBeGreaterThan(0);
    expect(puntajeDeElemento(["muro"], el(null, "IFCBEAM"))).toBe(0);
  });

  it("no distingue acentos ni mayúsculas", () => {
    expect(
      puntajeDeElemento(terminosDe("PILAR"), el("Pilár central", "IFCCOLUMN")),
    ).toBeGreaterThan(0);
  });
});

describe("buscarElementos", () => {
  const lista: ElementoBuscable[] = [
    el("Panel de muro"),
    el("Muro exterior"),
    el("Muro interior"),
    el("Losa", "IFCSLAB"),
  ];

  it("ordena de más a menos claro y, a igual puntaje, por nombre", () => {
    const { resultados } = buscarElementos("muro", lista);
    expect(resultados.map((r) => r.nombre)).toEqual([
      "Muro exterior",
      "Muro interior",
      "Panel de muro",
    ]);
  });

  it("corta en el máximo pero dice cuántos eran", () => {
    const { resultados, total } = buscarElementos("muro", lista, 2);
    expect(resultados).toHaveLength(2);
    expect(total).toBe(3);
  });

  it("una consulta vacía no devuelve todo el modelo", () => {
    expect(buscarElementos("  ", lista)).toEqual({ resultados: [], total: 0 });
  });
});
