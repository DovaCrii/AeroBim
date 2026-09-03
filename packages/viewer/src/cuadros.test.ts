import { describe, expect, it } from "vitest";

import {
  csvDe,
  encabezadoDeColumna,
  MAXIMO_COLUMNAS,
  MAXIMO_FILAS,
  type Schedule,
  type ScheduleColumn,
  type ScheduleRow,
} from "./cuadros.js";

/**
 * **El CSV se rompe en silencio**, y por eso estaba pidiendo esta prueba.
 *
 * Si el separador deja de ser `;`, o desaparece la marca de orden de bytes, o una comilla se escapa
 * mal, el archivo **se abre igual**: Excel enseña una columna con todo dentro, o los acentos
 * convertidos en garabatos. Nadie ve un error; ve un cuadro mal. Y quien lo recibe piensa que el
 * modelo está mal, no el CSV.
 *
 * Las tres convenciones —`;`, BOM y `CRLF`— son las que hacen que un Excel en español lo abra bien
 * de doble clic, y son las mismas del resto del producto.
 */

function columna(parcial: Partial<ScheduleColumn> = {}): ScheduleColumn {
  return { key: "k", group: null, name: "Columna", unit: null, filled: 1, ...parcial };
}

function fila(parcial: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    localId: 1,
    guid: "0GUID00000000000000000",
    name: "Elemento",
    values: new Map(),
    ...parcial,
  };
}

function cuadro(columnas: ScheduleColumn[], filas: ScheduleRow[]): Schedule {
  return {
    modelId: "m",
    category: "IFCWALL",
    columns: columnas,
    rows: filas,
    total: filas.length,
    truncated: false,
    hiddenColumns: 0,
    elapsedMs: 0,
  };
}

describe("csvDe — las tres convenciones que hacen que Excel lo abra bien", () => {
  const simple = cuadro(
    [columna({ key: "a", name: "Ancho" })],
    [fila({ values: new Map([["a", "200"]]) })],
  );

  it("empieza por la marca de orden de bytes", () => {
    // Sin ella, un Excel en español lee el archivo como ANSI y los acentos salen como garabatos.
    // No falla: **abre mal**, que es peor.
    expect(csvDe(simple).charCodeAt(0)).toBe(0xfeff);
  });

  it("separa por punto y coma, no por coma", () => {
    // Con coma, un Excel en español mete la fila entera en una celda. Es la convención de todo el
    // producto, no una preferencia de este archivo.
    const texto = csvDe(simple);
    expect(texto).toContain("GUID;Nombre;Ancho");
    expect(texto.split("\r\n")[0]).not.toContain(",");
  });

  it("termina las lineas con CRLF, y el archivo con una linea completa", () => {
    const texto = csvDe(simple);
    expect(texto.endsWith("\r\n")).toBe(true);
    expect(texto.split("\r\n").filter((l) => l !== "")).toHaveLength(2); // cabecera + una fila
  });
});

