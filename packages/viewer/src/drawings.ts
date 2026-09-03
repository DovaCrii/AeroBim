/**
 * Planos generados **desde el modelo**: la otra mitad de la Fase 7.
 *
 * La mitad de entrada trae el CAD que ya existe y lo compara con el IFC. Esta saca del modelo un
 * dibujo 2D que alguien pueda imprimir, firmar o seguir trabajando en su CAD — que para una oficina
 * técnica suele valer más que un modo de visualización.
 *
 * **Casi todo esto ya existe en `@thatopen/components` y aquí solo se ensambla**, que es la regla
 * del repositorio: `EdgeProjector` proyecta las aristas del modelo sobre un plano, `TechnicalDrawing`
 * es el dibujo con sus viewports, y `DxfExporter` lo serializa. Lo propio es decidir **qué se
 * proyecta, con qué nombre y con qué papel**, y no perder de vista lo que cuesta.
 */

import * as OBC from "@thatopen/components";
import * as THREE from "three";

/** Un plano ya generado, con lo que la interfaz necesita para listarlo y exportarlo. */
export interface GeneratedDrawing {
  readonly id: string;
  readonly name: string;
  /** Desde dónde se proyectó. */
  readonly view: DrawingView;
  /** Cuántos segmentos tiene el dibujo visible, que es el tamaño real del plano. */
  readonly segments: number;
  /** Cuántos segmentos quedaron ocultos por el propio modelo. */
  readonly hiddenSegments: number;
  /** Cuánto mide el dibujo, en metros. */
  readonly sizeM: readonly [number, number];
  /** Cuánto costó generarlo. Es la cifra que decide si esto se puede usar o no. */
  readonly elapsedMs: number;
}

/** Desde dónde se mira el modelo para dibujarlo. */
export type DrawingView = "plan" | "front" | "side";

/**
 * Las capas del plano, con el nombre que llevan **en el DXF**. `F7.2`.
 *
 * **Antes todo salía en la capa `0`**, y eso es lo que hace inútil un DXF en una oficina técnica:
 * quien lo abre no puede apagar las aristas ocultas, ni darles otro grosor de trazo, ni congelarlas
 * para acotar encima. Un plano en el que todo es la misma capa es un dibujo, no un entregable.
 *
 * La causa era que el código montaba las líneas a mano —`drawing.three.add()` y `layers.set(1)`—
 * en vez de pasarlas por `addProjectionLines()`, que es lo que asigna la capa. La librería tenía la
 * API desde el principio; lo que faltaba era usarla.
 *
 * **Los nombres van cortos y con prefijo.** En un CAD estos planos se insertan en un archivo que ya
 * tiene sus capas, así que `VISIBLE` a secas se mezclaría con las de la oficina; `AB-` dice de dónde
 * salió sin ocupar media línea en el desplegable de capas.
 */
export const CAPAS = {
  visibles: "AB-VISIBLE",
  ocultas: "AB-OCULTA",
} as const;

/** Una capa de un plano generado, para poder listarla y apagarla desde la interfaz. */
export interface DrawingLayerInfo {
  /** El nombre que lleva en el DXF. */
  readonly name: string;
  readonly visible: boolean;
  /** Cuántos segmentos hay en esta capa. */
  readonly segments: number;
}

/** Hacia dónde proyecta cada vista. */
const DIRECCIONES: Record<DrawingView, readonly [number, number, number]> = {
  plan: [0, -1, 0],
  front: [0, 0, -1],
  side: [-1, 0, 0],
};

/** Cómo se llama cada vista en el nombre del plano. */
const NOMBRES: Record<DrawingView, string> = {
  plan: "Planta",
  front: "Alzado frontal",
  side: "Alzado lateral",
};

