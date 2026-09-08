/**
 * Una tabla **dentro de la lámina que sale**: el cuadro en el plano. `F10.4`.
 *
 * Un plano con el modelo dibujado y sin cuadro obliga a llevar dos papeles a la obra, y el segundo
 * se pierde. Lo que se pide es una lámina que se pueda imprimir, firmar y colgar **con su cuadro
 * dentro** — de hallazgos o de elementos, que es la misma tabla con otro contenido.
 *
 * ## Por qué es un sistema de anotación y no geometría suelta
 *
 * El exportador de DXF escribe **texto** solo de los sistemas de anotación: para la geometría de un
 * dibujo escribe líneas, y una tabla sin texto son cuadrículas vacías. `DxfExporter` deja registrar
 * un exportador propio con `registerSystemExporter`, y ahí sí hay `writeText`. De paso, ser un
 * sistema de anotación da lo demás gratis: la tabla se dibuja **también en pantalla** dentro del
 * plano, se puede borrar y se puede volver a dibujar.
 *
 * `AnnotationSystem` pide tres miembros —`enabled`, `_buildGroup` y `pickHandle`— y nada más. Lo que
 * se implementa aquí es la aritmética de la tabla: dónde cae cada línea y cada texto.
 *
 * ## Y la aritmética va en un solo sitio
 *
 * **La pantalla y el DXF dibujan la misma tabla**, así que las posiciones de las líneas y de los
 * textos las calcula {@link trazarTabla} y las consumen los dos. Con dos cálculos, el cuadro del
 * papel y el de la pantalla se separan en la primera columna que cambie de ancho — y el que se
 * imprime es el que nadie mira antes de mandarlo.
 *
 * Las coordenadas son las del dibujo: **X a la derecha y Z hacia abajo en el papel**, que es la
 * convención de la librería —su eje Y de papel es `−Z`— y la misma que costó media lámina en `F7.2`.
 */

import * as OBC from "@thatopen/components";
import * as THREE from "three";

/** El contenido de una tabla: una cabecera y sus filas, ya en texto. */
export interface TablaDeCuadro {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** El título que va encima, o `null` si no lleva. */
  readonly title: string | null;
}

/** Dónde y con qué medidas se dibuja la tabla, en unidades del dibujo. */
export interface MedidasDeTabla {
  /** La esquina superior izquierda, en coordenadas del dibujo. */
  readonly x: number;
  readonly z: number;
  /** Alto de cada fila. El texto va a `0.62` de eso, que es lo que deja aire arriba y abajo. */
  readonly rowHeight: number;
  /** Ancho de un carácter, para calcular columnas. Sale de la fuente del CAD, no se adivina. */
  readonly charWidth: number;
}

/**
 * Cuánto ocupa como máximo una columna, en caracteres.
 *
 * **Sin tope, una columna con un nombre de tipo largo se lleva la lámina entera.** En el modelo del
 * usuario hay valores de 60 caracteres —`43248*716-LCD-ME-ISUP-D-TEST!Design Model - Base`— y una
 * tabla de veinticinco columnas así mide cuarenta metros de papel. Se recorta el texto y se dice con
 * un `…`, que es lo que hace cualquier cuadro de CAD.
 */
const MAXIMO_CARACTERES = 22;

/** Las capas del cuadro en el DXF. Separadas de las del dibujo: un cuadro no es geometría del modelo. */
export const CAPAS_DE_CUADRO = {
  rejilla: "AB-CUADRO",
  texto: "AB-CUADRO-TEXTO",
} as const;

/** Un texto ya situado en la tabla, en coordenadas del dibujo. */
export interface TextoDeTabla {
  readonly text: string;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly bold: boolean;
}

/** Una línea o un texto ya situados. Es lo que consumen la pantalla y el DXF. */
export interface TrazoDeTabla {
  readonly lines: readonly (readonly [number, number, number, number])[];
  readonly texts: readonly TextoDeTabla[];
  /** Cuánto ocupa la tabla entera, para poder colocarla sin que se salga del papel. */
  readonly width: number;
  readonly height: number;
}

