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
  countIfcEntities,
  distancePartsM,
  emptyElementClasses,
  isIfcGuid,
  missingElementClasses,
  NO_IFC_UNITS,
  parseIfcUnits,
  perpendicularToPlane,
  resolveUnitSymbol,
  type IfcGuid,
  type IfcUnits,
  type MissingClass,
  type Point3,
} from "@aerobim/bim-core";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import {
  mainThreadConverter,
  workerConverter,
  type ConvertLocation,
  type Converter,
} from "./converter.js";

export type { ConvertLocation, Converter, ConvertRequest, ConvertResponse } from "./converter.js";

/**
 * Las unidades del modelo se reexportan desde acá.
 *
 * La aplicación las necesita para mostrarlas, y viajan en {@link LoadedModel}: obligarla a
 * importar el tipo del paquete de dominio para leer un campo que le entrega el visor sería
 * filtrar una dependencia sin motivo.
 */
export type { IfcUnitKind, IfcUnits, MissingClass } from "@aerobim/bim-core";

/**
 * Mundo concreto que arma esta envoltura.
 *
 * Tres elecciones deliberadas frente a las versiones "Simple":
 *
 * - **`ShadowedScene`** proyecta sombras. Sin ellas un modelo se ve como una silueta plana:
 *   todo el mismo blanco, sin profundidad, y cuesta distinguir un muro de una losa.
 * - **`OrthoPerspectiveCamera`** trae la proyección ortográfica, que es como se lee un
 *   plano, y los modos de navegación.
 * - **`PostproductionRenderer`** añade oclusión ambiental y **aristas dibujadas**. Es lo que
 *   separa un render de maqueta de uno que se entiende: en un visor de escritorio como
 *   BricsCAD las líneas de los elementos están siempre ahí, y son las que dejan leer el
 *   modelo.
 */
type World = OBC.SimpleWorld<
  OBC.ShadowedScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>;

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

/**
 * Qué se está midiendo.
 *
 * `perpendicular` no es de la librería: se implementa acá con el rayo propio y la geometría del
 * dominio, porque `components-front` no la trae y es la medida que se pide cuando hay una cara de
 * referencia. Ver {@link addMeasurePoint}.
 */
export type MeasureMode = "distance" | "angle" | "area" | "perpendicular";

/**
 * Una medición terminada.
 *
 * Las magnitudes están en metros y grados: la escena está en metros porque el factor de
 * unidades del IFC se aplicó al convertir.
 *
 * **No trae los puntos.** El dibujo —la línea, los extremos y la etiqueta con el número— lo
 * hacen los componentes de `@thatopen/components-front` dentro de la escena, así que la
 * interfaz no tiene que rehacerlo. Lo que sube es el valor, para poder mostrarlo también en el
 * panel y para que sea copiable.
 */
export type Measurement =
  | {
      readonly mode: "distance";
      /** En línea recta entre los dos puntos. */
      readonly distanceM: number;
      /** Proyectada en planta, y el desnivel. Ver `distancePartsM` en `bim-core`. */
      readonly horizontalM: number;
      readonly verticalM: number;
    }
  | { readonly mode: "angle"; readonly angleDeg: number }
  | {
      readonly mode: "perpendicular";
      /** Largo de la perpendicular desde el punto hasta la cara de referencia. */
      readonly distanceM: number;
    }
  | {
      readonly mode: "area";
      readonly areaM2: number;
      readonly perimeterM: number;
      readonly vertices: number;
    };

/** Ejes sobre los que se puede cortar el modelo. */
export type SectionAxis = "horizontal" | "longitudinal" | "transversal";

/**
 * Vistas normalizadas, las que tiene cualquier visor de escritorio.
 *
 * Existen porque orbitar a mano hasta una planta o un alzado es incómodo y nunca queda recto,
 * y porque comparar dos modelos exige mirarlos desde el mismo sitio.
 */
export type StandardView = "iso" | "top" | "front" | "side";

export interface BimViewerOptions {
  /**
   * Carpeta desde donde se sirve el WASM de `web-ifc`, con barra final.
   *
   * Por defecto That Open lo descarga de un CDN. AeroBim lo sirve **local**: la
   * aplicación tiene que abrir un modelo en una faena sin internet, y depender de
   * unpkg para leer un archivo del disco contradice el local-first del proyecto.
   */
  readonly wasmPath?: string;
  /**
   * El worker que convierte los IFC. **Sin él se convierte en el hilo principal.**
   *
   * Lo crea la aplicación porque crear un worker es cosa del empaquetador — ver la cabecera de
   * `converter.ts`, donde está el intento que salió mal—. Y no hay valor por defecto a propósito:
   * un respaldo silencioso al hilo principal significaría diez segundos de interfaz congelada sin
   * que nadie sepa por qué, y este repositorio ya pagó una vez el precio de un fallo silencioso.
   */
  readonly convertWorker?: Worker;
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
  /** Dónde corrió la conversión. Es el dato con el que se responde `F0.6`. */
  readonly convertedIn: ConvertLocation;
  /**
   * Clases de elemento que el archivo declara y que **no llegaron a la escena**.
   *
   * Es el aviso de que el visor está mostrando menos de lo que el archivo trae. Pasa con modelos
   * industriales: el importador de Fragments procesa un conjunto conocido de clases IFC, y una
   * planta exportada desde un modelador de tuberías está llena de clases que un modelo de
   * arquitectura no tiene. Cuando eso ocurre el elemento no entra ni al árbol, así que ningún
   * contador interno lo echa de menos — el hueco solo se ve comparando con el archivo.
   */
  readonly missingClasses: readonly MissingClass[];
  /**
   * Clases de elemento que **sí se importaron y llegaron sin geometría**.
   *
   * Es el otro caso de geometría que falta, y hay que distinguirlos porque el arreglo es distinto:
   * acá el elemento existe —está en el árbol, se selecciona, trae sus propiedades— y simplemente no
   * se dibuja, porque el motor de geometría no pudo generar su malla. Eso apunta a `web-ifc` con
   * representaciones que no soporta (B-reps avanzados, barridos por trayectoria), no al conjunto de
   * clases del importador.
   */
  readonly emptyClasses: readonly MissingClass[];
}