/**
 * Cuánto se espera **sin un solo aviso de avance** antes de darlo por colgado.
 *
 * **No es un tope al tiempo total**, y la diferencia es todo: proyectar las aristas de un modelo
 * grande puede tardar minutos legítimamente, y cortarlo a los treinta segundos rompería el caso
 * bueno. Lo que no puede pasar es que no ocurra *nada*: `EdgeProjector` informa de su avance, así
 * que veinte segundos de silencio absoluto significan que se quedó.
 *
 * **Existe porque el fallo se reprodujo.** En un navegador que no compone fotogramas —el panel del
 * entorno de trabajo— `projector.get()` **no resuelve nunca y no emite un solo aviso**: la promesa
 * se queda pendiente. Sin este corte, la interfaz mostraba «Proyectando las aristas del modelo…»
 * para siempre, sin error y sin salida, que es la misma clase de fallo que ya costó una sesión con
 * el WASM multihilo. Un mensaje claro no arregla la proyección, pero convierte un cuelgue en algo
 * que se puede contar.
 */
const SIN_AVANCE_MS = 20_000;

/** Lo que se guarda de cada plano generado. */
interface PlanoGenerado {
  readonly info: GeneratedDrawing;
  readonly drawing: OBC.TechnicalDrawing;
  readonly viewport: OBC.DrawingViewport;
}

/**
 * Los planos que se generan desde el modelo, y su exportación.
 *
 * Vive aparte del visor por lo mismo que los planos 2D y los ejes: es un trabajo con entrada y
 * salida claras —qué elementos, qué vista, qué papel— que no necesita saber nada del resto.
 */
export class DrawingMaker {
  private readonly planos = new Map<string, PlanoGenerado>();
  private siguiente = 1;

  constructor(private readonly components: OBC.Components) {}

  /**
   * Proyecta los elementos indicados y arma el plano.
   *
   * **Las aristas ocultas se generan pero no se dibujan de entrada.** En un plano de arquitectura
   * son la mitad del ruido y solo se quieren en algunos casos; se guardan en el dibujo apagadas y
   * se encienden con {@link setHiddenVisible}.
   */
  async create(
    world: OBC.World,
    modelIdMap: OBC.ModelIdMap,
    view: DrawingView,
    onProgress?: (mensaje: string, avance?: number) => void,
  ): Promise<GeneratedDrawing | null> {
    const empezado = performance.now();

    const projector = this.components.get(OBC.EdgeProjector);
    projector.projectionDirection.set(...DIRECCIONES[view]);

    // **El aviso de avance es también el latido.** Cada vez que la proyección informa se anota la
    // hora; si pasan `SIN_AVANCE_MS` sin un solo aviso, se da por colgada. Ver {@link SIN_AVANCE_MS}.
    let ultimoAvance = performance.now();
    const conLatido = (mensaje: string, avance?: number) => {
      ultimoAvance = performance.now();
      onProgress?.(mensaje, avance);
    };

    // El aviso se pasa siempre, aunque quien llame no quiera oírlo: hace falta para el latido.
    const proyeccion = await conCorte(
      projector.get(modelIdMap, world, { onProgress: conLatido }),
      () => performance.now() - ultimoAvance,
      `La proyección de aristas no respondió en ${SIN_AVANCE_MS / 1000} s y se dio por colgada. ` +
        `Suele ser que el navegador no está dibujando la escena: EdgeProjector lee la escena ` +
        `dibujada, así que en una pestaña oculta o sin aceleración no avanza.`,
    );

    const visibles = contarSegmentos(proyeccion.visible);
    if (visibles === 0) return null;

    const drawing = this.components.get(OBC.TechnicalDrawings).create(world);
    const id = `plano-generado-${this.siguiente++}`;

    // **Nace apagado en la vista 3D.** El dibujo se coloca en el plano de proyección, o sea encima
    // del modelo: encendido de entrada, lo que se ve es una maraña de líneas superpuestas a la
    // geometría y la escena parece rota. Se enciende desde su ficha, cuando se quiere mirar.
    drawing.three.visible = false;

    // **Las capas se crean antes de colgar nada** — `F7.2`. `addProjectionLines` avisa y cae a la
    // capa `0` si el nombre no existe, así que sin esto el DXF volvería a salir con todo junto.
    drawing.layers.create(CAPAS.visibles, {
      material: new THREE.LineBasicMaterial({ color: 0xe8e8ef }),
    });
    drawing.layers.create(CAPAS.ocultas, {
      // Discontinua y más apagada: en un plano las aristas ocultas se leen como referencia, no como
      // el trazo del dibujo. `LineDashedMaterial` es un `LineBasicMaterial`, así que la capa lo toma.
      material: new THREE.LineDashedMaterial({ color: 0x8fa2c8, dashSize: 0.2, gapSize: 0.1 }),
      visible: false,
    });

    // Y se cuelgan **por la API de capas** y no a mano: es ella la que asigna la capa del DXF y la
    // capa 1 de Three.js —la que dibujan las cámaras del plano—, que antes se ponía aquí a pulso.
    const lineas = new THREE.LineSegments(proyeccion.visible);
    lineas.name = CAPAS.visibles;
    drawing.addProjectionLines(lineas, CAPAS.visibles);

    const ocultas = new THREE.LineSegments(proyeccion.hidden);
    ocultas.name = CAPAS.ocultas;
    drawing.addProjectionLines(ocultas, CAPAS.ocultas);
    // El patrón de guiones necesita las distancias calculadas, y hay que hacerlo **después** de que
    // la capa le ponga su material: sin esto la línea discontinua se dibuja continua.
    ocultas.computeLineDistances();

    // El viewport encuadra lo dibujado: sin márgenes el plano sale pegado al borde del papel.
    const caja = new THREE.Box3().setFromBufferAttribute(
      proyeccion.visible.getAttribute("position") as THREE.BufferAttribute,
    );
    const margen = Math.max(0.5, Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) * 0.03);

