/**
 * **Un DWG no puede tumbar el visor, y tumbarlo sin decir por qué.**
 *
 * ## Lo que se veía
 *
 * Arriba en la cinta, en rojo, con cero modelos cargados:
 *
 *     memory access out of bounds
 *
 * Es un error de WebAssembly. No nombra el archivo, no dice que sea un DWG, no dice qué hacer, y
 * **parece que el visor está roto** cuando lo que pasa es que se le pidió algo que está decidido y
 * documentado que no hace.
 *
 * ## De dónde salía
 *
 * De la última línea del repartidor de `App.tsx`, y de su propio comentario:
 *
 *     return openIfc(file);          // ← todo lo demás
 *
 * «Todo lo demás» incluye el DWG. `web-ifc` espera texto STEP, recibe binario, y el WASM se cae. El
 * `accept` del selector no lo evita: filtra el diálogo, no el arrastre.
 *
 * ## Por qué se prueba la decisión y no el visor
 *
 * Porque el visor entero pide WASM, WebGL y un archivo de verdad — eso se comprueba en el navegador.
 * Lo que se puede romper sin que nadie se entere es **la decisión y su texto**, y son puras cadenas.
 */

import { describe, expect, it } from "vitest";

import { extensionDe, queHacerCon } from "./formatos.js";

describe("qué hacer con un archivo soltado", () => {
  it("un DWG no llega al lector de IFC", () => {
    // **La prueba de la caída.** Mientras esto diga `modelo`, el archivo va a `openIfc` y el WASM
    // se cae: es literalmente el defecto que se arregla.
    expect(queHacerCon("PLANTA-NIVEL-1.dwg").tipo).toBe("no-se-puede");
  });

  it("lo hace por la extensión, escrita como esté", () => {
    // Windows escribe `.DWG` en mayúsculas más a menudo de lo que parece.
    expect(queHacerCon("Planta.DWG").tipo).toBe("no-se-puede");
    expect(queHacerCon("  planta.Dwg  ").tipo).toBe("no-se-puede");
  });

  it("lo que sí se lee sigue yendo a donde iba", () => {
    expect(queHacerCon("modelo.ifc").tipo).toBe("modelo");
    expect(queHacerCon("planta.dxf").tipo).toBe("plano");
    expect(queHacerCon("muro.laz").tipo).toBe("nube");
    expect(queHacerCon("muro.las").tipo).toBe("nube");
  });

  it("lo desconocido se sigue intentando como IFC", () => {
    // **Deliberado, y la otra mitad del arreglo.** Un IFC puede llegar con otra extensión o sin
    // ninguna; rechazarlo por el nombre rompería algo que hoy funciona. Solo se rechaza lo que se
    // sabe que no se puede.
    expect(queHacerCon("modelo").tipo).toBe("modelo");
    expect(queHacerCon("modelo.ifczip").tipo).toBe("modelo");
  });

  it("el motivo nombra el archivo, dice qué es y qué hacer", () => {
    const destino = queHacerCon("PLANTA-NIVEL-1.dwg");
    if (destino.tipo !== "no-se-puede") throw new Error("debería haberse rechazado");

    expect(destino.motivo).toContain("PLANTA-NIVEL-1.dwg");
    expect(destino.motivo).toContain("DWG");
    // Las dos salidas reales: el registro lo convierte, o se guarda como DXF en el CAD.
    expect(destino.motivo).toContain("registro");
    expect(destino.motivo).toContain("DXF");
    expect(destino.motivo).toContain("FORMATOS.md");
    // Y ni rastro del error de WASM, que es lo que no se entiende.
    expect(destino.motivo).not.toContain("memory access");
  });

  it("los demás formatos cerrados dicen cuál es cada uno", () => {
    // Un mensaje que dijera «DWG» ante un RVT mandaría a alguien a buscar un conversor de DWG.
    for (const [nombre, sigla] of [
      ["coordinacion.nwd", "NWD"],
      ["modelo.rvt", "RVT"],
      ["topografia.dgn", "DGN"],
    ] as const) {
      const destino = queHacerCon(nombre);
      if (destino.tipo !== "no-se-puede") throw new Error(`${nombre} debería haberse rechazado`);
      expect(destino.motivo).toContain(sigla);
    }
  });
});

describe("la extensión", () => {
  it("se queda con la última, no con la primera", () => {
    // `plano.dwg.dxf` es un DXF: lo produce el propio conversor y es un nombre normal.
    expect(extensionDe("plano.dwg.dxf")).toBe("dxf");
    expect(queHacerCon("plano.dwg.dxf").tipo).toBe("plano");
  });

  it("es vacía cuando no hay punto", () => {
    expect(extensionDe("modelo")).toBe("");
  });
});
