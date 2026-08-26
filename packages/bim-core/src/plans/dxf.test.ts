import { describe, expect, it } from "vitest";
import { aciColor, aciColorHex, parseDxf, suggestMetresPerUnit } from "./dxf.js";

/**
 * El oráculo de la paleta es la tabla oficial de AutoCAD. Los valores de abajo están copiados de
 * ahí, y son los que separan un plano que se lee como en el CAD de uno con colores inventados.
 */
describe("aciColor", () => {
  it("clava los colores fijos, con el 7 claro porque el fondo es oscuro", () => {
    expect(aciColor(1)).toBe(0xff0000);
    expect(aciColor(4)).toBe(0x00ffff);
    expect(aciColor(6)).toBe(0xff00ff);
    expect(aciColorHex(7)).toBe("#e8e8ef");
  });

  it("calcula la rueda del 10 al 249 como la tabla oficial", () => {
    // Rojo puro y su versión pálida; el 20 y el 21 son el mismo par un tono más allá.
    expect(aciColor(10)).toBe(0xff0000);
    expect(aciColor(11)).toBe(0xff8080);
    expect(aciColor(20)).toBe(0xff4000);
    expect(aciColor(21)).toBe(0xff9f80);
    // Un nivel más oscuro del mismo tono.
    expect(aciColor(12)).toBe(0xa50000);
  });

  it("el 201 es violeta, no verde — la capa que delató la leyenda", () => {
    const violeta = aciColor(201);
    const rojo = (violeta >> 16) & 0xff;
    const verde = (violeta >> 8) & 0xff;
    const azul = violeta & 0xff;

    expect(azul).toBeGreaterThan(verde);
    expect(rojo).toBeGreaterThan(verde);
  });

  it("los grises finales son una rampa, y lo desconocido cae en el color por defecto", () => {
    expect(aciColor(255)).toBe(0xffffff);
    expect(aciColor(0)).toBe(aciColor(7));
    expect(aciColor(null)).toBe(aciColor(7));
  });
});

/** Escribe un DXF mínimo a partir de pares (código, valor), que es como está escrito el formato. */
function dxf(...pares: readonly (readonly [number | string, string])[]): string {
  return pares.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
}

/**
 * El color ya resuelto que le toca a una entidad.
 *
 * Se escribe con su **procedencia** porque es lo que se está probando: la mitad de los defectos de
 * color de un plano no son la paleta, son haber ido a buscar el color al sitio equivocado.
 */
const color = (
  aci: number | null,
  source: "entidad" | "capa" | "bloque" | "defecto",
  opacity = 1,
) => ({ rgb: aciColor(aci), aci, opacity, source });

