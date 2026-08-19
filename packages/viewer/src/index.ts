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

import {
  angleAtDeg,
  distanceM,
  isIfcGuid,
  perimeterM,
  polygonAreaM2,
  type IfcGuid,
  type Point3,
} from "@aerobim/bim-core";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

/**
 * Mundo concreto que arma esta envoltura.
 *
 * La cámara es `OrthoPerspectiveCamera` y no `SimpleCamera`: trae la proyección
 * ortográfica —imprescindible para mirar un modelo como se mira un plano— y los modos de
 * navegación, sin costo para lo que ya funcionaba.
 */
type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>;

/** Cómo se proyecta la escena. La ortográfica es la de un plano: sin fuga de perspectiva. */
export type Projection = "Perspective" | "Orthographic";

/**
 * Cómo se navega la escena.
 *
 * - `Orbit`: girar alrededor del modelo. Lo normal.
 * - `Plan`: mirar de frente y desplazar, como sobre un plano.
 * - `FirstPerson`: recorrer el interior a la altura de los ojos.
 */
export type NavigationMode = "Orbit" | "Plan" | "FirstPerson";

/** Cómo se dibujan los elementos. */
export type RenderStyle = "solid" | "wireframe";

/** Qué se está midiendo. */
export type MeasureMode = "distance" | "angle" | "area";

/**
 * Una medición terminada.
 *
 * Las magnitudes están en metros y grados: la escena está en metros porque el factor de
 * unidades del IFC se aplicó al convertir.
 */
export type Measurement =
  | {
      readonly mode: "distance";
      readonly points: readonly THREE.Vector3[];
      readonly distanceM: number;
    }
  | { readonly mode: "angle"; readonly points: readonly THREE.Vector3[]; readonly angleDeg: number }
  | {
      readonly mode: "area";
      readonly points: readonly THREE.Vector3[];
      readonly areaM2: number;
      readonly perimeterM: number;
    };

/** Ejes sobre los que se puede cortar el modelo. */
export type SectionAxis = "horizontal" | "longitudinal" | "transversal";

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

/**
 * Un nodo del árbol espacial, ya listo para dibujar.
 *
 * El árbol que entrega Fragments trae solo categorías e identificadores; acá los nodos
 * llegan con su nombre resuelto y con **todos los identificadores que cuelgan debajo**, que
 * es lo que permite aislar una planta entera con un clic.
 */
export interface SpatialNode {
  /** Ruta única en el árbol. Sirve de clave estable al dibujar. */
  readonly key: string;
  /** Nombre del elemento, o su categoría cuando no tiene nombre. */
  readonly label: string;
  readonly category: string | null;
  readonly localId: number | null;
  /** Cuántos elementos cuelgan de este nodo. */
  readonly count: number;
  /** Identificadores de todo lo que cuelga del nodo, para aislar u ocultar de una vez. */
  readonly localIds: readonly number[];
  readonly children: readonly SpatialNode[];
  /**
   * Hijos que existen pero no se listan, por ser demasiados.
   *
   * Una categoría con 470 elementos convierte el árbol en una lista que nadie recorre. El
   * grupo sigue siendo aislable y ocultable completo; para llegar a un elemento concreto se
   * hace clic en el modelo.
   */
  readonly hiddenChildren: number;
}

/** El árbol espacial de un modelo cargado. */
export interface ModelTree {
  readonly modelId: string;
  readonly root: SpatialNode;
}

/** Un par nombre/valor ya legible, listo para mostrar. */
export interface PropertyValue {
  readonly name: string;
  readonly value: string;
}

/**
 * Un bloque de propiedades relacionadas con el elemento.
 *
 * Ahí caen los psets de IFC cuando el modelo los trae, y también el **tipo** y el
 * **material**, que llegan por las mismas relaciones. La distinción importa: un modelo
 * exportado sin psets —bastante común, es una casilla en el exportador— igual tiene tipo
 * y material, y esa información es justo la que alguien busca al clicar una viga.
 */
export interface PropertyGroup {
  readonly name: string;
  readonly properties: readonly PropertyValue[];
}

