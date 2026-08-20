import { describe, expect, it } from "vitest";
import { parseDxf, suggestMetresPerUnit } from "./dxf.js";

/** Escribe un DXF mínimo a partir de pares (código, valor), que es como está escrito el formato. */
function dxf(...pares: readonly (readonly [number | string, string])[]): string {
  return pares.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
}

const CABECERA = (insunits: string) =>
  [
    [0, "SECTION"],
    [2, "HEADER"],
    [9, "$INSUNITS"],
    [70, insunits],
    [0, "ENDSEC"],
  ] as const;

describe("parseDxf", () => {
  it("lee una línea y deja sus puntos en unidades del dibujo", () => {
    const plano = parseDxf(
      dxf(
        ...CABECERA("4"),
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "3000"],
        [21, "4000"],
        [0, "ENDSEC"],
        [0, "EOF"],
      ),
    );

    expect(plano.polylines).toEqual([
      { layer: "0-MUROS", points: [0, 0, 3000, 4000], closed: false, colorIndex: null, dash: null },
    ]);
    expect(plano.declaredUnits).toEqual({ code: 4, name: "milímetros", metresPerUnit: 0.001 });
    expect(plano.bounds).toEqual({ minX: 0, minY: 0, maxX: 3000, maxY: 4000 });
  });

  it("lee una polilínea cerrada con todos sus vértices", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LWPOLYLINE"],
        [8, "0-TABIQUES"],
        [90, "3"],
        [70, "1"],
        [10, "0"],
        [20, "0"],
        [10, "10"],
        [20, "0"],
        [10, "10"],
        [20, "5"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines[0]?.closed).toBe(true);
    // Cerrada: el último tramo vuelve al primer vértice, así que los tres puntos están.
    expect(plano.polylines[0]?.points).toEqual([0, 0, 10, 0, 10, 5]);
  });

  it("curva los tramos con `bulge`: un semicírculo no es una recta", () => {
    // `bulge` = 1 es media vuelta entre los dos vértices.
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LWPOLYLINE"],
        [8, "0"],
        [70, "0"],
        [10, "0"],
        [20, "0"],
        [42, "1"],
        [10, "10"],
        [20, "0"],
        [0, "ENDSEC"],
      ),
    );

    const puntos = plano.polylines[0]!.points;
    expect(puntos.length).toBeGreaterThan(4);

    // El punto medio del semicírculo cae a un radio del centro de la cuerda: (5, ±5).
    const alturas = [];
    for (let i = 1; i < puntos.length; i += 2) alturas.push(puntos[i]!);
    expect(Math.max(...alturas.map(Math.abs))).toBeCloseTo(5, 6);
  });

  it("desarma un bloque y lo coloca girado, escalado y en su sitio", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "BLOCKS"],
        [0, "BLOCK"],
        [2, "PILAR"],
        [10, "0"],
        [20, "0"],
        [0, "LINE"],
        [8, "0-EJES"],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "0"],
        [0, "ENDBLK"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "INSERT"],
        [8, "0"],
        [2, "PILAR"],
        [10, "100"],
        [20, "50"],
        [41, "2"],
        [42, "2"],
        [50, "90"],
        [0, "ENDSEC"],
      ),
    );

    const puntos = plano.polylines[0]!.points;
    expect(puntos[0]).toBeCloseTo(100, 6);
    expect(puntos[1]).toBeCloseTo(50, 6);
    // Girada 90° y al doble: el extremo sale hacia +Y, a dos unidades.
    expect(puntos[2]).toBeCloseTo(100, 6);
    expect(puntos[3]).toBeCloseTo(52, 6);
    // La capa la pone la entidad del bloque, no el INSERT: es lo que espera quien dibujó el plano.
    expect(plano.polylines[0]?.layer).toBe("0-EJES");
  });

  it("cuenta lo que no dibuja en vez de callarlo", () => {
    const plano = parseDxf(
      dxf([0, "SECTION"], [2, "ENTITIES"], [0, "HATCH"], [8, "0"], [0, "WIPEOUT"], [0, "ENDSEC"]),
    );

    expect(plano.skipped).toEqual({ WIPEOUT: 1, HATCH: 1 });
    expect(plano.polylines).toEqual([]);
    expect(plano.bounds).toBeNull();
  });

  it("lee los textos y les quita los códigos de formato del CAD", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "MTEXT"],
        [8, "AA - COTAS"],
        [10, "1000"],
        [20, "2000"],
        [40, "250"],
        [50, "90"],
        [1, "{\\fArial|b1;OFICINA 5\\P18.4 m2}"],
        [0, "TEXT"],
        [8, "0-EJES"],
        [10, "0"],
        [20, "0"],
        [40, "100"],
        [1, "EJE A %%d"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.texts).toEqual([
      {
        layer: "AA - COTAS",
        x: 1000,
        y: 2000,
        height: 250,
        rotationDeg: 90,
        text: "OFICINA 5 18.4 m2",
        colorIndex: null,
      },
      {
        layer: "0-EJES",
        x: 0,
        y: 0,
        height: 100,
        rotationDeg: 0,
        text: "EJE A °",
        colorIndex: null,
      },
    ]);
    // Un texto también ocupa sitio en el plano: cuenta para la extensión y para su capa.
    expect(plano.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 2000 });
    expect(plano.layers.map((c) => c.name).sort()).toEqual(["0-EJES", "AA - COTAS"]);
  });

  it("resuelve el trazo discontinuo: patrón de la capa, escalado por `$LTSCALE`", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "HEADER"],
        [9, "$LTSCALE"],
        [40, "2"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "TABLES"],
        // Trazo y punto: raya de 12, espacio de 3, punto y otro espacio de 3.
        [0, "LTYPE"],
        [2, "DASHDOT"],
        [49, "12"],
        [49, "-3"],
        [49, "0"],
        [49, "-3"],
        [0, "LTYPE"],
        [2, "CONTINUOUS"],
        [0, "LAYER"],
        [2, "0-EJES"],
        [6, "DASHDOT"],
        [0, "LAYER"],
        [2, "0-MUROS"],
        [6, "CONTINUOUS"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-EJES"],
        [10, "0"],
        [20, "0"],
        [11, "100"],
        [21, "0"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "100"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    // Raya media = 12 (la única positiva), espacio medio = 3, y las dos por `$LTSCALE` = 2.
    expect(plano.polylines[0]?.dash).toEqual([24, 6]);
    // Una capa continua no lleva patrón, aunque el archivo declare la tabla.
    expect(plano.polylines[1]?.dash).toBeNull();
  });

  it("resuelve el color: el propio de la entidad manda, y si no, el de su capa", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "TABLES"],
        [0, "LAYER"],
        [2, "0-MUROS"],
        [62, "4"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "0"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [62, "1"],
        [10, "0"],
        [20, "0"],
        [11, "2"],
        [21, "0"],
        // 256 es "por capa", que es lo que trae casi todo plano.
        [0, "LINE"],
        [8, "0-MUROS"],
        [62, "256"],
        [10, "0"],
        [20, "0"],
        [11, "3"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines.map((linea) => linea.colorIndex)).toEqual([4, 1, 4]);
  });

  it("no lanza con un archivo truncado ni con uno que no es un DXF", () => {
    expect(parseDxf("").polylines).toEqual([]);
    expect(parseDxf("cualquier cosa\nque no es un dxf").polylines).toEqual([]);
    expect(
      parseDxf(dxf([0, "SECTION"], [2, "ENTITIES"], [0, "LINE"], [10, "1"])).polylines,
    ).toEqual([]);
  });

  it("lista las capas con su color y ordenadas por cuánto traen", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "TABLES"],
        [0, "LAYER"],
        [2, "0-MUROS"],
        [62, "7"],
        [0, "LAYER"],
        [2, "0-R-DEMUELE"],
        [62, "-1"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-R-DEMUELE"],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "1"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "2"],
        [21, "0"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "3"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.layers).toEqual([
      { name: "0-MUROS", count: 2, colorIndex: 7 },
      // Una capa apagada declara su color en negativo: el color es el mismo.
      { name: "0-R-DEMUELE", count: 1, colorIndex: 1 },
    ]);
  });
});

