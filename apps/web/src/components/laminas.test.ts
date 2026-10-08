import { describe, expect, it } from "vitest";

import {
  agruparLaminas,
  claseDeLamina,
  etiquetaDePosicion,
  laminaVecina,
  porClase,
  tituloDeGrupo,
} from "./laminas.js";

const l = (id: string, name: string, grupoId?: string) => ({ id, name, grupoId });

describe("agruparLaminas", () => {
  it("junta las del mismo perfil en un grupo y deja sueltas las demás, en orden", () => {
    const entradas = agruparLaminas([
      l("a", "Planta"),
      l("p1", "Perfil longitudinal", "g1"),
      l("p2", "Transversal PK 0+000.10", "g1"),
      l("b", "Frontal"),
      l("q1", "Perfil longitudinal", "g2"),
    ]);
    expect(entradas.map((e) => e.tipo)).toEqual(["suelta", "grupo", "suelta", "grupo"]);
    const g1 = entradas[1];
    expect(g1?.tipo === "grupo" && g1.laminas.map((x) => x.id)).toEqual(["p1", "p2"]);
  });

  it("no agrupa láminas sin grupoId", () => {
    expect(agruparLaminas([l("a", "x"), l("b", "y")]).every((e) => e.tipo === "suelta")).toBe(true);
  });
});

describe("tituloDeGrupo y etiquetaDePosicion", () => {
  it("rotula con plural y singular", () => {
    expect(tituloDeGrupo("Perfil", 193)).toBe("Perfil — 193 láminas");
    expect(tituloDeGrupo("Perfil", 1)).toBe("Perfil — 1 lámina");
  });
  it("rotula desde 1 y calla fuera de rango", () => {
    expect(etiquetaDePosicion(11, 193)).toBe("12 de 193");
    expect(etiquetaDePosicion(-1, 193)).toBe("");
    expect(etiquetaDePosicion(193, 193)).toBe("");
  });
});

describe("laminaVecina", () => {
  const ids = ["a", "b", "c"];
  it("avanza y retrocede", () => {
    expect(laminaVecina(ids, "a", 1, false)).toBe("b");
    expect(laminaVecina(ids, "c", -1, false)).toBe("b");
  });
  it("con tope se queda en el extremo", () => {
    expect(laminaVecina(ids, "c", 1, false)).toBe("c");
    expect(laminaVecina(ids, "a", -1, false)).toBe("a");
  });
  it("circular da la vuelta", () => {
    expect(laminaVecina(ids, "c", 1, true)).toBe("a");
    expect(laminaVecina(ids, "a", -1, true)).toBe("c");
  });
  it("devuelve null si la lámina no está o no hay ninguna", () => {
    expect(laminaVecina(ids, "z", 1, true)).toBeNull();
    expect(laminaVecina([], "a", 1, true)).toBeNull();
  });
});

describe("clases del desplegable", () => {
  it("clasifica por nombre y omite clases vacías", () => {
    expect(claseDeLamina("Perfil longitudinal")).toBe("longitudinal");
    expect(claseDeLamina("Transversal PK 0+000.40")).toBe("transversal");
    expect(claseDeLamina("Planta")).toBe("otra");
    const grupos = porClase([
      { nombre: "Transversal PK 0+001" },
      { nombre: "Perfil longitudinal" },
    ]);
    expect(grupos.map((g) => g.clase)).toEqual(["longitudinal", "transversal"]);
  });
});
