import { describe, expect, it } from "vitest";
import {
  capasParaPanel,
  fichaDeLamina,
  orientacionDeVista,
  textoDeTamano,
} from "./ficha-de-lamina.js";

describe("capasParaPanel", () => {
  it("ordena las capas conocidas y deja las desconocidas al final con su nombre", () => {
    const filas = capasParaPanel([
      { name: "AB-REGLA", visible: true, segments: 10 },
      { name: "XYZ", visible: false, segments: 3 },
      { name: "AB-OCULTA", visible: false, segments: 5 },
      { name: "AB-VISIBLE", visible: true, segments: 100 },
    ]);
    expect(filas.map((f) => f.name)).toEqual(["AB-VISIBLE", "AB-OCULTA", "AB-REGLA", "XYZ"]);
    expect(filas[1]?.titulo).toBe("Aristas ocultas");
    expect(filas[3]?.titulo).toBe("XYZ");
    expect(filas[3]?.visible).toBe(false);
  });

  it("no pierde ni inventa capas", () => {
    expect(capasParaPanel([])).toEqual([]);
  });
});

describe("fichaDeLamina", () => {
  const base = {
    nombre: "Alzado lateral",
    anchoM: 28,
    altoM: 3.5,
    segmentos: 2526,
    segmentosOcultos: 400,
    generadoMs: 840,
  };

  it("lleva lo esencial y omite lo que no aplica", () => {
    const filas = fichaDeLamina(base);
    const etiquetas = filas.map((f) => f.etiqueta);
    expect(etiquetas).toEqual([
      "Vista",
      "Tamaño",
      "Hoja sugerida",
      "Trazos",
      "Aristas ocultas",
      "Generada en",
    ]);
    expect(filas.find((f) => f.etiqueta === "Tamaño")?.valor).toBe("28,0 × 3,5 m");
    expect(filas.find((f) => f.etiqueta === "Generada en")?.valor).toBe("840 ms");
    expect(filas.find((f) => f.etiqueta === "Hoja sugerida")?.valor).toBe("A4 a 1:200");
  });

  it("añade lo que cruza y los puntos de nube cuando los hay, y los segundos a partir de 1000 ms", () => {
    const filas = fichaDeLamina({ ...base, cruces: 12, puntosDeNube: 5000, generadoMs: 2350 });
    expect(filas.find((f) => f.etiqueta === "Elementos que cruza")?.valor).toBe("12");
    expect(filas.some((f) => f.etiqueta === "Puntos de nube")).toBe(true);
    expect(filas.find((f) => f.etiqueta === "Generada en")?.valor).toBe("2,4 s");
  });

  it("dice que no cabe cuando ninguna hoja alcanza", () => {
    const filas = fichaDeLamina({ ...base, anchoM: 1e7, altoM: 1e7 });
    expect(filas.find((f) => f.etiqueta === "Hoja sugerida")?.valor).toBe("No cabe en una A0");
  });
});

describe("orientacionDeVista", () => {
  it("refiere cada alzado a la planta, no a puntos cardinales", () => {
    expect(orientacionDeVista("plan")?.desde).toBe("Arriba");
    expect(orientacionDeVista("front")?.desde).toContain("inferior de la planta");
    expect(orientacionDeVista("side")?.desde).toContain("derecho de la planta");
    expect(orientacionDeVista("side")?.lectura).toContain("Frente de la planta a la izquierda");
    expect(orientacionDeVista("profile")).toBeNull();
  });

  it("entra en la ficha solo para las vistas que la tienen", () => {
    const base = {
      nombre: "Alzado lateral",
      anchoM: 22.7,
      altoM: 3,
      segmentos: 1,
      segmentosOcultos: 0,
      generadoMs: 1,
    };
    const etiquetas = (vista?: "side" | "profile") =>
      fichaDeLamina({ ...base, vista }).map((f) => f.etiqueta);
    expect(etiquetas("side")).toContain("Se mira desde");
    expect(etiquetas("side")).toContain("Se lee");
    expect(etiquetas("profile")).not.toContain("Se mira desde");
    expect(etiquetas()).not.toContain("Se mira desde");
  });
});

describe("textoDeTamano", () => {
  it("usa coma decimal", () => {
    expect(textoDeTamano(36.24, 69)).toBe("36,2 × 69,0 m");
  });
});