/** El grosor que sale cuando nadie lo declara: el `$LWDEFAULT` de AutoCAD. */
const GROSOR_POR_DEFECTO = 0.25;

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
      {
        layer: "0-MUROS",
        points: [0, 0, 3000, 4000],
        closed: false,
        color: color(null, "defecto"),
        dash: null,
        width: null,
        lineweightMm: GROSOR_POR_DEFECTO,
      },
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
        color: color(null, "defecto"),
      },
      {
        layer: "0-EJES",
        x: 0,
        y: 0,
        height: 100,
        rotationDeg: 0,
        text: "EJE A °",
        color: color(null, "defecto"),
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

  it("lee el ancho de una polilínea: un muro dibujado con banda no es una línea fina", () => {
    const conAncho = (codigo: number, valor: string) =>
      parseDxf(
        dxf(
          [0, "SECTION"],
          [2, "ENTITIES"],
          [0, "LWPOLYLINE"],
          [8, "0-MUROS"],
          [70, "0"],
          [codigo, valor],
          [10, "0"],
          [20, "0"],
          [10, "1000"],
          [20, "0"],
          [0, "ENDSEC"],
        ),
      ).polylines[0]?.width;

    // 43 es el ancho constante de toda la polilínea.
    expect(conAncho(43, "150")).toBe(150);
    // 40 y 41 son el inicial y el final: se resumen en su media, que es lo que se dibuja.
    expect(conAncho(40, "200")).toBe(200);
    expect(conAncho(43, "0")).toBeNull();
  });

  it("lee un relleno macizo de un `SOLID`, con sus esquinas en orden de contorno", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "SOLID"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "10"],
        [21, "0"],
        // En el estándar el tercero y el cuarto van cruzados: el contorno correcto es 1-2-4-3.
        [12, "0"],
        [22, "5"],
        [13, "10"],
        [23, "5"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.hatches).toEqual([
      {
        layer: "0-MUROS",
        color: color(null, "defecto"),
        solid: true,
        pattern: null,
        loops: [[0, 0, 10, 0, 10, 5, 0, 5]],
      },
    ]);
    // Un macizo también ocupa sitio: sin contarlo, el plano se centra mal y la unidad se deduce
    // con una extensión que no es la del dibujo.
    expect(plano.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
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

    expect(plano.polylines.map((linea) => linea.color.aci)).toEqual([4, 1, 4]);
    // Y con su procedencia, que es lo que permite auditar por qué algo se ve de un color.
    expect(plano.polylines.map((linea) => linea.color.source)).toEqual(["capa", "entidad", "capa"]);
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
      { name: "0-MUROS", count: 2, colorIndex: 7, off: false, lineweightMm: null },
      // **El signo negativo del 62 es "capa apagada"**: el color es el mismo y la capa no se ve. En
      // el plano real es `0-AREA UTIL`, que el visor pintaba violeta encima del dibujo.
      { name: "0-R-DEMUELE", count: 1, colorIndex: 1, off: true, lineweightMm: null },
    ]);
  });

  it("marca apagada la capa congelada y la `Defpoints`, que en el CAD no se imprime", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "TABLES"],
        [0, "LAYER"],
        [2, "0-AUX"],
        [62, "3"],
        // El bit 1 del código 70 es "congelada", que en pantalla es lo mismo que apagada.
        [70, "1"],
        [0, "LAYER"],
        [2, "Defpoints"],
        [62, "5"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-AUX"],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "0"],
        [0, "LINE"],
        [8, "Defpoints"],
        [10, "0"],
        [20, "0"],
        [11, "2"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.layers.map((capa) => [capa.name, capa.off])).toEqual([
      ["0-AUX", true],
      ["Defpoints", true],
    ]);
    // Y la geometría se conserva: "¿qué hay en la capa que apagaron?" es una pregunta legítima.
    expect(plano.polylines).toHaveLength(2);
  });

  it("la capa `0` dentro de un bloque toma la capa del `INSERT`, como en AutoCAD", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "TABLES"],
        [0, "LAYER"],
        [2, "0-MOBILIARIO"],
        [62, "3"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "BLOCKS"],
        [0, "BLOCK"],
        [2, "ESCRITORIO"],
        [10, "0"],
        [20, "0"],
        // Dibujado en la capa `0`, que es como se dibuja un bloque para poder insertarlo donde sea.
        [0, "LINE"],
        [8, "0"],
        [10, "0"],
        [20, "0"],
        [11, "120"],
        [21, "0"],
        // Y una línea con capa propia, que el `INSERT` no puede cambiar.
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "60"],
        [21, "0"],
        [0, "ENDBLK"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "INSERT"],
        [2, "ESCRITORIO"],
        [8, "0-MOBILIARIO"],
        [10, "0"],
        [20, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines.map((linea) => linea.layer)).toEqual(["0-MOBILIARIO", "0-MUROS"]);
    // Y con la capa correcta llega el color correcto: verde y no el casi blanco del por defecto.
    expect(plano.polylines[0]?.color).toEqual(color(3, "capa"));
    expect(plano.polylines[1]?.color).toEqual(color(null, "defecto"));
  });

  it("el color `0` es «por bloque»: lo pone el `INSERT`, no la capa donde se dibujó", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "BLOCKS"],
        [0, "BLOCK"],
        [2, "MARCA"],
        [10, "0"],
        [20, "0"],
        [0, "LINE"],
        [8, "0-AUX"],
        // `62 = 0` es "por bloque": antes caía a la capa y salía del color equivocado.
        [62, "0"],
        [10, "0"],
        [20, "0"],
        [11, "10"],
        [21, "0"],
        [0, "ENDBLK"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "INSERT"],
        [2, "MARCA"],
        [8, "0-EJES"],
        [62, "6"],
        [10, "0"],
        [20, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines[0]?.color).toEqual(color(6, "bloque"));
  });

  it("deja fuera el espacio papel y lo cuenta aparte: el marco de la lámina no es el dibujo", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [10, "0"],
        [20, "0"],
        [11, "20000"],
        [21, "0"],
        // El marco de la lámina: código 67 a 1, y cuatrocientos ochenta metros de extensión falsa.
        [0, "LWPOLYLINE"],
        [8, "0-FORMATO"],
        [67, "1"],
        [70, "1"],
        [10, "0"],
        [20, "0"],
        [10, "480000"],
        [20, "0"],
        [10, "480000"],
        [20, "297000"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines).toHaveLength(1);
    expect(plano.bounds).toEqual({ minX: 0, minY: 0, maxX: 20000, maxY: 0 });
    // Va aparte de `skipped` a propósito: no es geometría que falte, es geometría que no toca.
    expect(plano.paperSpaceCount).toBe(1);
    expect(plano.skipped).toEqual({});
  });

  it("lee el color verdadero (420) y la transparencia (440), no solo el índice de la paleta", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "LINE"],
        [8, "0-MUROS"],
        [62, "1"],
        // El 420 manda sobre el 62: es lo que declara un plano con colores de marca.
        [420, String(0x336699)],
        [440, String(0x02000080)],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines[0]?.color.rgb).toBe(0x336699);
    expect(plano.polylines[0]?.color.aci).toBeNull();
    expect(plano.polylines[0]?.color.opacity).toBeCloseTo(128 / 255, 5);
  });

  it("resuelve el grosor: el de la entidad, el de su capa, y el del archivo cuando nadie lo dice", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "HEADER"],
        [9, "$LWDEFAULT"],
        [370, "9"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "TABLES"],
        [0, "LAYER"],
        [2, "0-MUROS"],
        [62, "4"],
        // 30 centésimas de milímetro: el muro del plano real.
        [370, "30"],
        [0, "LAYER"],
        [2, "AA - COTAS"],
        [62, "2"],
        // `-3` es "el del archivo", que es lo que declara la cota del plano real.
        [370, "-3"],
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
        [8, "AA - COTAS"],
        [10, "0"],
        [20, "0"],
        [11, "2"],
        [21, "0"],
        // Grosor propio, que manda sobre el de su capa.
        [0, "LINE"],
        [8, "AA - COTAS"],
        [370, "50"],
        [10, "0"],
        [20, "0"],
        [11, "3"],
        [21, "0"],
        [0, "ENDSEC"],
      ),
    );

    // **La jerarquía de grosores es cómo se lee un plano**: el muro gordo, la cota fina.
    expect(plano.polylines.map((linea) => linea.lineweightMm)).toEqual([0.3, 0.09, 0.5]);
    expect(plano.layers.map((capa) => [capa.name, capa.lineweightMm])).toEqual([
      ["AA - COTAS", null],
      ["0-MUROS", 0.3],
    ]);
  });

  it("un `INSERT` con matriz dibuja todas sus copias, no una", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "BLOCKS"],
        [0, "BLOCK"],
        [2, "PILAR"],
        [10, "0"],
        [20, "0"],
        [0, "LINE"],
        [8, "0-ESTRUCTURA"],
        [10, "0"],
        [20, "0"],
        [11, "1"],
        [21, "0"],
        [0, "ENDBLK"],
        [0, "ENDSEC"],
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "INSERT"],
        [2, "PILAR"],
        [8, "0-ESTRUCTURA"],
        [10, "0"],
        [20, "0"],
        // Tres columnas por dos filas, separadas 100 y 200: seis pilares, no uno.
        [70, "3"],
        [71, "2"],
        [44, "100"],
        [45, "200"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.polylines).toHaveLength(6);
    expect(plano.polylines.map((linea) => linea.points[0])).toEqual([0, 100, 200, 0, 100, 200]);
    expect(plano.polylines.map((linea) => linea.points[1])).toEqual([0, 0, 0, 200, 200, 200]);
  });

  it("conserva el nombre del patrón de un rayado, que es lo que permite rayarlo", () => {
    const plano = parseDxf(
      dxf(
        [0, "SECTION"],
        [2, "ENTITIES"],
        [0, "HATCH"],
        [8, "0-MUROS"],
        [2, "ANSI31"],
        [70, "0"],
        [91, "1"],
        // Contorno de polilínea: la bandera 2 del código 92.
        [92, "2"],
        [72, "0"],
        [73, "1"],
        [93, "3"],
        [10, "0"],
        [20, "0"],
        [10, "10"],
        [20, "0"],
        [10, "10"],
        [20, "10"],
        [97, "0"],
        [0, "ENDSEC"],
      ),
    );

    expect(plano.hatches).toHaveLength(1);
    // Los veintitrés rellenos del plano real son `ANSI31`, y se dibujaban como contornos vacíos.
    expect(plano.hatches[0]?.solid).toBe(false);
    expect(plano.hatches[0]?.pattern).toBe("ANSI31");
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
