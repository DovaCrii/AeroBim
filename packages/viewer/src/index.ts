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
import * as FRAGS from "@thatopen/fragments";
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
export type LoadStage = "converting" | "loading" | "reading" | "drawing" | "framing" | "done";

/** Lo que costó abrir un modelo. La respuesta a `F0.4` y `F0.5` sale de acá. */
export interface LoadMetrics {
  /** Tamaño del IFC de entrada. */
  readonly ifcBytes: number;
  /** Tamaño del Fragments resultante. Comparado con `ifcBytes` da el factor de ahorro. */
  readonly fragBytes: number;
  /** Milisegundos de la conversión IFC → Fragments. */
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

/**
 * Falla temprano y con un mensaje útil si la página tiene aislamiento de origen.
 *
 * `web-ifc` elige su WASM multihilo cuando `crossOriginIsolated` es `true`, y esa
 * variante **no funciona empaquetada**: Emscripten lanza los workers de pthreads con una
 * URL `undefined`, el navegador recibe el `index.html` en su lugar y el worker muere con
 * `Unexpected token '<'`. La promesa de conversión nunca se rechaza, así que sin esta
 * comprobación el síntoma es una interfaz esperando para siempre, con la consola limpia.
 *
 * `IfcImporter` no expone el `forceSingleThread` de `IfcAPI.Init`, así que la única
 * palanca es no servir las cabeceras COOP/COEP. Un error explícito al arrancar es
 * infinitamente preferible a un cuelgue silencioso al abrir el primer modelo.
 */
function assertNotCrossOriginIsolated(): void {
  if (typeof globalThis.crossOriginIsolated === "boolean" && globalThis.crossOriginIsolated) {
    throw new Error(
      "BimViewer: la pagina tiene aislamiento de origen (crossOriginIsolated=true), y en " +
        "ese modo web-ifc usa un WASM multihilo que no funciona empaquetado: la conversion " +
        "se queda esperando sin emitir error. Quitar las cabeceras Cross-Origin-Opener-Policy " +
        "y Cross-Origin-Embedder-Policy del servidor.",
    );
  }
}

export class BimViewer {
  private readonly components: OBC.Components;
  private readonly world: World;
  private readonly fragments: OBC.FragmentsManager;
  private readonly container: HTMLElement;
  private readonly wasmPath: string;
  private disposed = false;
  /** `true` mientras hay una conversión en curso. Ver {@link wireEvents}. */
  private loading = false;
  /** Modelos ya presentes en la escena. Ver {@link wireEvents}. */
  private modelCount = 0;

  private constructor(
    components: OBC.Components,
    world: World,
    fragments: OBC.FragmentsManager,
    container: HTMLElement,
    wasmPath: string,
  ) {
    this.components = components;
    this.world = world;
    this.fragments = fragments;
    this.container = container;
    this.wasmPath = wasmPath;
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
    assertNotCrossOriginIsolated();

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

    const viewer = new BimViewer(
      components,
      world,
      fragments,
      container,
      options.wasmPath ?? DEFAULT_WASM_PATH,
    );
    viewer.wireEvents();
    return viewer;
  }

