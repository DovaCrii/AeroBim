/**
 * `@aerobim/viewer` — envoltura del visor.
 *
 * Existe como paquete aparte por una razón concreta: **aísla el punto de ruptura**.
 * That Open rompió su API entre 2.x y 3.x, y volverá a hacerlo. Si la aplicación
 * entera importara sus componentes directamente, una migración tocaría cientos de
 * archivos; con esta envoltura toca uno.
 *
 * Nada de React ni de estado de interfaz aquí: esto administra una escena y devuelve
 * datos. Las reglas de dominio viven en `@aerobim/bim-core`.
 */

import * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

/** Mundo concreto que arma esta envoltura. */
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;

export interface BimViewerOptions {
  /**
   * Carpeta desde donde se sirve el WASM de `web-ifc`, con barra final.
   *
   * Por defecto That Open lo descarga de un CDN. AeroBim lo sirve **local**: la
   * aplicación tiene que abrir un modelo en una faena sin internet, y depender de
   * unpkg para leer un archivo del disco contradice el local-first del proyecto.
   */
  readonly wasmPath?: string;
}

/**
 * Etapas de {@link BimViewer.loadIfc}, en orden.
 *
 * Sirven para dos cosas: mostrar progreso en la interfaz, y saber **dónde** se detuvo
 * una carga que no termina — que en este pipeline es información difícil de obtener,
 * porque un worker que deja de responder no emite error alguno.
 */
export type LoadStage = "converting" | "reading" | "drawing" | "framing" | "done";

/** Lo que costó abrir un modelo. La respuesta a `F0.4` sale de acá. */
export interface LoadMetrics {
  /** Tamaño del IFC de entrada. */
  readonly ifcBytes: number;
  /** Milisegundos de `IfcLoader.load`: parseo del IFC y conversión a Fragments. */
  readonly convertMs: number;
  /** Milisegundos hasta que la escena quedó dibujada y encuadrada. */
  readonly displayMs: number;
  /** Categorías IFC presentes en el modelo (`IfcWall`, `IfcDoor`, …). */
  readonly categoryCount: number;
  /** Elementos con geometría, que es lo que realmente pesa al dibujar. */
  readonly itemsWithGeometry: number;
  /** Dimensiones del modelo en metros, o `null` si no se pudo determinar. */
  readonly sizeM: readonly [number, number, number] | null;
}

export interface LoadedModel {
  readonly id: string;
  readonly name: string;
  readonly model: FRAGS.FragmentsModel;
  readonly metrics: LoadMetrics;
}

const DEFAULT_WASM_PATH = "/wasm/";

/**
 * Un visor por contenedor, reutilizado.
 *
 * **Verificado (2026-08-19):** con That Open 3.4.8, tras `components.dispose()` un visor
 * nuevo en el mismo documento queda con el pipeline de Fragments sin responder. Se
 * comprobó que no es el blob URL del worker —dándole a cada instancia el suyo, el
 * síntoma persiste—, así que hay más estado global de por medio.
 *
 * Consecuencia: el visor **no se destruye para volver a crearse**. React en StrictMode
 * monta cada efecto dos veces, y sin esta caché el segundo montaje recibía un visor ya
 * liberado.
 */
const porContenedor = new Map<HTMLElement, Promise<BimViewer>>();

export class BimViewer {
  private readonly components: OBC.Components;
  private readonly world: World;
  private readonly fragments: OBC.FragmentsManager;
  private readonly ifcLoader: OBC.IfcLoader;
  private readonly container: HTMLElement;
  private disposed = false;
  /** `true` mientras hay una conversión en curso. Ver {@link wireEvents}. */
  private loading = false;
  /** Modelos ya presentes en la escena. Ver {@link wireEvents}. */
  private modelCount = 0;

  private constructor(
    components: OBC.Components,
    world: World,
    fragments: OBC.FragmentsManager,
    ifcLoader: OBC.IfcLoader,
    container: HTMLElement,
  ) {
    this.components = components;
    this.world = world;
    this.fragments = fragments;
    this.ifcLoader = ifcLoader;
    this.container = container;
  }

  /**
   * Monta la escena en `container` y deja el visor listo para recibir un IFC.
   *
   * Llamarlo dos veces con el mismo contenedor devuelve **la misma instancia**: ver la
   * nota de {@link porContenedor} sobre por qué un visor no se puede recrear.
   */
  static async create(container: HTMLElement, options: BimViewerOptions = {}): Promise<BimViewer> {
    const existente = porContenedor.get(container);
    if (existente) return existente;

    const creando = BimViewer.build(container, options);
    porContenedor.set(container, creando);
    return creando;
  }

  private static async build(
    container: HTMLElement,
    options: BimViewerOptions,
  ): Promise<BimViewer> {
    const components = new OBC.Components();

    const worlds = components.get(OBC.Worlds);
    const world: World = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);
    world.scene.setup();

    components.init();

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(await OBC.FragmentsManager.getWorker());

