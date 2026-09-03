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
  camaraBcfDesdeEscena,
  corteAEscena,
  corteAIfc,
  countIfcEntities,
  distancePartsM,
  ifcAEscena,
  ladoDeVisibilidad,
  lineasDesdeMediciones,
  pareceEnBlanco,
  parseIfcGrids,
  seVe,
  visibilidadBcf,
  emptyElementClasses,
  isIfcGuid,
  looksNumeric,
  missingElementClasses,
  NO_IFC_UNITS,
  parseIfcUnits,
  closedPerimeterM,
  perpendicularToPlane,
  polygonAreaM2,
  resolveUnitSymbol,
  escenaAArchivo,
  matrizDeCalce,
  type Alineacion,
  type BcfCamera,
  type IfcGridAxis,
  type IfcGuid,
  type IfcUnits,
  type MissingClass,
  type Point3,
  type SavedView,
  type SceneCameraState,
  type ViewNavigation,
  type LineaIfc,
  type ViewProjection,
  type VisibilidadBcf,
  type VistaCompartida,
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
import type { TablaDeCuadro } from "./cuadro-en-plano.js";
import { categoriasDe, cuadroDe, encabezadoDeColumna, type Schedule } from "./cuadros.js";
import { DrawingMaker, type DrawingView, type GeneratedDrawing } from "./drawings.js";
import { GridOverlay } from "./grid.js";

export type { DrawingLayerInfo, DrawingView, GeneratedDrawing } from "./drawings.js";
export { CAPAS } from "./drawings.js";
export type { Schedule, ScheduleColumn, ScheduleRow } from "./cuadros.js";
export { csvDe, encabezadoDeColumna, MAXIMO_COLUMNAS, MAXIMO_FILAS } from "./cuadros.js";
export type { TablaDeCuadro, TrazoDeTabla } from "./cuadro-en-plano.js";
export {
  CAPAS_DE_CUADRO,
  CuadrosEnPlano,
  registrarExportador,
  trazarTabla,
} from "./cuadro-en-plano.js";
export type {
  CriterioVisual,
  FichaDeNube,
  InformeDeRefresco,
  ModoDeColor,
  NubeCargada,
  OpcionesDeNube,
} from "./nubes.js";
export {
  abrirNube,
  fichaDeNube,
  NubeEnEscena,
  PIXELES_MINIMOS,
  PUNTOS_DEL_PRIMER_PINTADO,
  RUTA_WASM_LAZ,
} from "./nubes.js";
import {
  abrirNube,
  NubeEnEscena,
  type CriterioVisual,
  type InformeDeRefresco,
  type NubeCargada,
  type OpcionesDeNube,
} from "./nubes.js";
import { PlanOverlay, type LoadedPlan, type PlanHit, type PlanTransform } from "./plan.js";

export type { IfcGridAxis } from "@aerobim/bim-core";

export type { LoadedPlan, PlanHit, PlanTransform } from "./plan.js";

/**
 * A qué se enganchó el cursor sobre un plano.
 *
 * Las tres referencias de un CAD, en el orden en que se prefieren: el **extremo** de un trazo, su
 * **punto medio** y el punto **sobre la línea** cuando no hay ninguno de los otros cerca.
 */
export interface PlanSnap {
  readonly kind: "endpoint" | "midpoint" | "intersection" | "edge";
  /** El punto enganchado, en metros de la escena. */
  readonly point: readonly [number, number, number];
  readonly layer: string;
  readonly planId: string;
}
export type { DxfLayer } from "@aerobim/bim-core";

export type { ConvertLocation, Converter, ConvertRequest, ConvertResponse } from "./converter.js";

/**
 * Las unidades del modelo se reexportan desde acá.
 *
 * La aplicación las necesita para mostrarlas, y viajan en {@link LoadedModel}: obligarla a
 * importar el tipo del paquete de dominio para leer un campo que le entrega el visor sería
 * filtrar una dependencia sin motivo.
 */
export type {
  IfcUnitKind,
  IfcUnits,
  MissingClass,
  SavedCamera,
  SavedSection,
  SavedView,
  LineaIfc,
  SceneCameraState,
  VisibilidadBcf,
  VistaCompartida,
} from "@aerobim/bim-core";

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

/**
 * Cómo se proyecta la escena. La ortográfica es la de un plano: sin fuga de perspectiva.
 *
 * **El tipo viene del dominio** porque una vista guardada lo persiste: si los nombres se separaran,
 * una vista escrita por una versión no se podría leer con la siguiente.
 */
export type Projection = ViewProjection;

/**
 * Cómo se navega la escena.
 *
 * - `Orbit`: girar alrededor del modelo. Lo normal.
 * - `Plan`: mirar de frente y desplazar, como sobre un plano.
 * - `FirstPerson`: recorrer el interior a la altura de los ojos.
 */
export type NavigationMode = ViewNavigation;

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

/**
 * Qué está oculto en cada modelo: identificadores locales de Fragments.
 *
 * Es la misma forma que guarda una vista (`SavedView.hiddenByModel`), y a propósito: lo que sirve
 * para restaurar una vista sirve para deshacer un aislamiento.
 */
export type VisibilitySnapshot = Readonly<Record<string, readonly number[]>>;

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
  /**
   * Los ejes de replanteo que trae el archivo, ya en metros.
   *
   * Van con el modelo porque son suyos, y porque la interfaz los necesita para poder decir cuántos
   * hay y para encenderlos y apagarlos.
   */
  readonly gridAxes: readonly IfcGridAxis[];
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
  /**
   * **Todos** los hijos del nodo, sin recortar.
   *
   * Antes se descartaban los de los grupos con más de treinta elementos, y el árbol decía "470
   * elementos — clic en el modelo para verlos": un callejón sin salida, porque en una categoría de
   * cientos no hay forma de llegar a uno concreto con el ratón. Cuántos se pintan de entrada lo
   * decide la interfaz, que es donde ese problema vive.
   */
  readonly children: readonly SpatialNode[];
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

/** Lo que dice el auditor de sombras. Ver {@link BimViewer.shadowAudit}. */
export interface ShadowAudit {
  /** `true` si el renderizador tiene el mapa de sombras encendido. */
  readonly shadowMap: boolean;
  /** Luces en la escena, y cuántas de ellas proyectan sombra. */
  readonly lights: number;
  readonly lightsCasting: number;
  /** Mallas del modelo que están dibujadas. */
  readonly meshes: number;
  /** De ésas, cuántas proyectan sombra y cuántas la reciben. */
  readonly casting: number;
  readonly receiving: number;
  /** Si la postproducción —oclusión ambiental y aristas— está encendida. */
  readonly postproduction: boolean;
  /**
   * Qué luces hay y qué alcanza la sombra de cada una, frente a lo que mide el modelo.
   *
   * **Es el dato que separa "no hay sombras" de "hay sombras y caen fuera".** La cámara de
   * sombra de una luz direccional trae un recuadro pequeño por defecto; con un edificio de 27 m
   * de lado, el modelo queda entero fuera y no se dibuja ni una sombra aunque todo lo demás
   * esté bien puesto.
   */
  readonly lightsDetail: readonly string[];
  /** El lado mayor del modelo, en metros. */
  readonly modelSpanM: number;
}

/** Lo que dice el auditor de pintura. Ver {@link BimViewer.paintAudit}. */
export interface PaintAudit {
  /** Materiales que llevan puesta la pintura de la vista fantasma. */
  readonly ghosted: number;
  /**
   * Materiales **opacos**. En vista fantasma, cada uno es un parche sólido a la vista.
   *
   * Es opaco de verdad y no "distinto de la pintura del fantasma", y la diferencia importa: el
   * modelo trae vidrios y barandas translúcidos de fábrica, y dos mallas internas de Fragments con
   * `ShaderMaterial` que no toman pintura ninguna. Contándolas como sólidas, este número **nunca
   * llegaría a cero** y el repintado automático no tendría condición de parada. Ninguna de ellas se
   * ve como el parche que el usuario reporta: van aparte, en {@link translucent}.
   */
  readonly solid: number;
  /** Translúcidos que no llevan la pintura del fantasma. No son huecos; se informan para no perderlos. */
  readonly translucent: number;
  /**
   * De qué son los sólidos, agrupados por malla y material.
   *
   * Distingue "el pintado no llegó a tiempo" de "esas mallas no se pintan nunca porque no son
   * caras", que a ojo son el mismo síntoma y piden arreglos distintos.
   */
  readonly solidKinds: Readonly<Record<string, number>>;
}

const DEFAULT_WASM_PATH = "/wasm/";

/** Un fotograma a 60 Hz, para forzar el avance de los controles de cámara. */
const ONE_FRAME_S = 1 / 60;

/**
 * A qué distancia se pone el objetivo de la cámara al abrir una observación, en metros.
 *
 * **Un viewpoint de BCF guarda una dirección, no un punto al que mirar**, y `camera-controls` pide
 * lo segundo. La dirección dice hacia dónde y no hasta dónde, así que la distancia es una elección
 * nuestra: cambia sobre qué punto orbita después quien mira, y no cambia lo que se ve al llegar.
 */
const DISTANCIA_DE_MIRA = 10;

/**
 * Cuánto se aleja la cámara al encuadrar un elemento, como múltiplo de su lado mayor.
 *
 * Pegado a una viga no se ve de qué viga se habla: hace falta el vecino para reconocer el sitio.
 */
const HOLGURA_AL_ENCUADRAR = 3;

/**
 * Ancho de la instantánea que se guarda con una observación, en píxeles.
 *
 * **Es una miniatura de lista, no una lámina.** En Solibri o Navisworks esto se ve al lado del
 * título del tema, y 1.200 px ya permite reconocer de qué elemento se habla al ampliarla. Guardar el
 * lienzo entero de una pantalla grande multiplicaría por cuatro el peso del BCF sin que nadie mire
 * el detalle: un archivo con treinta temas se manda por correo.
 */
const ANCHO_DE_INSTANTANEA = 1200;

/** Violeta de la marca, para el elemento seleccionado y para las cotas. */
const SELECTION_COLOR = 0x9b5de5;

/** El mismo violeta como color CSS, para las etiquetas de las mediciones. */
const SELECTION_CSS = "#9b5de5";

/**
 * El color del marcador de ajuste, **deliberadamente distinto del violeta de la selección**.
 *
 * Es lo que se investigó de `F1.12` —«al acercar el mouse sin clickear selecciona solo
 * elementos»—. En el código no hay nada que seleccione al pasar el cursor: `pickAt` se llama solo
 * desde el clic y no hay un `addEventListener` de movimiento en todo el paquete. Lo que sí sigue al
 * cursor es el **marcador de ajuste** del medidor, y venía con el borde en `rgb(122, 75, 209)` —un
 * violeta del mismo tono que el elemento seleccionado— y a 10 px. Un punto violeta que salta de
 * vértice en vértice, del mismo color que «esto está seleccionado», se lee como una selección.
 *
 * **Amarillo porque es la convención del CAD**: en AutoCAD y en BricsCAD las marcas de referencia
 * son amarillo verdoso, y nadie las confunde con una selección. El cambio es de color, no de
 * comportamiento: el ajuste engancha donde enganchaba.
 */
const SNAP_CSS = "#ffd43b";

/**
 * Opacidad de la vista fantasma.
 *
 * Translúcido pero todavía legible: con 0,15 el modelo se volvía una silueta y no se distinguía una
 * viga de una losa, que es justo lo que se viene a mirar detrás.
 *
 * **Está aquí y no escrito dentro del pintado porque hay dos lugares que tienen que coincidir**: el
 * que lo pinta y el que comprueba si está pintado (`paintAudit`). Con el número escrito dos veces,
 * cambiarlo en uno deja al otro diciendo que todo el modelo está sin pintar.
 */
const GHOST_OPACITY = 0.3;

/** Margen al comparar opacidades: son flotantes que van y vuelven del worker. */
const TOLERANCIA_OPACIDAD = 0.01;

/**
 * Si un material es el de la vista fantasma.
 *
 * Se compara la opacidad y no solo `transparent`, porque un modelo trae vidrios y barandas
 * translúcidos de fábrica: dándolos por pintados, sus mallas nuevas se quedarían opacas sin que
 * nadie lo note. Un vidrio a 0,4 cuenta como sólido, se repinta a 0,3 y en la siguiente vuelta ya
 * cuenta —el conteo converge, que es lo que hace falta para que sirva de condición de parada.
 */
/**
 * Cuántos repintados se conceden por gesto para tapar la geometría que llega nueva.
 *
 * Existe porque **no todo material se puede pintar**: hay dos mallas internas de Fragments con
 * `ShaderMaterial` y, en un modelo cualquiera, mallas que el resaltado no alcanza. Sin un techo, un
 * material que nunca toma la pintura convierte el repintado automático en un bucle infinito que
 * quema la GPU en silencio. Con techo, cuesta cuatro repintados desperdiciados y para.
 *
 * Se recarga en cada gesto del usuario, así que el techo es por gesto y no para toda la sesión.
 */
const REPINTADOS_POR_GESTO = 4;

/**
 * Cuánto se espera para el refresco diferido de un cambio de proyección, en milisegundos.
 *
 * Ver {@link BimViewer.refrescarAlAsentarse}. **No es un número mágico: es más que un fotograma y
 * menos que un gesto humano.** Tiene que dejar pasar el reordenamiento del nivel de detalle que
 * dispara el cambio de cámara —que no es instantáneo, va por tandas asíncronas— y a la vez ocurrir
 * antes de que alguien mire la pantalla y la vea a medias. Medido: a los 400 ms la escena ya tiene
 * mallas otra vez.
 */
const MS_HASTA_EL_REFRESCO_DIFERIDO = 400;

/**
 * Cuánta luz ambiental deja el sombreado legible.
 *
 * **`ShadowedScene.setup()` la deja en 1,50**, y con la direccional también en 1,50 el término
 * ambiente domina: todas las caras reciben casi lo mismo y el modelo se ve plano. Es la mitad de
 * "no da profundidad" que no tiene nada que ver con las sombras proyectadas — un cubo sin sombra
 * pero bien sombreado se lee como un cubo; con ambiente al máximo se lee como una silueta.
 *
 * 0,45 deja los rincones oscuros sin que las caras a contraluz se vayan a negro.
 */
const LUZ_AMBIENTE = 0.25;

/** La direccional sube para compensar el ambiente que baja: el modelo no se oscurece en total. */
const LUZ_DIRECCIONAL = 2.2;

/**
 * La luz de cielo y suelo, y **es lo que arregla los interiores**.
 *
 * El equilibrio anterior —ambiente 0,45 y direccional 2,2— dejó los **exteriores** legibles y los
 * **interiores** planos, y el motivo es geométrico: dentro de una sala **la direccional la tapa el
 * techo**, así que a un muro interior solo le llegaba el término ambiente, que es igual en todas
 * las direcciones. El resultado es lo que el usuario describió mirando una oficina del `Piso 5`:
 * todo el mismo gris medio, sin saber dónde acaba un muro y empieza el techo.
 *
 * Una `HemisphereLight` da color de cielo a lo que mira hacia arriba y color de suelo a lo que mira
 * hacia abajo. **Eso es información donde antes no había ninguna**: un techo y un piso dejan de
 * tener el mismo valor sin necesidad de que les llegue una sombra. Y no proyecta sombras, así que
 * no cuesta un mapa más.
 *
 * El ambiente baja de 0,45 a 0,25 para dejarle sitio: la suma de luz difusa se mantiene, y lo que
 * cambia es que **ahora tiene arriba y abajo**.
 */
const LUZ_HEMISFERIO = 0.85;

/** Azul muy pálido: el cielo. Saturarlo pinta el modelo de azul en vez de orientarlo. */
const CIELO = 0xdfe8f5;

/** Y un gris cálido oscuro para el suelo, que es lo que devuelve el rebote de un piso. */
const SUELO = 0x4a4740;

/**
 * Cuánto más grande que el modelo se hace el recuadro de sombra.
 *
 * La sombra de un edificio cae **fuera** de su planta —es una proyección oblicua—, así que un
 * recuadro del tamaño justo la corta por la mitad.
 */
const HOLGURA_DE_SOMBRA = 1.6;

/**
 * Enciende el mapa de sombras y equilibra las luces que dejó `setup()`.
 *
 * Se hace una vez al crear el mundo. Lo que depende del modelo —el alcance de la sombra— se
 * ajusta cada vez que entra uno: ver {@link BimViewer.ajustarLuces}.
 */