/** El elemento sobre el que se hizo clic. */
export interface PickedItem {
  readonly modelId: string;
  /**
   * Identificador interno de Fragments. **Sirve para hablar con el motor y nada más**:
   * cambia entre versiones del modelo. Para identidad, {@link guid}.
   */
  readonly localId: number;
  /**
   * GUID de IFC, validado. `null` si el elemento no lo trae o no es válido.
   *
   * Es la identidad estable del elemento y la que viaja en un BCF — ver `AGENTS.md`.
   */
  readonly guid: IfcGuid | null;
  readonly category: string | null;
  readonly name: string | null;
  /** Atributos directos del elemento. */
  readonly attributes: readonly PropertyValue[];
  /** Tipo, material y psets: todo lo que llega por relaciones. */
  readonly groups: readonly PropertyGroup[];
}

const DEFAULT_WASM_PATH = "/wasm/";

/** Ángulos de la vista isométrica: 45° alrededor del modelo, 60° desde la vertical. */
const ISO_AZIMUTH = Math.PI / 4;
const ISO_POLAR = Math.PI / 3;

/** Un fotograma a 60 Hz, para forzar el avance de los controles de cámara. */
const ONE_FRAME_S = 1 / 60;

/** Violeta de la marca, para el elemento seleccionado. */
const SELECTION_COLOR = 0x9b5de5;

/**
 * Espera al siguiente fotograma, con un plazo máximo.
 *
 * El respaldo por temporizador no es paranoia: `requestAnimationFrame` **no se dispara**
 * en una pestaña en segundo plano, y sin él una carga iniciada ahí se quedaría esperando
 * para siempre.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let listo = false;
    const terminar = () => {
      if (listo) return;
      listo = true;
      resolve();
    };
    requestAnimationFrame(terminar);
    setTimeout(terminar, 100);
  });
}

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
 * Atributos que no se listan: salen en campos propios de {@link PickedItem} o son
 * bookkeeping interno de Fragments, no información del modelo.
 */
const ATRIBUTOS_OCULTOS = new Set(["Name", "GlobalId", "_category", "_localId", "_guid"]);

/**
 * Relaciones que no vale la pena seguir.
 *
 * `ObjectTypeOf` es la vuelta del tipo hacia **todos los demás elementos que comparten
 * ese tipo**: en el modelo de prueba, clicar una viga traía siete vigas hermanas. No es
 * información del elemento y además cierra un ciclo.
 */
const RELACIONES_IGNORADAS = new Set(["ObjectTypeOf", "IsDecomposedBy", "ContainsElements"]);

/** `true` si el valor es un atributo escalar y no una lista de elementos relacionados. */
function esAtributo(valor: FRAGS.ItemAttribute | FRAGS.ItemData[]): valor is FRAGS.ItemAttribute {
  return !Array.isArray(valor);
}

/**
 * Texto legible de un atributo de IFC.
 *
 * Los valores llegan envueltos y con formas variadas: escalares, objetos con `value`
 * anidado (el patrón de `IfcPropertySingleValue`), booleanos y números. Devuelve `null`
 * cuando no hay nada que mostrar, para no llenar la tabla de "undefined".
 */
function textoDe(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (typeof valor === "string") return valor;
  if (typeof valor === "number") {
    // Los decimales de un IFC traen ruido de coma flotante: 2.9800000000000004.
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(3).replace(/\.?0+$/, "");
  }
  if (typeof valor === "boolean") return valor ? "sí" : "no";

  if (typeof valor === "object") {
    const anidado = (valor as { value?: unknown }).value;
    if (anidado !== undefined && anidado !== valor) return textoDe(anidado);
  }

  return null;
}

/** Nombre de un `ItemData`, para psets y propiedades. */
function nombreDe(item: FRAGS.ItemData): string | null {
  const campo = item["Name"];
  return campo !== undefined && esAtributo(campo) ? textoDe(campo.value) : null;
}

/**
 * Pasa un vector de la escena al punto del dominio.
 *
 * La geometría de las mediciones vive en `bim-core`, donde está probada contra casos
 * elementales sin necesitar un navegador. Acá solo se traduce el tipo.
 */
function toPoint3(v: THREE.Vector3): Point3 {
  return [v.x, v.y, v.z];
}

/** Recorre el árbol en profundidad aplicando `visitar` a cada nodo. */
function forEachNode(node: FRAGS.SpatialTreeItem, visitar: (node: FRAGS.SpatialTreeItem) => void) {
  visitar(node);
  for (const hijo of node.children ?? []) forEachNode(hijo, visitar);
}