export interface LoadedModel {
  readonly id: string;
  readonly name: string;
  readonly model: FRAGS.FragmentsModel;
  readonly metrics: LoadMetrics;
  /**
   * Las unidades que el archivo declara, leídas del IFC antes de convertirlo.
   *
   * Fragments no las conserva —aplica el factor a la geometría y descarta la declaración— así
   * que se leen del texto del archivo. Son las que la ficha de propiedades pone al lado de
   * cada número.
   */
  readonly units: IfcUnits;
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
  /**
   * Símbolo de la unidad, o `null` cuando no corresponde ninguna.
   *
   * `null` cubre tres casos que en pantalla se ven igual: el valor no es una medida, no se pudo
   * deducir la magnitud, o el modelo no declaró esa unidad. Nunca se inventa un símbolo.
   */
  readonly unit: string | null;
  /**
   * `true` cuando la unidad se deduce del nombre porque el archivo no declara el tipo del
   * valor. La interfaz la muestra atenuada: es una ayuda de lectura, no un dato del modelo.
   */
  readonly unitInferred: boolean;
  /**
   * El tipo con el que el archivo declara el valor (`IFCLENGTHMEASURE`, `IFCREAL`, `IFCLABEL`…), o
   * `null` si no lo declara.
   *
   * Se conserva porque **explica la unidad que se ve, y la que no se ve**: un número sin unidad al
   * lado deja la duda de si el visor no supo o si el archivo no dijo, y este campo la responde. La
   * interfaz lo pone en el tooltip de la fila.
   */
  readonly ifcType: string | null;
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

/** Un fotograma a 60 Hz, para forzar el avance de los controles de cámara. */
const ONE_FRAME_S = 1 / 60;

/** Violeta de la marca, para el elemento seleccionado y para las cotas. */
const SELECTION_COLOR = 0x9b5de5;

/** El mismo violeta como color CSS, para las etiquetas de las mediciones. */
const SELECTION_CSS = "#9b5de5";

/**
 * Cosas de la escena que se pueden apagar sin destruirlas.
 *
 * Es lo que tienen en común la cota de una distancia, el relleno de un área y la etiqueta de un
 * ángulo: los tres son objetos distintos de la librería y los tres se apagan igual.
 */
interface Ocultable {
  visible: boolean;
}

/**
 * Ángulos de las vistas normalizadas: azimut y polar de camera-controls.
 *
 * El polar se mide desde la vertical, así que `0` es mirar desde arriba y `PI/2` es mirar de
 * frente. No se usa exactamente `0` ni exactamente `PI/2`: en los extremos el vector de
 * dirección queda paralelo al "arriba" de la cámara y la orientación se vuelve indeterminada,
 * con lo que la vista aparece girada al azar. Un pelo de margen la deja estable.
 */
const VISTAS: Record<StandardView, readonly [azimuth: number, polar: number]> = {
  iso: [Math.PI / 4, Math.PI / 3],
  top: [0, 0.0001],
  front: [0, Math.PI / 2 - 0.0001],
  side: [Math.PI / 2, Math.PI / 2 - 0.0001],
};

/** Los tres medidores de `components-front`, cada uno con su tipo de resultado. */
interface MeasureTools {
  readonly distance: OBF.LengthMeasurement;
  readonly angle: OBF.AngleMeasurement;
  readonly area: OBF.AreaMeasurement;
}

/** Lo que mide cada herramienta, para poder guardar las cotas en una sola lista. */
type MeasureObject = OBF.Line | OBF.Angle | OBF.Area;

/**
 * Una cota ya dibujada, para poder listarla, apagarla o borrarla una por una.
 *
 * Existe porque un modelo revisado termina con diez o quince cotas encima, y sin poder apagarlas
 * de a una la única salida es borrarlas todas y volver a medir.
 */
export interface DrawnMeasurement {
  readonly id: string;
  readonly kind: MeasureMode;
  /** El valor ya formateado, con su unidad: `2.050 m`, `88.4°`, `0.76 m²`. */
  readonly label: string;
  readonly visible: boolean;
}

/**
 * Cómo se ajusta el cursor al medir.
 *
 * - `vertex`: al vértice o la arista más cercana, con la cara como respaldo. Es lo que se quiere
 *   casi siempre: dos personas midiendo el mismo muro obtienen el mismo número.
 * - `face`: donde caiga el cursor sobre la cara. Sirve para medir entre puntos que no son
 *   esquinas —el centro de un paño, un punto cualquiera del suelo— donde el ajuste estorba porque
 *   salta a la esquina más próxima.
 */
export type SnapMode = "vertex" | "face";

/**
 * Qué se mide con la herramienta de distancia.
 *
 * - `points`: entre dos puntos que se eligen.
 * - `edge`: el largo de una arista completa, con un solo clic sobre ella.
 */
export type DistanceMode = "points" | "edge";

/**
 * Deja una etiqueta de medición con los colores de la aplicación.
 *
 * La librería las crea con fondo azul y sombra fuerte, escritos a mano en el estilo del
 * elemento. Se repintan acá porque una cota azul sobre una línea violeta parece de otra
 * herramienta, y porque el tamaño por defecto tapa el modelo.
 */
function estilarEtiqueta(mark: OBF.Mark): void {
  const estilo = mark.three.element.style;
  estilo.backgroundColor = SELECTION_CSS;
  estilo.color = "#ffffff";
  estilo.padding = "2px 6px";
  estilo.borderRadius = "4px";
  estilo.fontSize = "11px";
  estilo.fontFamily = "inherit";
  estilo.fontVariantNumeric = "tabular-nums";
  estilo.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.5)";
  // La etiqueta no debe robar el clic: se mide clicando sobre el modelo, y una cota ya puesta
  // en medio del camino dejaba el siguiente punto sin registrar.
  estilo.pointerEvents = "none";
}

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
 * La geometría de las mediciones vive en `bim-core`, donde está probada contra casos elementales
 * sin necesitar un navegador. Acá solo se traduce el tipo.
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

/**
 * Arma un par nombre/valor con su unidad resuelta.
 *
 * La unidad sale del tipo IFC del valor cuando el archivo lo trae, y del nombre cuando no —ver
 * `resolveUnitSymbol` en `bim-core`, donde está la regla y sus pruebas—. Solo se busca unidad
 * para valores numéricos: un texto no lleva unidad ni aunque se llame `Length`.
 */
function propiedad(
  name: string,
  campo: FRAGS.ItemAttribute,
  value: string,
  units: IfcUnits,
): PropertyValue {
  const esNumero = typeof campo.value === "number";
  // El tipo se comprueba en ejecución aunque Fragments lo declare `string`: es un dato que llega
  // de la librería, y si alguna vez viniera un número, `resolveUnitSymbol` fallaría y se llevaría
  // por delante la ficha de propiedades completa. Sin tipo, la unidad se deduce del nombre, que
  // es el camino que ya se usa para los psets propios de las herramientas de modelado.
  const ifcType = typeof campo.type === "string" ? campo.type : null;
  const unidad = esNumero ? resolveUnitSymbol({ ifcType, name, units }) : null;

  return {
    name,
    value,
    unit: unidad?.symbol ?? null,
    unitInferred: unidad?.inferred ?? false,
    ifcType,
  };
}

/** Atributos escalares de un objeto, sin los internos. */
function atributosDe(item: FRAGS.ItemData, omitir: Set<string>, units: IfcUnits): PropertyValue[] {
  const propiedades: PropertyValue[] = [];

  for (const [clave, contenido] of Object.entries(item)) {
    if (!esAtributo(contenido) || omitir.has(clave) || clave.startsWith("_")) continue;

    // Una propiedad de pset guarda su valor aparte del nombre; un atributo normal lo trae
    // directo. Se prueban las claves de valor conocidas antes de rendirse.
    const texto = textoDe(contenido.value);
    if (texto !== null) propiedades.push(propiedad(clave, contenido, texto, units));
  }

  return propiedades;
}