/**
 * Calcula dónde cae cada línea y cada texto de la tabla.
 *
 * **Es la única aritmética de la tabla, y la usan la pantalla y el DXF.** Ver el docstring del
 * módulo: con dos cálculos, el cuadro que se imprime y el que se ve se separan.
 */
export function trazarTabla(tabla: TablaDeCuadro, medidas: MedidasDeTabla): TrazoDeTabla {
  const { x: x0, z: z0, rowHeight, charWidth } = medidas;

  // El ancho de cada columna sale del texto **más largo que va a llevar**, cabecera incluida, y con
  // su tope. Calcularlo de la cabecera sola deja las columnas de números demasiado anchas y las de
  // texto cortadas justo donde importa.
  const anchos = tabla.headers.map((cabecera, i) => {
    const largos = [
      recortar(cabecera).length,
      ...tabla.rows.map((f) => recortar(f[i] ?? "").length),
    ];
    return (Math.max(...largos) + 1.5) * charWidth;
  });

  const ancho = anchos.reduce((suma, uno) => suma + uno, 0);
  const filasDeTitulo = tabla.title === null ? 0 : 1;
  const alto = (filasDeTitulo + 1 + tabla.rows.length) * rowHeight;

  const lines: [number, number, number, number][] = [];
  const texts: TextoDeTabla[] = [];
  const alturaTexto = rowHeight * 0.62;

  // El título va sobre la tabla y sin rejilla propia: es un rótulo, no una fila de datos.
  if (tabla.title !== null) {
    texts.push({
      text: tabla.title,
      x: x0 + charWidth * 0.5,
      z: z0 + rowHeight * 0.7,
      height: alturaTexto * 1.15,
      bold: true,
    });
  }

  const zCabecera = z0 + filasDeTitulo * rowHeight;

  // Las horizontales: una por cada frontera de fila, de la cabecera al final.
  for (let f = 0; f <= tabla.rows.length + 1; f += 1) {
    const z = zCabecera + f * rowHeight;
    lines.push([x0, z, x0 + ancho, z]);
  }

  // Las verticales: una por cada frontera de columna, y las dos de los extremos.
  let x = x0;
  for (const anchoColumna of [...anchos, 0]) {
    lines.push([x, zCabecera, x, zCabecera + (tabla.rows.length + 1) * rowHeight]);
    x += anchoColumna;
  }

  const escribirFila = (valores: readonly string[], fila: number, negrita: boolean) => {
    let xCelda = x0;
    for (const [i, anchoColumna] of anchos.entries()) {
      const valor = recortar(valores[i] ?? "");
      if (valor !== "") {
        texts.push({
          text: valor,
          x: xCelda + charWidth * 0.5,
          // El texto se apoya un poco por encima de la línea de abajo de su fila, que es donde lo
          // pone un CAD: centrado a ojo se ve pegado a la línea de arriba.
          z: zCabecera + (fila + 1) * rowHeight - rowHeight * 0.22,
          height: alturaTexto,
          bold: negrita,
        });
      }
      xCelda += anchoColumna;
    }
  };

  escribirFila(tabla.headers, 0, true);
  for (const [i, valores] of tabla.rows.entries()) escribirFila(valores, i + 1, false);

  return { lines, texts, width: ancho, height: alto };
}

/** El texto de una celda, recortado al tope y con su `…` cuando se recorta. */
function recortar(valor: string): string {
  const limpio = valor.trim();
  return limpio.length <= MAXIMO_CARACTERES ? limpio : `${limpio.slice(0, MAXIMO_CARACTERES - 1)}…`;
}

/** Lo que guarda una tabla puesta en un dibujo. */
export interface TablaPuesta {
  uuid: string;
  style: string;
  tabla: TablaDeCuadro;
  medidas: MedidasDeTabla;
}