/** Nombres de un conjunto de elementos, en una sola consulta. */
async function namesOf(
  model: FRAGS.FragmentsModel,
  localIds: readonly number[],
): Promise<Map<number, string>> {
  const nombres = new Map<number, string>();
  if (localIds.length === 0) return nombres;

  const datos = await model.getItemsData([...localIds], {
    attributesDefault: false,
    attributes: ["Name", "LongName"],
  });

  for (const dato of datos) {
    const idCampo = dato["_localId"];
    if (idCampo === undefined || !esAtributo(idCampo)) continue;
    const id = idCampo.value;
    if (typeof id !== "number") continue;

    // `LongName` es lo que muchos exportadores usan en plantas y edificios, donde `Name`
    // queda con un código interno.
    const nombre = nombreDe(dato) ?? textoDe((dato["LongName"] as FRAGS.ItemAttribute)?.value);
    if (nombre !== null) nombres.set(id, nombre);
  }

  return nombres;
}

/**
 * Techo de elementos cuyos nombres se consultan de una vez.
 *
 * Por encima solo se nombran los contenedores: los elementos individuales no se listan, así
 * que su nombre no se usaría.
 */
const MAX_NOMBRES = 2000;

/** Hijos que un nodo lista antes de plegarse a un solo grupo. Ver `hiddenChildren`. */
const MAX_HIJOS_LISTADOS = 30;

/** Etiqueta legible de una categoría IFC: `IFCBUILDINGSTOREY` → `Planta`. */
const ETIQUETAS: Record<string, string> = {
  IFCPROJECT: "Proyecto",
  IFCSITE: "Sitio",
  IFCBUILDING: "Edificio",
  IFCBUILDINGSTOREY: "Planta",
  IFCSPACE: "Recinto",
};

/**
 * Convierte el árbol crudo en {@link SpatialNode}.
 *
 * **Fragments ya agrupa por categoría**, y conviene saber cómo antes de tocar esto: un nodo
 * con `category` y sin `localId` es un **grupo** (`IFCBEAM`, `IFCDOOR`), y sus hijos —con
 * `localId` y sin `category`— son los elementos. Intentar reagrupar produce niveles
 * fantasma etiquetados "sin categoría".
 *
 * La categoría se hereda del grupo al elemento, porque el elemento no la trae.
 */
function buildNode(
  raw: FRAGS.SpatialTreeItem,
  nombres: Map<number, string>,
  key: string,
  categoriaHeredada: string | null,
): SpatialNode {
  const category = raw.category ?? categoriaHeredada;

  const children = (raw.children ?? []).map((hijo, indice) =>
    buildNode(hijo, nombres, `${key}.${indice}`, category),
  );

  const localIds = [
    ...(raw.localId !== null ? [raw.localId] : []),
    ...children.flatMap((hijo) => hijo.localIds),
  ];

  const esGrupo = raw.localId === null;
  const nombre = raw.localId !== null ? nombres.get(raw.localId) : undefined;
  const etiquetaTipo = category !== null ? (ETIQUETAS[category] ?? category) : "Elemento";

  let label: string;
  if (esGrupo) {
    label = `${etiquetaTipo} (${localIds.length})`;
  } else if (nombre !== undefined) {
    label = nombre;
  } else {
    // Sin nombre, el identificador es lo único que distingue un elemento de otro.
    label = `${etiquetaTipo} #${raw.localId}`;
  }

  // Un grupo con cientos de elementos no se lista: ver `hiddenChildren`.
  const listables = children.length <= MAX_HIJOS_LISTADOS ? children : [];

  return {
    key,
    label,
    category,
    localId: raw.localId,
    count: localIds.length,
    localIds,
    children: listables,
    hiddenChildren: children.length - listables.length,
  };
}

/** Categoría IFC de un objeto (`IFCBEAMTYPE`, `IFCMATERIAL`, …). */
function categoriaDe(item: FRAGS.ItemData): string | null {
  const campo = item["_category"];
  return campo !== undefined && esAtributo(campo) ? textoDe(campo.value) : null;
}

