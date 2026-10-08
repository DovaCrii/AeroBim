import { describe, expect, it } from "vitest";

import { modoDelVisor } from "./IndicadorDeModo.js";

const base = {
  espacio: "modelo",
  modo2D: false,
  laminaAbierta: false,
  comparando: false,
  enPlanta: false,
  hayModelo: true,
} as const;

describe("modoDelVisor", () => {
  it("el espacio Modelo 3D con un modelo dice 3D", () => {
    expect(modoDelVisor(base).dimension).toBe("3D");
  });

  it("una lámina abierta es 2D, aunque el espacio sea el del modelo", () => {
    expect(modoDelVisor({ ...base, laminaAbierta: true }).dimension).toBe("2D");
  });

  it("el Modo 2D es 2D", () => {
    expect(modoDelVisor({ ...base, modo2D: true })).toMatchObject({ dimension: "2D" });
  });

  it("comparar es 2D sobre el modelo", () => {
    expect(modoDelVisor({ ...base, comparando: true }).titulo).toBe("Plano y modelo");
  });

  it("Planos y perfiles mostrando el modelo dice que es 3D y cómo pasar a 2D", () => {
    const modo = modoDelVisor({ ...base, espacio: "planos" });
    expect(modo.dimension).toBe("3D");
    expect(modo.ayuda).toContain("2D");
  });

  it("el espacio de planos con solo un modelo se mira en planta y dice 2D", () => {
    const modo = modoDelVisor({ ...base, espacio: "planos", enPlanta: true });
    expect(modo.dimension).toBe("2D");
    expect(modo.titulo).toBe("Planta del modelo");
  });

  it("sin nada abierto no promete seleccionar: pide abrir algo, en los dos espacios", () => {
    for (const espacio of ["modelo", "planos"] as const) {
      const modo = modoDelVisor({ ...base, espacio, hayModelo: false });
      expect(modo.titulo).toBe("Nada abierto");
      expect(modo.ayuda).toContain("Abre");
    }
  });
});