/** Claves donde vive el valor de una propiedad o cantidad, según su tipo IFC. */
const CLAVES_DE_VALOR = [
  "NominalValue",
  "Value",
  "LengthValue",
  "AreaValue",
  "VolumeValue",
  "CountValue",
  "WeightValue",
  "TimeValue",
];

/**
 * Relaciones cuyo contenido ya se leyó como propiedades del bloque.
 *
 * Descender por ellas produciría un grupo por cada propiedad —cuatro bloques
 * `IFCPROPERTYSINGLEVALUE` repitiendo lo que el pset ya muestra— que es puro ruido.
 */
const RELACIONES_YA_LEIDAS = new Set(["HasProperties", "Quantities"]);

/**
 * Propiedades de un `IfcPropertySet` o de un `IfcElementQuantity`.
 *
 * Las dos formas se tratan igual porque para quien mira son lo mismo: una lista de nombres
 * con su valor. Solo cambia la clave donde cuelgan —`HasProperties` en un pset,
 * `Quantities` en las cantidades medidas— y en qué campo está el número.
 */
function propiedadesDePset(pset: FRAGS.ItemData, units: IfcUnits): PropertyValue[] {
  const propiedades: PropertyValue[] = [];

  for (const clave of RELACIONES_YA_LEIDAS) {
    const lista = pset[clave];
    if (!Array.isArray(lista)) continue;

    for (const entrada of lista) {
      const name = nombreDe(entrada);
      if (name === null) continue;

      for (const claveValor of CLAVES_DE_VALOR) {
        const campo = entrada[claveValor];
        if (campo === undefined || !esAtributo(campo)) continue;
        const value = textoDe(campo.value);
        if (value !== null) {
          propiedades.push(propiedad(name, campo, value, units));
          break;
        }
      }
    }
  }

  return propiedades;
}

/** Identificador interno de un objeto, para poder reconocerlo entre los relacionados. */
function localIdDe(item: FRAGS.ItemData): number | null {
  const campo = item["_localId"];
  if (campo === undefined || !esAtributo(campo)) return null;
  return typeof campo.value === "number" ? campo.value : null;
}

/**
 * Convierte un objeto relacionado en un bloque mostrable.
 *
 * Devuelve `null` si no aporta nada. Baja **un solo nivel más** por sus propias
 * relaciones, que es lo que hace falta para llegar al material a través del tipo, y no
 * más: seguir el grafo de IFC sin límite lleva a listar medio modelo.
 */
function grupoDe(
  relacionado: FRAGS.ItemData,
  claveRelacion: string,
  localIdPropio: number,
  units: IfcUnits,
): PropertyGroup[] {
  // Las relaciones de IFC son de doble sentido, así que entre los "relacionados" reaparece
  // el propio elemento. Mostrarlo como un bloque más sería repetir la cabecera de la ficha.
  if (localIdDe(relacionado) === localIdPropio) return [];

  const grupos: PropertyGroup[] = [];
  const categoria = categoriaDe(relacionado);
  const nombre = nombreDe(relacionado);

  const desdePset = propiedadesDePset(relacionado, units);
  const propias = desdePset.length > 0 ? desdePset : atributosDe(relacionado, new Set(), units);

  if (propias.length > 0) {
    grupos.push({ name: encabezadoDe(categoria, nombre, claveRelacion), properties: propias });
  }

  for (const [clave, contenido] of Object.entries(relacionado)) {
    if (!Array.isArray(contenido)) continue;
    if (RELACIONES_IGNORADAS.has(clave) || RELACIONES_YA_LEIDAS.has(clave)) continue;

    for (const anidado of contenido) {
      if (typeof anidado !== "object" || anidado === null) continue;
      if (localIdDe(anidado) === localIdPropio) continue;

      const propiedades = atributosDe(anidado, new Set(), units);
      if (propiedades.length === 0) continue;

      grupos.push({
        name: encabezadoDe(categoriaDe(anidado), nombreDe(anidado), clave),
        properties: propiedades,
      });
    }
  }

  return grupos;
}

/**
 * Título de un bloque de propiedades.
 *
 * Para un pset o unas cantidades basta su nombre —`Pset_WallCommon` ya dice todo— pero para
 * un tipo o un material la categoría es la que informa: `IFCBEAMTYPE · Concrete, Plain`
 * distingue el tipo de la viga del material del que está hecha.
 */
function encabezadoDe(categoria: string | null, nombre: string | null, respaldo: string): string {
  const soloNombre = categoria === "IFCPROPERTYSET" || categoria === "IFCELEMENTQUANTITY";
  if (soloNombre && nombre !== null) return nombre;

  const partes = [categoria, nombre].filter((parte) => parte !== null);
  return partes.length === 0 ? respaldo : partes.join(" · ");
}