    // **`top` y `bottom` son coordenadas de papel, no coordenadas Z**, y confundirlas costaba la
    // mitad del plano.
    //
    // La librería define la Y del papel como **−Z**: su `DrawingViewport.bbox` se construye como
    // `Z ∈ [-top, -bottom]` y su eje Y local está documentado como «world −Z». Pasando las Z tal
    // cual, como se hacía aquí, la caja de recorte quedaba **al otro lado del dibujo**: para un
    // plano con z de 0 a 6 aceptaba `z ≤ margen` y tiraba todo lo demás.
    //
    // Medido con `diag.html?modo=dxf` sobre un rectángulo de 10 × 6 m con diagonal: salían **4 de 5
    // segmentos**, el borde superior desaparecía entero y la diagonal se cortaba justo donde cruza
    // el borde de la caja. Con las coordenadas de papel salen los cinco.
    //
    // **Y no lo veía nadie**: la comprobación de `F7.4` miraba la extensión del DXF —que la marca el
    // recuadro del viewport, no el dibujo— y el número de trazos. La extensión cuadraba con el
    // plano recortado igual que con el entero. Ahora se comparan **las coordenadas**.
    const viewport = drawing.viewports.create({
      left: caja.min.x - margen,
      right: caja.max.x + margen,
      top: -caja.min.z + margen,
      bottom: -caja.max.z - margen,
    });

    const info: GeneratedDrawing = {
      id,
      name: NOMBRES[view],
      view,
      segments: visibles,
      hiddenSegments: contarSegmentos(proyeccion.hidden),
      sizeM: [caja.max.x - caja.min.x, caja.max.z - caja.min.z],
      elapsedMs: performance.now() - empezado,
    };