/** Los datos con los que se pide una tabla. El `uuid` lo pone el sistema. */
export interface DatosDeTabla {
  tabla: TablaDeCuadro;
  medidas: MedidasDeTabla;
  style?: string;
}

interface DescriptorDeTabla {
  item: TablaPuesta;
  data: DatosDeTabla;
  style: OBC.BaseAnnotationStyle;
  handle: "position";
}

/**
 * El sistema de anotación que dibuja tablas en un plano. `F10.4`.
 *
 * Se registra en el dibujo con `techDrawings.use(CuadrosEnPlano)` y se le añaden tablas con
 * `add(drawing, { tabla, medidas })`. Lo que dibuja en pantalla son **las líneas de la rejilla**: el
 * texto no se puede pintar como geometría de línea sin escribir una fuente, y en pantalla el cuadro
 * se consulta en su panel. **En el DXF sí van los textos**, que es donde el cuadro tiene que
 * leerse — ver {@link registrarExportador}.
 */
export class CuadrosEnPlano extends OBC.AnnotationSystem<DescriptorDeTabla> {
  enabled = true;

  /**
   * El estilo por defecto, y hay que ponerlo aquí.
   *
   * `AnnotationSystem` no trae ninguno: `_getMaterial` resuelve el estilo por su nombre y **revienta
   * con `Cannot read properties of undefined (reading 'color')`** si no está registrado. Lo dijo la
   * primera ejecución, y la traza señala a la librería aunque lo que falta sea de aquí.
   *
   * El color es el de las líneas del plano generado, para que la tabla se vea como parte de la misma
   * lámina y no como algo pegado encima.
   */
  constructor(components: OBC.Components) {
    super(components);
    this.styles.set("default", { color: 0xe8e8ef, textOffset: 0, fontSize: 0.25 });
    this.activeStyle = "default";
  }

  protected _buildGroup(item: TablaPuesta): THREE.Group {
    const grupo = new THREE.Group();
    const trazo = trazarTabla(item.tabla, item.medidas);

    const puntos: number[] = [];
    for (const [x1, z1, x2, z2] of trazo.lines) puntos.push(x1, 0, z1, x2, 0, z2);

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));

    const lineas = new THREE.LineSegments(geometria, this._getMaterial(item.style));
    // La capa 1 es la que dibujan las cámaras del plano, igual que el resto del dibujo.
    lineas.layers.set(1);
    lineas.name = CAPAS_DE_CUADRO.rejilla;
    lineas.userData.layer = CAPAS_DE_CUADRO.rejilla;
    grupo.add(lineas);

    return grupo;
  }

  /**
   * Una tabla no se agarra por un tirador.
   *
   * Se coloca por sus medidas y se mueve borrándola y poniéndola en otro sitio, que es lo que hace
   * quien compone una lámina. Devolver `null` es la respuesta correcta, no una carencia.
   */
  pickHandle(): { uuid: string; handle: "position" } | null {
    return null;
  }
}

/**
 * Enseña al exportador de DXF a escribir las tablas, **con su texto**.
 *
 * Se llama una vez por sesión. Sin esto el DXF sale con la rejilla —que es geometría de línea y el
 * exportador ya la escribe— y **sin una sola palabra dentro**, que es una tabla inútil.
 */
export function registrarExportador(components: OBC.Components): void {
  components.get(OBC.DxfManager).exporter.registerSystemExporter(CuadrosEnPlano, (sistema, ctx) => {
    const dibujos = [...components.get(OBC.TechnicalDrawings).list.values()];
    for (const [, puesta] of sistema.get(dibujos)) {
      const trazo = trazarTabla(puesta.item.tabla, puesta.item.medidas);

      for (const [x1, z1, x2, z2] of trazo.lines) {
        ctx.writeLine(x1, z1, x2, z2, CAPAS_DE_CUADRO.rejilla);
      }
      for (const texto of trazo.texts) {
        ctx.writeText(texto.text, texto.x, texto.z, texto.height, {
          layer: CAPAS_DE_CUADRO.texto,
        });
      }
    }
  });
}