describe("suggestMetresPerUnit", () => {
  const conExtension = (insunits: string, lado: number) =>
    parseDxf(
      dxf(
        ...CABECERA(insunits),
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0"],
        [10, "0"],
        [20, "0"],
        [11, String(lado)],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

  it("respeta lo que declara el archivo cuando el tamaño es de edificio", () => {
    const sugerencia = suggestMetresPerUnit(conExtension("6", 22));

    expect(sugerencia.metresPerUnit).toBe(1);
    expect(sugerencia.declared).toBe(true);
  });

  it("corrige la cabecera cuando el tamaño no da: el caso del plano real", () => {
    // Declara centímetros y mide 20.023 unidades: en centímetros serían 200 m de oficina.
    const sugerencia = suggestMetresPerUnit(conExtension("5", 20023));

    expect(sugerencia.metresPerUnit).toBe(0.001);
    expect(sugerencia.unitName).toBe("milímetros");
    expect(sugerencia.declared).toBe(false);
    expect(sugerencia.reason).toContain("20.0 m");
  });

  it("decide midiendo cuando el archivo no declara nada", () => {
    expect(suggestMetresPerUnit(conExtension("0", 21800)).metresPerUnit).toBe(0.001);
    expect(suggestMetresPerUnit(conExtension("0", 21.8)).metresPerUnit).toBe(1);
  });

  it("lo dice en vez de inventar cuando ninguna unidad deja un tamaño creíble", () => {
    const sugerencia = suggestMetresPerUnit(conExtension("0", 0.000001));

    expect(sugerencia.reason).toContain("a mano");
  });
});