function encenderSombras(world: World): void {
  const renderizador = world.renderer?.three;
  if (renderizador !== undefined) {
    renderizador.shadowMap.enabled = true;
    // Bordes suaves. Con el mapa duro por defecto, la sombra de una viga sale como una escalera
    // de píxeles y se lee como un defecto de dibujo, no como una sombra.
    renderizador.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  world.scene.three.traverse((objeto) => {
    const luz = objeto as THREE.Light;
    if (!luz.isLight) return;
    if ((luz as THREE.AmbientLight).isAmbientLight) luz.intensity = LUZ_AMBIENTE;
    else if (luz.castShadow) luz.intensity = LUZ_DIRECCIONAL;
  });

  // **La luz de cielo y suelo, que la escena de la librería no trae.** Ver {@link LUZ_HEMISFERIO}:
  // es lo que da orientación a un muro interior, donde la direccional no llega porque la tapa el
  // techo. Se marca con un nombre para poder encontrarla en la auditoría de luces.
  const hemisferio = new THREE.HemisphereLight(CIELO, SUELO, LUZ_HEMISFERIO);
  hemisferio.name = "aerobim:hemisferio";
  world.scene.three.add(hemisferio);
}

/**
 * Pinta de amarillo las marcas de ajuste del medidor, en vez del violeta que traen.
 *
 * **Toca estáticos de la librería, y por eso está aislado en una función con su nombre.** Los
 * estilos del marcador son `static` de `GraphicVertexPicker` —de la clase, no de la instancia—, así
 * que se ponen una vez al crear el mundo. Se conserva la **forma** de cada clase de ajuste, que es
 * información útil y ya venía distinguida: círculo para la cara, cuadrado para el vértice y para la
 * arista. Lo único que cambia es el color, para que no se confunda con la selección (`F1.12`).
 */
function recolorearMarcadorDeAjuste(): void {
  const picker = OBF.GraphicVertexPicker;
  picker.baseSnappingStyle = { ...picker.baseSnappingStyle, borderColor: SNAP_CSS };

  // Las claves son del enumerado de Fragments, así que se recorren tal como están en el objeto:
  // enumerarlas a mano las dejaría atrás en cuanto la librería añada una clase de ajuste.
  const porClase = picker.snappingStyles as Record<string, Partial<CSSStyleDeclaration>>;
  for (const clase of Object.keys(porClase)) {
    porClase[clase] = { ...porClase[clase], borderColor: SNAP_CSS };
  }
}

function esFantasma(material: THREE.Material): boolean {
  return material.transparent && Math.abs(material.opacity - GHOST_OPACITY) < TOLERANCIA_OPACIDAD;
}

/**
 * El punto del ratón tal como lo espera el rayo de Fragments: **en píxeles de la ventana**.
 *
 * Existe para dejar dicho por qué no se le resta la posición del lienzo, que es lo que uno haría por
 * costumbre y lo que estuvo mal durante toda la primera etapa del visor.
 *
 * `screenToCast` de Fragments hace esto por dentro:
 *
 * ```js
 * const rect = element.getBoundingClientRect();
 * const x = (p.x - rect.left) / scaleX;
 * ```
 *
 * Es decir, **ya resta el rectángulo**. Restarlo antes lo resta dos veces, y el rayo sale desviado
 * exactamente lo que mide el borde izquierdo del lienzo. Con el árbol como única columna eran 48 px
 * y el fallo pasaba por "el picker es impreciso"; al poner el panel de propiedades a la izquierda
 * pasaron a ser 288 px y entonces se veía clarísimo: clic en un pilar, se seleccionaba otro.
 *
 * La moraleja para la próxima envoltura: **antes de convertir coordenadas, leer qué espera la
 * librería.** Este error no da error, solo respuestas equivocadas.
 */
function mouseFor(clientX: number, clientY: number): THREE.Vector2 {
  return new THREE.Vector2(clientX, clientY);
}

/**
 * La misma caja, pero nunca plana del todo.
 *
 * **Encuadrar una caja sin grosor deja la cámara en `NaN`**, y con eso la vista muere: no se dibuja
 * nada, el rayo no encuentra nada y ningún botón la recupera, porque todos parten de donde está la
 * cámara. Pasa con un plano 2D —que es exactamente plano— y con un elemento sin espesor, como una
 * losa vista sola.
 *
 * Se le da un grosor mínimo a los lados degenerados. Son centímetros sobre decenas de metros: no
 * cambia el encuadre que se ve, y quita el caso que rompe la aritmética de la cámara.
 */
function conGrosor(box: THREE.Box3): THREE.Box3 {
  const tamano = box.getSize(new THREE.Vector3());
  const minimo = Math.max(0.01, Math.max(tamano.x, tamano.y, tamano.z) * 0.001);
  if (tamano.x >= minimo && tamano.y >= minimo && tamano.z >= minimo) return box;

  return box
    .clone()
    .expandByVector(
      new THREE.Vector3(
        tamano.x < minimo ? minimo : 0,
        tamano.y < minimo ? minimo : 0,
        tamano.z < minimo ? minimo : 0,
      ),
    );
}

/**
 * Un vector unitario dentro del plano de `normal`.
 *
 * Hace falta para dibujar la escuadra del ángulo recto: uno de sus lados va sobre la cara. Se elige
 * cruzando la normal con un eje que no sea paralelo a ella —si la cara es horizontal se usa el eje X
 * y si no, la vertical— porque el producto cruzado con un vector paralelo da cero y no daría
 * dirección alguna.
 */
function direccionEnElPlano(normal: THREE.Vector3): THREE.Vector3 {
  const referencia =
    Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(normal, referencia).normalize();
}

/** Una polilínea suelta de la escena, dibujada por encima de la geometría. */
function polilinea(puntos: readonly THREE.Vector3[], color: number): THREE.Line {
  const linea = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([...puntos]),
    new THREE.LineBasicMaterial({ color, depthTest: false }),
  );
  // Por encima del modelo: una marca de medición escondida dentro de una viga no sirve de nada.
  linea.renderOrder = 2;
  return linea;
}

/**
 * La escuadra que marca el ángulo recto en el pie de una perpendicular.
 *
 * **Es lo que convierte una línea en una cota perpendicular.** Sin ella, la línea que va del punto a
 * la cara es una raya más y no dice que forme noventa grados: quien mira no puede confiar en que la
 * medida sea la perpendicular y no una diagonal cualquiera. Es la misma notación de un plano a mano.
 *
 * Se dibuja con dos segmentos —un lado sobre la cara y otro sobre la perpendicular— y su tamaño es
 * una fracción de la medida, acotada, para que se vea igual midiendo cinco centímetros que veinte
 * metros.
 */
function escuadraDeAnguloRecto(
  pie: THREE.Vector3,
  haciaElPunto: THREE.Vector3,
  normal: THREE.Vector3,
  color: number,
): THREE.Line {
  const largo = pie.distanceTo(haciaElPunto);
  const lado = Math.min(Math.max(largo * 0.12, 0.02), 1);

  const sobreLaCara = direccionEnElPlano(normal).multiplyScalar(lado);
  const sobreLaPerpendicular = haciaElPunto.clone().sub(pie).normalize().multiplyScalar(lado);

  const a = pie.clone().add(sobreLaCara);
  const esquina = a.clone().add(sobreLaPerpendicular);
  const b = pie.clone().add(sobreLaPerpendicular);

  return polilinea([a, esquina, b], color);
}

/**
 * La marca de la cara de referencia: una cruz sobre la cara y su normal saliendo.
 *
 * Aparece con el primer clic y contesta la pregunta que antes quedaba en el aire: **¿tomó la cara que
 * quería?** Sin esto, el primer clic de una perpendicular no producía ningún cambio en pantalla y no
 * había forma de saber si había entrado.
 *
 * El tamaño va con la distancia a la cámara, como en cualquier programa de dibujo: así se ve igual de
 * grande esté uno cerca de un tornillo o lejos de una nave.
 */
function marcaDeReferencia(
  punto: THREE.Vector3,
  normal: THREE.Vector3,
  distanciaALaCamara: number,
  color: number,
): THREE.Group {
  const tamano = Math.min(Math.max(distanciaALaCamara * 0.02, 0.02), 2);

  const enElPlano = direccionEnElPlano(normal).multiplyScalar(tamano);
  const cruzado = new THREE.Vector3()
    .crossVectors(normal, enElPlano)
    .normalize()
    .multiplyScalar(tamano);

  const grupo = new THREE.Group();
  grupo.add(polilinea([punto.clone().sub(enElPlano), punto.clone().add(enElPlano)], color));
  grupo.add(polilinea([punto.clone().sub(cruzado), punto.clone().add(cruzado)], color));
  // La normal saliendo de la cara: dice hacia dónde se va a medir.
  grupo.add(
    polilinea(
      [
        punto,
        punto.clone().add(
          normal
            .clone()
            .normalize()
            .multiplyScalar(tamano * 1.5),
        ),
      ],
      color,
    ),
  );
  return grupo;
}

/** Libera una polilínea o un grupo de ellas: geometría y material son propios de cada una. */
function liberarDibujo(objeto: THREE.Object3D): void {
  objeto.removeFromParent();
  objeto.traverse((hijo) => {
    if (!(hijo instanceof THREE.Line)) return;
    hijo.geometry.dispose();
    (hijo.material as THREE.Material).dispose();
  });
}

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

  return {
    key,
    label,
    category,
    localId: raw.localId,
    count: localIds.length,
    localIds,
    children,
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
  // **Un número puede venir escrito como texto**, y hay que rescatarlo: ProStructures exporta el
  // peso de un perfil como `IFCLABEL('579.84')` mientras el largo del mismo perfil sí va como
  // medida. Si solo se aceptaran números, ese peso se quedaría sin kilos.
  const esNumero =
    typeof campo.value === "number" ||
    (typeof campo.value === "string" && looksNumeric(campo.value));

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

  if (aporta(categoria, propias)) {
    grupos.push({ name: encabezadoDe(categoria, nombre, claveRelacion), properties: propias });
  }

  for (const [clave, contenido] of Object.entries(relacionado)) {
    if (!Array.isArray(contenido)) continue;
    if (RELACIONES_IGNORADAS.has(clave) || RELACIONES_YA_LEIDAS.has(clave)) continue;

    for (const anidado of contenido) {
      if (typeof anidado !== "object" || anidado === null) continue;
      if (localIdDe(anidado) === localIdPropio) continue;

      // **Un pset colgado del tipo también es un pset**, y hasta ahora este nivel solo leía
      // atributos: los psets del tipo salían como bloques con una sola línea, su propio nombre.
      // El IFC4 de OpenBuildings del usuario mostraba quince seguidos —`Pset_BeamCommon`,
      // `ObjectLEED`, `StructuralQuantities`…— antes de los mismos psets con sus valores.
      const categoriaAnidada = categoriaDe(anidado);
      const desdePsetAnidado = propiedadesDePset(anidado, units);
      const propiedades =
        desdePsetAnidado.length > 0 ? desdePsetAnidado : atributosDe(anidado, new Set(), units);
      if (!aporta(categoriaAnidada, propiedades)) continue;

      grupos.push({
        name: encabezadoDe(categoriaAnidada, nombreDe(anidado), clave),
        properties: propiedades,
      });
    }
  }

  return grupos;
}

/**
 * `true` si el bloque dice algo que no esté ya en su título.
 *
 * **Un pset vacío no es un pset.** Cuando el archivo declara el conjunto y no llegan sus
 * propiedades, lo único que queda es su nombre —y el nombre ya es el título del bloque—, así que
 * mostrarlo es repetir una palabra y hacer creer que hay datos donde no los hay. Con un tipo o un
 * material es al revés: `IFCMATERIAL · Iron` con solo su nombre **sí** informa de qué está hecho el
 * elemento, y por eso el filtro se limita a los conjuntos de propiedades y cantidades.
 */