/** GUID de IFC validado contra el dominio, o `null` si no lo trae o no es válido. */
function guidDe(item: FRAGS.ItemData): IfcGuid | null {
  for (const clave of ["_guid", "GlobalId"]) {
    const campo = item[clave];
    if (campo === undefined || !esAtributo(campo)) continue;
    const texto = textoDe(campo.value);
    // Se valida con `bim-core` en vez de confiar en el string: un GUID mal formado no
    // sirve como identidad, y es mejor saberlo acá que al exportar un BCF.
    if (texto !== null && isIfcGuid(texto)) return texto;
  }
  return null;
}

/** Atributos escalares de un objeto, sin los internos. */
function atributosDe(item: FRAGS.ItemData, omitir: Set<string>): PropertyValue[] {
  const propiedades: PropertyValue[] = [];

  for (const [clave, contenido] of Object.entries(item)) {
    if (!esAtributo(contenido) || omitir.has(clave) || clave.startsWith("_")) continue;

    // Una propiedad de pset guarda su valor aparte del nombre; un atributo normal lo trae
    // directo. Se prueban las claves de valor conocidas antes de rendirse.
    const texto = textoDe(contenido.value);
    if (texto !== null) propiedades.push({ name: clave, value: texto });
  }

  return propiedades;
}

/**
 * Propiedades de un `IfcPropertySet`, cuando el modelo trae psets.
 *
 * Cada propiedad cuelga de `HasProperties` con su nombre y un valor que, según el tipo
 * IFC, vive en una clave distinta.
 */
function propiedadesDePset(pset: FRAGS.ItemData): PropertyValue[] {
  const lista = pset["HasProperties"];
  if (!Array.isArray(lista)) return [];

  const propiedades: PropertyValue[] = [];
  for (const propiedad of lista) {
    const name = nombreDe(propiedad);
    if (name === null) continue;

    for (const clave of ["NominalValue", "Value", "LengthValue", "AreaValue", "VolumeValue"]) {
      const campo = propiedad[clave];
      if (campo === undefined || !esAtributo(campo)) continue;
      const value = textoDe(campo.value);
      if (value !== null) {
        propiedades.push({ name, value });
        break;
      }
    }
  }

  return propiedades;
}

/**
 * Convierte un objeto relacionado en un bloque mostrable.
 *
 * Devuelve `null` si no aporta nada. Baja **un solo nivel más** por sus propias
 * relaciones, que es lo que hace falta para llegar al material a través del tipo, y no
 * más: seguir el grafo de IFC sin límite lleva a listar medio modelo.
 */
function grupoDe(relacionado: FRAGS.ItemData, claveRelacion: string): PropertyGroup[] {
  const grupos: PropertyGroup[] = [];
  const categoria = categoriaDe(relacionado);
  const nombre = nombreDe(relacionado);

  // Un pset real: sus propiedades están en `HasProperties`.
  const desdePset = propiedadesDePset(relacionado);
  const propias = desdePset.length > 0 ? desdePset : atributosDe(relacionado, new Set());

  if (propias.length > 0) {
    // El encabezado dice qué es esto: "IFCBEAMTYPE · Concrete, Plain 510.29" es mucho más
    // útil que "IsDefinedBy".
    const encabezado = [categoria, nombre].filter((parte) => parte !== null).join(" · ");
    grupos.push({ name: encabezado === "" ? claveRelacion : encabezado, properties: propias });
  }

  for (const [clave, contenido] of Object.entries(relacionado)) {
    if (!Array.isArray(contenido) || RELACIONES_IGNORADAS.has(clave)) continue;

    for (const anidado of contenido) {
      if (typeof anidado !== "object" || anidado === null) continue;
      const propiedades = atributosDe(anidado, new Set());
      if (propiedades.length === 0) continue;

      const sub = [categoriaDe(anidado), nombreDe(anidado)]
        .filter((parte) => parte !== null)
        .join(" · ");
      grupos.push({ name: sub === "" ? clave : sub, properties: propiedades });
    }
  }

  return grupos;
}

