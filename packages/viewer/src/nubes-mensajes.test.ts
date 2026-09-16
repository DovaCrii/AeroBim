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

import { comoSeCuenta } from "./nubes.js";

describe("el mensaje de una nube que no es COPC", () => {
  it("dice qué archivo era", () => {
    const traducido = comoSeCuenta(
      new Error("COPC info VLR is required"),
      "blob:https://p340/levantamiento-muro.laz",
    );

    expect(traducido.message).toContain("levantamiento-muro.laz");
  });

  it("dice qué hacer, y no solo qué falta", () => {
    const traducido = comoSeCuenta(new Error("COPC info VLR is required"), "x.laz");

    // Lo accionable: que hay que convertirlo, y dónde está escrito cómo.
    expect(traducido.message).toContain("Conviértelo");
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