    const ifcLoader = components.get(OBC.IfcLoader);
    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: { path: options.wasmPath ?? DEFAULT_WASM_PATH, absolute: true },
    });

    const viewer = new BimViewer(components, world, fragments, ifcLoader, container);
    viewer.wireEvents();
    return viewer;
  }

  /**
   * Conecta los eventos de la escena.
   *
   * Las guardas (`loading`, `modelCount`) son **medidas defensivas**: Fragments atiende
   * al worker en serie, así que no se le piden refrescos mientras convierte ni antes de
   * que exista un modelo. Se agregaron investigando el cuelgue de `F0.4` y **no son su
   * causa** — el síntoma persiste con y sin ellas. Se conservan porque pedir trabajo a
   * un worker ocupado o vacío no tiene sentido, no porque arreglen ese problema.
   */
  private wireEvents(): void {
    // Fragments dibuja por niveles según la cámara: sin refrescar al terminar de mover,
    // el modelo se queda en la resolución con que entró.
    this.world.camera.controls.addEventListener("rest", () => {
      if (this.loading || this.modelCount === 0) return;
      void this.fragments.core.update(true);
    });

    // Solo se cuelga el modelo de la escena. El refresco lo hace `loadIfc` cuando la
    // conversión ya terminó, que es el único momento en que es seguro pedirlo.
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.modelCount += 1;
    });
  }

  /**
   * Convierte un IFC a Fragments, lo agrega a la escena y devuelve lo que costó.
   *
   * `coordinate` va en `true`: alinea varios modelos entre sí usando su
   * georreferenciación, que es lo que permite ver arquitectura y estructura juntas
   * en el mismo lugar.
   */
  async loadIfc(
    bytes: Uint8Array,
    name: string,
    onStage: (stage: LoadStage) => void = () => {},
  ): Promise<LoadedModel> {
    this.assertAlive();

    const startedAt = performance.now();
    this.loading = true;
    let model: FRAGS.FragmentsModel;
    onStage("converting");
    try {
      model = await this.ifcLoader.load(bytes, true, name);
    } finally {
      // Se libera el guardia incluso si la conversión falla; si no, el visor se queda
      // sin refrescos para siempre después de un IFC roto.
      this.loading = false;
    }
    const convertMs = performance.now() - startedAt;

    onStage("reading");
    const [categories, itemsWithGeometry] = await Promise.all([
      model.getCategories(),
      model.getItemsWithGeometry(),
    ]);

    onStage("drawing");
    await this.fragments.core.update(true);

    onStage("framing");
    const sizeM = await this.fitTo(model);
    const displayMs = performance.now() - startedAt;
    onStage("done");

    return {
      id: model.modelId,
      name,
      model,
      metrics: {
        ifcBytes: bytes.byteLength,
        convertMs,
        displayMs,
        categoryCount: categories.length,
        itemsWithGeometry: itemsWithGeometry.length,
        sizeM,
      },
    };
  }

  /**
   * Encuadra la cámara sobre el modelo y devuelve sus dimensiones en metros.
   *
   * Devuelve `null` cuando no logra determinar la caja: un modelo sin geometría, o uno
   * cuyos fragmentos todavía no llegaron del worker. Nunca inventa una caja por
   * defecto — encuadrar sobre una caja falsa deja al usuario mirando el vacío sin
   * entender por qué.
   */
  async fitTo(model: FRAGS.FragmentsModel): Promise<readonly [number, number, number] | null> {
    this.assertAlive();

    const box = await this.boxOf(model);
    if (box === null || box.isEmpty()) return null;

    // El segundo argumento es `enableTransition`, y va en **false** a propósito.
    //
    // Con la transición activada, `fitToBox` devuelve una promesa que solo se resuelve
    // cuando la animación de cámara termina, y esa animación avanza con
    // `requestAnimationFrame`. Si la pestaña está en segundo plano, rAF no corre y el
    // `await` no vuelve nunca. Encuadrar de golpe además es lo correcto acá: animar
    // desde una cámara arbitraria hacia un modelo recién abierto no aporta nada.
    await this.world.camera.controls.fitToBox(box, false);

    const size = box.getSize(new THREE.Vector3());
    return [size.x, size.y, size.z];
  }

  /** Caja envolvente del modelo, preguntando primero a Fragments y cayendo a la escena. */
  private async boxOf(model: FRAGS.FragmentsModel): Promise<THREE.Box3 | null> {
    const boxes = await model.getBoxes();
    if (boxes.length > 0) {
      const union = new THREE.Box3();
      for (const box of boxes) union.union(box);
      if (!union.isEmpty()) return union;
    }

    const fromScene = new THREE.Box3().setFromObject(model.object);
    return fromScene.isEmpty() ? null : fromScene;
  }

  /**
   * Libera la escena, el renderer y los workers de Fragments.
   *
   * **Es un camino sin retorno**: por la limitación descrita en {@link porContenedor},
   * después de esto no se puede crear otro visor en el mismo documento. Se reserva para
   * el cierre real de la vista, no para un desmontaje de React.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    porContenedor.delete(this.container);
    this.components.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("BimViewer: el visor ya fue liberado");
    }
  }
}