describe("csvDe — lo que rompe una fila si no se escapa", () => {
  it("un punto y coma dentro de un nombre no parte la fila", () => {
    // **Aparece de verdad**: un nombre de tipo con un `;` es corriente en modelos de estructura.
    const texto = csvDe(
      cuadro([columna({ key: "a", name: "Ancho" })], [fila({ name: "Viga; tipo A" })]),
    );
    const filas = texto.split("\r\n").filter((l) => l !== "");
    expect(filas).toHaveLength(2);
    expect(filas[1]).toContain('"Viga; tipo A"');
  });

  it("una comilla se dobla, que es como se escapa en CSV", () => {
    const texto = csvDe(cuadro([columna()], [fila({ name: 'Perfil 2" x 4"' })]));
    expect(texto).toContain('"Perfil 2"" x 4"""');
  });

  it("un salto de linea dentro de un valor no crea una fila nueva", () => {
    const texto = csvDe(
      cuadro([columna({ key: "a" })], [fila({ values: new Map([["a", "dos\nlineas"]]) })]),
    );
    // Dos filas de datos serían dos elementos donde hay uno: el recuento del cuadro dejaría de
    // cuadrar con el del modelo.
    const comillas = (texto.match(/"/g) ?? []).length;
    expect(comillas).toBeGreaterThan(0);
    expect(texto).toContain("dos\nlineas");
  });

  it("un valor vacio o ausente sale vacio, no como 'undefined'", () => {
    const texto = csvDe(
      cuadro([columna({ key: "a" }), columna({ key: "b" })], [fila({ values: new Map() })]),
    );
    const ultima = texto.split("\r\n").filter((l) => l !== "")[1] ?? "";
    expect(ultima).not.toContain("undefined");
    expect(ultima).not.toContain("null");
  });

  it("una fila sin GUID ni nombre sale con las celdas vacias y no se cae", () => {
    const texto = csvDe(cuadro([columna()], [fila({ guid: null, name: null })]));
    const ultima = texto.split("\r\n").filter((l) => l !== "")[1] ?? "";
    expect(ultima.startsWith(";")).toBe(true);
  });
});

describe("csvDe — la forma del cuadro", () => {
  it("la cabecera lleva GUID y Nombre delante de las columnas", () => {
    // El GUID va **primero y siempre**: es la identidad estable, y sin él una fila del CSV no se
    // puede volver a atar a su elemento.
    const texto = csvDe(cuadro([columna({ name: "Ancho" }), columna({ name: "Alto" })], []));
    expect(texto.replace("﻿", "").split("\r\n")[0]).toBe("GUID;Nombre;Ancho;Alto");
  });

  it("un cuadro sin filas trae solo la cabecera", () => {
    const texto = csvDe(cuadro([columna()], []));
    expect(texto.split("\r\n").filter((l) => l !== "")).toHaveLength(1);
  });

  it("cada fila tiene tantas celdas como la cabecera", () => {
    // Una fila corta desplaza todas las columnas siguientes, y el cuadro sale con los valores
    // cambiados de sitio sin que nada falle.
    const c = cuadro(
      [columna({ key: "a" }), columna({ key: "b" }), columna({ key: "c" })],
      [fila({ values: new Map([["b", "2"]]) }), fila({ values: new Map() })],
    );
    const lineas = csvDe(c)
      .replace("﻿", "")
      .split("\r\n")
      .filter((l) => l !== "");
    const celdas = lineas.map((l) => l.split(";").length);
    expect(new Set(celdas).size).toBe(1);
    expect(celdas[0]).toBe(5); // GUID + Nombre + tres columnas
  });
});

describe("encabezadoDeColumna", () => {
  it("sin grupo ni unidad, es el nombre a secas", () => {
    expect(encabezadoDeColumna(columna({ name: "Ancho" }))).toBe("Ancho");
  });

  it("con unidad, la unidad va entre parentesis", () => {
    // Es lo que impide leer «Ancho 200» y no saber si son milímetros o metros.
    expect(encabezadoDeColumna(columna({ name: "Ancho", unit: "mm" }))).toBe("Ancho (mm)");
  });

  it("con grupo, el grupo va delante", () => {
    const h = encabezadoDeColumna(columna({ group: "Pset_WallCommon", name: "Ancho" }));
    expect(h).toContain("Pset_WallCommon");
    expect(h).toContain("Ancho");
  });

  it("con grupo y unidad, salen los dos", () => {
    const h = encabezadoDeColumna(columna({ group: "Pset_WallCommon", name: "Ancho", unit: "mm" }));
    expect(h).toContain("Pset_WallCommon");
    expect(h.endsWith("(mm)")).toBe(true);
  });
});

describe("los topes", () => {
  it("estan donde dice la documentacion", () => {
    // Se fijan aquí para que cambiarlos sea una decisión y no un descuido: son lo que impide que
    // un cuadro de un modelo grande cuelgue la pestaña.
    expect(MAXIMO_FILAS).toBe(300);
    expect(MAXIMO_COLUMNAS).toBe(24);
  });
});