  /**
   * Conecta los eventos de la escena.
   *
   * Las guardas (`loading`, `modelCount`) evitan pedirle trabajo al worker mientras
   * convierte o cuando todavía no hay nada que dibujar. Fragments lo atiende en serie,
   * así que un refresco a destiempo solo puede estorbar.
   */
  private wireEvents(): void {
    // Fragments dibuja por niveles según la cámara: sin refrescar al terminar de mover,
    // el modelo se queda en la resolución con que entró.
    this.world.camera.controls.addEventListener("rest", () => {
      if (this.loading || this.modelCount === 0) return;
      void this.fragments.core.update(true);
    });

    // Solo se cuelga el modelo de la escena. El refresco lo hace `loadIfc` cuando la
    // carga ya terminó, que es el único momento en que es seguro pedirlo.
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.modelCount += 1;
    });
  }

  /**
   * Convierte un IFC a Fragments, lo carga en la escena y devuelve lo que costó.
   *
   * **Se usa `IfcImporter` y `core.load` en vez de `IfcLoader.load`**, que es el atajo
   * que ofrece `@thatopen/components`. Ese atajo no completaba de forma reproducible y
   * no emitía ningún error (ver `MASTER_PLAN.md` → _Estado de `F0.4`_); esta ruta hace
   * los dos pasos explícitos, se puede medir por separado y encaja con `F0.6`, que de
   * todos modos exige poder convertir en un lugar y mostrar en otro.
   */
  async loadIfc(
    bytes: Uint8Array,
    name: string,
    onStage: (stage: LoadStage) => void = () => {},
  ): Promise<LoadedModel> {
    this.assertAlive();

    const startedAt = performance.now();
    this.loading = true;

    let fragByteLength: number;
    let model: FRAGS.FragmentsModel;
    try {
      onStage("converting");
      // Un importador por carga: no arrastra estado del modelo anterior, y el costo de
      // inicializar el WASM otra vez son unas decenas de milisegundos.
      const importer = new FRAGS.IfcImporter();
      importer.wasm = { path: this.wasmPath, absolute: true };
      const fragments = await importer.process({ bytes });

      // El tamaño se anota **antes** de cargar: `core.load` transfiere el búfer al
      // worker, y un `ArrayBuffer` transferido queda con `byteLength` en 0. Leerlo
      // después reportaba "0 B" para todos los modelos.
      fragByteLength = fragments.byteLength;

      onStage("loading");
      model = await this.fragments.core.load(fragments, {
        modelId: name,
        camera: this.world.camera.three,
      });
    } finally {
      // Se libera el guardia incluso si falla; si no, el visor se queda sin refrescos
      // para siempre después de un IFC roto.
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
        fragBytes: fragByteLength,
        convertMs,
        displayMs,
        categoryCount: categories.length,
        itemsWithGeometry: itemsWithGeometry.length,
        sizeM,
      },
    };
  }

  /**
   * Cámara y controles de la escena.
   *
   * Se expone porque las vistas guardadas (`F1.6`) tienen que leer y restaurar la
   * posición de cámara, y los viewpoints de BCF (Fase 4) también.
   */
  get camera(): OBC.SimpleCamera {
    return this.world.camera;
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

    const size = box.getSize(new THREE.Vector3());

    // **Pendiente conocido (`F1.6`): la orientación inicial no se puede fijar desde acá.**
    //
    // El encuadre deja el modelo visto de canto —una planta de 22 m se ve como una franja
    // de 3 m de alto— y lo natural sería girar a una vista isométrica antes de encuadrar.
    // Se intentó con `setLookAt`, con `moveTo` y con `rotateTo`, y **ninguno surte efecto**:
    // medido después de llamarlos, la cámara sigue en `polar=90°` y `pos=(50, 50, 50)`,
    // que son sus valores iniciales. Algo en `SimpleCamera` de That Open no aplica estos
    // comandos, y averiguar qué es trabajo de la Fase 1, que necesita controles de vista
    // (planta, alzado, isométrica) de todos modos.
    //
    // Mientras tanto el modelo se ve y se puede orbitar con el ratón.
    //
    // El segundo argumento es `enableTransition`, y va en **false** a propósito.
    //
    // Con la transición activada, `fitToBox` devuelve una promesa que solo se resuelve
    // cuando la animación de cámara termina, y esa animación avanza con
    // `requestAnimationFrame`. Si la pestaña está en segundo plano, rAF no corre y el
    // `await` no vuelve nunca. Encuadrar de golpe además es lo correcto acá: animar
    // desde una cámara arbitraria hacia un modelo recién abierto no aporta nada.
    await this.world.camera.controls.fitToBox(box, false);

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
