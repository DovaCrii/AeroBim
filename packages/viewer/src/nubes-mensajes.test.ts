/**
 * **Un LAZ que no es COPC tiene que decirlo en el idioma de quien lo abre.**
 *
 * ## Lo que se veía
 *
 * Arriba en la cinta, en rojo:
 *
 *     COPC info VLR is required
 *
 * Es exacto, es de la biblioteca, está en inglés y nombra una estructura interna del formato. Quien
 * acaba de arrastrar el levantamiento que le pasó el topógrafo no tiene forma de saber qué hacer.
 *
 * ## Y no es un fallo
 *
 * Ni de AeroBim ni del archivo. Un LAZ normal es correcto: simplemente **no lleva el octree
 * dentro**, así que no se puede pedir por partes — habría que descargar los 130 MB enteros para ver
 * el primer punto. Por eso el visor lee COPC, y por eso la conversión existe y está documentada.
 *
 * Lo único que faltaba era **decirlo**: qué pasa, por qué, y qué hacer. Un mensaje que no se
 * entiende convierte una limitación conocida en un fallo aparente del producto.
 *
 * ## Por qué se mide la cadena y no una nube de verdad
 *
 * Porque abrir un COPC pide WASM, `fetch` por rangos y un archivo de decenas de megas: eso se
 * comprueba en el diagnóstico del visor, con nubes reales. Lo que se puede romper sin que nadie se
 * entere es **el texto**, y es lo que esto sujeta.
 */

import { describe, expect, it } from "vitest";

import { comoSeCuenta, lectorPorRango } from "./nubes.js";

describe("el mensaje de una nube que no es COPC", () => {
  it("dice qué archivo era, aunque la URL sea un blob", () => {
    // **Así es una URL `blob:` de verdad**: termina en un UUID. Esta prueba usaba
    // `blob:https://p340/levantamiento-muro.laz`, que no existe, y por eso pasaba con el defecto
    // puesto — en `p340` el aviso decía «0d9c7dac-2200-… es un LAZ normal».
    const traducido = comoSeCuenta(
      new Error("COPC info VLR is required"),
      "blob:https://p340.tailccd107.ts.net:10000/0d9c7dac-2200-4bc9-bfa0-4386ff706008",
      "levantamiento-muro.laz",
    );

    expect(traducido.message).toContain("«levantamiento-muro.laz»");
    expect(traducido.message).not.toContain("0d9c7dac");
  });

  it("sin nombre, no enseña el tramo vacío de una URL que acaba en barra", () => {
    const traducido = comoSeCuenta(
      new Error("COPC info VLR is required"),
      "/api/revisiones/abc/contenido/",
    );

    expect(traducido.message).not.toContain("«»");
  });

  it("dice qué hacer, y no solo qué falta", () => {
    const traducido = comoSeCuenta(new Error("COPC info VLR is required"), "x.laz");

    // Lo accionable: que hay que convertirlo, **con qué**, y dónde está escrito el resto.
    expect(traducido.message).toContain("Conviértelo");
    expect(traducido.message).toContain("QGIS");
    expect(traducido.message).toContain("pdal translate");
    expect(traducido.message).toContain("NUBES_DE_PUNTOS.md");
    // Y ni una palabra del error original, que es lo que no se entiende.
    expect(traducido.message).not.toContain("VLR");
  });

  it("dice por qué, para que no parezca un capricho", () => {
    const traducido = comoSeCuenta(new Error("COPC info VLR is required"), "x.laz");

    expect(traducido.message).toContain("índice");
  });

  it("no toca los errores que no son este", () => {
    // **La otra mitad.** Una traducción que se traga cualquier error escondería el siguiente
    // fallo de verdad detrás de un consejo sobre COPC — que es peor que el mensaje crudo.
    const otro = new Error("no se pudo leer la nube (404): /x.copc.laz");

    expect(comoSeCuenta(otro, "/x.copc.laz")).toBe(otro);
  });
});

describe("un servidor que ignora los tramos", () => {
  /**
   * **La otra causa del mismo síntoma.** Si el proxy ignora `Range`, cada lectura trae el archivo
   * desde el byte cero y un COPC perfecto se lee como «LAZ normal». Distinguirlo es lo que evita
   * mandar a convertir un archivo que está bien.
   */
  function servidor(status: number, cuerpo: Uint8Array) {
    return async () => new Response(cuerpo, { status });
  }

  it("un 200 lejos del principio es un fallo de la instalación, no del archivo", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = servidor(200, new Uint8Array(1000)) as typeof fetch;
    try {
      await expect(lectorPorRango("/x.copc.laz")(500, 600)).rejects.toThrow(/por tramos/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("un 200 al pedir el principio se corta a lo pedido", async () => {
    const original = globalThis.fetch;
    const entero = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
    globalThis.fetch = servidor(200, entero) as typeof fetch;
    try {
      const leido = await lectorPorRango("/x.copc.laz")(0, 10);
      expect([...leido]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("un 206 se devuelve tal cual", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = servidor(206, new Uint8Array([7, 8, 9])) as typeof fetch;
    try {
      expect([...(await lectorPorRango("/x.copc.laz")(500, 503))]).toEqual([7, 8, 9]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