/** Arma un {@link PickedItem} a partir de los datos crudos del modelo. */
function describeItem(
  modelId: string,
  localId: number,
  data: FRAGS.ItemData | undefined,
  units: IfcUnits,
): PickedItem {
  if (!data) {
    return { modelId, localId, guid: null, category: null, name: null, attributes: [], groups: [] };
  }

  const groups: PropertyGroup[] = [];
  for (const [clave, contenido] of Object.entries(data)) {
    if (!Array.isArray(contenido) || RELACIONES_IGNORADAS.has(clave)) continue;
    for (const relacionado of contenido) {
      if (typeof relacionado !== "object" || relacionado === null) continue;
      groups.push(...grupoDe(relacionado, clave, localId, units));
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
    attributes: atributosDe(data, ATRIBUTOS_OCULTOS, units),
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
  private disposed = false;
  /** `true` mientras hay una conversión en curso. Ver {@link wireEvents}. */
  private loading = false;
  /** Modelos ya presentes en la escena. Ver {@link wireEvents}. */
  private modelCount = 0;
  private renderStyle: RenderStyle = "solid";
  private measureMode: MeasureMode | null = null;
  private snapMode: SnapMode = "vertex";
  /**
   * La cara de referencia de una perpendicular en curso: un punto suyo y su normal.
   *
   * `null` mientras no se ha elegido ninguna. Ver {@link addMeasurePoint}.
   */
  private referencePlane: { readonly point: Point3; readonly normal: Point3 } | null = null;
  private readonly tools: MeasureTools;
  /** Quién escucha las mediciones terminadas. Ver {@link onMeasurement}. */
  private readonly measureListeners = new Set<(measurement: Measurement | null) => void>();
  /**
   * Qué elemento está seleccionado, para poder repintar el resaltado.
   *
   * Hace falta recordarlo porque el resaltado se aplica **en capas** —la vista fantasma pinta
   * todo el modelo y la selección pinta un elemento encima— y cada vez que una capa cambia hay
   * que rehacer las dos. Ver {@link applyHighlights}.
   */
  private selection: { readonly modelId: string; readonly localId: number } | null = null;
  /** `true` mientras se repinta el resaltado. Ver {@link applyHighlights}. */
  private applyingHighlights = false;
  /** `true` si llegó otra petición de repintado mientras se atendía la anterior. */
  private highlightsPending = false;
  /**
   * Las mediciones tomadas, en orden, con lo que se dibuja de cada una.
   *
   * **Se guarda el dibujo, no solo el dato.** Al principio una medición se apagaba sacándola de la
   * lista de su medidor, y eso la borraba de verdad: al volver a encenderla no reaparecía. Ahora se
   * apaga poniendo su `visible` en `false`, que es el mecanismo que la librería sí soporta y que no
   * destruye nada.
   */
  private readonly drawn: {
    id: string;
    kind: MeasureMode;
    object: MeasureObject;
    /** Lo que se dibuja de esa medición: la cota, el relleno, la etiqueta. */
    visuals: Ocultable[];
    visible: boolean;
  }[] = [];
  /**
   * Dibujos que llegaron antes de que su medición quedara registrada.
   *
   * El orden lo impone la librería: cuando una medición entra en su lista, **ella crea el dibujo
   * primero** y solo después corren los demás avisos. Así que los dibujos esperan acá y
   * {@link registrarCota} los recoge.
   */
  private visualesPendientes: Ocultable[] = [];
  /** Unidades declaradas por cada modelo, por identificador. */
  private readonly unitsByModel = new Map<string, IfcUnits>();
  /** Quien convierte los IFC. Ver {@link converter} y `converter.ts`. */
  private readonly conversor: Converter;

  private constructor(
    components: OBC.Components,
    world: World,
    fragments: OBC.FragmentsManager,
    container: HTMLElement,
    wasmPath: string,
    convertWorker: Worker | undefined,
  ) {
    this.components = components;
    this.world = world;
    this.fragments = fragments;
    this.container = container;
    this.conversor =
      convertWorker === undefined
        ? mainThreadConverter(wasmPath)
        : workerConverter(wasmPath, convertWorker);
    this.tools = {
      distance: components.get(OBF.LengthMeasurement),
      angle: components.get(OBF.AngleMeasurement),
      area: components.get(OBF.AreaMeasurement),
    };
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
      OBC.ShadowedScene,
      OBC.OrthoPerspectiveCamera,
      OBF.PostproductionRenderer
    >();
    world.scene = new OBC.ShadowedScene(components);
    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);

    world.scene.setup({
      shadows: { cascade: 1, resolution: 2048 },
    });

    components.init();

    // Oclusión ambiental y aristas. `COLOR_PEN_SHADOWS` es color + líneas + sombras, que es
    // la combinación con la que un modelo se lee: las aristas marcan dónde acaba cada
    // elemento y la oclusión da profundidad a los rincones.
    const { postproduction } = world.renderer;
    postproduction.enabled = true;
    postproduction.style = OBF.PostproductionAspect.COLOR_PEN_SHADOWS;

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(await OBC.FragmentsManager.getWorker());

    // La rueda acerca hacia donde apunta el cursor y no hacia el centro de la pantalla. Es el
    // gesto de cualquier visor de escritorio, y sin él acercarse a un detalle exige acercar y
    // recentrar por turnos hasta llegar.
    world.camera.controls.dollyToCursor = true;

    // **Sin rejilla en el suelo, a propósito.** Se probó la de That Open y estorba más de lo que
    // ayuda: al arrancar, sin modelo, la cámara está lejos del origen y la rejilla llena la pantalla
    // de una malla densa que tapa hasta el mensaje de "arrastra un archivo aquí". Una rejilla útil
    // hay que dimensionarla contra el modelo —separación de líneas y alcance según su tamaño— y eso
    // es una tarea, no una línea.

    const viewer = new BimViewer(
      components,
      world,
      fragments,
      container,
      options.wasmPath ?? DEFAULT_WASM_PATH,
      options.convertWorker,
    );
    viewer.wireEvents();
    viewer.wireMeasureTools();
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

      // **Por qué se repinta al descansar la cámara.** Mover la cámara hace que Fragments cambie el
      // nivel de detalle, y la geometría que entra nueva llega con su material original: el
      // resaltado se aplica a lo que había, no a lo que venga después.
      //
      // Al principio esto solo se hacía en vista fantasma, y eso dejaba un fallo peor: **al orbitar
      // se perdía el violeta del elemento seleccionado.** Quien clicaba una viga y giraba para
      // verla ya no sabía cuál había elegido, y la selección parecía no funcionar. Se repinta
      // siempre que haya algo pintado.
      if (this.renderStyle === "wireframe" || this.selection !== null) void this.applyHighlights();
      else void this.fragments.core.update(true);
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
   * Deja los tres medidores listos, con su mundo, sus colores y su ajuste.
   *
   * **Se usan los de `@thatopen/components-front` y no una implementación propia.** La versión
   * a mano calculaba bien pero no dibujaba nada: ni el punto al que se ajustaba el cursor, ni
   * los extremos, ni la etiqueta con el número. Sin esa señal, medir era hacer clics a ciegas —
   * es literalmente lo que hizo pensar que la medición no funcionaba. Estos componentes traen
   * el marcador de ajuste, la cota y el valor pegado a la línea.
   */
  private wireMeasureTools(): void {
    this.prepararMedidor(this.tools.distance);
    this.prepararMedidor(this.tools.angle);
    this.prepararMedidor(this.tools.area);

    // Las magnitudes de la escena están en metros y grados, porque el factor de unidades del
    // IFC ya se aplicó al convertir. Tres decimales en longitud es el milímetro.
    this.tools.distance.units = "m";
    this.tools.angle.units = "deg";
    this.tools.area.units = "m2";
    this.tools.angle.rounding = 1;
    this.tools.area.rounding = 2;

    // El registro de cotas se alimenta acá, en el mismo sitio donde se emite el resultado: así una
    // cota que vuelve a encenderse no se duplica en la lista.
    this.tools.distance.list.onItemAdded.add((line) => this.registrarCota("distance", line));
    this.tools.angle.list.onItemAdded.add((angle) => this.registrarCota("angle", angle));
    this.tools.area.list.onItemAdded.add((area) => this.registrarCota("area", area));

    this.tools.distance.list.onItemAdded.add((line) => {
      // La descomposición se hace en el dominio, donde está probada contra la rampa 3-4-5, y no
      // acá: es el número que alguien va a usar para replantear.
      const partes = distancePartsM(toPoint3(line.start), toPoint3(line.end));
      this.emitMeasurement({
        mode: "distance",
        // La directa se toma de la librería —es la que dibuja en la etiqueta— para que el panel
        // y la cota de la escena no puedan discrepar por un redondeo.
        distanceM: line.value,
        horizontalM: partes.horizontalM,
        verticalM: partes.verticalM,
      });
    });
    this.tools.angle.list.onItemAdded.add((angle) => {
      this.emitMeasurement({ mode: "angle", angleDeg: angle.value });
    });
    this.tools.area.list.onItemAdded.add((area) => {
      this.emitMeasurement({
        mode: "area",
        areaM2: area.value,
        perimeterM: area.perimeter,
        vertices: area.points.size,
      });
    });
  }

  /** Ajuste, color y estado inicial de un medidor. */
  private prepararMedidor(
    tool: OBF.LengthMeasurement | OBF.AngleMeasurement | OBF.AreaMeasurement,
  ): void {
    tool.world = this.world;
    tool.enabled = false;
    tool.color = new THREE.Color(SELECTION_COLOR);
    tool.rounding = 3;

    // Marcador de ajuste más grande que el de la librería. Es un punto de 4 px sobre un modelo de
    // acero lleno de aristas: hay que verlo para confiar en dónde va a caer el clic.
    tool.pickerSize = 10;

    // **La superficie de un área se dibuja respetando la profundidad.** El material de la librería
    // viene con `depthTest` desactivado, así que un área medida sobre el suelo se pintaba **encima
    // de todo el modelo** y la pantalla entera quedaba violeta. Con la prueba de profundidad el
    // relleno se queda donde está, detrás de lo que tenga delante.
    tool.fillsMaterial = new THREE.MeshLambertMaterial({
      color: new THREE.Color(SELECTION_COLOR),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
      depthTest: true,
    });

    this.aplicarAjuste(tool);

    // Las etiquetas se crean con el estilo de la librería; se repintan al aparecer. Y de paso se
    // anota cada dibujo, que es lo que después permite apagar una medición concreta sin borrarla.
    tool.labels.onItemAdded.add((mark) => {
      estilarEtiqueta(mark);
      this.visualesPendientes.push(mark);
    });
    tool.lines.onItemAdded.add((line) => {
      estilarEtiqueta(line.label);
      this.visualesPendientes.push(line);
    });
    tool.fills.onItemAdded.add((fill) => {
      estilarEtiqueta(fill.label);
      this.visualesPendientes.push(fill);
    });
  }

  /**
   * Las clases de ajuste del modo actual.
   *
   * El orden es la preferencia: primero vértice, luego arista y la cara como respaldo. Sin `FACE`,
   * un clic en el medio de un muro no devuelve punto y medir se vuelve un juego de puntería contra
   * las esquinas. Con el ajuste desactivado queda solo la cara, que es lo que hace falta para medir
   * entre dos puntos cualesquiera de un paño.
   */
  private snappingClasses(): FRAGS.SnappingClass[] {
    return this.snapMode === "vertex"
      ? [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE, FRAGS.SnappingClass.FACE]
      : [FRAGS.SnappingClass.FACE];
  }

  /** Traduce el modo de ajuste a las clases de la librería. */
  private aplicarAjuste(
    tool: OBF.LengthMeasurement | OBF.AngleMeasurement | OBF.AreaMeasurement,
  ): void {
    tool.snappings = this.snappingClasses();
  }

  /**
   * Elige si el cursor se ajusta a vértices y aristas o cae libre sobre la cara.
   *
   * Las dos formas hacen falta y ninguna sirve para todo: sin ajuste no se puede medir una esquina
   * con exactitud, y con ajuste no se puede poner un punto en medio de un paño porque salta a la
   * esquina más cercana.
   */
  setSnapMode(mode: SnapMode): void {
    this.assertAlive();

    this.snapMode = mode;
    this.aplicarAjuste(this.tools.distance);
    this.aplicarAjuste(this.tools.angle);
    this.aplicarAjuste(this.tools.area);
  }

  /** Cómo se ajusta el cursor al medir. */
  get snapping(): SnapMode {
    return this.snapMode;
  }

  /**
   * Elige entre medir entre dos puntos o el largo de una arista completa.
   *
   * El modo arista resuelve de un clic lo que de otro modo son dos clics con puntería: se pasa el
   * cursor por una viga y se mide su largo exacto, extremo a extremo.
   */
  setDistanceMode(mode: DistanceMode): void {
    this.assertAlive();
    this.tools.distance.mode = mode === "edge" ? "edge" : "free";
  }

  /** Qué mide la herramienta de distancia. */
  get distanceMode(): DistanceMode {
    return this.tools.distance.mode === "edge" ? "edge" : "points";
  }

  /**
   * Las cotas dibujadas, en el orden en que se hicieron.
   *
   * Incluye las apagadas: una cota apagada sigue existiendo, y tiene que poder volver.
   */
  listMeasurements(): readonly DrawnMeasurement[] {
    return this.drawn.map(({ id, kind, object, visible }) => ({
      id,
      kind,
      label: this.etiquetaDe(kind, object),
      visible,
    }));
  }

  /**
   * Apaga o enciende una medición concreta, sin borrarla.
   *
   * Se apaga poniendo en `false` el `visible` de lo que dibuja —la cota, el relleno, la etiqueta—,
   * que es el mecanismo de la librería. **No se saca de su lista**: eso fue el primer intento y
   * borraba la medición de verdad, porque al quitarla la librería libera su dibujo y al devolverla no
   * reaparecía.
   */
  setMeasurementVisible(id: string, visible: boolean): void {
    this.assertAlive();

    const entrada = this.drawn.find((cota) => cota.id === id);
    if (entrada === undefined) return;

    entrada.visible = visible;
    for (const visual of entrada.visuals) visual.visible = visible;
    this.world.renderer?.update();
  }

  /** Borra una cota concreta, sin tocar las demás. */
  deleteMeasurement(id: string): void {
    this.assertAlive();

    const indice = this.drawn.findIndex((cota) => cota.id === id);
    if (indice === -1) return;

    const [entrada] = this.drawn.splice(indice, 1);
    if (entrada !== undefined) this.listaDe(entrada.kind).delete(entrada.object);
  }

  /**
   * La lista de cotas del medidor que corresponde a un tipo.
   *
   * El tipo se unifica con una conversión porque cada medidor declara su propia lista —de `Line`,
   * de `Angle` o de `Area`— y acá se necesita tratarlas por igual. La conversión es segura: `kind`
   * y el objeto vienen siempre del mismo registro, que los emparejó al crearlos.
   */
  private listaDe(kind: MeasureMode): FRAGS.DataSet<MeasureObject> {
    const tool =
      kind === "distance"
        ? this.tools.distance
        : kind === "angle"
          ? this.tools.angle
          : this.tools.area;
    return tool.list as FRAGS.DataSet<MeasureObject>;
  }

  /** El valor de una cota, ya formateado con su unidad. */
  private etiquetaDe(kind: MeasureMode, object: MeasureObject): string {
    if (kind === "distance") return `${(object as OBF.Line).value.toFixed(3)} m`;
    if (kind === "angle") return `${(object as OBF.Angle).value.toFixed(1)}°`;
    return `${(object as OBF.Area).value.toFixed(2)} m²`;
  }

  /**
   * Registra una medición nueva y recoge los dibujos que la librería acaba de crear para ella.
   *
   * Los dibujos llegan **antes** de este aviso: la librería los crea en su propio manejador, que se
   * registró primero. Por eso esperan en {@link visualesPendientes} y se adjuntan acá.
   */
  private registrarCota(kind: MeasureMode, object: MeasureObject): void {
    const visuals = this.visualesPendientes;
    this.visualesPendientes = [];

    const existente = this.drawn.find((cota) => cota.object === object);
    if (existente !== undefined) {
      existente.visuals.push(...visuals);
      return;
    }

    this.drawn.push({ id: object.id, kind, object, visuals, visible: true });
  }

  /** Avisa a quien escuche que hay una medición nueva, o que se borraron todas. */
  private emitMeasurement(measurement: Measurement | null): void {
    for (const listener of this.measureListeners) listener(measurement);
  }

  /**
   * Se suscribe a las mediciones terminadas. Devuelve la función para darse de baja.
   *
   * Es un `callback` y no un valor de retorno de {@link addMeasurePoint} porque una medición no
   * termina cuando se hace un clic: la distancia se cierra en el segundo, el ángulo en el
   * tercero y un área cuando quien mide decide cerrarla.
   */
  onMeasurement(listener: (measurement: Measurement | null) => void): () => void {
    this.measureListeners.add(listener);
    return () => this.measureListeners.delete(listener);
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

    // El archivo se lee como texto **antes** de convertir, para dos cosas que después ya no se
    // pueden saber: las unidades que declara —Fragments aplica el factor a la geometría y descarta
    // la declaración— y qué clases de elemento contiene, que es la única forma de detectar que el
    // visor cargó menos de lo que el archivo trae. Se decodifica como `latin1` porque STEP es ASCII
    // con escapes propios y esa decodificación nunca falla; son dos pasadas sobre el archivo, nada
    // al lado de los segundos que cuesta la conversión.
    const texto = new TextDecoder("latin1").decode(bytes);
    const units = parseIfcUnits(texto);
    const clasesDelArchivo = countIfcEntities(texto);

    // **El tamaño del IFC se anota antes de convertir.** Los bytes se le pasan al worker
    // transferidos, no copiados, y un `ArrayBuffer` transferido queda con `byteLength` en 0. Es la
    // misma trampa que ya se pagó con el búfer del Fragments, ahora del otro lado del pipeline.
    const ifcBytes = bytes.byteLength;

    let fragByteLength: number;
    let model: FRAGS.FragmentsModel;
    try {
      onStage("converting");
      const fragments = await this.conversor.convert(bytes);

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
    const [categories, itemsWithGeometry, emptyClasses] = await Promise.all([
      model.getCategories(),
      model.getItemsWithGeometry(),
      this.classesWithoutGeometry(model),
    ]);

    onStage("drawing");
    await this.fragments.core.update(true);

    onStage("framing");
    const sizeM = await this.fitTo(model);
    const displayMs = performance.now() - startedAt;
    onStage("done");

    this.unitsByModel.set(model.modelId, units);

    return {
      id: model.modelId,
      name,
      model,
      units,
      metrics: {
        ifcBytes,
        fragBytes: fragByteLength,
        convertMs,
        displayMs,
        categoryCount: categories.length,
        itemsWithGeometry: itemsWithGeometry.length,
        sizeM,
        convertedIn: this.conversor.location,
        missingClasses: missingElementClasses(clasesDelArchivo, categories),
        emptyClasses,
      },
    };
  }

  /**
   * Qué elementos entraron al modelo **sin geometría**, contados por clase.
   *
   * Se calcula restando: todos los identificadores del modelo menos los que tienen geometría, y de
   * los que quedan se leen sus categorías. El filtro de `bim-core` descarta lo que nunca tuvo
   * geometría —psets, materiales, unidades, tipos, el armazón espacial— para que la cuenta solo
   * hable de elementos que deberían verse.
   *
   * Es la comprobación que faltaba: los contadores del visor decían "839 elementos con geometría" y
   * no había forma de saber cuántos se habían quedado sin ella.
   */
  private async classesWithoutGeometry(
    model: FRAGS.FragmentsModel,
  ): Promise<readonly MissingClass[]> {
    const [porCategoria, conGeometria] = await Promise.all([
      // Una sola consulta devuelve los identificadores agrupados por categoría. Preguntar la
      // categoría de cada elemento por separado costaría miles de idas y vueltas al worker.
      model.getItemsOfCategories([/^IFC/]),
      model.getItemsIdsWithGeometry(),
    ]);

    const tienen = new Set(conGeometria);
    const categorias: string[] = [];
    for (const [categoria, ids] of Object.entries(porCategoria)) {
      for (const id of ids) {
        if (!tienen.has(id)) categorias.push(categoria);
      }
    }

    return emptyElementClasses(categorias);
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

    this.selection = { modelId: model.modelId, localId: result.localId };
    await this.applyHighlights();

    return describeItem(
      model.modelId,
      result.localId,
      data,
      this.unitsByModel.get(model.modelId) ?? NO_IFC_UNITS,
    );
  }

  /**
   * Repinta las dos capas de resaltado: la vista fantasma y la selección.
   *
   * **Van juntas porque `resetHighlight` borra todo.** Antes cada una se aplicaba por su lado, y
   * seleccionar un elemento apagaba la vista fantasma sin motivo aparente. El orden importa: el
   * fantasma primero, sobre el modelo entero, y la selección después, para que el elemento
   * elegido quede opaco por encima de lo translúcido.
   */
  private async applyHighlights(): Promise<void> {
    // **No se puede repintar dos veces a la vez.** Esto lo dispara también el descanso de la
    // cámara, así que girando llegan varias peticiones seguidas; sin esta guarda, el
    // `resetHighlight` de una entra entre el reset y el highlight de la anterior y el modelo
    // queda a medio pintar —o el worker recibe dos tandas cruzadas y falla—. La última petición
    // no se pierde: se atiende al terminar la que estaba en curso.
    if (this.applyingHighlights) {
      this.highlightsPending = true;
      return;
    }

    this.applyingHighlights = true;
    try {
      do {
        this.highlightsPending = false;

        await this.fragments.resetHighlight();

        if (this.renderStyle === "wireframe") {
          await this.fragments.highlight({
            color: new THREE.Color(0xffffff),
            renderedFaces: FRAGS.RenderedFaces.TWO,
            // Translúcido pero todavía legible: con 0,15 el modelo se volvía una silueta y no se
            // distinguía una viga de una losa, que es justo lo que se viene a mirar detrás.
            opacity: 0.3,
            transparent: true,
          });
        }

        if (this.selection !== null) {
          await this.fragments.highlight(
            {
              color: new THREE.Color(SELECTION_COLOR),
              renderedFaces: FRAGS.RenderedFaces.TWO,
              opacity: 1,
              transparent: false,
            },
            { [this.selection.modelId]: new Set([this.selection.localId]) },
          );
        }

        await this.fragments.core.update(true);
      } while (this.highlightsPending);
    } finally {
      this.applyingHighlights = false;
    }
  }

  /**
   * Redibuja dejando el estado pintado consistente.
   *
   * **Se llama después de cualquier cosa que cambie lo que hay en pantalla**: cambiar de proyección,
   * ocultar, aislar, cortar, cerrar un modelo. La razón es que Fragments dibuja por niveles de
   * detalle: cada refresco puede traer geometría nueva, y la nueva llega con su material original.
   * Si solo se refrescara sin repintar, el modelo queda **mitad sólido y mitad fantasma** —lo que se
   * vio al alternar proyección y aspecto— o pierde el violeta del elemento seleccionado.
   *
   * Cuando no hay nada pintado encima, un refresco simple basta y es más barato.
   */
  private async refresh(): Promise<void> {
    if (this.renderStyle === "wireframe" || this.selection !== null) await this.applyHighlights();
    else await this.fragments.core.update(true);
  }

  /** Quita el resaltado de selección, dejando la vista fantasma si estaba puesta. */
  async clearSelection(): Promise<void> {
    this.assertAlive();
    this.selection = null;
    await this.applyHighlights();
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
    // Y repintando: el cambio de cámara reordena los niveles de detalle, y la geometría que entra
    // nueva llega sin el resaltado. Alternando proyección y aspecto se veía el modelo a medias.
    await this.refresh();
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

    this.renderStyle = style;
    await this.applyHighlights();
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

    // **Medir y seleccionar no se mezclan.** Al entrar a medir se suelta la selección: un elemento
    // pintado de violeta debajo de las cotas estorba para ver lo que se está midiendo, y deja la
    // duda de si el clic va a seguir seleccionando.
    if (mode !== null && this.selection !== null) {
      this.selection = null;
      void this.applyHighlights();
    }

    this.measureMode = mode;
    this.referencePlane = null;

    // Solo un medidor activo a la vez. Con dos escuchando el puntero, cada clic entraba en las
    // dos mediciones y salían cotas que nadie pidió.
    //
    // En modo perpendicular se enciende **el medidor de distancia igualmente**, aunque nunca se le
    // pida crear nada: encendido es lo que dibuja el marcador de ajuste al mover el ratón, y así la
    // perpendicular se apunta con la misma señal visual que las demás medidas.
    //
    // **Sin verificar que los dos conviven.** La perpendicular usa el rayo de la CPU y el marcador
    // usa el selector gráfico de la librería, que lee píxeles de la escena. Que uno estorbe al otro
    // no se pudo comprobar: en el navegador de pruebas ningún rayo funciona después de un par de
    // refrescos, porque esa pestaña no pinta cuadros. Si la perpendicular deja de encontrar
    // geometría en uso real, **lo primero que hay que probar es no encender el medidor acá.**
    this.tools.distance.enabled = mode === "distance" || mode === "perpendicular";
    this.tools.angle.enabled = mode === "angle";
    this.tools.area.enabled = mode === "area";
    this.emitMeasurement(null);
  }

  /** Qué se está midiendo, o `null` si no se está midiendo. */
  get measuring(): MeasureMode | null {
    return this.measureMode;
  }

  /**
   * Suma un punto a la medición en curso, donde esté el cursor.
   *
   * **No recibe coordenadas** porque el medidor sigue el puntero por su cuenta: dibuja el
   * marcador de ajuste mientras el ratón se mueve, y ese mismo punto es el que fija el clic. Si
   * la interfaz le pasara las suyas, el punto medido podría no ser el que se estaba viendo.
   *
   * El resultado no vuelve por acá: llega por {@link onMeasurement} cuando la medición se
   * cierra, porque cuántos clics hacen falta depende de lo que se mida.
   */
  async addMeasurePoint(clientX?: number, clientY?: number): Promise<boolean> {
    this.assertAlive();
    if (this.measureMode === null) return false;

    // La perpendicular es propia y **sí necesita las coordenadas**: usa el rayo de la CPU, que a
    // diferencia del ajuste de la librería devuelve también la normal de la cara tocada.
    if (this.measureMode === "perpendicular") {
      if (clientX === undefined || clientY === undefined) return false;
      return this.addPerpendicularPoint(clientX, clientY);
    }

    // **Un dibujado antes de leer.** El ajuste del medidor no usa el rayo de la CPU: lee los
    // píxeles de la escena dibujada para saber qué hay bajo el cursor. Mientras se orbita, la
    // librería suspende esas lecturas, así que al soltar el ratón el último fotograma puede no
    // corresponder a la cámara actual y el punto saldría de donde estaba antes de mover. Un
    // dibujado explícito acá cuesta milisegundos y garantiza que se mide lo que se está viendo.
    this.world.renderer?.update();

    if (this.measureMode === "distance") await this.tools.distance.create();
    else if (this.measureMode === "angle") await this.tools.angle.create();
    else if (this.measureMode === "area") await this.tools.area.create();

    // Los medidores de la librería no informan si el clic cayó en el vacío, así que acá se da por
    // registrado. Es lo que había antes de que existiera este valor de retorno.
    return true;
  }

  /**
   * Los dos clics de una perpendicular: primero la cara de referencia, luego el punto.
   *
   * **Se dibuja con el medidor de la librería aunque el cálculo sea propio:** una vez conocido el
   * pie de la perpendicular, se añade la cota a su lista y ella se encarga de la línea, los extremos
   * y la etiqueta. Así la perpendicular se ve igual que las demás medidas y aparece en la misma
   * lista, sin duplicar el dibujo.
   */
  private async addPerpendicularPoint(clientX: number, clientY: number): Promise<boolean> {
    // **El primer clic va sin ajuste y el segundo con él**, y la diferencia importa: con ajuste el
    // rayo devuelve el vértice o la arista más cercana, que **no traen normal** —solo una cara la
    // tiene— y sin normal no hay plano de referencia. Para el punto que se mide, en cambio, el
    // ajuste es justo lo que se quiere.
    if (this.referencePlane === null) {
      const cara = await this.rayAt(clientX, clientY, false);
      if (cara?.normal == null) return false;
      this.referencePlane = { point: cara.point, normal: cara.normal };
      return true;
    }

    // **Con respaldo sin ajuste.** El ajuste no siempre resuelve —depende de que los datos de
    // vértices y aristas del trozo de modelo que se está mirando estén ya disponibles— y cuando no
    // resuelve devuelve nada. Perder la medición por eso sería peor que medir el punto de la cara,
    // que es exactamente donde se hizo clic.
    const toque =
      (await this.rayAt(clientX, clientY, true)) ?? (await this.rayAt(clientX, clientY, false));
    if (toque === null) return false;

    const perpendicular = perpendicularToPlane(
      toque.point,
      this.referencePlane.point,
      this.referencePlane.normal,
    );
    this.referencePlane = null;
    if (perpendicular === null) return false;

    // Menos de un milímetro es el punto sobre la propia cara: no hay perpendicular que dibujar.
    if (perpendicular.distanceM < 0.001) {
      this.emitMeasurement({ mode: "perpendicular", distanceM: 0 });
      return true;
    }

    const linea = new OBF.Line(
      new THREE.Vector3(...toque.point),
      new THREE.Vector3(...perpendicular.footM),
    );
    linea.units = "m";
    linea.rounding = 3;
    this.tools.distance.list.add(linea);

    this.emitMeasurement({ mode: "perpendicular", distanceM: perpendicular.distanceM });
    return true;
  }

  /**
   * Qué hay bajo un punto de la pantalla: el punto tocado y, si la hay, la normal de la cara.
   *
   * Es el rayo de la CPU contra la geometría, no la lectura de píxeles de la librería. **Con ajuste
   * devuelve el vértice o la arista más cercana y por tanto puede no traer normal**; sin ajuste
   * devuelve el punto de la cara con su normal, que es lo que define un plano.
   */
  private async rayAt(
    clientX: number,
    clientY: number,
    conAjuste: boolean,
  ): Promise<{ point: Point3; normal: Point3 | null } | null> {
    const canvas = this.world.renderer?.three.domElement;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const comun = {
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(clientX - rect.left, clientY - rect.top),
      dom: canvas,
    };

    const result = await this.fragments.raycast(
      conAjuste ? { ...comun, snappingClasses: this.snappingClasses() } : comun,
    );
    if (!result) return null;

    const normal = result.normal ?? null;
    return {
      point: toPoint3(result.point),
      normal: normal === null ? null : toPoint3(normal),
    };
  }

  /**
   * Cierra la medición en curso.
   *
   * Solo el área lo necesita: un contorno no tiene un número fijo de vértices, así que hay que
   * decir cuándo terminó. La distancia y el ángulo se cierran solos al completar sus puntos.
   */
  finishMeasurement(): void {
    this.assertAlive();
    if (this.measureMode === "area") this.tools.area.endCreation();
  }

  /** Descarta la medición a medias, sin borrar las ya terminadas. */
  cancelMeasurement(): void {
    this.assertAlive();
    this.tools.distance.cancelCreation();
    this.tools.angle.cancelCreation();
    this.tools.area.cancelCreation();
    this.emitMeasurement(null);
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
    await this.refresh();
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
    await this.refresh();
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

  /**
   * Dónde está corriendo la conversión.
   *
   * Se expone porque es la respuesta de `F0.6` y porque conviene poder comprobarlo sin abrir un
   * modelo: si el worker no arrancara, esto lo diría antes de que alguien espere diez segundos.
   */
  get converter(): ConvertLocation {
    return this.conversor.location;
  }

  /** Borra todas las mediciones dibujadas, de los tres tipos. */
  clearMeasurements(): void {
    this.assertAlive();

    this.cancelMeasurement();
    this.tools.distance.list.clear();
    this.tools.angle.list.clear();
    this.tools.area.list.clear();
    this.drawn.length = 0;
    this.visualesPendientes = [];
    this.emitMeasurement(null);
  }

  /** Cuántas mediciones hay dibujadas ahora mismo, de cualquier tipo. */
  get measurementCount(): number {
    return this.tools.distance.list.size + this.tools.angle.list.size + this.tools.area.list.size;
  }

  /** Muestra u oculta un conjunto de elementos de un modelo. */
  async setVisible(modelId: string, localIds: readonly number[], visible: boolean): Promise<void> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return;

    await model.setVisible([...localIds], visible);
    await this.refresh();
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
    await this.refresh();
  }

  /**
   * Muestra u oculta un modelo entero.
   *
   * Es lo que hace falta para coordinar de verdad: con arquitectura y estructura abiertas a la
   * vez, la operación más frecuente es apagar una para mirar la otra. Se apaga la visibilidad
   * de sus elementos y **el modelo sigue cargado**, así que volver a encenderlo es instantáneo
   * y no cuesta otra conversión.
   */
  async setModelVisible(modelId: string, visible: boolean): Promise<void> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return;

    await model.setVisible(undefined, visible);
    await this.refresh();
  }

  /**
   * Cierra un modelo: lo saca de la escena y libera su memoria.
   *
   * **Es distinto de apagarlo.** Apagado sigue cargado y volver a encenderlo es inmediato;
   * cerrado hay que abrir el archivo otra vez y pagar la conversión de nuevo. Existe porque en
   * una revisión se van abriendo modelos para comparar y la escena termina con disciplinas que
   * ya no hacen falta, cada una ocupando memoria del navegador.
   *
   * El objeto de la escena se quita **a mano y después** de liberar el modelo: quien lo colgó
   * fue esta envoltura, en `wireEvents`, así que sacarlo también le toca a ella.
   */
  async closeModel(modelId: string): Promise<void> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return;

    // Una selección que apunte a este modelo queda huérfana, y repintar el resaltado sobre un
    // modelo liberado falla.
    if (this.selection?.modelId === modelId) this.selection = null;

    const objeto = model.object;
    await this.fragments.core.disposeModel(modelId);
    this.world.scene.three.remove(objeto);

    this.unitsByModel.delete(modelId);
    this.modelCount = Math.max(0, this.modelCount - 1);
    if (this.modelCount > 0) await this.refresh();
  }

  /** Vuelve a mostrar todo. */
  async showAll(): Promise<void> {
    this.assertAlive();

    for (const [, model] of this.fragments.list) {
      await model.setVisible(undefined, true);
    }
    await this.refresh();
  }

  /**
   * Encuadra todos los modelos de la escena en vista isométrica.
   *
   * Existe como acción a demanda porque un visor la necesita —uno se pierde orbitando y
   * quiere volver— y porque el encuadre automático al cargar no siempre gana: algo del
   * ciclo de vida de That Open reencuadra después, y con el botón el usuario recupera la
   * vista en un clic sin que importe quién movió la cámara al final.
   */
  async frameAll(view: StandardView = "iso"): Promise<void> {
    this.assertAlive();

    const union = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      const box = await this.boxOf(model);
      if (box !== null) union.union(box);
    }
    if (union.isEmpty()) return;

    this.applyFraming(union, view);
  }

  /**
   * Encuadra el elemento seleccionado, o todo el modelo si no hay ninguno.
   *
   * Es el gesto que uno espera del doble clic en cualquier visor: ir a lo que interesa sin
   * orbitar a ciegas. Devuelve `false` si no había nada seleccionado, para que la interfaz
   * pueda decir por qué no pasó nada.
   */
  async frameSelection(): Promise<boolean> {
    this.assertAlive();

    if (this.selection === null) return false;

    const model = this.fragments.list.get(this.selection.modelId);
    if (!model) return false;

    const box = await model.getMergedBox([this.selection.localId]);
    if (box.isEmpty()) return false;

    // Un elemento delgado —una placa, un perfil— encuadrado justo queda pegado a los bordes de
    // la pantalla y no se entiende dónde está. Un margen proporcional a su tamaño deja ver algo
    // del contexto sin perder el elemento.
    const holgura = box.getSize(new THREE.Vector3()).length() * 0.25;
    box.expandByScalar(Math.max(holgura, 0.2));

    // Se conserva la orientación actual de la cámara: quien hace doble clic quiere acercarse a
    // un elemento, no cambiar el punto de vista desde el que estaba mirando.
    const controls = this.world.camera.controls;
    void controls.fitToBox(box, false);
    controls.update(ONE_FRAME_S);
    await this.refresh();
    return true;
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
  private applyFraming(box: THREE.Box3, view: StandardView = "iso"): void {
    const controls = this.world.camera.controls;
    const [azimuth, polar] = VISTAS[view];
    // El encuadre va **antes** del giro: `fitToBox` recoloca la cámara y con ello pisa los
    // ángulos, así que girar primero no dejaba rastro. Rotar después conserva el objetivo y
    // la distancia que el encuadre calculó.
    void controls.fitToBox(box, false);
    void controls.rotateTo(azimuth, polar, false);
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
    // El worker de conversión también se termina: es un hilo con un WASM de varios megabytes
    // dentro, y sin esto sobreviviría al visor sin que nadie pueda volver a usarlo.
    this.conversor.dispose();
    this.components.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("BimViewer: el visor ya fue liberado");
    }
  }
}