    this.planos.set(id, { info, drawing, viewport });
    return info;
  }

  /**
   * Enciende o apaga las aristas ocultas de un plano generado.
   *
   * **Va por la capa y no por el objeto** — `F7.2`: apagar el `LineSegments` a mano dejaba la capa
   * del dibujo diciendo que estaba visible, así que la interfaz y el DXF podían discrepar.
   */
  setHiddenVisible(id: string, visible: boolean): void {
    this.setLayerVisible(id, CAPAS.ocultas, visible);
  }

  /** Enciende o apaga una capa por su nombre. */
  setLayerVisible(id: string, layer: string, visible: boolean): void {
    const plano = this.planos.get(id);
    plano?.drawing.layers.setVisibility(layer, visible);
  }

  /**
   * Las capas de un plano generado, con cuántos segmentos hay en cada una.
   *
   * Es lo que permite que la ficha del plano diga **qué va a salir en el DXF** antes de exportarlo,
   * en vez de una casilla suelta de «aristas ocultas» que no dice dónde acaban.
   */
  layersOf(id: string): readonly DrawingLayerInfo[] {
    const plano = this.planos.get(id);
    if (plano === undefined) return [];

    const porCapa = new Map<string, number>();
    plano.drawing.three.traverse((objeto) => {
      const lineas = objeto as THREE.LineSegments;
      if (!lineas.isLineSegments) return;
      const capa = lineas.name;
      porCapa.set(capa, (porCapa.get(capa) ?? 0) + contarSegmentos(lineas.geometry));
    });

    const capas: DrawingLayerInfo[] = [];
    for (const [nombre, capa] of plano.drawing.layers) {
      // La capa `0` existe siempre en cualquier dibujo y aquí no se usa: enseñarla vacía en la
      // ficha solo invita a preguntar qué hay dentro.
      const segmentos = porCapa.get(nombre) ?? 0;
      if (segmentos === 0) continue;
      capas.push({ name: nombre, visible: capa.visible, segments: segmentos });
    }
    return capas;
  }

  /** Enciende o apaga el plano entero en la vista 3D. */
  setVisible(id: string, visible: boolean): void {
    const plano = this.planos.get(id);
    if (plano !== undefined) plano.drawing.three.visible = visible;
  }

  /** La caja que ocupa un plano generado, para poder encuadrarlo al encenderlo. */
  boxOf(id: string): THREE.Box3 | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    const caja = new THREE.Box3().setFromObject(plano.drawing.three);
    return caja.isEmpty() ? null : caja;
  }

  /**
   * Serializa un plano a DXF.
   *
   * **Con papel, el DXF sale en milímetros y con el dibujo colocado en la hoja**; sin papel, en
   * unidades del mundo. Se ofrece con papel porque lo que se pide es un plano imprimible, y un DXF
   * en metros obliga a escalarlo a mano en el CAD.
   */
  exportDxf(
    id: string,
    paper?: { widthMm: number; heightMm: number; margin: number },
  ): string | null {
    const plano = this.planos.get(id);
    if (plano === undefined) return null;

    return this.components
      .get(OBC.DxfManager)
      .exporter.export(
        [{ drawing: plano.drawing, viewports: [{ viewport: plano.viewport }] }],
        paper,
      );
  }

  /** Cierra un plano generado y libera su geometría. */
  remove(id: string): void {
    const plano = this.planos.get(id);
    if (plano === undefined) return;

    plano.drawing.three.traverse((objeto) => {
      const conGeometria = objeto as Partial<THREE.Mesh>;
      conGeometria.geometry?.dispose();
      const material = conGeometria.material;
      for (const uno of Array.isArray(material) ? material : material ? [material] : []) {
        uno.dispose();
      }
    });
    this.components.get(OBC.TechnicalDrawings).list.delete(plano.drawing.uuid);
    this.planos.delete(id);
  }

  /** Los planos generados, en el orden en que se hicieron. */
  get list(): readonly GeneratedDrawing[] {
    return [...this.planos.values()].map((plano) => plano.info);
  }
}

/** Cuántos segmentos tiene una geometría de líneas: dos vértices, un segmento. */
function contarSegmentos(geometria: THREE.BufferGeometry): number {
  const posiciones = geometria.getAttribute("position");
  return posiciones === undefined ? 0 : Math.floor(posiciones.count / 2);
}

/**
 * Espera una promesa pero **se rinde si deja de haber señales de vida**.
 *
 * `silencio()` devuelve cuántos milisegundos han pasado desde la última señal, así que quien llama
 * decide qué cuenta como una: aquí es el aviso de avance de la proyección. **No es un tope al
 * tiempo total** —lo que tarda puede tardar— sino a la falta de noticias.
 *
 * El vigilante se limpia en los dos caminos: sin eso, un `setInterval` cada segundo sobrevive a la
 * proyección y sigue corriendo hasta recargar la página.
 */
async function conCorte<T>(
  promesa: Promise<T>,
  silencio: () => number,
  mensaje: string,
): Promise<T> {
  let vigilante: ReturnType<typeof setInterval> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_resolver, rechazar) => {
        vigilante = setInterval(() => {
          if (silencio() > SIN_AVANCE_MS) rechazar(new Error(mensaje));
        }, 1000);
      }),
    ]);
  } finally {
    if (vigilante !== undefined) clearInterval(vigilante);
  }
}
