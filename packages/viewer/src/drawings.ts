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

    const lineas = new THREE.LineSegments(
      proyeccion.visible,
      new THREE.LineBasicMaterial({ color: 0xe8e8ef }),
    );
    // La capa 1 es la que dibujan las cámaras del plano; sin esto la geometría existe y el plano
    // sale en blanco.
    lineas.layers.set(1);
    lineas.name = "visibles";
    drawing.three.add(lineas);

    const ocultas = new THREE.LineSegments(
      proyeccion.hidden,
      new THREE.LineDashedMaterial({ color: 0x8fa2c8, dashSize: 0.2, gapSize: 0.1 }),
    );
    ocultas.computeLineDistances();
    ocultas.layers.set(1);
    ocultas.name = "ocultas";
    ocultas.visible = false;
    drawing.three.add(ocultas);

    // El viewport encuadra lo dibujado: sin márgenes el plano sale pegado al borde del papel.
    const caja = new THREE.Box3().setFromBufferAttribute(
      proyeccion.visible.getAttribute("position") as THREE.BufferAttribute,
    );
    const margen = Math.max(0.5, Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z) * 0.03);
    const viewport = drawing.viewports.create({
      left: caja.min.x - margen,
      right: caja.max.x + margen,
      top: caja.max.z + margen,
      bottom: caja.min.z - margen,
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

  /** Enciende o apaga las aristas ocultas de un plano generado. */
  setHiddenVisible(id: string, visible: boolean): void {
    const plano = this.planos.get(id);
    const ocultas = plano?.drawing.three.children.find((hijo) => hijo.name === "ocultas");
    if (ocultas !== undefined) ocultas.visible = visible;
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