/** Arma un {@link PickedItem} a partir de los datos crudos del modelo. */
function describeItem(
  modelId: string,
  localId: number,
  data: FRAGS.ItemData | undefined,
): PickedItem {
  if (!data) {
    return { modelId, localId, guid: null, category: null, name: null, attributes: [], groups: [] };
  }

  const groups: PropertyGroup[] = [];
  for (const [clave, contenido] of Object.entries(data)) {
    if (!Array.isArray(contenido) || RELACIONES_IGNORADAS.has(clave)) continue;
    for (const relacionado of contenido) {
      if (typeof relacionado !== "object" || relacionado === null) continue;
      groups.push(...grupoDe(relacionado, clave));
    }
  }

  const nombrePropio = nombreDe(data);

  return {
    modelId,
    localId,
    guid: guidDe(data),
    category: categoriaDe(data),
    // Muchos elementos no tienen nombre propio —las vigas del modelo de prueba, por
    // ejemplo— y el nombre útil es el de su tipo. Se toma prestado en vez de mostrar
    // "sin nombre" cuando hay algo mejor a mano.
    name: nombrePropio ?? groups.find((grupo) => grupo.name.includes("TYPE"))?.name ?? null,
    attributes: atributosDe(data, ATRIBUTOS_OCULTOS),
    groups,
  };
}

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
  private renderStyle: RenderStyle = "solid";
  private measurementLine: THREE.Line | null = null;
  private measureMode: MeasureMode | null = null;
  /** Puntos de la medición en curso. Ver {@link addMeasurePoint}. */
  private measurePoints: THREE.Vector3[] = [];

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
    const world: World = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();
    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);
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
   * Qué elemento hay bajo un punto de la pantalla, con sus propiedades.
   *
   * Devuelve `null` si ahí no hay nada, que es la mitad de los clics en un visor y no es
   * un error.
   *
   * Las coordenadas van en píxeles de la ventana (`clientX` / `clientY` de un evento de
   * ratón); la conversión al espacio del lienzo ocurre acá, para que quien llame no tenga
   * que saber dónde está el canvas.
   */
  async pickAt(clientX: number, clientY: number): Promise<PickedItem | null> {
    this.assertAlive();

    const canvas = this.world.renderer?.three.domElement;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const result = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(clientX - rect.left, clientY - rect.top),
      dom: canvas,
    });
    if (!result) return null;

    const model = result.fragments;
    const [data] = await model.getItemsData([result.localId], {
      attributesDefault: true,
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOcurrence: { attributes: true, relations: false },
        HasAssociations: { attributes: true, relations: false },
      },
    });

    await this.highlight(model.modelId, result.localId);

    return describeItem(model.modelId, result.localId, data);
  }

  /** Pinta el elemento seleccionado y apaga el resaltado anterior. */
  private async highlight(modelId: string, localId: number): Promise<void> {
    await this.fragments.resetHighlight();
    await this.fragments.highlight(
      {
        color: new THREE.Color(SELECTION_COLOR),
        renderedFaces: FRAGS.RenderedFaces.TWO,
        opacity: 1,
        transparent: false,
      },
      { [modelId]: new Set([localId]) },
    );
    await this.fragments.core.update(true);
  }

  /** Quita el resaltado de selección. */
  async clearSelection(): Promise<void> {
    this.assertAlive();
    await this.fragments.resetHighlight();
    await this.fragments.core.update(true);
  }

  /**
   * Cámara y controles de la escena.
   *
   * Se expone porque las vistas guardadas (`F1.6`) tienen que leer y restaurar la
   * posición de cámara, y los viewpoints de BCF (Fase 4) también.
   */
  get camera(): OBC.OrthoPerspectiveCamera {
    return this.world.camera;
  }

  /**
   * Cambia entre perspectiva y ortográfica.
   *
   * La ortográfica es la que sirve para leer un modelo como un plano: sin fuga, dos muros
   * del mismo largo se ven del mismo largo. Es la vista con la que trabaja la oficina
   * técnica.
   */
  async setProjection(projection: Projection): Promise<void> {
    this.assertAlive();
    await this.world.camera.projection.set(projection);
    // Cambiar de proyección sustituye el objeto de cámara, así que hay que decírselo a los
    // modelos: si no, siguen calculando el nivel de detalle con la cámara anterior.
    for (const [, model] of this.fragments.list) {
      model.useCamera(this.world.camera.three);
    }
    await this.fragments.core.update(true);
  }

  /** Proyección actual. */
  get projection(): Projection {
    return this.world.camera.projection.current;
  }

  /** Cambia el modo de navegación. */
  setNavigationMode(mode: NavigationMode): void {
    this.assertAlive();
    this.world.camera.set(mode);
  }

  /**
   * Árbol espacial de cada modelo cargado: proyecto → sitio → edificio → planta →
   * elementos.
   *
   * Los nombres se resuelven en **una sola consulta por modelo** en vez de una por nodo:
   * son decenas de contenedores y cientos de elementos, y preguntar de uno en uno hace
   * que abrir el árbol tarde más que abrir el modelo.
   */
  async getSpatialTrees(): Promise<ModelTree[]> {
    this.assertAlive();

    const trees: ModelTree[] = [];
    for (const [modelId, model] of this.fragments.list) {
      const raw = await model.getSpatialStructure();

      const todos: number[] = [];
      forEachNode(raw, (node) => {
        if (node.localId !== null) todos.push(node.localId);
      });

      // Se piden los nombres de todos los elementos en **una** consulta mientras el modelo
      // sea de tamaño razonable. Por encima de ese techo solo se nombran los contenedores:
      // los elementos individuales ni se listan, así que su nombre no se usaría.
      const aConsultar =
        todos.length <= MAX_NOMBRES
          ? todos
          : todos.filter((id) => {
              let esContenedor = false;
              forEachNode(raw, (node) => {
                if (node.localId === id && (node.children?.length ?? 0) > 0) esContenedor = true;
              });
              return esContenedor;
            });

      trees.push({ modelId, root: buildNode(raw, await namesOf(model, aConsultar), "0", null) });
    }

    return trees;
  }

  /**
   * Alterna entre sólido y malla.
   *
   * Se hace pintando los materiales de todos los modelos: el sólido se vuelve casi
   * transparente y las aristas quedan a la vista. **No es un wireframe verdadero** —
   * Fragments tiene una representación de alambre (`CurrentLod.WIRES`) pero la reserva para
   * su nivel de detalle automático y no la expone para forzarla— y conviene llamarlo por su
   * nombre: es una vista fantasma, útil para ver qué hay detrás de un muro.
   */
  async setRenderStyle(style: RenderStyle): Promise<void> {
    this.assertAlive();

    if (style === "solid") {
      await this.fragments.resetHighlight();
    } else {
      await this.fragments.highlight({
        color: new THREE.Color(0xffffff),
        renderedFaces: FRAGS.RenderedFaces.TWO,
        opacity: 0.15,
        transparent: true,
      });
    }

    this.renderStyle = style;
    await this.fragments.core.update(true);
  }

  /** Estilo de representación actual. */
  get style(): RenderStyle {
    return this.renderStyle;
  }

  /**
   * Fija qué se mide, o `null` para salir del modo medición.
   *
   * Cambiar de modo descarta lo que hubiera a medias: mezclar puntos de una distancia con
   * los de un área da un número sin sentido.
   */
  setMeasureMode(mode: MeasureMode | null): void {
    this.assertAlive();
    this.measureMode = mode;
    this.resetMeasurement();
  }

  /**
   * Suma un punto a la medición en curso y devuelve el resultado cuando ya hay bastantes.
   *
   * Cuántos hacen falta depende del modo: dos para una distancia, tres para un ángulo, y a
   * partir de tres el área **se recalcula con cada vértice nuevo**, así que se ve crecer
   * mientras se recorre el contorno.
   *
   * Devuelve `null` mientras faltan puntos, y también si el clic cayó al vacío. El ciclo
   * vive acá y no en la interfaz a propósito: quien la use no necesita tocar vectores de
   * Three.js ni saber cómo se ajusta un punto a una arista.
   */
  async addMeasurePoint(clientX: number, clientY: number): Promise<Measurement | null> {
    this.assertAlive();
    if (this.measureMode === null) return null;

    const punto = await this.snapAt(clientX, clientY);
    if (punto === null) return null;

    this.measurePoints.push(punto);
    const puntos = this.measurePoints;

    if (this.measureMode === "distance") {
      if (puntos.length < 2) return null;
      const [a, b] = [puntos[0]!, puntos[1]!];
      this.drawPolyline([a, b]);
      this.measurePoints = [];
      return {
        mode: "distance",
        points: [a, b],
        distanceM: distanceM(toPoint3(a), toPoint3(b)),
      };
    }

    if (this.measureMode === "angle") {
      if (puntos.length < 3) return null;
      const [a, b, c] = [puntos[0]!, puntos[1]!, puntos[2]!];
      this.drawPolyline([a, b, c]);
      this.measurePoints = [];
      return {
        mode: "angle",
        points: [a, b, c],
        angleDeg: angleAtDeg(toPoint3(a), toPoint3(b), toPoint3(c)),
      };
    }

    // Área: el contorno sigue abierto, así que se acumula y se recalcula con cada vértice.
    if (puntos.length < 3) {
      this.drawPolyline(puntos);
      return null;
    }
    this.drawPolyline([...puntos, puntos[0]!]);
    const contorno = puntos.map(toPoint3);
    return {
      mode: "area",
      points: [...puntos],
      areaM2: polygonAreaM2(contorno),
      perimeterM: perimeterM([...contorno, contorno[0]!]),
    };
  }

  /** Descarta la medición en curso y la dibujada. */
  resetMeasurement(): void {
    this.measurePoints = [];
    this.clearMeasurements();
  }

  /**
   * Corta el modelo con un plano que pasa por su centro.
   *
   * Los tres ejes cubren lo que se pide en la práctica: un corte **horizontal** para mirar
   * una planta desde arriba sin la cubierta, y dos **verticales** para ver el interior. El
   * plano se puede arrastrar después con el ratón.
   *
   * Se usa `createFromNormalAndCoplanarPoint` y no `create`, que coloca el plano donde
   * apunte el cursor: un corte por el centro es predecible, y es lo que alguien espera al
   * pulsar un botón llamado "corte horizontal".
   */
  async addSection(axis: SectionAxis): Promise<void> {
    this.assertAlive();

    const clipper = this.components.get(OBC.Clipper);
    clipper.enabled = true;

    const centro = new THREE.Vector3();
    const caja = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      const suya = await this.boxOf(model);
      if (suya !== null) caja.union(suya);
    }
    if (caja.isEmpty()) return;
    caja.getCenter(centro);

    const normales: Record<SectionAxis, THREE.Vector3> = {
      horizontal: new THREE.Vector3(0, 1, 0),
      longitudinal: new THREE.Vector3(1, 0, 0),
      transversal: new THREE.Vector3(0, 0, 1),
    };

    clipper.createFromNormalAndCoplanarPoint(this.world, normales[axis], centro);
    await this.fragments.core.update(true);
  }

  /**
   * Cuántos planos de corte hay activos.
   *
   * Se expone para poder comprobar que un corte se creó de verdad. A ojo cuesta distinguir
   * "el corte no se aplicó" de "el corte cayó donde no se ve nada".
   */
  get sectionCount(): number {
    return this.components.get(OBC.Clipper).list.size;
  }

  /** Quita todos los planos de corte. */
  async clearSections(): Promise<void> {
    this.assertAlive();

    const clipper = this.components.get(OBC.Clipper);
    clipper.deleteAll();
    clipper.enabled = false;
    await this.fragments.core.update(true);
  }

  /**
   * Punto exacto de la geometría bajo el cursor, con ajuste a vértices y aristas.
   *
   * Devuelve `null` si ahí no hay nada. El ajuste importa para medir: sin él, cada clic cae
   * en un punto arbitrario de una cara y dos personas midiendo el mismo muro obtienen
   * números distintos.
   */
  async snapAt(clientX: number, clientY: number): Promise<THREE.Vector3 | null> {
    this.assertAlive();

    const canvas = this.world.renderer?.three.domElement;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const result = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(clientX - rect.left, clientY - rect.top),
      dom: canvas,
      // El orden es la preferencia: primero vértice, luego arista, y la cara como respaldo.
      // Sin `FACE` un clic en el medio de un muro no devuelve nada, y medir se vuelve un
      // juego de puntería contra las esquinas.
      snappingClasses: [
        FRAGS.SnappingClass.POINT,
        FRAGS.SnappingClass.LINE,
        FRAGS.SnappingClass.FACE,
      ],
    });

    return result?.point.clone() ?? null;
  }

  /** Dibuja el trazo de la medición, reemplazando el anterior. */
  private drawPolyline(points: readonly THREE.Vector3[]): void {
    this.clearMeasurements();
    if (points.length < 2) return;

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([...points]),
      new THREE.LineBasicMaterial({ color: SELECTION_COLOR, depthTest: false }),
    );
    // Se dibuja por encima de la geometría: una cota escondida dentro de un muro no sirve.
    line.renderOrder = 1;

    this.measurementLine = line;
    this.world.scene.three.add(line);
  }

  /** Quita la medición dibujada. */
  clearMeasurements(): void {
    if (this.measurementLine === null) return;

    this.world.scene.three.remove(this.measurementLine);
    this.measurementLine.geometry.dispose();
    // El material es propio de esta línea, así que se libera con ella.
    (this.measurementLine.material as THREE.Material).dispose();
    this.measurementLine = null;
  }

  /** Muestra u oculta un conjunto de elementos de un modelo. */
  async setVisible(modelId: string, localIds: readonly number[], visible: boolean): Promise<void> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return;

    await model.setVisible([...localIds], visible);
    await this.fragments.core.update(true);
  }

  /**
   * Deja visibles **solo** estos elementos, en todos los modelos.
   *
   * Es la operación que hace útil al árbol: ver una planta sin el resto del edificio
   * encima.
   */
  async isolate(modelId: string, localIds: readonly number[]): Promise<void> {
    this.assertAlive();

    for (const [id, model] of this.fragments.list) {
      // `undefined` afecta a todos los elementos del modelo.
      await model.setVisible(undefined, false);
      if (id === modelId) await model.setVisible([...localIds], true);
    }
    await this.fragments.core.update(true);
  }

  /** Vuelve a mostrar todo. */
  async showAll(): Promise<void> {
    this.assertAlive();

    for (const [, model] of this.fragments.list) {
      await model.setVisible(undefined, true);
    }
    await this.fragments.core.update(true);
  }

  /**
   * Encuadra todos los modelos de la escena en vista isométrica.
   *
   * Existe como acción a demanda porque un visor la necesita —uno se pierde orbitando y
   * quiere volver— y porque el encuadre automático al cargar no siempre gana: algo del
   * ciclo de vida de That Open reencuadra después, y con el botón el usuario recupera la
   * vista en un clic sin que importe quién movió la cámara al final.
   */
  async frameAll(): Promise<void> {
    this.assertAlive();

    const union = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      const box = await this.boxOf(model);
      if (box !== null) union.union(box);
    }
    if (union.isEmpty()) return;

    this.applyFraming(union);
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

    // Se encuadra dos veces a propósito. Al terminar de cargar, el lienzo todavía puede
    // estar cambiando de tamaño —aparece el panel de propiedades, el de métricas, el
    // contenedor crece— y un encuadre calculado con la relación de aspecto anterior deja
    // el modelo mal situado. El segundo pase, ya en el fotograma siguiente, lo corrige.
    this.applyFraming(box);
    await nextFrame();
    this.applyFraming(box);

    return [size.x, size.y, size.z];
  }

  /**
   * Orienta y encuadra la cámara sobre `box`.
   *
   * Todo va sin transición y con un `update` explícito al final, y las tres cosas
   * importan:
   *
   * - **Vista isométrica primero.** `fitToBox` conserva la dirección en que mira la
   *   cámara, y la inicial deja una planta de edificio vista de canto: 22 m de ancho por
   *   3 m de alto, una franja en la que no se reconoce nada.
   * - **Sin transición.** Con la animación activada, la promesa de `fitToBox` solo se
   *   resuelve cuando termina, y la animación avanza con `requestAnimationFrame`: en una
   *   pestaña de fondo no vuelve nunca. Además, animar desde una cámara arbitraria hacia
   *   un modelo recién abierto no aporta nada.
   * - **El `update` no es opcional.** camera-controls registra los ángulos y el objetivo
   *   al instante, pero solo mueve la cámara dentro de `update(delta)`. Verificado: sin
   *   esta llamada la posición se queda en `(50, 50, 50)`, su valor inicial.
   */
  private applyFraming(box: THREE.Box3): void {
    const controls = this.world.camera.controls;
    // El encuadre va **antes** del giro: `fitToBox` recoloca la cámara y con ello pisa los
    // ángulos, así que girar primero no dejaba rastro. Rotar después conserva el objetivo y
    // la distancia que el encuadre calculó.
    void controls.fitToBox(box, false);
    void controls.rotateTo(ISO_AZIMUTH, ISO_POLAR, false);
    controls.update(ONE_FRAME_S);
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
