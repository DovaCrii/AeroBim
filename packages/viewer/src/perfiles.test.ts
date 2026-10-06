/**
 * El PK escrito, y la tabla que acompaña a un perfil.
 *
 * Con la misma L de 3 + 4 m que las pruebas del dominio: el PK final es 7, y el codo está en el 3.
 */
import { describe, expect, it } from "vitest";

import type { EjeDePerfil } from "@aerobim/bim-core";
import {
  MAXIMO_FILAS_DE_REFERENCIAS,
  tablaDePk,
  textoDePk,
  vistaDeFrenteDeLaLamina,
} from "./perfiles.js";

const L: EjeDePerfil = {
  sistema: "escena",
  verticesM: [
    [0, 0],
    [3, 0],
    [3, 4],
  ],
};

describe("textoDePk con decimales", () => {
  it("sin decimales escribe metros enteros, y con uno, uno", () => {
    expect(textoDePk(0, 0)).toBe("0+000");
    expect(textoDePk(1240, 0)).toBe("1+240");
    expect(textoDePk(12.5, 1)).toBe("0+012.5");
  });

  it("redondea antes de partir en kilómetros, también sin decimales", () => {
    expect(textoDePk(999.6, 0)).toBe("1+000");
  });

  it("con dos decimales sigue igual que siempre", () => {
    expect(textoDePk(1234.5)).toBe("1+234.50");
  });
});

describe("rótulos sueltos en una tabla", () => {
  it("salen en su sitio, sin rejilla y sin recalcular", async () => {
    const { trazarTabla } = await import("./cuadro-en-plano.js");
    const trazo = trazarTabla(
      {
        title: null,
        headers: [],
        rows: [],
        rotulos: [
          { text: "0+010", x: 1, z: 2, height: 0.3 },
          { text: "102", x: -1, z: -3, height: 0.3 },
        ],
      },
      { x: 0, z: 0, rowHeight: 1, charWidth: 1 },
    );
    expect(trazo.lines).toEqual([]);
    expect(trazo.texts.map((t) => [t.text, t.x, t.z, t.height])).toEqual([
      ["0+010", 1, 2, 0.3],
      ["102", -1, -3, 0.3],
    ]);
  });
});

describe("textoDePk", () => {
  it("escribe kilómetros, un más, y metros con dos decimales", () => {
    expect(textoDePk(0)).toBe("0+000.00");
    expect(textoDePk(7)).toBe("0+007.00");
    expect(textoDePk(1234.5)).toBe("1+234.50");
    expect(textoDePk(12_000)).toBe("12+000.00");
  });

  it("redondea a centímetros antes de partir en kilómetros", () => {
    // Partiendo primero, 999,996 salía como «0+1000.00».
    expect(textoDePk(999.996)).toBe("1+000.00");
    expect(textoDePk(1999.999)).toBe("2+000.00");
  });
});

describe("tablaDePk", () => {
  it("lleva los vértices del trazado con su PK", () => {
    const tabla = tablaDePk(L, [], [0, 0, 0]);

    expect(tabla.headers).toEqual(["PK", "Punto", "Este (m)", "Norte (m)"]);
    expect(tabla.rows.map((fila) => fila.slice(0, 2))).toEqual([
      ["0+000.00", "Inicio"],
      ["0+003.00", "Vértice 1"],
      ["0+007.00", "Fin"],
    ]);
  });

  it("pasa las coordenadas de la escena a las del IFC: Este es x, Norte es −z", () => {
    const tabla = tablaDePk(L, [], [0, 0, 0]);

    // El fin está en (x=3, z=4) de la escena, que en el IFC es Este 3, Norte −4.
    expect(tabla.rows[2]!.slice(2)).toEqual(["3.00", "-4.00"]);
  });

  it("suma el origen que Fragments quitó al recentrar", () => {
    // Un modelo cuyo origen real está en Este 349 723, Norte 6 292 883: en ejes de la escena el
    // desplazamiento es (349 723, cota, −6 292 883). Sin sumarlo, las coordenadas no coincidirían
    // con nada que se mida en otra herramienta.
    const tabla = tablaDePk(L, [], [349_723, 0, -6_292_883]);

    expect(tabla.rows[0]!.slice(2)).toEqual(["349723.00", "6292883.00"]);
  });

  it("mezcla las transversales con los vértices, por PK", () => {
    const tabla = tablaDePk(L, [2, 5], [0, 0, 0]);

    expect(tabla.rows.map((fila) => fila.slice(0, 2))).toEqual([
      ["0+000.00", "Inicio"],
      ["0+002.00", "Transversal"],
      ["0+003.00", "Vértice 1"],
      ["0+005.00", "Transversal"],
      ["0+007.00", "Fin"],
    ]);
  });

  it("deja fuera una estación que cae fuera del eje", () => {
    expect(tablaDePk(L, [99], [0, 0, 0]).rows).toHaveLength(3);
  });

  it("no pasa del máximo de filas, y dice cuántas quedaron fuera", () => {
    const muchas = Array.from({ length: 100 }, (_, i) => i * 0.05);
    const tabla = tablaDePk(L, muchas, [0, 0, 0]);

    expect(tabla.rows).toHaveLength(MAXIMO_FILAS_DE_REFERENCIAS + 1);
    expect(tabla.rows[tabla.rows.length - 1]![0]).toBe("…");
    expect(tabla.rows[tabla.rows.length - 1]![1]).toBe("63 más");
  });
});

describe("desde dónde se mira una lámina para verla de frente", () => {
  it("la planta, desde arriba: está tumbada", () => {
    expect(vistaDeFrenteDeLaLamina("plan")).toBe("top");
  });

  it("el perfil y el alzado frontal, de frente: están de pie, y desde arriba se verían de canto", () => {
    // El defecto que lo destapó: al abrir un perfil en el visor 2D salía **una sola línea**, porque la
    // cámara lo miraba siempre desde arriba.
    expect(vistaDeFrenteDeLaLamina("profile")).toBe("front");
    expect(vistaDeFrenteDeLaLamina("front")).toBe("front");
  });

  it("el alzado lateral, de costado", () => {
    expect(vistaDeFrenteDeLaLamina("side")).toBe("side");
  });
});