function aporta(categoria: string | null, propiedades: readonly PropertyValue[]): boolean {
  if (propiedades.length === 0) return false;

  const esConjunto = categoria === "IFCPROPERTYSET" || categoria === "IFCELEMENTQUANTITY";
  if (!esConjunto) return true;

  return !(propiedades.length === 1 && propiedades[0]?.name === "Name");
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

/**
 * Cuántos píxeles de radio se aceptan al señalar un punto de la nube.
 *
 * Seis: un poco más que el tamaño con el que se pintan los puntos. Con un radio de uno hay que
 * acertar el centro exacto de un punto de 2 px, que es cazar un píxel; con seis se señala la
 * esquina que se está mirando. Y no más, porque entonces empieza a atrapar el punto de detrás.
 */
const RADIO_DE_SENALADO = 6;

/**
 * Un punto señalado sobre la nube, en los dos sistemas que hacen falta.
 *
 * `escena` sirve para dibujar la marca donde se pinchó; `archivo` es el que se guarda en el par de
 * calce, porque es el sistema de los datos y no el de nuestro renderizador.
 */
export interface PuntoSenalado {
  escena: [number, number, number];
  archivo: [number, number, number];
  /** A qué distancia de la cámara cayó, en metros. Sirve para quedarse con el más cercano. */
  distancia: number;
}

/**
 * Los seis planos del tronco de visión de la cámara, con la normal hacia dentro.
 *
 * Es la convención que espera `nodosVisibles`: un punto está dentro cuando `normal·p + constante ≥
 * 0` en los seis. `THREE.Frustum` los da justamente así, y por eso se toman de ahí en vez de
 * calcularlos — un signo al revés dejaría el recorte cargando solo lo que **no** se ve.
 */
function planosDeLaCamara(camara: THREE.Camera): { a: number; b: number; c: number; d: number }[] {
  camara.updateMatrixWorld();
  const proyeccion = new THREE.Matrix4().multiplyMatrices(
    camara.projectionMatrix,
    camara.matrixWorldInverse,
  );
  const tronco = new THREE.Frustum().setFromProjectionMatrix(proyeccion);
  return tronco.planes.map((p) => ({
    a: p.normal.x,
    b: p.normal.y,
    c: p.normal.z,
    d: p.constant,
  }));
}

/**
 * `altoDeLaVentana / (2·tan(fov/2))`, que es lo que convierte metros a píxeles a una distancia.
 *
 * **Devuelve `undefined` para una cámara ortogonal**, y eso no es una laguna: en una ortogonal el
 * tamaño en pantalla **no depende de la distancia**, así que la fórmula no aplica y forzarla daría
 * un nivel de detalle inventado. Sin factor, la selección ordena por profundidad —lo menos profundo
 * primero—, que es correcto aunque menos fino; el recorte por vista, que es la mitad importante,
 * sigue funcionando igual.
 */
function factorDeProyeccionDe(camara: THREE.Camera, altoEnPixeles: number): number | undefined {
  if (!(camara instanceof THREE.PerspectiveCamera)) return undefined;
  if (!Number.isFinite(altoEnPixeles) || altoEnPixeles <= 0) return undefined;
  const mitad = (camara.fov * Math.PI) / 360;
  return altoEnPixeles / (2 * Math.tan(mitad));
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
  /** La nube de puntos abierta, si hay. Una sola: ver {@link loadPointCloud}. */
  private nube: NubeEnEscena | null = null;
  private renderStyle: RenderStyle = "solid";
  /** El modo de navegación actual: la cámara de That Open no lo devuelve, así que se recuerda. */
  private navigationMode: NavigationMode = "Orbit";
  private measureMode: MeasureMode | null = null;
  private snapMode: SnapMode = "vertex";
  /**
   * La cara de referencia de una perpendicular en curso: un punto suyo y su normal.
   *
   * `null` mientras no se ha elegido ninguna. Ver {@link addMeasurePoint}.
   */
  private referencePlane: { readonly point: Point3; readonly normal: Point3 } | null = null;
  private readonly tools: MeasureTools;
  /**
   * Los planos 2D dibujados en la escena. Ver {@link loadPlan}.
   *
   * Se crea siempre, aunque no haya ningún plano: no cuesta nada y evita el `null` en cada uso.
   */
  private readonly plans: PlanOverlay;
  /** Los ejes de replanteo de los modelos abiertos. Ver {@link loadIfc} y {@link setGridVisible}. */
  private readonly grids: GridOverlay;
  /** Los planos generados desde el modelo. Ver {@link createDrawing}. */
  private readonly drawings: DrawingMaker;
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
  /** `true` mientras se atiende un repintado disparado por geometría nueva. */
  private repintandoPorVista = false;
  /**
   * Los puntos que llevan puestos el ángulo y el área en curso.
   *
   * **Son propios desde el 2026-08-26**, como ya lo eran los de la distancia: el ajuste de los
   * medidores de la librería lee píxeles de la escena dibujada y no informa cuando no resuelve,
   * así que un clic al vacío se veía igual que uno que entró. Ver {@link addMeasurePoint}.
   */
  private puntosDeAngulo: THREE.Vector3[] = [];
  private puntosDeArea: THREE.Vector3[] = [];
  /** Las marcas de los puntos ya puestos, para poder quitarlas al cerrar o al cancelar. */
  private marcasDeMedicion: THREE.Object3D[] = [];
  /**
   * Las mallas a las que la vista fantasma les cambió el material, con el que tenían.
   *
   * Se guarda la referencia original y no una copia de sus valores: salir de la vista fantasma es
   * reponerla. Ver {@link completarPintura}.
   */
  private readonly pinturaPropia = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  /** Un clon translúcido por material de origen, para no subir miles a la GPU. */
  private readonly clonesDeFantasma = new Map<THREE.Material, THREE.Material>();
  /**
   * El camino de vuelta: de un clon translúcido al material opaco del que salió.
   *
   * **Y a diferencia de {@link clonesDeFantasma}, este no se vacía nunca.** Es lo que arregla el
   * fantasma que se quedaba pegado: Fragments crea mallas nuevas al cambiar el nivel de detalle y
   * les pone el material que encuentra, que puede ser un clon translúcido nuestro. Esas mallas
   * llegan **después** de {@link despintar}, así que no están en {@link pinturaPropia} y nadie las
   * devolvía a sólido: quedaban en fantasma para siempre, y el cambio de proyección —que rehace
   * las mallas del nivel de detalle— era el momento en que se veía.
   *
   * Con este mapa, cualquier malla que aparezca vistiendo un clon se puede devolver a su original
   * en cualquier momento, aunque nadie recuerde habérselo puesto.
   */
  private readonly originalDeClon = new Map<THREE.Material, THREE.Material>();
  /**
   * Los materiales que hubo que pintar **en su sitio** por no dejarse clonar, y cómo estaban.
   *
   * Son los del nivel de detalle de Fragments. Ver {@link pinturaDe}.
   */
  private readonly pinturaEnSitio = new Map<
    THREE.Material,
    {
      readonly transparent: boolean;
      readonly opacity: number;
      readonly depthWrite: boolean;
      readonly side: THREE.Side;
    }
  >();
  /**
   * Repintados que quedan por intentar sobre la geometría nueva. Ver {@link repintarGeometriaNueva}.
   *
   * Arranca en cero porque en vista sólida no hay nada que repintar; se recarga al entrar en vista
   * fantasma y cada vez que la cámara descansa, que son los momentos en que el usuario hizo algo.
   */
  private presupuestoDePintura = 0;
  /**
   * El refresco diferido que queda por disparar, o `null`.
   *
   * Ver {@link refrescarAlAsentarse}. Se guarda para poder reprogramarlo y para poder cancelarlo al
   * destruir el visor: un `setTimeout` vivo sobre una escena ya liberada revienta al dispararse.
   */
  private refrescoPendiente: ReturnType<typeof setTimeout> | null = null;
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
    /**
     * Los puntos que se clicaron, en coordenadas de la escena. `F4.5`.
     *
     * **Se guardan porque son el marcado.** BCF escribe el marcado de un viewpoint como segmentos
     * de recta en coordenadas del modelo, y medir consiste justamente en poner puntos ahí: sin
     * esta lista habría que ir a buscarlos dentro de los objetos de la librería, que es leer sus
     * entrañas y romperse en su siguiente versión.
     */
    puntos: Point3[];
    /** Lo que se dibuja de esa medición: la cota, el relleno, la etiqueta. */
    visuals: Ocultable[];
    /**
     * Dibujos **propios**, que hay que liberar a mano al borrar la medición.
     *
     * Son los que no crea la librería: hoy, la escuadra del ángulo recto de una perpendicular. Se
     * apuntan aparte porque la librería solo libera lo suyo, y una marca que sobrevive a su medición
     * se queda flotando en la escena sin dueño.
     */
    owned: THREE.Object3D[];
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
  /** Dibujos propios que esperan a que su medición quede registrada. Ver {@link registrarCota}. */
  private propiosPendientes: THREE.Object3D[] = [];
  /**
   * Los puntos de la medición que se está registrando, en coordenadas de la escena.
   *
   * Mismo relevo que {@link visualesPendientes} y por el mismo motivo: quien conoce los puntos es
   * el método que crea la medición, y quien la registra es el aviso de la librería que corre
   * después. Se dejan acá entre las dos cosas.
   */
  private puntosPendientes: Point3[] = [];
  /**
   * Lo que estaba oculto **antes** de cada aislamiento, uno por cada uno sin deshacer.
   *
   * Es lo que hace que aislar sea un paso reversible en vez de un camino de ida: al salir se
   * vuelve a lo que había —con lo que se había apagado a mano todavía apagado—, y no a todo
   * encendido, que es lo que hace {@link showAll}. Aislar dentro de un aislamiento apila otro
   * nivel, así que se sale de a uno. Ver {@link undoIsolation}.
   */
  private readonly visibilityStack: VisibilitySnapshot[] = [];
  /**
   * El primer punto de una medición tomada **sobre el plano 2D**, si hay una a medias.
   *
   * Vive aparte de los medidores de la librería porque los puntos no salen de ellos: salen del
   * ajuste propio a los trazos del CAD. Ver {@link addPlanMeasurePoint}.
   */
  private planMeasureStart: THREE.Vector3 | null = null;
  /** `true` si medir se engancha a los trazos del plano. Se puede apagar desde la cinta. */
  private planSnapEnabled = true;
  /**
   * La marca de la cara de referencia mientras se mide una perpendicular.
   *
   * Vive fuera del registro de mediciones porque no pertenece a ninguna: es de la medición **a
   * medias**, y desaparece en cuanto se completa o se cancela.
   */
  private marcaReferencia: THREE.Object3D | null = null;
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
    this.plans = new PlanOverlay(world.scene.three);
    this.grids = new GridOverlay(world.scene.three);
    this.drawings = new DrawingMaker(components);
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

    // **Y ahora las sombras de verdad.** `setup({shadows})` crea la luz que las proyecta y deja
    // el resto sin hacer: medido con `diag.html?modo=sombras`, el mapa de sombras del
    // renderizador venía **apagado**, así que no se calculaba ninguna. Ver {@link ajustarLuces}.
    encenderSombras(world);

    // **El marcador de ajuste, en amarillo y no en violeta.** Va acá y no en `prepararMedidor`
    // porque los estilos son estáticos de `GraphicVertexPicker`: son de la clase, no de cada
    // medidor, así que ponerlos tres veces sería decir lo mismo tres veces. Ver {@link SNAP_CSS}.
    recolorearMarcadorDeAjuste();

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
      // Descansar la cámara es un gesto terminado: se le renueva el presupuesto de repintados
      // para que la geometría que traiga el nivel de detalle nuevo se pueda tapar.
      this.presupuestoDePintura = REPINTADOS_POR_GESTO;

      if (this.renderStyle === "wireframe" || this.selection !== null) void this.applyHighlights();
      else void this.refresh();
    });

    // Solo se cuelga el modelo de la escena. El refresco lo hace `loadIfc` cuando la
    // carga ya terminó, que es el único momento en que es seguro pedirlo.
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.modelCount += 1;

      // **`rest` no alcanza para la vista fantasma.** Medido con `diag.html?modo=fantasma`: al
      // descansar la cámara el modelo se quedaba al 62 % pintado y ahí se quedaba, porque las
      // mallas del nivel de detalle nuevo llegan *después* del repintado, no antes. Este evento es
      // el que avisa cuando llegaron. Ver {@link repintarGeometriaNueva}.
      model.onViewUpdated.add(() => {
        // Las banderas de sombra van por objeto y la geometría nueva llega sin ellas, así que
        // esto no es opcional: sin la línea, media planta deja de proyectar al girar la cámara.
        this.ajustarLuces();
        void this.repintarGeometriaNueva();
      });
    });
  }

  /**
   * Vuelve a pintar de fantasma lo que llegó opaco, y sabe cuándo parar.
   *
   * **Es el arreglo de `F1.15`** —"el modo fantasma se cae al mover"—. Fragments dibuja por niveles
   * de detalle: mover la cámara descarta mallas y trae otras, y las que llegan traen su material
   * original, opaco. El repintado al descansar la cámara no basta porque corre *antes* de que esas
   * mallas existan; medido, dejaba el modelo al 62 % y no avanzaba más.
   *
   * **Lo delicado es parar.** El propio repintado termina en `fragments.core.update(true)`, que
   * dispara otro `onViewUpdated`: sin condición de parada esto es un bucle infinito. La condición
   * es la escena misma —{@link paintAudit} cuenta los materiales opacos que quedan— y por eso
   * `solid` cuenta solo lo **opaco**: contando también los translúcidos que no toman la pintura,
   * nunca llegaría a cero. Y por si algún material no se deja pintar en un modelo que no hemos
   * visto, el {@link REPINTADOS_POR_GESTO} pone un techo por gesto.
   */
  private async repintarGeometriaNueva(): Promise<void> {
    if (this.disposed || this.loading) return;
    // El refresco del repintado dispara este mismo evento; atenderlo aquí sería morderse la cola.
    if (this.applyingHighlights || this.repintandoPorVista) return;

    // **En vista sólida hay trabajo simétrico que hacer, y no hacerlo era el defecto.** El material
    // original es el correcto, sí, pero la geometría nueva puede nacer **vistiendo un clon
    // translúcido nuestro**, y entonces se queda en fantasma para siempre. Ver
    // {@link limpiarFantasmaResidual}.
    if (this.renderStyle !== "wireframe") {
      await this.limpiarFantasmaResidual();
      return;
    }

    const antes = this.paintAudit.solid;
    if (antes === 0) {
      this.presupuestoDePintura = REPINTADOS_POR_GESTO;
      return;
    }
    if (this.presupuestoDePintura <= 0) return;

    this.repintandoPorVista = true;
    try {
      await this.applyHighlights();
      // Solo se gasta presupuesto cuando el repintado **no sirvió**. Si bajó el conteo, el
      // siguiente aviso vuelve a tener el cupo entero: acercarse a un modelo grande trae geometría
      // en muchas tandas, y cada tanda merece su intento.
      if (this.paintAudit.solid >= antes) this.presupuestoDePintura -= 1;
      else this.presupuestoDePintura = REPINTADOS_POR_GESTO;
    } finally {
      this.repintandoPorVista = false;
    }
  }

  /**
   * Quita el fantasma que quedó pegado en vista sólida, y sabe cuándo parar.
   *
   * **Es la mitad que faltaba de `F1.15`.** Entrar en la vista fantasma tenía su bucle —
   * {@link repintarGeometriaNueva}, que insiste hasta que no queda nada opaco— y **salir no tenía
   * nada equivalente**: se despintaba una vez y las mallas que el nivel de detalle creara después
   * nacían con un clon translúcido, sin nadie que las devolviera. El usuario lo vio al cambiar de
   * proyección, que es justo lo que rehace esas mallas: «sigue el fantasma al pasar a ortográfica».
   *
   * El oráculo es el mismo y por eso es fiable: {@link paintAudit} cuenta las mallas que llevan
   * puesta la pintura del fantasma, y en vista sólida **eso tiene que ser cero**. La condición de
   * parada sale de la escena, no de una suposición sobre cuántas pasadas hacen falta, y el
   * presupuesto por gesto pone el techo por si algún material no se deja devolver.
   */
  private async limpiarFantasmaResidual(): Promise<void> {
    const antes = this.paintAudit.ghosted;
    if (antes === 0) {
      this.presupuestoDePintura = REPINTADOS_POR_GESTO;
      return;
    }
    if (this.presupuestoDePintura <= 0) return;

    this.repintandoPorVista = true;
    try {
      this.quitarClonesHuerfanos();
      await this.fragments.core.update(true);
      // Igual que al entrar: solo se gasta presupuesto cuando la pasada **no sirvió**.
      if (this.paintAudit.ghosted >= antes) this.presupuestoDePintura -= 1;
      else this.presupuestoDePintura = REPINTADOS_POR_GESTO;
    } finally {
      this.repintandoPorVista = false;
    }
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
   * Las cotas visibles, convertidas en el marcado de un viewpoint de BCF. `F4.5`.
   *
   * **Las cotas dibujadas son el marcado**, y no es un atajo: BCF guarda el marcado como segmentos
   * de recta en coordenadas del modelo, y medir consiste justamente en poner puntos ahí. La regla
   * de cómo se convierte cada medida —una distancia da un tramo, un ángulo dos, un área su
   * contorno cerrado— vive en `bim-core` con sus pruebas.
   *
   * **Solo las visibles.** Una cota apagada es una que quien anota decidió no mostrar, y mandarla
   * al otro extremo sería devolverle lo que el autor quitó de la pantalla.
   */
  capturarMarcadoBcf(): readonly LineaIfc[] {
    this.assertAlive();

    return lineasDesdeMediciones(
      this.drawn
        .filter((cota) => cota.visible && cota.puntos.length > 0)
        .map((cota) => ({ kind: cota.kind, puntos: cota.puntos })),
    );
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
    if (entrada === undefined) return;

    this.listaDe(entrada.kind).delete(entrada.object);
    // Los dibujos propios los libera nadie más: la librería solo se ocupa de los suyos.
    for (const propio of entrada.owned) liberarDibujo(propio);
    this.world.renderer?.update();
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
    const owned = this.propiosPendientes;
    const puntos = this.puntosPendientes;
    this.visualesPendientes = [];
    this.propiosPendientes = [];
    this.puntosPendientes = [];

    const existente = this.drawn.find((cota) => cota.object === object);
    if (existente !== undefined) {
      existente.visuals.push(...visuals);
      existente.owned.push(...owned);
      return;
    }

    this.drawn.push({ id: object.id, kind, object, puntos, visuals, owned, visible: true });
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
    const [categories, itemsWithGeometry, cargados] = await Promise.all([
      model.getCategories(),
      model.getItemsWithGeometry(),
      this.loadedByClass(model),
    ]);

    onStage("drawing");
    await this.fragments.core.update(true);

    // **Las sombras se ajustan en cuanto hay geometría**, que es el primer momento en que se
    // conoce el tamaño del modelo: el alcance de la sombra depende de él. Ver {@link ajustarLuces}.
    this.ajustarLuces();

    onStage("framing");
    const sizeM = await this.fitTo(model);
    const displayMs = performance.now() - startedAt;
    onStage("done");

    this.unitsByModel.set(model.modelId, units);

    // **Los ejes de replanteo se leen del archivo, no del conversor**, que los deja sin geometría.
    // Se dibujan a la base del modelo, que es donde se leen: ver `ifcGrid` en `bim-core`.
    const rejilla = parseIfcGrids(texto);
    if (rejilla.axes.length > 0) {
      const caja = await this.boxOf(model);
      this.grids.add(model.modelId, rejilla.axes, caja?.min.y ?? 0);
    }

    return {
      id: model.modelId,
      name,
      model,
      units,
      gridAxes: rejilla.axes,
      metrics: {
        ifcBytes,
        fragBytes: fragByteLength,
        convertMs,
        displayMs,
        categoryCount: categories.length,
        itemsWithGeometry: itemsWithGeometry.length,
        sizeM,
        convertedIn: this.conversor.location,
        missingClasses: missingElementClasses(clasesDelArchivo, cargados.porClase),
        emptyClasses: emptyElementClasses(cargados.sinDibujo),
      },
    };
  }

  /**
   * Cuántos elementos llegaron de cada clase, y cuáles llegaron **sin dibujo**.
   *
   * Las dos cifras salen de la misma consulta porque comparten el trabajo caro: pedir los
   * identificadores agrupados por categoría. De ahí se cuenta por clase —lo que se compara contra el
   * archivo— y se separan los que no tienen geometría, que es el otro caso posible.
   */
  private async loadedByClass(model: FRAGS.FragmentsModel): Promise<{
    porClase: ReadonlyMap<string, number>;
    sinDibujo: readonly (string | null)[];
  }> {
    const [porCategoria, conGeometria] = await Promise.all([
      model.getItemsOfCategories([/^IFC/]),
      model.getItemsIdsWithGeometry(),
    ]);

    const tienen = new Set(conGeometria);
    const porClase = new Map<string, number>();
    const sinDibujo: string[] = [];

    for (const [categoria, ids] of Object.entries(porCategoria)) {
      porClase.set(categoria.toUpperCase(), ids.length);
      for (const id of ids) {
        if (!tienen.has(id)) sinDibujo.push(categoria);
      }
    }

    return { porClase, sinDibujo };
  }

  /**
   * Qué elemento hay bajo un punto de la pantalla, con sus propiedades.
   *
   * Devuelve `null` si ahí no hay nada, que es la mitad de los clics en un visor y no es
   * un error.
   *
   * **Las coordenadas van tal cual, en píxeles de la ventana** (`clientX` / `clientY` del evento de
   * ratón). No hay que restarles la posición del lienzo: el `screenToCast` de Fragments ya lo hace
   * por dentro. Restarla antes fue un fallo real y difícil de ver — ver {@link mouseFor}.
   */
  async pickAt(clientX: number, clientY: number): Promise<PickedItem | null> {
    this.assertAlive();

    const canvas = this.world.renderer?.three.domElement;
    if (!canvas) return null;

    const result = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: mouseFor(clientX, clientY),
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
   *
   * **Y las dos capas ya no se pintan con el mismo mecanismo.** La selección la resuelve Fragments,
   * que es lo que sabe hacer; el fantasma lo pinta {@link completarPintura} por su cuenta, porque
   * medido no llegaba a un tercio del modelo y no se podía deshacer.
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

        // **Se despinta al principio de cada pasada, no solo al salir de la vista fantasma.** La
        // librería arma sus materiales a partir del que la malla tiene puesto, así que si ve el clon
        // translúcido, lo que construya encima nace translúcido: el elemento seleccionado se volvía
        // invisible dentro del fantasma por esto. Que vea siempre los materiales originales.
        this.despintar();

        if (this.renderStyle === "wireframe") this.completarPintura();

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
   * Pinta de translúcido las mallas del modelo: **la vista fantasma, hecha por nuestra cuenta**.
   *
   * Antes esto lo hacía `fragments.highlight()`, y las mediciones con `diag.html?modo=fantasma`
   * sobre `Piso 5.ifc` dijeron que no sirve para esto, por dos motivos independientes:
   *
   * 1. **No llega a un tercio del modelo.** Quedaban 16 mallas opacas *y dibujando* —258, 822, 180
   *    índices reales—, y no es cuestión de a quién se resalta: pasar la lista explícita de todos los
   *    elementos con `getLocalIds()` daba exactamente el mismo 16, y repetir la llamada tampoco. Son
   *    `LODMesh`, las mallas que Fragments dibuja **mientras la cámara se mueve**, y no pasan por su
   *    registro de resaltado. Ahí estaba el "se cae al mover" del informe.
   * 2. **`resetHighlight()` no deshace lo que `highlight()` sí pinta.** Al volver a sólido quedaban
   *    13 mallas translúcidas para siempre, y el material que la librería construía para la
   *    selección heredaba esa transparencia: el elemento elegido desaparecía dentro del fantasma.
   *
   * Así que el fantasma se pinta acá y la librería queda solo para la selección, que es lo que sí
   * hace bien. **Con un clon del material, nunca mutando el que hay**: Fragments comparte materiales
   * entre mosaicos y mutarlos se filtra a donde no toca. El único que se pinta en su sitio es el del
   * nivel de detalle, que no se deja clonar — ver {@link pinturaDe}.
   *
   * De paso el fantasma **conserva el color de cada elemento** en vez de blanquear todo el modelo,
   * que era lo que hacía la librería: mirando detrás de un muro se sigue distinguiendo una viga de
   * una losa.
   */
  private completarPintura(): void {
    // Lo ya translúcido se deja en paz: el vidrio y las barandas del modelo son más transparentes
    // que el fantasma, y pintarlos los volvería *más* opacos de lo que el propio modelo dice.
    const toca = (material: THREE.Material): boolean => !material.transparent;

    for (const [, model] of this.fragments.list) {
      model.object.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;

        const original = malla.material;
        const puestos: THREE.Material[] = Array.isArray(original) ? [...original] : [original];
        if (puestos.length === 0 || !puestos.some(toca)) return;

        if (!this.pinturaPropia.has(malla)) this.pinturaPropia.set(malla, original);

        const pintados = puestos.map((material) =>
          toca(material) ? this.pinturaDe(material) : material,
        );
        malla.material = Array.isArray(original) ? pintados : (pintados[0] as THREE.Material);
      });
    }
  }

  /**
   * El material translúcido con que pintar uno opaco: un clon, o el propio si no se deja clonar.
   *
   * **Los que no se dejan clonar son los del nivel de detalle**, y son justamente los que importan.
   * `LodMaterial.clone()` reventó en la primera prueba —`Cannot read properties of undefined
   * (reading 'color')` dentro de `newLodMaterialParams`—, y el rastro dijo lo que faltaba saber: las
   * mallas que se quedaban opacas son `LODMesh`, los sustitutos que Fragments dibuja **mientras la
   * cámara se mueve**. Ahí está el "se cae al mover" del informe, con nombre y apellido.
   *
   * Así que esos se pintan en su sitio, guardando cómo estaban. Es seguro donde antes no lo era:
   * el material del nivel de detalle no lo comparte nadie más, mientras que mutar los materiales de
   * los elementos se filtraba al elemento seleccionado y lo volvía translúcido.
   *
   * Los clones se cachean por material de origen: un modelo grande tiene miles de mallas y decenas
   * de materiales, y clonar por malla subiría miles de programas a la GPU para pintar lo mismo.
   */
  private pinturaDe(origen: THREE.Material): THREE.Material {
    const guardado = this.clonesDeFantasma.get(origen);
    if (guardado !== undefined) return guardado;

    let pintado: THREE.Material;
    try {
      pintado = origen.clone();
    } catch {
      pintado = origen;
      if (!this.pinturaEnSitio.has(origen)) {
        this.pinturaEnSitio.set(origen, {
          transparent: origen.transparent,
          opacity: origen.opacity,
          depthWrite: origen.depthWrite,
          side: origen.side,
        });
      }
    }

    pintado.transparent = true;
    pintado.opacity = GHOST_OPACITY;
    // Sin esto, la cara de delante escribe profundidad y tapa lo que hay detrás: se vería
    // translúcido y sin embargo no se vería el muro de atrás, que es para lo que sirve el modo.
    pintado.depthWrite = false;
    // Las dos caras, como pedía el resaltado de la librería: mirando a través de un muro se ven
    // sus caras interiores, y sin esto un elemento abierto se ve por dentro como un agujero.
    pintado.side = THREE.DoubleSide;
    pintado.needsUpdate = true;
    this.clonesDeFantasma.set(origen, pintado);
    // El camino de vuelta, que no se borra: ver {@link originalDeClon}. Solo si de verdad es un
    // clon — cuando el material no se deja clonar, `pintado` **es** `origen` y apuntarlo a sí mismo
    // haría que despintar lo dejara translúcido creyendo haberlo arreglado.
    if (pintado !== origen) this.originalDeClon.set(pintado, origen);
    return pintado;
  }

  /**
   * Deshace {@link completarPintura}: repone los materiales y devuelve los que se tocaron en su sitio.
   *
   * **Y barre además las mallas que nadie apuntó**, que es lo que arregla el fantasma pegado. El
   * usuario lo dijo así: «sigue el fantasma al pasar a ortográfica». Cierto, y la causa no era la
   * proyección: cambiar de proyección **rehace las mallas del nivel de detalle**, y algunas nacen
   * vistiendo un clon translúcido nuestro. Como llegan después de que esto corriera, no estaban en
   * `pinturaPropia` y nada las devolvía a sólido.
   *
   * Entrar en la vista fantasma sí tenía ese bucle —{@link repintarGeometriaNueva}, con su
   * presupuesto y su oráculo— y salir no tenía nada equivalente. La asimetría era el defecto.
   */
  private despintar(): void {
    for (const [malla, original] of this.pinturaPropia) malla.material = original;
    this.pinturaPropia.clear();

    for (const [material, antes] of this.pinturaEnSitio) {
      material.transparent = antes.transparent;
      material.opacity = antes.opacity;
      material.depthWrite = antes.depthWrite;
      material.side = antes.side;
      material.needsUpdate = true;
    }
    this.pinturaEnSitio.clear();
    this.clonesDeFantasma.clear();
    this.quitarClonesHuerfanos();
  }

  /**
   * Devuelve a su material original cualquier malla que haya aparecido vistiendo un clon translúcido.
   *
   * Recorre las mallas —el mismo recorrido que hace {@link completarPintura}, así que cuesta lo
   * mismo— y consulta {@link originalDeClon}, que nunca se vacía. Sin esto, una malla creada por el
   * nivel de detalle **después** de salir del fantasma se quedaba translúcida sin que ningún mapa
   * supiera de ella.
   */
  private quitarClonesHuerfanos(): void {
    if (this.originalDeClon.size === 0) return;

    for (const [, model] of this.fragments.list) {
      model.object.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;

        const puesto = malla.material;
        if (Array.isArray(puesto)) {
          let cambio = false;
          const vueltos = puesto.map((material) => {
            const original = this.originalDeClon.get(material);
            if (original === undefined) return material;
            cambio = true;
            return original;
          });
          if (cambio) malla.material = vueltos;
          return;
        }

        const original = this.originalDeClon.get(puesto);
        if (original !== undefined) malla.material = original;
      });
    }
  }

  /**
   * Los datos de un elemento **por su identificador**, sin pasar por un clic.
   *
   * Es el mismo camino que usa {@link pickAt} una vez que sabe a quién preguntar, y existe aparte
   * porque hay dos casos en que el elemento se conoce y el ratón no interviene: comprobar la lectura
   * de propiedades sobre un modelo real —ver `diag.html?modo=psets`— y, más adelante, abrir un tema
   * de coordinación que apunta a un elemento por su GUID.
   */
  async describeItemById(modelId: string, localId: number): Promise<PickedItem | null> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return null;

    const [data] = await model.getItemsData([localId], {
      attributesDefault: true,
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOcurrence: { attributes: true, relations: false },
        HasAssociations: { attributes: true, relations: false },
      },
    });

    return describeItem(modelId, localId, data, this.unitsByModel.get(modelId) ?? NO_IFC_UNITS);
  }

  /**
   * Selecciona un elemento por su identificador y lo encuadra. `F10.5`.
   *
   * **Es el camino del cuadro al modelo**, que es lo que convierte una tabla en una herramienta de
   * revisión: se ve el perfil raro entre trescientas filas y se va a mirarlo donde está. Hace lo
   * mismo que abrir una observación —seleccionar y encuadrar— sin pasar por el GUID, porque aquí el
   * elemento ya se conoce por su identificador local del propio modelo.
   */
  async selectById(modelId: string, localId: number): Promise<PickedItem | null> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return null;

    this.selection = { modelId, localId };
    await this.applyHighlights();
    await this.frameItem(modelId, localId);
    return this.describeItemById(modelId, localId);
  }

  /**
   * Qué categorías de IFC hay en un modelo abierto, y cuántos elementos tiene cada una. `F10.5`.
   *
   * Es la lista con la que se elige un cuadro: sin las cuentas, elegir categoría es adivinar cuál
   * de las cuarenta que trae el archivo tiene algo dentro.
   */
  async categoriesOf(modelId: string): Promise<ReadonlyMap<string, number>> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return new Map();
    return categoriasDe(model);
  }

  /**
   * El cuadro de una categoría: sus elementos en filas y sus propiedades en columnas. `F10.5`.
   *
   * **Reusa `describeItemById`**, que es el mismo camino que la ficha de un elemento al clicarlo, y
   * eso no es una comodidad: es lo que hace que el cuadro y la ficha no puedan discrepar sobre el
   * valor de una propiedad ni sobre su unidad. Con una lectura propia dentro del cuadro, el día que
   * cambie el manejo de unidades una de las dos se queda atrás y nadie se entera.
   */
  async scheduleOf(
    modelId: string,
    category: string,
    onProgress?: (leidos: number, de: number) => void,
  ): Promise<Schedule | null> {
    this.assertAlive();

    const model = this.fragments.list.get(modelId);
    if (!model) return null;

    return cuadroDe(
      model,
      category,
      (localId) => this.describeItemById(modelId, localId),
      onProgress,
    );
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
    this.sanearCamara();
    if (this.renderStyle === "wireframe" || this.selection !== null) await this.applyHighlights();
    else {
      await this.fragments.core.update(true);
      // **Y en sólido sin selección hay que barrer.** Este es el camino que toma cambiar de
      // proyección, y era por donde se colaba el fantasma pegado: un `update` no devuelve a sólido
      // una malla que nació vistiendo un clon translúcido.
      await this.limpiarFantasmaResidual();
    }
  }

  /**
   * Repara la cámara cuando su aritmética se ha ido a `NaN`.
   *
   * **Un lienzo de altura cero envenena la cámara para siempre.** La relación de aspecto se calcula
   * dividiendo por el alto, y con el alto en cero queda `NaN`: a partir de ahí la matriz de
   * proyección es `NaN`, encuadrar devuelve una posición imposible, el rayo no encuentra nada y
   * **ningún botón la recupera**, porque todos parten de donde está la cámara. Pasa de verdad: un
   * panel plegado al arrancar, una ventana reducida a nada, una pestaña que se abre oculta.
   *
   * Se comprueba antes de cada refresco, que es barato, y se devuelve a un estado utilizable.
   */
  private sanearCamara(): void {
    const camara = this.world.camera.three;
    const lienzo = this.world.renderer?.three.domElement;

    const perspectiva = camara as THREE.PerspectiveCamera;
    if (perspectiva.isPerspectiveCamera === true && !Number.isFinite(perspectiva.aspect)) {
      const ancho = lienzo?.clientWidth ?? 0;
      const alto = lienzo?.clientHeight ?? 0;
      perspectiva.aspect = ancho > 0 && alto > 0 ? ancho / alto : 1;
      perspectiva.updateProjectionMatrix();
    }

    if (!Number.isFinite(camara.position.x + camara.position.y + camara.position.z)) {
      // Sin sitio conocido al que volver, la posición inicial: es la que tenía la escena vacía y
      // desde ahí cualquier encuadre vuelve a funcionar.
      this.world.camera.controls.setLookAt(50, 50, 50, 0, 0, 0, false);
      this.world.camera.controls.update(ONE_FRAME_S);
    }
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
    // **Y otra vez cuando la cámara se haya asentado.** Ver {@link refrescarAlAsentarse}: el
    // refresco de arriba corre con la cámara donde esté *ahora*, que si el usuario venía moviéndola
    // es a mitad de camino.
    this.refrescarAlAsentarse();
  }

  /**
   * Vuelve a refrescar un instante después, sin depender de que la cámara avise.
   *
   * **Es el arreglo de «al mover y cambiar de órbita a ortográfica pasaba eso».** Medido con
   * `diag.html?modo=fantasma`: al cambiar de proyección **en medio de un movimiento**, la escena se
   * queda con **cero mallas auditables** —el modelo desaparece o se ve como dibujo de línea— y solo
   * vuelve a dibujarse cuando algo emite `rest`. Con la cámara ya quieta, ese `rest` **no llega**:
   * camera-controls lo emite al terminar un movimiento, y el cambio de proyección interrumpió el
   * que estaba en marcha. El visor se quedaba esperando un aviso que nadie iba a dar.
   *
   * Así que el refresco no se cuelga solo del evento: se pide **también** un poco después, a ciegas.
   * Es una sola pasada de más por cambio de proyección, y es lo que garantiza que el nivel de
   * detalle se recalcule con la cámara final y no con la de mitad del gesto.
   *
   * No se acumula: si ya hay uno pendiente, se reprograma en vez de encadenar refrescos.
   */
  private refrescarAlAsentarse(): void {
    if (this.refrescoPendiente !== null) clearTimeout(this.refrescoPendiente);
    this.refrescoPendiente = setTimeout(() => {
      this.refrescoPendiente = null;
      if (this.disposed || this.loading) return;
      void this.refresh();
    }, MS_HASTA_EL_REFRESCO_DIFERIDO);
  }

  /** Proyección actual. */
  get projection(): Projection {
    return this.world.camera.projection.current;
  }

  /** Cambia el modo de navegación. */
  setNavigationMode(mode: NavigationMode): void {
    this.assertAlive();
    this.navigationMode = mode;
    this.world.camera.set(mode);
  }

  /** Cómo se está navegando. Se recuerda acá porque la cámara de That Open no lo devuelve. */
  get navigation(): NavigationMode {
    return this.navigationMode;
  }

  /**
   * Captura la vista actual: cámara, lo oculto y los cortes.
   *
   * **Guarda lo que se ve, no lo que hay.** Dos personas revisando el mismo modelo se pasan una vista
   * para hablar de lo mismo, y para eso hacen falta las tres cosas: desde dónde se mira, qué está
   * apagado y por dónde está cortado. Con solo la cámara, la vista del otro muestra otra cosa.
   */
  /**
   * La cámara tal como está ahora, en coordenadas de la escena: `F4.1`.
   *
   * Existe aparte de {@link captureView} porque una observación **no es una vista guardada**: no
   * necesita nombre, ni qué está oculto, ni los cortes, y sí necesita dos cosas que una vista
   * guardada no lleva y que un viewpoint de BCF exige —el «arriba» real de la imagen y el alto de
   * la vista ortogonal—.
   *
   * **El «arriba» se lee del cuaternión y no se supone.** La tentación es pasar el eje vertical del
   * mundo, y con la cámara en planta —mirando recto hacia abajo, que es lo que hace el Modo 2D— eso
   * es un vector paralelo a la dirección de vista: una cámara imposible. El giro real de la cámara
   * sí lo sabe la propia cámara.
   *
   * La conversión al sistema del IFC no se hace acá: la hace `camaraBcfDesdeEscena` en `bim-core`,
   * donde se puede probar sin navegador.
   */
  get cameraState(): SceneCameraState {
    this.assertAlive();

    const controls = this.world.camera.controls;
    const camara = this.world.camera.three;

    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(camara.quaternion);

    const ortogonal = (camara as THREE.OrthographicCamera).isOrthographicCamera;
    if (ortogonal) {
      const orto = camara as THREE.OrthographicCamera;
      // El alto que de verdad se ve: el del frustum dividido por el zoom, que es lo que aplica
      // Three.js. Sin el zoom, acercarse no cambiaría el número y el BCF abriría con otro encuadre.
      const alto = Math.abs(orto.top - orto.bottom) / (orto.zoom || 1);
      return {
        position: toPoint3(controls.getPosition(new THREE.Vector3())),
        target: toPoint3(controls.getTarget(new THREE.Vector3())),
        up: toPoint3(arriba),
        kind: "ortogonal",
        viewHeightM: alto,
      };
    }

    return {
      position: toPoint3(controls.getPosition(new THREE.Vector3())),
      target: toPoint3(controls.getTarget(new THREE.Vector3())),
      up: toPoint3(arriba),
      kind: "perspectiva",
      fieldOfViewDeg: (camara as THREE.PerspectiveCamera).fov,
    };
  }

  /**
   * La vista de ahora mismo, **en la forma que se le puede pasar a otra persona**.
   *
   * A diferencia de {@link captureView}, que escribe en el idioma de esta sesión —coordenadas de la
   * escena y `localId` del motor—, esta escribe en el del modelo: la cámara ya convertida al
   * sistema del IFC, lo apagado por GUID y los cortes también en el sistema del IFC. Es lo que hace
   * que la vista siga valiendo mañana, en otro equipo y con otra versión del visor.
   *
   * Devuelve `null` **solo si la cámara no se puede expresar**, que es el mismo caso que impide
   * exportar un viewpoint: cámara y objetivo en el mismo punto, o un «arriba» paralelo a la
   * dirección de vista. Sin cámara no hay vista que compartir.
   */
  async captureVistaCompartida(nombre: string): Promise<VistaCompartida | null> {
    this.assertAlive();

    const camara = camaraBcfDesdeEscena(this.cameraState);
    if (camara === null) return null;

    return {
      nombre,
      camara,
      visibilidad: await this.captureVisibilityBcf(),
      cortes: [...this.components.get(OBC.Clipper).list].map(([, plano]) =>
        corteAIfc({ normal: toPoint3(plano.normal), origin: toPoint3(plano.origin) }),
      ),
    };
  }

  /**
   * Aplica una vista compartida: deja la pantalla como la tenía quien la guardó.
   *
   * **El orden es el mismo que en {@link applyView} y por los mismos motivos**, con uno propio: la
   * proyección va primero porque sustituye el objeto de cámara y pisaría la posición, y la
   * visibilidad va antes que la cámara para que no se vea el modelo entero un instante.
   *
   * **Lo que no exista se ignora.** Los GUID que no estén en ningún modelo abierto no se buscan dos
   * veces, y una vista guardada con tres disciplinas abiertas sigue sirviendo con dos.
   */
  async applyVistaCompartida(vista: VistaCompartida): Promise<void> {
    this.assertAlive();

    await this.setProjection(vista.camara.tipo === "ortogonal" ? "Orthographic" : "Perspective");

    // Una vista dice qué se ve, entera: los aislamientos anteriores dejan de tener sentido como
    // pasos que deshacer, porque lo que había antes ya no es lo que hay.
    this.visibilityStack.length = 0;
    if (vista.visibilidad !== null) await this.applyVisibilityBcf(vista.visibilidad);
    else await this.showAll();

    const clipper = this.components.get(OBC.Clipper);
    clipper.deleteAll();
    clipper.enabled = vista.cortes.length > 0;
    for (const corte of vista.cortes) {
      const { normal, origin } = corteAEscena(corte);
      clipper.createFromNormalAndCoplanarPoint(
        this.world,
        new THREE.Vector3(...normal),
        new THREE.Vector3(...origin),
      );
    }

    // La cámara al final, con la conversión que ya usa `abrirObservacion`: es la misma pieza y no
    // hay dos formas de leer un viewpoint.
    this.aplicarCamaraBcf(vista.camara);
    await this.refresh();
  }

  /**
   * La foto de lo que se está mirando, como PNG en un `data:`. `null` si no hay nada que enseñar.
   *
   * **Es lo que le falta al BCF para que se entienda sin abrir el modelo.** Todo visor del mercado
   * dibuja la lista de temas con su miniatura al lado; los nuestros salían sin ninguna, así que el
   * mandante abría una lista de títulos.
   *
   * **Y la trampa está en cuándo se lee el lienzo.** El búfer de dibujo de WebGL se borra en cuanto
   * el navegador compone el cuadro, y leerlo un instante tarde devuelve un rectángulo vacío **sin
   * fallar**: `toDataURL` entrega un PNG perfectamente válido, todo del mismo color. Por eso acá se
   * dibuja y se lee **en el mismo turno**, sin un solo `await` en medio — y por eso además se
   * comprueba el resultado antes de devolverlo.
   *
   * Devolver `null` en vez de una imagen lisa es deliberado: una miniatura en blanco dentro de un
   * BCF afirma «así se ve el problema» sobre nada, y es peor que no llevar ninguna.
   */
  capturarImagen(anchoMaximo = ANCHO_DE_INSTANTANEA): string | null {
    this.assertAlive();

    const lienzo = this.world.renderer?.three.domElement;
    if (!lienzo || lienzo.width === 0 || lienzo.height === 0) return null;

    // Se dibuja justo antes de leer. Nada de `await` entre esta línea y el `drawImage`.
    this.world.renderer?.update();

    const escala = Math.min(1, anchoMaximo / lienzo.width);
    const ancho = Math.max(1, Math.round(lienzo.width * escala));
    const alto = Math.max(1, Math.round(lienzo.height * escala));

    const destino = document.createElement("canvas");
    destino.width = ancho;
    destino.height = alto;
    const pincel = destino.getContext("2d", { willReadFrequently: true });
    if (pincel === null) return null;
    pincel.drawImage(lienzo, 0, 0, ancho, alto);

    // La comprobación va sobre la imagen **ya reducida**: son cien veces menos píxeles y la
    // pregunta —¿hay algo dibujado?— se contesta igual.
    if (pareceEnBlanco(pincel.getImageData(0, 0, ancho, alto).data)) return null;

    return destino.toDataURL("image/png");
  }

  async captureView(name: string): Promise<SavedView> {
    this.assertAlive();

    const controls = this.world.camera.controls;
    const posicion = controls.getPosition(new THREE.Vector3());
    const objetivo = controls.getTarget(new THREE.Vector3());

    const hiddenByModel = await this.captureVisibility();

    // La lista del `Clipper` es un mapa: cada entrada es [identificador, plano].
    const sections = [...this.components.get(OBC.Clipper).list].map(([, plano]) => ({
      normal: toPoint3(plano.normal),
      origin: toPoint3(plano.origin),
    }));

    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      camera: {
        position: toPoint3(posicion),
        target: toPoint3(objetivo),
        projection: this.projection,
        navigation: this.navigationMode,
      },
      hiddenByModel,
      sections,
    };
  }

  /**
   * Vuelve a una vista guardada.
   *
   * **Lo que no exista se ignora.** Una vista se guarda con unos modelos abiertos y se aplica con
   * otros: si falta uno, se restaura lo que sí está en vez de fallar. Es lo que hace que una vista
   * siga sirviendo cuando alguien cerró una disciplina.
   *
   * El orden importa: primero la proyección —que sustituye el objeto de cámara— y al final la
   * posición, porque cambiar de proyección la pisaría.
   */
  async applyView(view: SavedView): Promise<void> {
    this.assertAlive();

    await this.setProjection(view.camera.projection);
    this.setNavigationMode(view.camera.navigation);

    // Una vista dice qué se ve, entera: los aislamientos anteriores dejan de tener sentido como
    // pasos que deshacer, porque lo que había antes ya no es lo que hay.
    this.visibilityStack.length = 0;
    await this.applyVisibility(view.hiddenByModel);

    const clipper = this.components.get(OBC.Clipper);
    clipper.deleteAll();
    clipper.enabled = view.sections.length > 0;
    for (const corte of view.sections) {
      clipper.createFromNormalAndCoplanarPoint(
        this.world,
        new THREE.Vector3(...corte.normal),
        new THREE.Vector3(...corte.origin),
      );
    }

    const controls = this.world.camera.controls;
    const [px, py, pz] = view.camera.position;
    const [tx, ty, tz] = view.camera.target;
    void controls.setLookAt(px, py, pz, tx, ty, tz, false);
    controls.update(ONE_FRAME_S);

    await this.refresh();
  }

  /**
   * Abre una observación: **lleva la cámara al problema y selecciona el elemento**. `F4.1`.
   *
   * Es la mitad que faltaba del ciclo de coordinación. Hasta ahora la observación se **creaba**
   * desde el visor y para **verla** había que salir a otra pantalla, así que quien coordinaba tenía
   * el hallazgo en un sitio y el modelo en otro.
   *
   * Devuelve el elemento seleccionado, o `null` si el GUID no está en ningún modelo abierto — que
   * es un caso normal y no un fallo: la observación puede ser de la disciplina de estructura y
   * estar abierta la de arquitectura. Quien llama lo dice; **no se inventa una selección**.
   *
   * **Las dos piezas ya existían y aquí solo se ensamblan**, que es la regla del repositorio:
   *
   * - `getLocalIdsByGuids` lo trae `@thatopen/fragments`: la búsqueda por GUID no se escribe.
   * - `ifcAEscena` de `bim-core` convierte la cámara guardada de vuelta al sistema de la escena, y
   *   es la inversa exacta —con su prueba— de la que la escribió en el BCF.
   */
  async abrirObservacion(
    guid: string,
    camara: BcfCamera | null = null,
    visibilidad: VisibilidadBcf | null = null,
  ): Promise<PickedItem | null> {
    this.assertAlive();

    // **La visibilidad va primero, antes de la cámara y antes de buscar el elemento.** Es lo que
    // hace que el encuadre siguiente se calcule sobre lo que de verdad va a quedar en pantalla, y
    // además evita el parpadeo de ver el modelo entero y que se apague medio segundo después.
    if (visibilidad !== null) await this.applyVisibilityBcf(visibilidad);

    // **La cámara se aplica aunque el elemento no esté**, y en este orden. Si la observación es de
    // un modelo que no está abierto, llevar la vista al sitio del problema sigue sirviendo: se ve
    // el hueco donde debería estar la viga.
    if (camara !== null) this.aplicarCamaraBcf(camara);

    for (const [modelId, model] of this.fragments.list) {
      const [localId] = await model.getLocalIdsByGuids([guid]);
      if (localId === null || localId === undefined) continue;

      this.selection = { modelId, localId };
      await this.applyHighlights();
      // Sin cámara guardada se encuadra el elemento: es lo que se puede afirmar —dónde está— sin
      // inventar desde dónde lo miraba quien lo encontró.
      if (camara === null) await this.frameItem(modelId, localId);
      return this.describeItemById(modelId, localId);
    }

    return null;
  }

  /**
   * Pone la cámara donde dice un viewpoint de BCF, convirtiendo del sistema del IFC al de la escena.
   *
   * El IFC lleva la cota en **Z** y la escena de Three.js el «arriba» en **Y**: aplicar la posición
   * sin convertir deja la cámara bajo tierra o de lado. La conversión es `ifcAEscena`, y su prueba
   * la ata a la transformación con la que se dibujan los ejes de replanteo del modelo.
   */
  private aplicarCamaraBcf(camara: BcfCamera): void {
    const [px, py, pz] = ifcAEscena(camara.punto);
    const [dx, dy, dz] = ifcAEscena(camara.direccion);

    // **El objetivo se calcula**, porque BCF guarda una dirección y `camera-controls` quiere un
    // punto al que mirar. La distancia es una elección: la dirección dice hacia dónde y no hasta
    // dónde, así que se pone el objetivo a una distancia razonable sobre esa recta.
    const alcance =
      camara.tipo === "ortogonal" ? (camara.escala ?? DISTANCIA_DE_MIRA) : DISTANCIA_DE_MIRA;
    const controls = this.world.camera.controls;
    void controls.setLookAt(
      px,
      py,
      pz,
      px + dx * alcance,
      py + dy * alcance,
      pz + dz * alcance,
      true,
    );
    controls.update(ONE_FRAME_S);
  }

  /**
   * Encuadra un elemento concreto.
   *
   * Existe para {@link abrirObservacion} cuando la observación no trae cámara: se puede afirmar
   * dónde está el elemento, y no desde dónde lo miraba quien lo encontró.
   */
  private async frameItem(modelId: string, localId: number): Promise<void> {
    const model = this.fragments.list.get(modelId);
    if (!model) return;

    const cajas = await model.getBoxes([localId]);
    const caja = cajas?.[0];
    if (!caja) return;

    const centro = caja.getCenter(new THREE.Vector3());
    const lado = caja.getSize(new THREE.Vector3());
    // Un margen sobre el tamaño del elemento: pegado a una viga no se ve de qué viga se habla.
    const distancia = Math.max(lado.x, lado.y, lado.z, 1) * HOLGURA_AL_ENCUADRAR;
    const controls = this.world.camera.controls;
    void controls.setLookAt(
      centro.x + distancia,
      centro.y + distancia,
      centro.z + distancia,
      centro.x,
      centro.y,
      centro.z,
      true,
    );
    controls.update(ONE_FRAME_S);
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
    // Entrar a la vista fantasma es un gesto: se le concede su cupo de repintados para tapar la
    // geometría que vaya llegando. Ver {@link repintarGeometriaNueva}.
    this.presupuestoDePintura = style === "wireframe" ? REPINTADOS_POR_GESTO : 0;
    await this.applyHighlights();
  }

  /** Estilo de representación actual. */
  get style(): RenderStyle {
    return this.renderStyle;
  }

  /**
   * Cuántas mallas del modelo llevan puesta la pintura de fantasma y cuántas siguen sólidas.
   *
   * **Es el oráculo de `F1.15`** —"el modo fantasma se cae al mover"—. Esa frase no se puede
   * depurar mirando: hay que poder preguntarle a la escena si el material que tiene puesto cada
   * malla es el que la vista fantasma pide. Fragments dibuja por niveles de detalle, y la geometría
   * que entra mientras la cámara se mueve llega con **su material original, opaco**: el modelo se
   * queda mitad translúcido y mitad sólido, que es exactamente lo que se ve como "se cae".
   *
   * Y es además la **condición de parada** del repintado automático: ver
   * {@link repintarGeometriaNueva}.
   */
  /**
   * Pone las sombras al alcance del modelo, y las banderas en las mallas que las necesitan.
   *
   * **Son las dos mitades que `setup({shadows})` no hace**, y las dos salieron de medir con
   * `diag.html?modo=sombras` sobre `Piso 5.ifc`:
   *
   * 1. **El recuadro de sombra venía de 10 × 10 m para un modelo de 40,5 m.** La cámara de
   *    sombra de una luz direccional es ortográfica y trae un recuadro pequeño por defecto: con
   *    el edificio fuera de él no se dibuja **ni una** sombra, y todo lo demás puede estar
   *    perfecto. Se ajusta al modelo con holgura, porque la sombra cae fuera de la planta.
   * 2. **Ninguna malla tenía `castShadow` ni `receiveShadow`.** Three.js las exige **por
   *    objeto**, y las mallas del modelo las crea el worker de Fragments *después* del `setup`.
   *
   * Se llama al cargar un modelo **y cada vez que llega geometría nueva**, por lo mismo que el
   * repintado del fantasma: mover la cámara cambia el nivel de detalle y lo que entra viene sin
   * banderas. Ver {@link repintarGeometriaNueva}.
   */
  private ajustarLuces(): void {
    const caja = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      model.object.traverse((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;
        // El suelo de un piso recibe la sombra de sus muros: todo proyecta y todo recibe.
        malla.castShadow = true;
        malla.receiveShadow = true;
      });
      caja.expandByObject(model.object);
    }

    if (caja.isEmpty()) return;

    const centro = caja.getCenter(new THREE.Vector3());
    const lado = caja.getSize(new THREE.Vector3());
    const alcance = (Math.max(lado.x, lado.y, lado.z) * HOLGURA_DE_SOMBRA) / 2;

    this.world.scene.three.traverse((objeto) => {
      const luz = objeto as THREE.DirectionalLight;
      if (!luz.isLight || !luz.castShadow) return;

      const camara = luz.shadow.camera as THREE.OrthographicCamera;
      if (camara.isOrthographicCamera !== true) return;
      camara.left = -alcance;
      camara.right = alcance;
      camara.top = alcance;
      camara.bottom = -alcance;
      camara.near = 0.5;
      camara.far = alcance * 6;
      camara.updateProjectionMatrix();

      // **Y la luz tiene que apuntar al modelo.** Su dirección va del objeto a su `target`, y el
      // de fábrica está en el origen: con un modelo en coordenadas de proyecto —a cientos de
      // metros del origen, que es lo normal en un IFC de obra— la luz lo ilumina de canto.
      luz.target.position.copy(centro);
      luz.target.updateMatrixWorld();
      luz.position.copy(centro).add(new THREE.Vector3(alcance, alcance * 2, alcance));
      luz.updateMatrixWorld();
      // Con el mapa de sombras grande, el sesgo de fábrica deja franjas: el propio muro se
      // sombrea a sí mismo en bandas. Se escala con el alcance porque es un error en unidades
      // del mundo.
      luz.shadow.bias = -0.00005 * Math.max(1, alcance / 20);
      luz.shadow.needsUpdate = true;
    });
  }

  /**
   * Si las sombras están puestas de verdad, pieza por pieza.
   *
   * **Es el oráculo de `F1.16`** —"no está renderizando con mejor información de sombras"—. La
   * maquinaria está montada desde el principio: `ShadowedScene`, `setup({shadows})` y la
   * postproducción `COLOR_PEN_SHADOWS`. Eso hace que el tablero diga que sí y la pantalla diga
   * que no, que es la clase de fallo que ya se pagó con `F7.13`.
   *
   * Lo que hay que poder preguntar es lo que Three.js exige **por objeto**: una malla no
   * proyecta ni recibe sombra hasta que alguien le pone `castShadow` y `receiveShadow`, y las
   * mallas del modelo las crea el worker de Fragments *después* del `setup` de la escena.
   */
  get shadowAudit(): ShadowAudit {
    this.assertAlive();

    let lights = 0;
    let lightsCasting = 0;
    const lightsDetail: string[] = [];
    this.world.scene.three.traverse((objeto) => {
      const luz = objeto as THREE.Light;
      if (!luz.isLight) return;
      lights += 1;
      if (luz.castShadow) lightsCasting += 1;

      // `Light` no declara `shadow`: lo traen sus subclases que proyectan. Se lee así porque la
      // pregunta es justamente qué subclase hay, y no se sabe hasta mirar.
      const camara = (luz as THREE.DirectionalLight).shadow?.camera as
        THREE.OrthographicCamera | undefined;
      const recuadro =
        camara?.isOrthographicCamera === true
          ? `recuadro ${(camara.right - camara.left).toFixed(0)} x ${(camara.top - camara.bottom).toFixed(0)} m, ` +
            `profundidad ${camara.near.toFixed(1)}–${camara.far.toFixed(0)}`
          : "sin camara ortografica de sombra";
      lightsDetail.push(
        `${luz.type} intensidad=${luz.intensity.toFixed(2)} proyecta=${luz.castShadow} · ${recuadro}`,
      );
    });

    const caja = new THREE.Box3();
    for (const [, model] of this.fragments.list) caja.expandByObject(model.object);
    const lado = caja.isEmpty() ? new THREE.Vector3() : caja.getSize(new THREE.Vector3());

    let meshes = 0;
    let casting = 0;
    let receiving = 0;
    for (const [, model] of this.fragments.list) {
      model.object.traverseVisible((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;
        meshes += 1;
        if (malla.castShadow) casting += 1;
        if (malla.receiveShadow) receiving += 1;
      });
    }

    return {
      shadowMap: this.world.renderer?.three.shadowMap.enabled ?? false,
      lights,
      lightsCasting,
      meshes,
      casting,
      receiving,
      postproduction: this.postproduction,
      lightsDetail,
      modelSpanM: Math.max(lado.x, lado.y, lado.z),
    };
  }

  get paintAudit(): PaintAudit {
    this.assertAlive();

    let ghosted = 0;
    let solid = 0;
    let translucent = 0;
    const solidKinds: Record<string, number> = {};

    for (const [, model] of this.fragments.list) {
      // **`traverseVisible` y no `traverse`**: lo que no se dibuja no cuenta. Fragments deja mallas
      // apagadas en la escena —los clones con que resuelve el resaltado, entre otras— y contarlas
      // hacía que salir de la vista fantasma pareciera dejar pintura pegada cuando en pantalla no
      // había nada pegado.
      model.object.traverseVisible((objeto) => {
        const malla = objeto as THREE.Mesh;
        if (!malla.isMesh) return;

        // Una malla puede llevar varios materiales; basta que uno no esté pintado para que se
        // vea el hueco, así que se cuenta material por material y no malla por malla.
        for (const material of Array.isArray(malla.material) ? malla.material : [malla.material]) {
          if (!material.visible) continue;
          if (esFantasma(material)) ghosted += 1;
          else if (material.transparent) translucent += 1;
          else {
            solid += 1;
            // **Y se dice de qué son.** Un conteo de sólidos no distingue "el pintado no llegó" de
            // "esas mallas no se pintan nunca porque no son caras", y son dos arreglos distintos.
            const dibuja =
              malla.geometry.groups.length === 0
                ? malla.geometry.drawRange.count
                : malla.geometry.groups.reduce((suma, grupo) => suma + grupo.count, 0);
            const clase =
              `${material.type}·op=${material.opacity}·visible=${malla.visible && material.visible}` +
              `·grupos=${malla.geometry.groups.length}·indices=${dibuja}`;
            solidKinds[clase] = (solidKinds[clase] ?? 0) + 1;
          }
        }
      });
    }

    return { ghosted, solid, translucent, solidKinds };
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
    this.quitarMarcaDeReferencia();

    // **Cambiar de modo suelta los puntos a medias**, y no es cosmético: quedarse con los dos
    // vértices de un área al pasar a medir una distancia mezcla dos medidas en una, y el número
    // que sale no es de ninguna de las dos. Antes esto lo hacía la librería por dentro; desde que
    // los puntos son propios hay que hacerlo acá.
    this.planMeasureStart = null;
    this.puntosDeAngulo = [];
    this.puntosDeArea = [];
    this.quitarMarcasDeMedicion();

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

    // **Medir distancias va con el rayo propio, no con el selector de la librería.**
    //
    // El usuario reportó que «las opciones de medida de distancia no está funcionando», y leyendo
    // el camino que había se ve por qué podía no funcionar **y por qué no lo decía**:
    //
    // - El ajuste de `LengthMeasurement` **no usa el rayo de la CPU: lee los píxeles de la escena
    //   dibujada**. Cuando esa lectura no resuelve —y depende de qué fotograma haya— `create()` no
    //   coloca nada.
    // - Y esta función **devolvía `true` de todas formas**. La interfaz avanzaba su contador y el
    //   aviso pasaba a pedir el segundo punto, así que un clic que no hizo nada se veía igual que
    //   uno que sí: exactamente «no funciona» sin un solo mensaje.
    //
    // El rayo propio (`snapAt`) usa `fragments.raycast` con las mismas clases de ajuste —vértice,
    // arista y cara— y es el mismo que usa la selección, que sí funciona en uso real. Devuelve el
    // punto o `null`, así que el valor de retorno **deja de mentir**.
    //
    // Y de paso resuelve lo que `docs/UX.md` tenía pedido: **medir del plano al modelo en un mismo
    // gesto**, porque los dos puntos entran por el mismo sitio.
    //
    // **Las tres medidas pasan por aquí desde el 2026-08-26.** El ángulo y el área se quedaron con
    // el medidor de la librería en el primer arreglo, con la nota de que eran «las dos que quedan»;
    // esto las cierra. Tenían el mismo defecto y la misma mitad silenciosa: `create()` no colocaba
    // nada cuando la lectura de píxeles no resolvía, y esta función devolvía `true` igual.
    if (clientX === undefined || clientY === undefined) return false;

    const punto = await this.puntoDeMedicion(clientX, clientY);
    if (punto === null) return false;

    if (this.measureMode === "distance") return this.addDistancePoint(punto);
    if (this.measureMode === "angle") return this.addAnglePoint(punto);
    return this.addAreaPoint(punto);
  }

  /**
   * Suma un punto a la medición en curso **por su coordenada del mundo**, sin pasar por el rayo.
   *
   * Es el mismo camino que {@link addMeasurePoint} una vez que sabe dónde está el punto: las dos
   * acaban en el mismo sitio, y lo único que cambia es de dónde sale la coordenada.
   *
   * **Existe por dos motivos y ninguno es de conveniencia.**
   *
   * 1. **Restaurar una medición y abrir un punto de vista de coordinación.** Una medida guardada
   *    —o la que viene dentro de un BCF— son coordenadas, no clics: sin esta entrada habría que
   *    simular un ratón sobre una cámara concreta, que es exactamente lo que no se puede hacer.
   * 2. **Poder comprobar las cuatro medidas.** El ajuste por rayo necesita un navegador que
   *    componga fotogramas, y en el entorno de pruebas se agota en un par de llamadas: el ángulo
   *    pide tres puntos y el área cuatro, así que sin esto **no hay forma de ejercitarlas**. Con
   *    esto, el mecanismo se prueba entero y lo único que queda fuera es el rayo, que tiene su
   *    propia comprobación.
   *
   * Devuelve `false` si no se está midiendo. **No puede fallar por «no hay geometría»**, que es
   * justamente la diferencia con el clic: acá el punto lo pone quien llama.
   */
  addMeasurePointAt(punto: Point3): boolean {
    this.assertAlive();
    if (this.measureMode === null) return false;
    // La perpendicular no entra por acá: su primer punto no es un punto, es una **cara** —hace
    // falta la normal—, y eso no se puede pasar como una coordenada.
    if (this.measureMode === "perpendicular") return false;

    const vector = new THREE.Vector3(...punto);
    if (this.measureMode === "distance") return this.addDistancePoint(vector);
    if (this.measureMode === "angle") return this.addAnglePoint(vector);
    return this.addAreaPoint(vector);
  }

  /**
   * El punto que hay bajo el cursor para medir, con el ajuste que corresponda.
   *
   * **El plano tiene la primera palabra**: su ajuste ve los trazos del CAD, que el del modelo no.
   * Si no engancha en el plano, va el rayo propio contra la geometría. Devuelve `null` cuando no
   * hay nada, que es lo que permite decirlo en vez de callarlo.
   */
  private async puntoDeMedicion(clientX: number, clientY: number): Promise<THREE.Vector3 | null> {
    if (this.planSnapEnabled) {
      const enganche = this.snapOnPlan(clientX, clientY);
      if (enganche !== null) return new THREE.Vector3(...enganche.point);
    }
    return await this.snapAt(clientX, clientY);
  }

  /**
   * Los tres clics de un ángulo: dos extremos y el vértice en medio.
   *
   * El orden es el que ya pedía la barra de estado —primer punto, vértice, tercer punto—, así que
   * el segundo clic es el del vértice. **Cada punto se marca al entrar**: sin eso, tres clics
   * seguidos sin nada en pantalla no dejan saber cuál de ellos contó.
   */
  private addAnglePoint(punto: THREE.Vector3): boolean {
    this.puntosDeAngulo.push(punto);
    this.marcarPuntoDeMedicion(punto);

    if (this.puntosDeAngulo.length < 3) return true;

    const [inicio, vertice, fin] = this.puntosDeAngulo as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];
    this.puntosDeAngulo = [];
    this.quitarMarcasDeMedicion();

    const grados = angleAtDeg(toPoint3(inicio), toPoint3(vertice), toPoint3(fin));

    const angulo = new OBF.Angle(inicio, vertice, fin);
    angulo.units = "deg";
    angulo.rounding = 1;
    // Los tres puntos, para el marcado del viewpoint. Van **antes** del `add`, que es lo que
    // dispara el aviso donde se registra la cota.
    this.puntosPendientes = [toPoint3(inicio), toPoint3(vertice), toPoint3(fin)];
    this.tools.angle.list.add(angulo);

    this.emitMeasurement({ mode: "angle", angleDeg: grados });
    this.world.renderer?.update();
    return true;
  }

  /**
   * Un vértice del contorno de un área.
   *
   * **El área no se cierra sola**: un contorno no tiene un número fijo de vértices, así que se
   * cierra con Enter o con doble clic — ver {@link finishMeasurement}. Lo que hace este método es
   * acumular y marcar, para que se vea por dónde va el contorno mientras se dibuja.
   */
  private addAreaPoint(punto: THREE.Vector3): boolean {
    this.puntosDeArea.push(punto);
    this.marcarPuntoDeMedicion(punto);
    this.world.renderer?.update();
    return true;
  }

  /** Marca un punto de una medición en curso, para que se vea que el clic entró y dónde. */
  private marcarPuntoDeMedicion(punto: THREE.Vector3): void {
    const marca = marcaDeReferencia(
      punto,
      new THREE.Vector3(0, 1, 0),
      this.world.camera.three.position.distanceTo(punto),
      SELECTION_COLOR,
    );
    this.marcasDeMedicion.push(marca);
    this.world.scene.three.add(marca);
    this.world.renderer?.update();
  }

  /** Quita las marcas de los puntos de una medición en curso. */
  private quitarMarcasDeMedicion(): void {
    for (const marca of this.marcasDeMedicion) liberarDibujo(marca);
    this.marcasDeMedicion = [];
    this.world.renderer?.update();
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

      // **Se marca la cara elegida.** Antes el primer clic no producía ningún cambio en pantalla y
      // no había forma de saber si había entrado ni cuál era la cara de referencia.
      const punto = new THREE.Vector3(...cara.point);
      const marca = marcaDeReferencia(
        punto,
        new THREE.Vector3(...cara.normal),
        this.world.camera.three.position.distanceTo(punto),
        SELECTION_COLOR,
      );
      this.marcaReferencia = marca;
      this.world.scene.three.add(marca);
      this.world.renderer?.update();
      return true;
    }

    // **Con respaldo sin ajuste.** El ajuste no siempre resuelve —depende de que los datos de
    // vértices y aristas del trozo de modelo que se está mirando estén ya disponibles— y cuando no
    // resuelve devuelve nada. Perder la medición por eso sería peor que medir el punto de la cara,
    // que es exactamente donde se hizo clic.
    const toque =
      (await this.rayAt(clientX, clientY, true)) ?? (await this.rayAt(clientX, clientY, false));
    if (toque === null) return false;

    const plano = this.referencePlane;
    const perpendicular = perpendicularToPlane(toque.point, plano.point, plano.normal);
    this.referencePlane = null;
    this.quitarMarcaDeReferencia();
    if (perpendicular === null) return false;

    // Menos de un milímetro es el punto sobre la propia cara: no hay perpendicular que dibujar.
    if (perpendicular.distanceM < 0.001) {
      this.emitMeasurement({ mode: "perpendicular", distanceM: 0 });
      return true;
    }

    const punto = new THREE.Vector3(...toque.point);
    const pie = new THREE.Vector3(...perpendicular.footM);

    // **La escuadra va antes que la cota.** Se deja en la cola de dibujos propios, y al añadir la
    // cota a su medidor esa cola se recoge junto con los dibujos que crea la librería: así la marca
    // se apaga y se borra con su medición, sin quedarse suelta en la escena.
    const escuadra = escuadraDeAnguloRecto(
      pie,
      punto,
      new THREE.Vector3(...plano.normal),
      SELECTION_COLOR,
    );
    this.world.scene.three.add(escuadra);
    this.visualesPendientes.push(escuadra);
    this.propiosPendientes.push(escuadra);

    const linea = new OBF.Line(punto, pie);
    linea.units = "m";
    linea.rounding = 3;
    this.puntosPendientes = [toPoint3(punto), toPoint3(pie)];
    this.tools.distance.list.add(linea);

    this.emitMeasurement({ mode: "perpendicular", distanceM: perpendicular.distanceM });
    this.world.renderer?.update();
    return true;
  }

  /**
   * Los dos clics de una medición de distancia, venga el punto de donde venga.
   *
   * **La cota la dibuja el medidor de la librería aunque los puntos sean propios**, igual que la
   * perpendicular: así una medida se ve como las demás, aparece en la misma lista y se apaga y se
   * borra igual. Lo único propio es de dónde salen los dos puntos.
   *
   * **Y por eso los dos puntos no tienen que venir del mismo sitio.** Uno puede engancharse a un
   * trazo del CAD y el otro a un vértice del modelo, que es literalmente lo que `docs/UX.md` tenía
   * anotado como pendiente: _«medir del plano al modelo en un mismo gesto»_. Sale de que los dos
   * entren por aquí, no de código nuevo.
   */
  private addDistancePoint(punto: THREE.Vector3): boolean {
    if (this.planMeasureStart === null) {
      this.planMeasureStart = punto;

      // El primer punto tiene que verse, o no hay forma de saber si el clic entró ni dónde quedó
      // enganchado. Se marca con la misma cruz de la perpendicular, mirando hacia arriba: sirve
      // igual sobre un plano —que es horizontal— y sobre el modelo, donde lo que importa es ver
      // **dónde** quedó el punto y no la orientación de la cara.
      const marca = marcaDeReferencia(
        punto,
        new THREE.Vector3(0, 1, 0),
        this.world.camera.three.position.distanceTo(punto),
        SELECTION_COLOR,
      );
      this.marcaReferencia = marca;
      this.world.scene.three.add(marca);
      this.world.renderer?.update();
      return true;
    }

    const inicio = this.planMeasureStart;
    this.planMeasureStart = null;
    this.quitarMarcaDeReferencia();

    const partes = distancePartsM([inicio.x, inicio.y, inicio.z], [punto.x, punto.y, punto.z]);
    if (partes.directM < 0.0005) return true;

    const linea = new OBF.Line(inicio, punto);
    linea.units = "m";
    linea.rounding = 3;
    this.puntosPendientes = [toPoint3(inicio), toPoint3(punto)];
    this.tools.distance.list.add(linea);

    this.emitMeasurement({
      mode: "distance",
      distanceM: partes.directM,
      horizontalM: partes.horizontalM,
      verticalM: partes.verticalM,
    });
    this.world.renderer?.update();
    return true;
  }

  /** Olvida una medición sobre el plano a medias y borra su marca. */
  private descartarMedicionEnPlano(): void {
    if (this.planMeasureStart === null) return;
    this.planMeasureStart = null;
    this.quitarMarcaDeReferencia();
  }

  /** Quita la marca de la cara de referencia, si había alguna. */
  private quitarMarcaDeReferencia(): void {
    if (this.marcaReferencia === null) return;
    liberarDibujo(this.marcaReferencia);
    this.marcaReferencia = null;
    this.world.renderer?.update();
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

    const comun = {
      camera: this.world.camera.three,
      mouse: mouseFor(clientX, clientY),
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
   *
   * **Tres puntos es el mínimo y se dice.** Con dos, el área es cero y el perímetro es el doble
   * del segmento: un resultado que existe y no significa nada. Antes esto lo decidía la librería
   * por dentro; ahora se devuelve `false` y la interfaz puede seguir pidiendo vértices.
   */
  finishMeasurement(): boolean {
    this.assertAlive();
    if (this.measureMode !== "area") return false;
    if (this.puntosDeArea.length < 3) return false;

    const puntos = this.puntosDeArea;
    this.puntosDeArea = [];
    this.quitarMarcasDeMedicion();

    const comoPuntos = puntos.map(toPoint3);
    const area = new OBF.Area(puntos);
    area.units = "m2";
    area.rounding = 2;
    this.puntosPendientes = [...comoPuntos];
    this.tools.area.list.add(area);

    this.emitMeasurement({
      mode: "area",
      // **El área y el perímetro salen del dominio, no de la librería.** Son las mismas
      // funciones que tienen sus pruebas en `bim-core`, y así el número que se lee en pantalla
      // es el que está probado.
      //
      // **Y el perímetro es el `closed`**, no el de la polilínea: un contorno incluye el tramo de
      // vuelta al primer vértice. Con el otro, un cuadrado de 4 m daba 12 m en vez de 16 — se vio
      // porque el oráculo era una figura de medida conocida.
      areaM2: polygonAreaM2(comoPuntos),
      perimeterM: closedPerimeterM(comoPuntos),
      vertices: puntos.length,
    });
    this.world.renderer?.update();
    return true;
  }

  /** Cuántos vértices lleva puestos el contorno de un área a medias. */
  get areaPointCount(): number {
    return this.puntosDeArea.length;
  }

  /** Descarta la medición a medias, sin borrar las ya terminadas. */
  cancelMeasurement(): void {
    this.assertAlive();
    this.tools.distance.cancelCreation();
    this.tools.angle.cancelCreation();
    this.tools.area.cancelCreation();
    // Los puntos propios de las tres medidas, con sus marcas.
    this.planMeasureStart = null;
    this.puntosDeAngulo = [];
    this.puntosDeArea = [];
    this.quitarMarcasDeMedicion();
    // La perpendicular a medias también se descarta, con su marca de referencia.
    this.referencePlane = null;
    this.quitarMarcaDeReferencia();
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
   * Corta el modelo **a una altura concreta**, en metros de la escena.
   *
   * Es lo que hace falta para comparar de verdad un plano con el modelo: un DXF de planta es una
   * sección a la altura de las ventanas, y con el edificio entero encima no se ve si los muros
   * coinciden. Cortando a esa misma cota, las dos cosas dicen lo mismo y la comparación es directa.
   */
  async sectionAtHeight(alturaM: number): Promise<void> {
    this.assertAlive();

    const clipper = this.components.get(OBC.Clipper);
    clipper.enabled = true;
    clipper.createFromNormalAndCoplanarPoint(
      this.world,
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, alturaM, 0),
    );
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

    const result = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: mouseFor(clientX, clientY),
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

    for (const cota of this.drawn) {
      for (const propio of cota.owned) liberarDibujo(propio);
    }
    this.drawn.length = 0;
    for (const propio of this.propiosPendientes) liberarDibujo(propio);
    this.visualesPendientes = [];
    this.propiosPendientes = [];

    this.emitMeasurement(null);
    this.world.renderer?.update();
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

    // Lo de antes se guarda **antes** de tocar nada: es lo que permite salir del aislamiento sin
    // encender lo que ya estaba apagado a mano. Ver {@link undoIsolation}.
    this.visibilityStack.push(await this.captureVisibility());

    for (const [id, model] of this.fragments.list) {
      // `undefined` afecta a todos los elementos del modelo.
      await model.setVisible(undefined, false);
      if (id === modelId) await model.setVisible([...localIds], true);
    }
    await this.refresh();
  }

  /** Qué está oculto ahora mismo, por modelo. */
  async captureVisibility(): Promise<VisibilitySnapshot> {
    this.assertAlive();

    const hiddenByModel: Record<string, readonly number[]> = {};
    for (const [modelId, model] of this.fragments.list) {
      const ocultos = await model.getItemsByVisibility(false);
      if (ocultos.length > 0) hiddenByModel[modelId] = ocultos;
    }
    return hiddenByModel;
  }

  /**
   * Deja la visibilidad exactamente como dice la instantánea.
   *
   * Los modelos que no aparezcan quedan enteros a la vista: una instantánea tomada con otros
   * modelos abiertos sigue sirviendo, igual que una vista guardada.
   */
  async applyVisibility(snapshot: VisibilitySnapshot): Promise<void> {
    this.assertAlive();

    for (const [modelId, model] of this.fragments.list) {
      await model.setVisible(undefined, true);
      const ocultos = snapshot[modelId];
      if (ocultos !== undefined && ocultos.length > 0) await model.setVisible([...ocultos], false);
    }
    await this.refresh();
  }

  /**
   * Qué se está viendo ahora mismo, **en GUID y en la forma de un viewpoint de BCF**. `F4.7`.
   *
   * Es lo que faltaba para que una observación diga la verdad fuera de acá. {@link captureVisibility}
   * ya sabía qué está apagado, pero lo dice en `localId` —el identificador del motor—, que sirve
   * para una vista de trabajo y **no sirve para un BCF**: cambia entre versiones del modelo y entre
   * herramientas, así que un viewpoint anclado a él queda huérfano en la siguiente exportación.
   *
   * **La cuenta va antes que la traducción, y por eso se pregunta dos veces al modelo.** Resolver un
   * GUID cuesta una consulta por elemento; sabiendo primero cuántos hay de cada lado, se traduce
   * solo el lado que se va a escribir. Con tres vigas apagadas de veinte mil elementos son tres
   * búsquedas y no veinte mil.
   *
   * Devuelve `null` cuando no hay nada que afirmar —el modelo entero a la vista— o cuando ni
   * siquiera el lado corto cabe en un viewpoint razonable. Las dos son respuestas normales: quien
   * llama no escribe visibilidad, que es exactamente lo que hacía antes de que esto existiera.
   */
  async captureVisibilityBcf(): Promise<VisibilidadBcf | null> {
    this.assertAlive();

    const ocultosPorModelo: { model: FRAGS.FragmentsModel; ids: number[] }[] = [];
    const visiblesPorModelo: { model: FRAGS.FragmentsModel; ids: number[] }[] = [];
    let ocultos = 0;
    let visibles = 0;

    for (const [, model] of this.fragments.list) {
      const apagados = await model.getItemsByVisibility(false);
      const encendidos = await model.getItemsByVisibility(true);
      ocultosPorModelo.push({ model, ids: apagados });
      visiblesPorModelo.push({ model, ids: encendidos });
      ocultos += apagados.length;
      visibles += encendidos.length;
    }

    const lado = ladoDeVisibilidad(ocultos, visibles);
    if (lado === null) return null;

    const elegidos = lado === "ocultos" ? ocultosPorModelo : visiblesPorModelo;
    const guids: (string | null)[] = [];
    for (const { model, ids } of elegidos) {
      if (ids.length === 0) continue;
      guids.push(...(await model.getGuidsByLocalIds(ids)));
    }

    return visibilidadBcf(lado, guids);
  }

  /**
   * Deja la pantalla como estaba quien anotó, leyendo la visibilidad de una observación. `F4.7`.
   *
   * **Lo que no está abierto no es un fallo.** Una observación puede haberse tomado con estructura
   * y arquitectura a la vista y abrirse hoy con una sola: lo que hay se ajusta y lo que falta se
   * ignora, igual que al aplicar una vista guardada.
   *
   * Devuelve cuántos elementos quedaron apagados, que es lo que permite decirlo en pantalla — «se
   * apagaron 340 elementos para dejarlo como estaba» — en vez de que la vista cambie sola sin
   * explicación.
   */
  async applyVisibilityBcf(visibilidad: VisibilidadBcf): Promise<number> {
    this.assertAlive();

    let apagados = 0;
    for (const [, model] of this.fragments.list) {
      // **Se parte del modelo entero encendido.** Sin esto, aplicar una observación encima de otra
      // acumula lo apagado por las dos y la vista deja de ser la que dice el viewpoint.
      await model.setVisible(undefined, true);

      const todos = await model.getLocalIds();
      if (todos.length === 0) continue;
      const guids = await model.getGuidsByLocalIds(todos);

      const ocultar: number[] = [];
      todos.forEach((localId, i) => {
        const guid = guids[i];
        // Un elemento sin GUID no puede estar nombrado en el viewpoint, así que le toca el valor
        // por defecto — que es lo mismo que le pasaría a cualquier elemento no enumerado.
        const visible = typeof guid === "string" ? seVe(visibilidad, guid) : visibilidad.porDefecto;
        if (!visible) ocultar.push(localId);
      });

      if (ocultar.length > 0) {
        await model.setVisible(ocultar, false);
        apagados += ocultar.length;
      }
    }

    await this.refresh();
    return apagados;
  }

  /** Cuántos aislamientos hay sin deshacer. Cero significa que no se está mirando nada aislado. */
  get isolationDepth(): number {
    return this.visibilityStack.length;
  }

  /**
   * Sale del último aislamiento y **vuelve a lo que había antes**, no a todo encendido.
   *
   * Es la operación que faltaba: aislar dejaba el resto del modelo apagado sin más camino de vuelta
   * que "Ver todo", que además enciende lo que uno había apagado a propósito. Acá el paso se
   * deshace: si antes de aislar había una planta apagada, sigue apagada.
   *
   * Devuelve `false` si no había ningún aislamiento que deshacer.
   */
  async undoIsolation(): Promise<boolean> {
    this.assertAlive();

    const previa = this.visibilityStack.pop();
    if (previa === undefined) return false;

    await this.applyVisibility(previa);
    return true;
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

    this.grids.remove(modelId);

    const objeto = model.object;
    await this.fragments.core.disposeModel(modelId);
    this.world.scene.three.remove(objeto);

    this.unitsByModel.delete(modelId);
    this.modelCount = Math.max(0, this.modelCount - 1);
    if (this.modelCount > 0) await this.refresh();
  }

  /**
   * Abre una nube de puntos COPC y la deja en la escena, junto al modelo: `F2.1`.
   *
   * **La nube no se mueve al modelo ni el modelo a la nube.** Entra en las coordenadas que le
   * corresponden —las del archivo, menos su desplazamiento y con los ejes de la escena— y ahí se ve
   * si calza o no. Traerla «a ojo» al lado del edificio la haría parecer alineada sin estarlo, que
   * es lo contrario de lo que sirve: la Fase 2 existe para **medir** si lo construido coincide con lo
   * modelado. Alinearla es `F2.2`, con la georreferencia del archivo o señalando puntos.
   *
   * Solo se sostiene **una nube a la vez**, y a propósito: dos levantamientos de la misma obra en la
   * escena son dos verdades sobre lo mismo, y no hay forma de saber a cuál se le está midiendo. La
   * anterior se descarta al abrir otra.
   */
  async loadPointCloud(url: string, opciones: OpcionesDeNube): Promise<NubeCargada> {
    this.assertAlive();
    this.unloadPointCloud();

    const cargada = await abrirNube(url, opciones);
    this.nube = cargada.nube;
    // **El recorte local hay que encenderlo en el renderizador**, o los planos del material se
    // ignoran en silencio: el recorte por caja de `F2.3` no haria nada y no habria error que
    // mirar. Se enciende al abrir la primera nube y no antes, porque cuesta una variante de
    // sombreador y el resto de la escena no lo usa.
    const renderizador = this.world.renderer;
    if (renderizador !== null) renderizador.three.localClippingEnabled = true;
    this.world.scene.three.add(cargada.objeto);
    await this.refresh();
    return cargada;
  }

  /**
   * Vuelve a decidir qué nodos de la nube hacen falta, con la cámara donde esté ahora.
   *
   * **Se llama cuando la cámara se asienta, no mientras se mueve.** Cada refresco puede pedir nodos
   * por la red, y hacerlo en cada fotograma de una órbita sería pedir y tirar lo mismo cien veces.
   *
   * Devuelve `null` si no hay nube abierta, que es un caso normal y no un error.
   */
  async refreshPointCloud(criterio: CriterioVisual = {}): Promise<InformeDeRefresco | null> {
    this.assertAlive();
    if (this.nube === null) return null;
    const camara = this.camera.three;
    const factor = factorDeProyeccionDe(camara, this.container.clientHeight);
    const informe = await this.nube.refrescar({
      ...criterio,
      camara: [camara.position.x, camara.position.y, camara.position.z],
      planos: planosDeLaCamara(camara),
      // El campo se omite y no se pone en `undefined`: con `exactOptionalPropertyTypes` son cosas
      // distintas, y "ausente" es lo que significa "ordena por profundidad".
      ...(factor !== undefined ? { factorDeProyeccion: factor } : {}),
    });
    await this.refresh();
    return informe;
  }

  /** La nube viva, para sus controles: tamaño de punto, densidad, recorte y color. */
  get cloud(): NubeEnEscena | null {
    return this.nube;
  }

  /**
   * Señala un punto **sobre la nube**, desde una posición del ratón: `F2.2`.
   *
   * Devuelve el punto en coordenadas de la escena y **también en las del archivo**, que son las que
   * sirven para calzar: el par de puntos de un calce tiene que estar en el sistema de los datos, no
   * en el de nuestro renderizador — si mañana cambia la convención de la escena, un calce guardado
   * en coordenadas de escena empezaría a mentir.
   *
   * **El umbral se calcula desde el tamaño del punto en pantalla**, no es un número fijo en metros.
   * Un umbral en metros que sirve a dos metros del muro no acierta a cincuenta, y al contrario
   * atrapa el punto equivocado: con el tamaño en píxeles, señalar se comporta igual de cerca y de
   * lejos, que es lo que espera quien está marcando esquinas.
   *
   * Devuelve `null` si no hay nube o si el rayo no da en nada, que son casos normales.
   */
  pickPointCloud(clientX: number, clientY: number): PuntoSenalado | null {
    this.assertAlive();
    if (this.nube === null) return null;

    const caja = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - caja.left) / caja.width) * 2 - 1,
      -((clientY - caja.top) / caja.height) * 2 + 1,
    );

    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(ndc, this.camera.three);

    // **El umbral: cuántos metros mide un píxel a la distancia de la nube.**
    //
    // La primera versión lo sacó de dividir el tamaño de la nube por el alto de la ventana, y **no
    // acertaba nunca**: eso no es una longitud en el mundo, es un número sin unidades. Lo correcto
    // es la relación de la propia cámara — a distancia `d`, un píxel mide `d / factor`, donde el
    // factor es `alto / (2·tan(fov/2))`, el mismo que usa el recorrido del octree.
    //
    // Se toma un radio de unos pocos píxeles y no de uno: con un punto de 2 px pintado, exigir el
    // centro exacto obliga a afinar como con una aguja, y quien marca esquinas está mirando la
    // esquina, no cazando un píxel.
    const centro = this.nube.cajaDeLoCargado()?.getCenter(new THREE.Vector3()) ?? null;
    const distancia = centro !== null ? this.camera.three.position.distanceTo(centro) : 10;
    const factor = factorDeProyeccionDe(this.camera.three, caja.height);
    const metrosPorPixel = factor !== undefined ? distancia / factor : distancia / 1000;
    rayo.params.Points = {
      threshold: Math.max(0.01, metrosPorPixel * RADIO_DE_SENALADO),
    };

    const golpes = rayo.intersectObjects(this.nube.objeto.children, false);
    const primero = golpes[0];
    if (primero === undefined) return null;

    const enLaEscena: [number, number, number] = [
      primero.point.x,
      primero.point.y,
      primero.point.z,
    ];
    return {
      escena: enLaEscena,
      archivo: escenaAArchivo(enLaEscena, this.nube.desplazamiento),
      distancia: primero.distance,
    };
  }

  /**
   * Calza la nube con el modelo aplicando una alineación: `F2.2`.
   *
   * La alineación va **del sistema local del modelo al de la nube** —es lo que devuelven
   * `calzarConPuntos` y `alineacionDeMapa` de `bim-core`— y acá se invierte, porque **lo que se
   * mueve es la nube**: mover el modelo movería las observaciones, las vistas guardadas y los
   * planos, que están anotados sobre él.
   *
   * Se aplica como matriz del objeto y **no reescribiendo los puntos**: los puntos ya están en
   * coordenadas locales pequeñas, así que el giro lo hace la tarjeta sin perder precisión, y volver
   * a calzar cuesta dieciséis números en vez de subir cientos de megas otra vez.
   *
   * Devuelve `false` si no hay nube.
   */
  alignPointCloud(alineacion: Alineacion): boolean {
    this.assertAlive();
    if (this.nube === null) return false;

    const objeto = this.nube.objeto;
    // La matriz se pone a mano y se desactiva la actualización automática: si Three.js recompusiera
    // la matriz desde posición, giro y escala, un giro que no sea alrededor de un eje puro se
    // perdería al descomponerlo.
    objeto.matrixAutoUpdate = false;
    objeto.matrix.fromArray(matrizDeCalce(alineacion, this.nube.desplazamiento));
    objeto.matrixWorldNeedsUpdate = true;
    return true;
  }

  /** Deshace el calce: la nube vuelve a donde la puso el cargador. */
  resetPointCloudAlignment(): boolean {
    this.assertAlive();
    if (this.nube === null) return false;
    this.nube.objeto.matrix.identity();
    this.nube.objeto.matrixWorldNeedsUpdate = true;
    return true;
  }

  /**
   * Quita la nube y **suelta su memoria**.
   *
   * Descartar el objeto no basta: la geometría se queda en la tarjeta hasta que alguien llama a
   * `dispose`, y una nube son cientos de megas. Sin esto, abrir tres levantamientos seguidos deja
   * los tres pagados.
   */
  unloadPointCloud(): void {
    if (this.nube === null) return;
    this.world.scene.three.remove(this.nube.objeto);
    this.nube.dispose();
    this.nube = null;
  }

  /** El objeto de la nube en la escena, o `null`. Para encuadrarla o medir sobre ella. */
  get pointCloud(): THREE.Group | null {
    return this.nube?.objeto ?? null;
  }

  /**
   * Carga un plano 2D (DXF) y lo deja bajo el modelo, a escala.
   *
   * **Se coloca centrado sobre el modelo y a la cota de su base**, que es de donde uno parte para
   * ajustar: el CAD y el IFC casi nunca comparten origen, y arrancar en el origen del dibujo lo
   * dejaría a decenas de metros, fuera de la pantalla. Sin modelo abierto, va al origen.
   *
   * La escala se propone midiendo el dibujo y **se puede cambiar**: ver `suggestMetresPerUnit` en
   * `bim-core` y {@link setPlanTransform}.
   */
  async loadPlan(text: string, name: string): Promise<LoadedPlan> {
    this.assertAlive();

    const union = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      const caja = await this.boxOf(model);
      if (caja !== null) union.union(caja);
    }

    const centro = union.isEmpty()
      ? { xM: 0, zM: 0, elevationM: 0 }
      : {
          xM: (union.min.x + union.max.x) / 2,
          zM: (union.min.z + union.max.z) / 2,
          // A ras de la base del modelo, que es donde va un plano de planta.
          elevationM: union.min.y,
        };

    const plano = this.plans.add(text, name, centro);
    await this.refresh();
    return plano;
  }

  /** Cambia la colocación de un plano: escala, cota, desplazamiento, giro o reflejo. */
  async setPlanTransform(
    id: string,
    cambios: Partial<PlanTransform>,
  ): Promise<PlanTransform | null> {
    this.assertAlive();

    const resultado = this.plans.setTransform(id, cambios);
    await this.refresh();
    return resultado;
  }

  /**
   * Cambia el alto de los rótulos de un plano, en metros. Con `0` se apagan.
   *
   * El tamaño no puede salir del archivo: los planos anotativos escriben altura de papel y esos
   * rótulos no se ven; otros escriben altura de modelo y tapan el dibujo. Ver
   * {@link PlanOverlay.setLabelHeight}.
   */
  async setPlanLabelHeight(id: string, metros: number): Promise<void> {
    this.assertAlive();

    this.plans.setLabelHeight(id, metros);
    await this.refresh();
  }

  /** Enciende o apaga una capa del plano. */
  async setPlanLayerVisible(id: string, layer: string, visible: boolean): Promise<void> {
    this.assertAlive();

    this.plans.setLayerVisible(id, layer, visible);
    await this.refresh();
  }

  /** Enciende o apaga el plano entero. */
  async setPlanVisible(id: string, visible: boolean): Promise<void> {
    this.assertAlive();

    this.plans.setVisible(id, visible);
    await this.refresh();
  }

  /** Cierra un plano: lo saca de la escena y libera su geometría. */
  async removePlan(id: string): Promise<void> {
    this.assertAlive();

    this.plans.remove(id);
    await this.refresh();
  }

  /**
   * Qué elemento 2D hay bajo el cursor.
   *
   * **Es la selección del plano, no la del modelo**: devuelve la capa, el plano y el largo del
   * tramo tocado. Se llama cuando el clic sobre el modelo no encontró nada, así que un plano bajo
   * una losa no roba la selección del elemento que está encima.
   */
  pickPlan(clientX: number, clientY: number): PlanHit | null {
    this.assertAlive();

    const canvas = this.world.renderer?.three.domElement;
    if (!canvas || this.plans.count === 0) return null;

    // El rectángulo se resta **una sola vez** y aquí sí toca hacerlo: a diferencia del picker de
    // Fragments, `Raycaster` espera coordenadas normalizadas. Ver la nota de `F1.11`.
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const rayo = new THREE.Raycaster();
    const camara = this.world.camera.three;
    rayo.setFromCamera(ndc, camara);
    return this.plans.pick(rayo, camara);
  }

  /**
   * A qué punto del plano se engancharía un clic aquí.
   *
   * **Es el ajuste de un CAD, con las referencias que se usan revisando**: el **cruce** de dos
   * trazos —la esquina de dos muros, el encuentro de dos ejes—, el **extremo** de un trazo, su
   * **punto medio** y, si no hay ninguno cerca, el punto **sobre la línea**. Sin ajuste, medir
   * sobre un plano es un juego de puntería y los números salen con el error del pulso.
   *
   * La tolerancia crece con la distancia a la cámara: enganchar cuesta lo mismo de cerca que de
   * lejos, que es lo que hace que se sienta como un CAD y no como una lotería.
   */
  snapOnPlan(clientX: number, clientY: number): PlanSnap | null {
    this.assertAlive();

    const hit = this.pickPlan(clientX, clientY);
    if (hit === null) return null;

    const punto = new THREE.Vector3(...hit.point);
    if (hit.segmentStartM === null || hit.segmentEndM === null) {
      return { kind: "edge", point: hit.point, layer: hit.layer, planId: hit.planId };
    }

    const a = new THREE.Vector3(...hit.segmentStartM);
    const b = new THREE.Vector3(...hit.segmentEndM);
    const medio = a.clone().add(b).multiplyScalar(0.5);

    // La tolerancia es un porcentaje de lo que se ve, no una medida fija: en un plano de 50 m
    // mirado entero, 20 cm no engancha nada; mirando un detalle, engancharía el trazo de al lado.
    const tolerancia = this.world.camera.three.position.distanceTo(punto) * 0.02;

    // **La intersección va con los demás candidatos y gana por cercanía**, no por preferencia: en
    // la esquina de dos muros el cruce y el extremo caen casi en el mismo sitio, y forzar uno de
    // los dos daría un enganche que salta de sitio según qué trazo tocó el rayo.
    const cruces = this.plans
      .intersectionsNear(hit.planId, punto, tolerancia)
      .map((cruce) => ({ kind: "intersection" as const, punto: cruce }));

    const candidatos = [
      ...cruces,
      { kind: "endpoint" as const, punto: a },
      { kind: "endpoint" as const, punto: b },
      { kind: "midpoint" as const, punto: medio },
    ]
      .map((candidato) => ({ ...candidato, distancia: candidato.punto.distanceTo(punto) }))
      .sort((uno, otro) => uno.distancia - otro.distancia);

    const mejor = candidatos[0];
    if (mejor !== undefined && mejor.distancia <= tolerancia) {
      return {
        kind: mejor.kind,
        point: [mejor.punto.x, mejor.punto.y, mejor.punto.z],
        layer: hit.layer,
        planId: hit.planId,
      };
    }

    return { kind: "edge", point: hit.point, layer: hit.layer, planId: hit.planId };
  }

  /**
   * Calza un plano sobre el modelo con dos pares de puntos: giro, escala y desplazamiento.
   *
   * Ver {@link PlanOverlay.align}. Devuelve la colocación que quedó, o `null` si el plano ya no
   * está o si los dos puntos de un lado coinciden — dos clics en el mismo sitio no dan dirección.
   */
  async alignPlan(
    id: string,
    puntos: {
      readonly planoA: Point3;
      readonly modeloA: Point3;
      readonly planoB: Point3;
      readonly modeloB: Point3;
    },
    ajustarEscala: boolean,
  ): Promise<PlanTransform | null> {
    this.assertAlive();

    const resultado = this.plans.align(id, puntos, ajustarEscala);
    await this.refresh();
    return resultado;
  }

  /**
   * El punto del **modelo** bajo el cursor, con el ajuste del medidor puesto.
   *
   * Es la otra mitad de alinear por dos puntos: uno se señala en el CAD y el otro en el IFC.
   */
  async pointOnModel(clientX: number, clientY: number): Promise<Point3 | null> {
    this.assertAlive();

    const toque = await this.rayAt(clientX, clientY, true);
    return toque?.point ?? null;
  }

  /**
   * Genera un plano **desde el modelo**: proyecta sus aristas y arma el dibujo.
   *
   * Se proyecta lo que está a la vista, no todo lo cargado: apagar una disciplina antes de generar
   * es la forma natural de decidir qué entra en el plano, y es lo que ya se hace para mirar.
   *
   * Devuelve `null` si no había nada que proyectar. Puede tardar: la proyección recorre la
   * geometría y descarta lo tapado, así que el aviso de avance no es un adorno.
   */
  async createDrawing(
    view: DrawingView,
    onProgress?: (mensaje: string, avance?: number) => void,
  ): Promise<GeneratedDrawing | null> {
    this.assertAlive();

    const modelIdMap: Record<string, Set<number>> = {};
    for (const [modelId, model] of this.fragments.list) {
      const visibles = await model.getItemsByVisibility(true);
      if (visibles.length > 0) modelIdMap[modelId] = new Set(visibles);
    }
    if (Object.keys(modelIdMap).length === 0) return null;

    const plano = await this.drawings.create(this.world, modelIdMap, view, onProgress);
    await this.refresh();
    return plano;
  }

  /**
   * Serializa un plano generado a DXF, listo para abrir en el CAD.
   *
   * Con papel sale en milímetros y colocado en la hoja; sin papel, en unidades del mundo. La
   * interfaz ofrece papel porque lo que se pide es un plano imprimible.
   */
  exportDrawingDxf(
    id: string,
    paper?: { widthMm: number; heightMm: number; margin: number },
  ): string | null {
    this.assertAlive();
    return this.drawings.exportDxf(id, paper);
  }

  /**
   * La lámina de un plano generado, lista para que el servidor la dibuje en PDF. `F7.5`.
   *
   * **El navegador proyecta y el servidor compone el papel**, y ese reparto no es casual: proyectar
   * aristas necesita un renderizador —en un servidor sin pantalla es justo lo que no hay— y el
   * membrete de J.E.J. ya vive en el servidor, medido del formato de la oficina.
   *
   * Lo que sale de aquí son **los segmentos y los textos ya situados en coordenadas del dibujo**,
   * que es lo mismo que se escribe en el DXF: así el PDF y el DXF dibujan el mismo plano. Se
   * recorren las capas encendidas, porque el papel tiene que decir lo mismo que la pantalla.
   */
  sheetOf(id: string): { nombre: string; segmentos: number[][]; textos: unknown[][] } | null {
    this.assertAlive();
    return this.drawings.sheet(id);
  }

  /**
   * Lleva las cotas medidas sobre el modelo a una lámina generada. `F7.3`.
   *
   * **Es el acotado del plano sin medir dos veces.** Se mide sobre el modelo con el ajuste a
   * vértice, se genera la planta, y las cotas van dentro de la lámina y salen en el DXF. Acotar
   * encima del dibujo sería medir otra vez la misma cosa y arriesgarse a dos números distintos.
   *
   * Solo las de **distancia entre dos puntos**: un área no es una cota, y un ángulo tiene su propio
   * sistema. Y solo las **encendidas**: una medición apagada es una que quien mide decidió no
   * mostrar, y el plano tiene que decir lo mismo que la pantalla.
   *
   * Devuelve cuántas se pusieron. Puede ser menos que las que hay: una cota entre dos puntos que se
   * proyectan al mismo sitio —una medición vertical en una planta— no es una cota y se salta.
   */
  async addDimensionsToDrawing(id: string): Promise<number> {
    this.assertAlive();

    // `Point3` ya **es** una tripleta `[x, y, z]`, así que se pasa tal cual: convertirla otra vez
    // fue lo que el compilador rechazó, y con razón.
    const puestas = this.drawings.addDimensions(id, this.medicionesParaPlano("distance"));
    if (puestas > 0) await this.refresh();
    return puestas;
  }

  /**
   * Anota en la lámina **todo lo que se ha medido**: cotas, ángulos y pendientes. `F7.3`.
   *
   * **Va en un solo gesto y no en tres botones.** Quien acota un plano no quiere elegir «ahora las
   * cotas, ahora los ángulos»: quiere que lo que midió aparezca. Y las tres salen del mismo sitio
   * —las mediciones encendidas— así que separarlas sería inventar una decisión que nadie tiene.
   *
   * La pendiente **se deriva** de las cotas en vez de medirse aparte: una cota entre dos puntos a
   * distinta altura ya lleva dentro la diferencia de altura y el recorrido. Ver `addSlopes`.
   *
   * Devuelve cuántas de cada una entraron, que es lo que la ficha del plano puede decir. Puede ser
   * menos que lo medido: lo que se proyecta a un punto no es una cota, y lo que está a nivel no
   * tiene pendiente que anotar.
   */
  async annotateDrawing(
    id: string,
  ): Promise<{ cotas: number; angulos: number; pendientes: number }> {
    this.assertAlive();

    const distancias = this.medicionesParaPlano("distance");
    const angulos = this.medicionesParaPlano("angle");

    const puestas = {
      cotas: this.drawings.addDimensions(id, distancias),
      angulos: this.drawings.addAngles(id, angulos),
      pendientes: this.drawings.addSlopes(id, distancias),
    };
    if (puestas.cotas + puestas.angulos + puestas.pendientes > 0) await this.refresh();
    return puestas;
  }

  /**
   * Señala en la lámina los hallazgos que apunten a un elemento dibujado. `F7.3`.
   *
   * **Es lo que conecta el plano con la coordinación**, y es el punto de la fase entera: un plano
   * que dice «aquí falta la cota del vano V-03» es un plano con el que se va a obra. Sin esto son
   * dos papeles que hay que cruzar a mano.
   *
   * Los hallazgos llegan **por GUID**, que es la identidad estable, y aquí se resuelven al
   * identificador local de cada modelo abierto: es el mismo camino que usa abrir una observación
   * desde el panel de coordinación.
   *
   * Devuelve cuántas entraron. Es normal que sean menos: la planta proyecta lo que estaba
   * encendido, así que un hallazgo de la estructura no cabe en un plano de arquitectura.
   */
  async addCalloutsToDrawing(
    id: string,
    hallazgos: readonly { guid: string; titulo: string }[],
  ): Promise<number> {
    this.assertAlive();

    const resueltos: { localId: number; titulo: string }[] = [];
    for (const [, model] of this.fragments.list) {
      const guids = hallazgos.map((uno) => uno.guid);
      const locales = await model.getLocalIdsByGuids(guids);
      for (const [i, localId] of locales.entries()) {
        if (localId === null || localId === undefined) continue;
        resueltos.push({ localId, titulo: hallazgos[i]!.titulo });
      }
    }

    const puestas = this.drawings.addCallouts(id, resueltos);
    if (puestas > 0) await this.refresh();
    return puestas;
  }

  /** Las mediciones **encendidas** de un tipo, en la forma que espera el generador de planos. */
  private medicionesParaPlano(kind: MeasureMode) {
    return this.drawn
      .filter((una) => una.visible && una.kind === kind && una.puntos.length >= 2)
      .map((una) => ({ puntos: una.puntos }));
  }

  /** Cuántas mediciones hay hoy que se puedan llevar a un plano. `F7.3`. */
  get dimensionableCount(): number {
    return this.drawn.filter(
      (una) =>
        una.visible && (una.kind === "distance" || una.kind === "angle") && una.puntos.length >= 2,
    ).length;
  }

  /**
   * Pone una tabla dentro de una lámina generada. `F10.4`.
   *
   * **Es lo que hace de una proyección un entregable.** Un plano con el modelo dibujado y sin cuadro
   * obliga a llevar dos papeles a la obra, y el segundo se pierde. La tabla llega ya en texto, así
   * que sirve igual para un cuadro de elementos —el de `F10.5`— que para uno de hallazgos: es la
   * misma tabla con otro contenido, y quien la arma decide qué columnas valen la pena en papel.
   */
  async addTableToDrawing(id: string, tabla: TablaDeCuadro): Promise<boolean> {
    this.assertAlive();
    const puesta = this.drawings.addTable(id, tabla);
    if (puesta) await this.refresh();
    return puesta;
  }

  /**
   * El cuadro de una categoría, reducido a una tabla que quepa en un plano. `F10.4`.
   *
   * **Un cuadro de pantalla y un cuadro de papel no son la misma tabla**, y por eso esto existe: en
   * pantalla se puede desplazar y hay veinticuatro columnas; en una lámina, veinticuatro columnas
   * son ilegibles a cualquier escala. Se quedan las que **más filas llevan**, que es el mismo
   * criterio con el que se ordenan, y el título dice de qué es y cuántos hay — incluido lo que no
   * cupo, porque un cuadro que parece el total y no lo es se cuenta mal en una reunión.
   */
  tablaDeCuadro(cuadro: Schedule, columnas = 6, filas = 40): TablaDeCuadro {
    const elegidas = cuadro.columns.slice(0, columnas);
    const recorte = cuadro.rows.slice(0, filas);
    const total =
      cuadro.rows.length === cuadro.total
        ? `${cuadro.total}`
        : `${cuadro.rows.length} de ${cuadro.total}`;

    return {
      title:
        `${cuadro.category} · ${total}` +
        (recorte.length < cuadro.rows.length ? ` · en el plano, ${recorte.length}` : ""),
      headers: ["Nombre", ...elegidas.map((columna) => encabezadoDeColumna(columna))],
      rows: recorte.map((fila) => [
        fila.name ?? `#${fila.localId}`,
        ...elegidas.map((columna) => fila.values.get(columna.key) ?? ""),
      ]),
    };
  }

  /** Enciende o apaga las aristas ocultas de un plano generado. */
  async setDrawingHiddenVisible(id: string, visible: boolean): Promise<void> {
    this.assertAlive();
    this.drawings.setHiddenVisible(id, visible);
    await this.refresh();
  }

  /**
   * Enciende o apaga un plano generado en la vista 3D.
   *
   * **Encenderlo lleva la cámara a él.** El dibujo se coloca en el plano de proyección —encima del
   * modelo— así que aparecer sin más lo deja mezclado con la geometría y parece que algo se rompió.
   */
  async setDrawingVisible(id: string, visible: boolean): Promise<void> {
    this.assertAlive();

    this.drawings.setVisible(id, visible);
    if (visible) {
      const caja = this.drawings.boxOf(id);
      if (caja !== null) this.applyFraming(caja, "top");
    }
    await this.refresh();
  }

  /** Cierra un plano generado. */
  async removeDrawing(id: string): Promise<void> {
    this.assertAlive();
    this.drawings.remove(id);
    await this.refresh();
  }

  /** Enciende o apaga los ejes de replanteo de todos los modelos. */
  async setGridVisible(visible: boolean): Promise<void> {
    this.assertAlive();

    this.grids.setVisible(visible);
    await this.refresh();
  }

  /** `true` si los ejes de replanteo están encendidos. */
  get gridVisible(): boolean {
    return this.grids.shown;
  }

  /** Cuántos ejes de replanteo hay dibujados, sumando todos los modelos. */
  get gridAxisCount(): number {
    return this.grids.count;
  }

  /** Enciende o apaga el ajuste al plano mientras se mide. */
  setPlanSnapEnabled(enabled: boolean): void {
    this.assertAlive();
    this.planSnapEnabled = enabled;
    if (!enabled) this.descartarMedicionEnPlano();
  }

  /** `true` si medir se engancha a los trazos del plano. */
  get planSnap(): boolean {
    return this.planSnapEnabled;
  }

  /**
   * Enciende o apaga la postproducción: la oclusión ambiental y las aristas dibujadas.
   *
   * **Un plano CAD no se mira con postproducción.** `COLOR_PEN_SHADOWS` está para que un modelo se
   * lea —las aristas marcan dónde acaba cada elemento, la oclusión da profundidad a los rincones—
   * y sobre un dibujo de líneas plano hace lo contrario: filtra los colores y los deja lavados, que
   * es parte de por qué el plano no se veía como en el CAD. En Modo 2D se apaga, y volviendo al
   * modelo se enciende.
   */
  setPostproductionEnabled(enabled: boolean): void {
    this.assertAlive();
    const postproduccion = this.world.renderer?.postproduction;
    if (postproduccion !== undefined) postproduccion.enabled = enabled;
  }

  /** `true` si la postproducción está encendida. */
  get postproduction(): boolean {
    return this.world.renderer?.postproduction.enabled ?? false;
  }

  /** Encuadra un plano, en planta por defecto. Devuelve `false` si ese plano ya no está. */
  framePlan(id: string, view: StandardView = "top"): boolean {
    this.assertAlive();

    const caja = this.plans.boxOf(id);
    if (caja === null) return false;

    this.applyFraming(caja, view);
    return true;
  }

  /**
   * Vuelve a mostrar todo, incluido lo que se había apagado a mano.
   *
   * Es la vuelta a cero, y por eso deja la pila de aislamientos vacía: después de esto no queda
   * ningún paso que deshacer. Para salir de un aislamiento **sin** encender el resto, ver
   * {@link undoIsolation}.
   */
  async showAll(): Promise<void> {
    this.assertAlive();

    this.visibilityStack.length = 0;
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
    // **Los planos también cuentan.** Sin esto, con solo un DXF abierto no había nada que encuadrar
    // y los botones de vista —y el cubo— no hacían nada: parecían rotos y solo estaban mirando al
    // conjunto equivocado.
    const cajaPlanos = this.plans.boxAll();
    if (cajaPlanos !== null) union.union(cajaPlanos);

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
    void controls.fitToBox(conGrosor(box), false);
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
    // El refresco diferido se cancela: un `setTimeout` vivo sobre una escena ya liberada revienta
    // al dispararse, y con la vista cerrada nadie vería el resultado de todas formas.
    if (this.refrescoPendiente !== null) {
      clearTimeout(this.refrescoPendiente);
      this.refrescoPendiente = null;
    }
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
