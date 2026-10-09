import type { GeneratedDrawing } from "@aerobim/viewer";
import { describe, expect, it } from "vitest";

import {
  LIMITE_DE_ELEMENTOS_DEL_AVISO,
  avisoDeEntrada,
  describirEntrada,
  fichaDeLamina,
  nombrePorDefecto,
  textoDeEscala,
} from "./generar-plano.js";

describe("describirEntrada", () => {
  it("cuenta elementos y modelos con su plural", () => {
    expect(describirEntrada({ elementos: 412, modelos: 2 })).toBe("412 elementos de 2 modelos");
    expect(describirEntrada({ elementos: 1, modelos: 1 })).toBe("1 elemento de 1 modelo");
  });
  it("dice que no hay ninguno", () => {
    expect(describirEntrada({ elementos: 0, modelos: 0 })).toBe("Ningún elemento");
  });
});

describe("avisoDeEntrada", () => {
  it("avisa cuando no hay nada", () => {
    expect(avisoDeEntrada({ elementos: 0, modelos: 0 }, "visible")?.nivel).toBe("vacio");
    expect(avisoDeEntrada({ elementos: 0, modelos: 0 }, "seleccion")?.texto).toMatch(
      /seleccionado/,
    );
  });
  it("avisa por encima del límite y no en el límite", () => {
    expect(
      avisoDeEntrada({ elementos: LIMITE_DE_ELEMENTOS_DEL_AVISO + 1, modelos: 1 }, "visible")
        ?.nivel,
    ).toBe("mucho");
    expect(
      avisoDeEntrada({ elementos: LIMITE_DE_ELEMENTOS_DEL_AVISO, modelos: 1 }, "visible"),
    ).toBeNull();
  });
});

describe("nombrePorDefecto", () => {
  it("compone vista, referencia y cantidad", () => {
    expect(nombrePorDefecto("plan", "Piso 5.ifc", { elementos: 3, modelos: 1 })).toBe(
      "Planta · Piso 5 · 3 elementos",
    );
  });
  it("omite lo que falta", () => {
    expect(nombrePorDefecto("front", null, { elementos: 1, modelos: 1 })).toBe(
      "Frontal · 1 elemento",
    );
    expect(nombrePorDefecto("side", "", { elementos: 0, modelos: 0 })).toBe("Lateral");
  });
});

describe("fichaDeLamina", () => {
  const base: GeneratedDrawing = {
    id: "a",
    name: "Planta",
    view: "plan",
    segments: 3210,
    hiddenSegments: 1120,
    sizeM: [24.04, 12],
    elapsedMs: 2300,
  };
  it("no inventa lo que la lámina no trae", () => {
    const [queEs, cuanto] = fichaDeLamina(base);
    expect(queEs).toBe("Planta");
    expect(cuanto).toContain("24.0 × 12.0 m");
    expect(cuanto).toContain("2.3 s");
  });
  it("suma entrada y escala cuando están", () => {
    const [queEs] = fichaDeLamina({
      ...base,
      entrada: { elementos: 412, modelos: 2 },
      escalaA3: 200,
    });
    expect(queEs).toBe("Planta · 412 elementos de 2 modelos · 1:200 en A3");
    expect(textoDeEscala(50)).toBe("1:50 en A3");
  });
});
