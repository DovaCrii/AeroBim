import {
  BimViewer,
  csvDe,
  type DistanceMode,
  type DrawingView,
  type DrawnMeasurement,
  type FichaDeNube,
  type InformeDeRefresco,
  type MedicionDeDesviacion,
  type ModoDeColor,
  type GeneratedDrawing,
  type LoadedModel,
  type LoadedPlan,
  type LoadStage,
  type MeasureMode,
  type Measurement,
  type ModelTree,
  type NavigationMode,
  type PickedItem,
  type PlanHit,
  type PlanTransform,
  type Projection,
  type PuntoSenalado,
  type RenderStyle,
  type SavedView,
  type Schedule,
  type SectionAxis,
  type SnapMode,
  type SpatialNode,
  type StandardView,
} from "@aerobim/viewer";
import {
  calzarConPuntos,
  escenaAArchivo,
  parseSavedViews,
  type ParDePuntos,
  type RegistryOrigin,
} from "@aerobim/bim-core";
import { cabecerasDeEscritura, motivoDe403 } from "./csrf.js";
import { type FichaCompartida, pedirFicha, testigoCompartido } from "./compartido.js";
import { cambiarTema, type Tema, temaGuardado } from "./tema.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrawingsPanel } from "./components/DrawingsPanel.js";
import { ModelsPanel } from "./components/ModelsPanel.js";
import { Coordinacion, type ObservacionDelModelo } from "./components/Coordinacion.js";
import { CuadroFlotante } from "./components/CuadroFlotante.js";
import { CuadrosPanel } from "./components/CuadrosPanel.js";
import { NotaFlotante } from "./components/NotaFlotante.js";
import { Origen } from "./components/Origen.js";
import { PlansPanel } from "./components/PlansPanel.js";
import { ProjectBrowser } from "./components/ProjectBrowser.js";
import { PuertaDeEntrada } from "./components/PuertaDeEntrada.js";
import { Resizer } from "./components/Resizer.js";
import { Selector } from "./components/Selector.js";
import { CalcePanel } from "./components/CalcePanel.js";
import { Compartido } from "./components/Compartido.js";
import { NubesPanel } from "./components/NubesPanel.js";
import { Plan2DCard, PropertiesPanel, PuntoDeNubeCard } from "./components/PropertiesPanel.js";
import { Ribbon, type RibbonTab } from "./components/Ribbon.js";
import { SpatialTree } from "./components/SpatialTree.js";
import { StatusBar } from "./components/StatusBar.js";
import { ViewCube } from "./components/ViewCube.js";
import { VistasCompartidas } from "./components/VistasCompartidas.js";
import { IconArrowLeft } from "./components/icons.js";

/**
 * Lo que la interfaz da por oculto, en las tres listas que pinta.
 *
 * Se guarda entero antes de aislar para poder devolverlo al salir: son los conjuntos que leen los
 * ojos del árbol, los del panel de modelos y el de la ficha del elemento.
 */
interface HiddenState {
  readonly hidden: ReadonlySet<string>;
  readonly hiddenModels: ReadonlySet<string>;
  readonly hiddenElements: ReadonlySet<string>;
}

/**
 * Una alineación de plano a medias: qué plano, qué puntos van puestos y con qué escala.
 *
 * Los puntos se guardan en el orden en que se piden —plano, modelo, plano, modelo—, así que
 * cuántos hay dice en qué paso va el gesto y qué hay que pedir en el siguiente clic.
 */
interface Alignment {
  readonly planId: string;
  readonly planName: string;
  readonly points: readonly Point3[];
  /** `true` si además de girar y mover hay que corregir la escala del plano. */
  readonly adjustScale: boolean;
}

/** Un punto de la escena, en metros. */
type Point3 = readonly [number, number, number];

type Status =
  | { readonly kind: "starting" }
  | { readonly kind: "ready" }
  | { readonly kind: "loading"; readonly name: string; readonly stage: LoadStage }
  | { readonly kind: "error"; readonly message: string };

/**
 * Qué decir en cada etapa de la carga.
 *
 * **La conversión corre en el hilo principal y no se puede interrumpir:** con el modelo de 32 MB son
 * casi diez segundos de interfaz congelada. No se puede evitar hasta que la conversión se mude a un
 * worker (`F0.6`), pero sí se puede decir en qué va — que es la diferencia entre esperar y no saber
 * si se colgó. Los avisos aparecen entre etapas, en los huecos en que el navegador puede pintar.
 */
/**
 * Dónde se guardan las vistas en este navegador.
 *
 * Lleva la versión en la clave: el día que la forma de una vista cambie, las viejas se quedan donde
 * están sin estorbar a las nuevas. Leerlas es tolerante —ver `parseSavedViews` en `bim-core`— porque
 * esto es almacenamiento de fuera: puede estar a medio escribir o editado a mano.
 */
const CLAVE_VISTAS = "aerobim.vistas.v1";

/** Dónde se recuerda si la cinta quedó plegada. */
const CLAVE_CINTA = "aerobim.cinta.plegada.v1";

/**
 * Dónde se recuerda si el navegador quedó plegado a rail.
 *
 * Se recuerda por lo mismo que la cinta: es una preferencia de trabajo —quien trabaja en una
 * pantalla chica lo pliega una vez— y no un estado de la sesión.
 */
const CLAVE_NAVEGADOR = "aerobim.navegador.plegado.v1";

/** Dónde se recuerdan los anchos de los paneles laterales. */
/**
 * Dónde se recuerda el ancho de los paneles.
 *
 * **Sube a `v2` a propósito**: el ancho de fábrica cambió con la escala de la interfaz, y sin
 * cambiar la clave quien ya la tuviera guardada se quedaría con los 288 px de antes y el texto un
 * quinto más grande dentro. Se pierde el ancho que alguien hubiera ajustado a mano, una vez.
 */
const CLAVE_PANELES = "aerobim.paneles.ancho.v2";

/**
 * Cuánto puede medir un panel lateral: ni tan angosto que no quepa un nombre, ni media pantalla.
 *
 * **Subidos un 20% con la escala de la interfaz.** El ancho de un panel se guarda en píxeles —lo
 * arrastra el usuario— así que es lo único que **no** creció solo al subir el tamaño base: con el
 * texto un quinto más grande y el mismo ancho, un código de entregable dejaba de caber.
 */
const ANCHO_PANEL = { minimo: 240, maximo: 620 } as const;

/** El ancho de fábrica de cada panel, también escalado: 288 × 1,2. */
const ANCHO_DE_FABRICA = 346;

/** Lee el ancho guardado de un panel. Cualquier cosa rara devuelve el de fábrica. */
function leerAncho(lado: "izquierda" | "derecha", porDefecto: number): number {
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(CLAVE_PANELES) ?? "[]");
    if (!Array.isArray(guardado)) return porDefecto;

    const valor = guardado[lado === "izquierda" ? 0 : 1];
    if (typeof valor !== "number" || !Number.isFinite(valor)) return porDefecto;
    return Math.min(ANCHO_PANEL.maximo, Math.max(ANCHO_PANEL.minimo, valor));
  } catch {
    return porDefecto;
  }
}

/** Lee la preferencia de la cinta. Sin almacenamiento, la cinta se muestra desplegada. */
function leerCintaPlegada(): boolean {
  try {
    return localStorage.getItem(CLAVE_CINTA) === "1";
  } catch {
    return false;
  }
}

/** Lee la preferencia del navegador. Sin almacenamiento, arranca desplegado. */
function leerNavegadorPlegado(): boolean {
  try {
    return localStorage.getItem(CLAVE_NAVEGADOR) === "1";
  } catch {
    return false;
  }
}

/** Lee las vistas guardadas. Nunca lanza: si el almacenamiento no está, no hay vistas. */
function leerVistas(): readonly SavedView[] {
  try {
    return parseSavedViews(localStorage.getItem(CLAVE_VISTAS) ?? "[]");
  } catch {
    return [];
  }
}

/** Guarda las vistas. Un almacenamiento lleno o bloqueado no debe romper la aplicación. */
function escribirVistas(vistas: readonly SavedView[]): void {
  try {
    localStorage.setItem(CLAVE_VISTAS, JSON.stringify(vistas));
  } catch {
    // Modo privado, cuota agotada o permisos: las vistas siguen en memoria esta sesión.
  }
}

/**
 * El worker que convierte los IFC, uno para toda la aplicación.
 *
 * Vive acá y no dentro del visor porque **crear un worker es cosa del empaquetador**: Vite reconoce
 * este `new URL(..., import.meta.url)` y emite el worker como un módulo propio con sus dependencias
 * dentro. Hecho desde el paquete, lo incrustaba como URL `data:` y sus `import` no resolvían.
 *
 * Se crea una sola vez, en la primera llamada: `BimViewer.create` devuelve una única instancia por
 * contenedor y StrictMode monta cada efecto dos veces, así que crearlo por montaje dejaría un worker
 * huérfano con su WASM cargado.
 */
let conversor: Worker | null = null;

function workerDeConversion(): Worker {
  conversor ??= new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
  return conversor;
}

/**
 * De dónde se sirve el WASM de `web-ifc`.
 *
 * **Sale de `BASE_URL` y no de una constante**, porque la aplicación vive en dos sitios: en
 * la raíz del servidor de Vite mientras se desarrolla, y bajo `/static/visor/` cuando Django
 * la sirve detrás del login. Con la ruta escrita a mano, el segundo caso pide `/wasm/`, recibe
 * el `index.html` de Django y falla con `Unexpected token '<'` **dentro del worker** — o sea
 * sin un error visible, que es exactamente la trampa que ya costó una sesión.
 *
 * `BASE_URL` termina en barra en los dos casos, así que se concatena tal cual.
 */
const RUTA_WASM = `${import.meta.env.BASE_URL}wasm/`;

/**
 * La marca, por la misma razón que el WASM.
 *
 * **Vite reescribe las rutas del `index.html` y no las cadenas dentro del JSX.** El favicon
 * salió bien en el build y este `img` se quedó pidiendo `/aerobim-mark.svg`, que bajo
 * `/static/visor/` no existe: un 404 en la consola y la marca sin dibujar. Se vio al abrir el
 * visor servido por Django.
 */
/**
 * La marca, **en su variante para fondo oscuro**.
 *
 * El visor es oscuro en todas sus superficies, así que aquí no hace falta la original: el
 * `#1B2A4A` de sus rellenos daba **1,15:1** contra la cinta —o sea que el cuerpo del dron y las
 * caras del cubo eran agujeros— y la variante deja esos rellenos transparentes con el trazo en el
 * acento, que da 7,80:1. La original se queda para el favicon y para el portal en tema claro.
 */
const RUTA_MARCA = `${import.meta.env.BASE_URL}aerobim-mark-oscuro.svg`;

/**
 * Qué revisión del registro hay que abrir, si la URL lo dice.
 *
 * Es la costura con el control documental: desde el expediente de un entregable, «abrir en el
 * visor» llega aquí como `?revision=<uuid>`. Sin el parámetro, el visor arranca vacío como
 * siempre y sigue abriendo archivos del disco.
 */
function revisionPedida(): string | null {
  const pedida = new URLSearchParams(globalThis.location?.search ?? "").get("revision");
  // Se comprueba la forma antes de pedirla: un valor cualquiera en la URL no tiene por qué
  // convertirse en una petición a la API.
  return pedida !== null && /^[0-9a-f-]{36}$/i.test(pedida) ? pedida : null;
}

const ETAPAS: Record<LoadStage, string> = {
  converting: "convirtiendo la geometría",
  loading: "cargando en la escena",
  reading: "leyendo categorías y propiedades",
  drawing: "dibujando",
  framing: "encuadrando",
  // `done` se ve un instante antes de que el estado pase a "Listo": mejor que no diga "listo…".
  done: "terminando",
};

/**
 * Cuánto puede moverse el ratón entre pulsar y soltar para que siga contando como clic.
 *
 * Nadie pulsa un botón sin mover el ratón un píxel o dos, y orbitar mueve decenas. Este
 * margen separa las dos intenciones.
 *
 * **Subido de 4 a 8 px** porque con 4 se perdían clics buenos: en una pantalla grande, apuntar a
 * una viga delgada y pulsar arrastra el cursor unos píxeles sin querer, y el clic se descartaba en
 * silencio. Ocho sigue siendo un orden de magnitud menos que un giro de cámara.
 */
const CLICK_TOLERANCE_PX = 8;

/**
 * Por qué un modo de color no se pudo dar, para decirlo en el panel.
 *
 * **Cada frase dice qué mirar en el archivo**, no «no disponible»: el destinatario de esto es quien
 * pide el levantamiento a quien lo vuela, y lo que necesita es saber qué pedirle. La altura no está
 * porque siempre se puede: la cota vive en la posición.
 */
const MOTIVO_DEL_COLOR: Record<ModoDeColor, string> = {
  altura: "",
  rgb: "Este levantamiento no trae color: se pinta por altura. El color hay que pedirlo al vuelo.",
  intensidad:
    "La intensidad de este levantamiento no recorre lo bastante para distinguir nada: " +
    "se pinta por altura.",
  clase:
    "Este levantamiento viene sin clasificar —todos los puntos en la misma clase—, así que se " +
    "pinta por altura. Clasificar suelo y vegetación se pide al procesar la nube.",
};

/**
 * `true` si la tecla se pulsó **escribiendo en un campo**.
 *
 * Los atajos del visor escuchan en la ventana entera, que es lo que hace que funcionen mirando el
 * modelo sin haber pinchado nada antes. El precio es que también los oye quien está escribiendo el
 * nombre de una vista o el texto de una observación, y ahí `Enter` y `Esc` son de quien escribe.
 */
function enUnCampo(evento: KeyboardEvent): boolean {
  const destino = evento.target;
  if (!(destino instanceof HTMLElement)) return false;
  return (
    destino instanceof HTMLInputElement ||
    destino instanceof HTMLTextAreaElement ||
    destino instanceof HTMLSelectElement ||
    destino.isContentEditable
  );
}

export function App() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<BimViewer | null>(null);
  /** Dónde se pulsó el ratón, para distinguir un clic de un arrastre de cámara. */
  const pressPoint = useRef<{ x: number; y: number } | null>(null);
  /**
   * `true` mientras hay un clic en proceso.
   *
   * Consultar un elemento de un modelo grande tarda, y un doble clic manda **dos** clics seguidos.
   * Sin esta guarda las dos consultas iban al mismo worker a la vez y volvían cruzadas: se
   * seleccionaba un elemento distinto del que se había pulsado.
   */
  const clickInFlight = useRef(false);
  /**
   * Qué revisión del registro se abrió ya, para no volver a pedirla.
   *
   * El efecto que la abre depende del estado del visor, y ese estado pasa por `ready` varias
   * veces durante una sesión —después de cada carga—. Sin esta marca, cada una volvería a
   * descargar y a dibujar la misma revisión.
   */
  const revisionAbierta = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [models, setModels] = useState<readonly LoadedModel[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<PickedItem | null>(null);
  const [trees, setTrees] = useState<readonly ModelTree[]>([]);
  const [projection, setProjection] = useState<Projection>("Perspective");
  const [navigation, setNavigation] = useState<NavigationMode>("Orbit");
  const [style, setStyle] = useState<RenderStyle>("solid");
  const [measureMode, setMeasureMode] = useState<MeasureMode | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  /**
   * Puntos puestos en la medición en curso.
   *
   * Se cuentan acá y no en el visor porque su único uso es decir **qué falta** para completar la
   * medida. Un modo de medición que repite la misma frase después de cada clic no deja saber si
   * el clic entró, y eso es justo lo que hacía pensar que medir no funcionaba.
   */
  const [measurePoints, setMeasurePoints] = useState(0);
  /** `true` si el último clic al medir cayó al vacío. Ver {@link StatusBar}. */
  const [measureMissed, setMeasureMissed] = useState(false);
  /** Las cotas dibujadas, para poder apagarlas o borrarlas una por una. */
  const [drawn, setDrawn] = useState<readonly DrawnMeasurement[]>([]);

  // --- La nube de puntos (`F12.1`) -----------------------------------------------------
  const [nube, setNube] = useState<FichaDeNube | null>(null);
  const [nubeInforme, setNubeInforme] = useState<InformeDeRefresco | null>(null);
  const [nubePuntos, setNubePuntos] = useState(0);
  const [nubeColor, setNubeColor] = useState<ModoDeColor>("rgb");
  const [nubeTamano, setNubeTamano] = useState(2);
  const [nubeTecho, setNubeTecho] = useState(4_000_000);
  /**
   * El tema, leído de donde ya lo aplicó el script de `index.html`.
   *
   * **No se aplica aquí, solo se lee**: el atributo lo puso ese script antes del primer pintado, y
   * volver a aplicarlo desde React no arreglaría nada — para cuando React monta, el destello ya
   * habría pasado. Este estado existe solo para que el botón sepa qué símbolo dibujar.
   */
  const [tema, setTema] = useState<Tema>(() => temaGuardado());
  const [nubeRecortada, setNubeRecortada] = useState(false);
  /** Por que el color pedido no se pudo dar. Ver MOTIVO_DEL_COLOR. */
  const [nubeAvisoDeColor, setNubeAvisoDeColor] = useState<string | null>(null);
  /** La URL del `blob:` de la nube abierta. Se revoca **al cerrarla**, no al acabar de cargar. */
  const urlDeLaNube = useRef<string | null>(null);
  /** El `input` de archivo escondido tras «Abrir», para poder pulsarlo desde el panel de nubes. */
  const entradaDeArchivo = useRef<HTMLInputElement | null>(null);

  // --- El calce y la desviación (`F12.2`) ----------------------------------------------
  const [calce, setCalce] = useState<string | null>(null);
  const [medicion, setMedicion] = useState<MedicionDeDesviacion | null>(null);
  /** De qué elemento es la medición que se está enseñando. Ver el efecto que la borra. */
  const [medicionDe, setMedicionDe] = useState<string | null>(null);

  /**
   * El calce a mano: los pares señalados y en qué paso va.
   *
   * **Es el camino corriente**, no el excepcional: la mayoría de los IFC de obra no traen su
   * emplazamiento, así que el automático no aplica y hay que señalar.
   *
   * `paso` dice qué se espera del siguiente clic. Sin eso, el gesto sería adivinar: se pincha en
   * el modelo, se pincha en la nube, y nadie sabe cuál de los dos estaba pendiente.
   */
  const [pares, setPares] = useState<readonly ParDePuntos[]>([]);
  const [pasoDelCalce, setPasoDelCalce] = useState<"apagado" | "modelo" | "nube">("apagado");
  /** El punto del modelo ya señalado, esperando su pareja en la nube. */
  const puntoDelModelo = useRef<[number, number, number] | null>(null);
  const [snapMode, setSnapMode] = useState<SnapMode>("vertex");
  const [distanceMode, setDistanceMode] = useState<DistanceMode>("points");
  const [hasSections, setHasSections] = useState(false);
  /** Nodos del árbol ocultos, por clave. El árbol los lee para dibujar su icono. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  /** Modelos apagados enteros, por identificador. Ver el panel de modelos. */
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(new Set());
  /**
   * Elementos apagados de uno en uno, como `modelo:identificador`.
   *
   * Se lleva aparte de lo que oculta el árbol —que va por nodo— porque acá se apaga **un elemento
   * concreto**, el seleccionado, y la ficha tiene que poder decir si está encendido o no.
   */
  const [hiddenElements, setHiddenElements] = useState<ReadonlySet<string>>(new Set());
  /**
   * Lo que los iconos decían **antes** de cada aislamiento, uno por cada uno sin deshacer.
   *
   * El visor lleva su propia pila con lo que estaba oculto de verdad; esta lleva lo que la interfaz
   * mostraba, que es otra cosa: el árbol y el panel de modelos pintan sus ojos con estos conjuntos.
   * Al salir del aislamiento hay que devolver las dos, o los iconos mienten sobre lo que se ve.
   */
  const [isolations, setIsolations] = useState<readonly HiddenState[]>([]);
  /**
   * `true` si lo que está apagado lo apagó **el punto de vista de una observación**. `F4.7`.
   *
   * Hace falta un estado propio porque esa visibilidad no pasa por ninguno de los conjuntos de
   * arriba: llega en GUID desde el registro y la aplica el visor de una vez. Sin esto, `hasHidden`
   * daría `false` con medio modelo apagado y **la barra de estado no ofrecería la vuelta**, que es
   * exactamente el caso que ya costó una sesión aprender aislando desde la ficha.
   */
  const [visibilidadDeObservacion, setVisibilidadDeObservacion] = useState(false);
  /**
   * De qué revisión del registro salió lo que está abierto, o `null` si es un archivo del disco.
   *
   * **Es lo que permite abrir una observación desde el visor** (`F4.1`): una observación cuelga de un
   * entregable y apunta a una revisión, y eso no se puede adivinar del IFC. Si el modelo se abrió
   * arrastrando un archivo, no hay registro donde anotarla y el botón no aparece — ofrecerlo para
   * que termine en un 404 es peor que no ofrecerlo.
   */
  const [origen, setOrigen] = useState<RegistryOrigin | null>(null);
  /**
   * El enlace por el que se entró, si esta es una sesión compartida.
   *
   * Se lee una vez: la ruta no cambia mientras el visor vive, y releerla en cada pintado haría que
   * un `useEffect` que dependa de ella se disparase sin motivo.
   */
  const testigo = useMemo(() => testigoCompartido(), []);
  const [compartido, setCompartido] = useState<FichaCompartida | null>(null);
  /** Los planos 2D cargados, en el orden en que se abrieron. */
  const [plans, setPlans] = useState<readonly LoadedPlan[]>([]);
  /**
   * El elemento 2D seleccionado: la línea del plano sobre la que se hizo clic.
   *
   * Va aparte del elemento del modelo porque **no son lo mismo y no tienen los mismos datos**: un
   * trazo del CAD no tiene GUID ni psets, tiene capa, color y largo. Mezclarlos en una sola ficha
   * obligaría a inventar campos vacíos en cada una.
   */
  const [selectedPlan, setSelectedPlan] = useState<PlanHit | null>(null);
  /**
   * El punto del levantamiento que se acaba de señalar, o `null`. `F12.14`.
   *
   * Es la tercera clase de selección, y va aparte por el mismo motivo que el trazo del plano: **no
   * tiene los mismos datos**. Un punto de una nube no tiene GUID, ni psets, ni capa — tiene una
   * coordenada, y con eso basta para colgar una observación de lo construido.
   *
   * Y es lo que hace que la coordinación **no espere al modelo**: en obra el levantamiento llega
   * antes que el IFC de su etapa.
   */
  const [puntoDeNube, setPuntoDeNube] = useState<PuntoSenalado | null>(null);
  /**
   * `true` si medir se engancha a los trazos del plano.
   *
   * Encendido por defecto —es lo que hace útil medir sobre un plano—, y apagable porque midiendo el
   * modelo con un plano debajo, engancharse al CAD sin querer falsea la medida.
   */
  const [planSnap, setPlanSnap] = useState(true);
  /** `true` en modo 2D: los modelos apagados, la cámara en planta y proyección ortográfica. */
  const [modo2D, setModo2D] = useState(false);
  /**
   * Lo que había antes de entrar al modo 2D, para poder devolverlo al salir.
   *
   * Va en un `ref` y no en el estado a propósito: nada de la pantalla depende de esto mientras el
   * modo está puesto, y solo se lee una vez, al salir.
   */
  const antesDel2D = useRef<{
    readonly modelosApagados: ReadonlySet<string>;
    readonly projection: Projection;
    readonly navigation: NavigationMode;
  } | null>(null);
  /** `true` con los ejes de replanteo del modelo a la vista. */
  const [gridVisible, setGridVisible] = useState(true);
  /** Los planos generados desde el modelo, en el orden en que se hicieron. */
  const [drawings, setDrawings] = useState<readonly GeneratedDrawing[]>([]);
  const [hiddenDrawings, setHiddenDrawings] = useState<ReadonlySet<string>>(new Set());
  /**
   * En qué va la proyección, o `null` si no se está generando ninguna.
   *
   * Proyectar las aristas de un modelo entero tarda, y sin este aviso la aplicación parece colgada
   * — que es exactamente lo que ya pasó con la conversión de los IFC grandes.
   */
  const [generating, setGenerating] = useState<string | null>(null);
  /**
   * La alineación de un plano en curso, si la hay.
   *
   * Son cuatro clics alternos —punto del plano, su punto en el modelo, y otro par— y hay que
   * recordar por cuál va y los que ya se pusieron. Vive en la interfaz y no en el visor porque es
   * un flujo de pantalla: el visor solo sabe calzar cuando ya están los cuatro.
   */
  const [aligning, setAligning] = useState<Alignment | null>(null);
  /** Planos apagados enteros, por identificador. */
  const [hiddenPlans, setHiddenPlans] = useState<ReadonlySet<string>>(new Set());
  /** Capas de plano apagadas, como `plano:capa`. */
  const [hiddenPlanLayers, setHiddenPlanLayers] = useState<ReadonlySet<string>>(new Set());
  /**
   * La última vista normalizada aplicada, para que el cubo diga hacia dónde se mira.
   *
   * Se borra en cuanto alguien orbita a mano: seguir marcando "Planta" con la cámara en cualquier
   * otro sitio sería el cubo mintiendo, que es peor que un cubo sin nada marcado.
   */
  const [standardView, setStandardView] = useState<StandardView | null>("iso");
  /**
   * La pestaña abierta de la cinta.
   *
   * **La distribución sigue a Revit y a los modeladores de Bentley**, que es de donde vienen quienes
   * van a usar esto: cinta arriba con pestañas y grupos rotulados, propiedades a la izquierda,
   * navegador del proyecto a la derecha, barra de estado al pie y el modelo en el centro.
   */
  const [tab, setTab] = useState<RibbonTab>("vista");
  /** Las vistas guardadas. Se leen del navegador al arrancar y se escriben al cambiar. */
  const [views, setViews] = useState<readonly SavedView[]>(leerVistas);
  const [panelIzquierdo, setPanelIzquierdo] = useState(true);
  /**
   * `true` con el navegador plegado a rail: 44 px de iconos en vez de 346 de panel.
   *
   * **No es «oculto», y esa es la decisión.** Propiedades se sigue escondiendo del todo —lo que
   * enseña depende de que haya algo seleccionado, así que sin selección no hay nada que perder—,
   * pero el navegador es *el contenido del proyecto*: esconderlo entero deja la pantalla sin decir
   * qué hay abierto. Plegado devuelve **302 px de lienzo** y sigue diciéndolo.
   *
   * Y es un **estado del mismo navegador**, no una navegación aparte: los doce iconos son las doce
   * secciones con el rótulo escondido, no doce destinos con uno visible a la vez. Es lo que decidió
   * `F9.6` y lo que hace que esto no contradiga la regla de `docs/UX.md`.
   */
  const [navegadorPlegado, setNavegadorPlegado] = useState(leerNavegadorPlegado);
  /**
   * La sección del navegador que se acaba de pedir desde otro sitio de la pantalla.
   *
   * El sello es lo que hace que pedir dos veces la misma sección funcione las dos veces; el motivo
   * largo está en la propiedad `pedida` de `ProjectBrowser`.
   */
  const [seccionPedida, setSeccionPedida] = useState<{
    readonly clave: string;
    readonly sello: number;
  } | null>(null);

  /**
   * Lleva a una sección del navegador: lo destapa si está plegado y despliega la sección.
   *
   * Son **dos cosas** porque el panel se puede haber plegado hace media hora: desplegar una sección
   * dentro de un panel escondido no lleva a ninguna parte, y es exactamente lo que pasaba al pulsar
   * «Del registro» en la puerta de entrada con el navegador cerrado — nada visible ocurría.
   */
  const irASeccion = useCallback((clave: string) => {
    setNavegadorPlegado(false);
    setSeccionPedida((actual) => ({ clave, sello: (actual?.sello ?? 0) + 1 }));
  }, []);
  /**
   * `true` con la cinta plegada.
   *
   * Se recuerda en el navegador porque es una preferencia de trabajo, no un estado de la sesión:
   * quien trabaja en una pantalla chica la pliega una vez y no quiere volver a hacerlo cada día.
   */
  const [ribbonCollapsed, setRibbonCollapsed] = useState(leerCintaPlegada);
  /**
   * El ancho de cada panel lateral, en píxeles, arrastrable por su borde.
   *
   * **Un ancho fijo obliga a una elección que cambia cada diez minutos**: revisando las capas de un
   * plano hace falta panel, midiendo hace falta lienzo. Se recuerdan en el navegador porque son una
   * preferencia de trabajo, no un estado de la sesión.
   */
  const [anchoIzquierdo, setAnchoIzquierdo] = useState(() =>
    leerAncho("izquierda", ANCHO_DE_FABRICA),
  );
  const [anchoDerecho, setAnchoDerecho] = useState(() => leerAncho("derecha", ANCHO_DE_FABRICA));

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_CINTA, ribbonCollapsed ? "1" : "0");
    } catch {
      // Modo privado o cuota agotada: la preferencia vale para esta sesión y ya.
    }
  }, [ribbonCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_PANELES, JSON.stringify([anchoIzquierdo, anchoDerecho]));
    } catch {
      // Igual que arriba: sin almacenamiento, los anchos duran lo que la pestaña.
    }
  }, [anchoIzquierdo, anchoDerecho]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_NAVEGADOR, navegadorPlegado ? "1" : "0");
    } catch {
      // Ídem.
    }
  }, [navegadorPlegado]);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    let cancelled = false;
    let desuscribir: (() => void) | null = null;

    BimViewer.create(host, {
      wasmPath: RUTA_WASM,
      // **El worker de Fragments sale de `BASE_URL` igual que el WASM, y por lo mismo.**
      //
      // El primer arreglo de la pantalla negra lo dejó escrito a mano dentro del paquete del
      // visor —`/wasm/fragments-worker.mjs`— y eso es **exactamente** la trampa que el comentario
      // de `RUTA_WASM` describe cuatrocientas líneas más arriba: bajo Django la aplicación vive
      // en `/static/visor/`, así que una ruta absoluta pide la raíz del servidor. Medido en
      // producción: el archivo estaba en `/static/visor/wasm/fragments-worker.mjs` y el código
      // pedía `/wasm/…` — **404**.
      //
      // O sea que se quitó la descarga a unpkg y se puso en su lugar una ruta que tampoco existe.
      // El síntoma no cambió —pantalla negra— porque el fallo vuelve a ser silencioso: un worker
      // que no carga no avisa.
      fragmentsWorkerUrl: `${RUTA_WASM}fragments-worker.mjs`,
      convertWorker: workerDeConversion(),
    })
      .then((instance) => {
        if (cancelled) return;
        viewer.current = instance;
        // El resultado de una medición no vuelve del clic: llega cuando la medición se cierra,
        // y cuántos clics hacen falta depende de lo que se mida.
        desuscribir = instance.onMeasurement((resultado) => {
          setMeasurement(resultado);
          setMeasurementCount(instance.measurementCount);
          setDrawn(instance.listMeasurements());
          // Una medición cerrada —o descartada— deja el contador a cero para la siguiente.
          setMeasurePoints(0);
          setMeasureMissed(false);
        });
        // **En desarrollo el visor queda a mano desde la consola.** Es lo que permite comprobar
        // una selección o una carga sin ojos —`window.aerobim.pickPlan(x, y)`— y es la misma idea
        // que `diag.html`, pero dentro de la aplicación de verdad. En producción no existe.
        if (import.meta.env.DEV) {
          (globalThis as unknown as { aerobim?: BimViewer }).aerobim = instance;
        }
        setStatus({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: describe(error) });
      });

    // El visor **no se libera acá a propósito.** `BimViewer.create` devuelve una única
    // instancia por contenedor, y liberarla es irreversible: en That Open 3.4.8 un visor
    // creado despues de un `dispose()` queda con el pipeline de Fragments sin responder.
    // Como StrictMode monta cada efecto dos veces, destruir aqui dejaba a la aplicacion
    // con un visor ya liberado.
    return () => {
      cancelled = true;
      desuscribir?.();
    };
  }, []);

  const openDxf = useCallback(async (file: File) => {
    const instance = viewer.current;
    if (!instance) return;

    setStatus({ kind: "loading", name: file.name, stage: "reading" });
    try {
      // Un DXF es texto, y grande: se lee entero porque el lector necesita las secciones de
      // bloques y tablas antes de poder dibujar la primera línea.
      const texto = await file.text();
      const plano = await instance.loadPlan(texto, file.name);
      setPlans((actuales) => [...actuales, plano]);
      // **Las capas que el CAD tiene apagadas arrancan apagadas acá también**, y con el ojo cerrado
      // en la lista: si el plano se ve como en AutoCAD pero la lista dice que todo está encendido,
      // la lista miente. Se pueden encender una por una — la geometría está cargada.
      const apagadas = plano.layers.filter((capa) => capa.off);
      if (apagadas.length > 0) {
        setHiddenPlanLayers((actual) => {
          const siguiente = new Set(actual);
          for (const capa of apagadas) siguiente.add(`${plano.id}:${capa.name}`);
          return siguiente;
        });
      }
      setStatus({ kind: "ready" });
      requestAnimationFrame(() => instance.framePlan(plano.id, "top"));
    } catch (error: unknown) {
      setStatus({ kind: "error", message: describe(error) });
    }
  }, []);

  const openIfc = useCallback(async (file: File) => {
    const instance = viewer.current;
    if (!instance) return;

    setStatus({ kind: "loading", name: file.name, stage: "converting" });
    // **Un archivo del disco borra el origen en el registro.** Lo vuelve a poner `abrirRevision`
    // cuando la carga viene de ahí. Si se abre una revisión y después se arrastra otro IFC encima,
    // el elemento seleccionado ya puede ser del segundo modelo: anclar la observación a la revisión
    // del primero apuntaría a un GUID que ese archivo no contiene.
    setOrigen(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await instance.loadIfc(bytes, file.name, (stage) => {
        setStatus({ kind: "loading", name: file.name, stage });
      });
      setModels((current) => [...current, loaded]);
      setTrees(await instance.getSpatialTrees());
      setStatus({ kind: "ready" });

      // El árbol aparece recién ahora y estrecha el lienzo, así que el encuadre que hizo
      // `loadIfc` se queda corto y el modelo sale cortado. Se reencuadra una vez que el
      // navegador ya aplicó el nuevo ancho.
      requestAnimationFrame(() => void instance.frameAll());
    } catch (error: unknown) {
      setStatus({ kind: "error", message: describe(error) });
    }
  }, []);

  /**
   * Abre una nube de puntos COPC: `F12.1`.
   *
   * **El archivo del disco se lee por rangos igual que uno servido**, y eso no era evidente: la
   * nube se abre pidiendo trozos con una cabecera `Range`, y un `File` no tiene URL. La tiene con
   * `createObjectURL`, y **el navegador responde `206` a un rango sobre un `blob:`** — comprobado
   * antes de escribir esto, porque si hubiera devuelto el archivo entero con un `200` la nube de
   * gigas se habría descargado completa sin que nada fallara.
   *
   * Así que no hay un camino nuevo para el disco: el mismo lector sirve para los dos.
   *
   * **La URL no se revoca al acabar de cargar.** Los nodos del octree se piden mientras se navega,
   * no una vez al principio: revocarla dejaría la nube congelada en lo que ya estaba en memoria y
   * sin explicar por qué. Se revoca al cerrar la nube.
   */
  /**
   * Vuelve a decidir qué nodos de la nube hacen falta, con la cámara donde esté.
   *
   * **Se llama cuando la cámara se asienta, no mientras se mueve.** Cada refresco puede pedir nodos
   * por la red, y hacerlo en cada fotograma de una órbita sería pedir y tirar lo mismo cien veces.
   */
  const refrescarNube = useCallback(async () => {
    const instance = viewer.current;
    if (!instance || instance.cloud === null) return;
    const informe = await instance.refreshPointCloud({ puntosMaximos: nubeTecho });
    if (informe !== null) {
      setNubeInforme(informe);
      setNubePuntos(informe.puntos);
    }
  }, [nubeTecho]);

  /**
   * Abre una nube que ya tiene URL, sea un `blob:` del disco o una del registro.
   *
   * **La URL es la unidad y no los bytes**, y eso es la decisión. El lector de COPC pide tramos
   * (`Range`) según lo que quepa en pantalla; darle una URL de la que puede pedir por partes es lo
   * que hace que el primer punto salga en menos de un segundo sobre 124,7 MB. Pasarle un `File`
   * obligaría a tenerlo entero antes de empezar.
   *
   * `revocable` distingue las dos: un `blob:` hay que devolverlo al cerrar la nube, y una del
   * registro no —`revokeObjectURL` sobre una `http:` no falla, pero dejaría escrito que se revoca
   * algo que nadie creó—.
   */
  const abrirNube = useCallback(
    async (url: string, nombre: string, { revocable }: { revocable: boolean }) => {
      const instance = viewer.current;
      if (!instance) return;

      setStatus({ kind: "loading", name: nombre, stage: "reading" });
      try {
        const cargada = await instance.loadPointCloud(url, {
          presupuestoBytes: 256 * 1024 * 1024,
          color: "rgb",
          // **La misma trampa que ya costó una sesión con `web-ifc`, y aquí sin arreglar.**
          //
          // El valor por omisión de `laz-perf` es `/wasm/laz-perf.wasm`, absoluto desde la raíz.
          // Eso funciona en el servidor de Vite, donde la aplicación vive en `/`, y **da 404 bajo
          // `/visor/`**: la nube no se abría desde el portal —solo desde el disco en desarrollo—.
          // Medido: `GET /wasm/laz-perf.wasm → 404` y `Aborted(Both async and sync fetching of the
          // wasm failed)` en la barra, con las peticiones de tramos ya respondiendo 206.
          rutaWasm: `${RUTA_WASM}laz-perf.wasm`,
        });
        urlDeLaNube.current = revocable ? url : null;
        setNube(cargada.ficha);
        setNubeInforme(cargada.informe);
        setNubePuntos(cargada.cargados);
        setNubeColor(cargada.nube.color);
        setStatus({ kind: "ready" });
        requestAnimationFrame(() => void refrescarNube());
      } catch (error: unknown) {
        if (revocable) URL.revokeObjectURL(url);
        setStatus({ kind: "error", message: describe(error) });
      }
    },
    [refrescarNube],
  );

  const openCloud = useCallback(
    (file: File) => abrirNube(URL.createObjectURL(file), file.name, { revocable: true }),
    [abrirNube],
  );

  /**
   * Calza la nube con el modelo, si el IFC trae su emplazamiento.
   *
   * **Y si no lo trae, lo dice.** Devolver `null` en silencio dejaría a alguien pulsando el botón
   * sin entender por qué no pasa nada; el motivo —que el modelo no sabe dónde está— es además la
   * información que hay que pedirle a quien modela.
   */
  const calzarAutomaticamente = useCallback(async () => {
    const instance = viewer.current;
    if (!instance) return;
    const traslado = await instance.alignPointCloudToModel();
    if (traslado === null) {
      setCalce(
        "El modelo no trae su emplazamiento, así que no hay de dónde sacar el calce. " +
          "Pídelo como IFC4 con IfcMapConversion, o señala pares de puntos.",
      );
      return;
    }
    // **La cifra no se enseña, y quitarla es el arreglo.** Decía «movida -6,70, -3,47, 8,78 m», y
    // eso se lee como «el levantamiento estaba a 8,78 m del modelo» — que es una frase sobre la
    // obra, y grave. No lo es: `alignPointCloudToModel` devuelve la diferencia entre **dos orígenes
    // internos** —el que la nube resta para no perder precisión en `float32` y el que Fragments
    // resta al recentrar el modelo—, así que su magnitud no dice nada de nadie.
    //
    // Medido el 2026-09-09 con dos levantamientos distintos del mismo muro: uno dio
    // `1,30 · -3,47 · 0,78` y otro `-6,70 · -3,47 · 8,78`. **El mismo -3,47 en los dos**, y las
    // otras dos cifras difiriendo en exactamente 8,00 m, que es medio lado de la segunda nube. Son
    // números del calce, no de la obra — el mismo aviso que ya lleva el signo de la desviación.
    //
    // Lo que sí hace falta decir es que se hizo y que hay que mirarlo, porque calzar mal y medir
    // encima da una desviación creíble y falsa.
    setCalce(
      "Calzada con el emplazamiento del modelo. Comprueba que la nube cae encima antes de medir.",
    );
    void refrescarNube();
  }, [refrescarNube]);

  /**
   * Recoge un clic del lienzo mientras se está calzando a mano.
   *
   * Devuelve `true` si el clic **era para el calce**, para que quien lo llame no lo deje pasar
   * también a seleccionar o a medir: con las tres cosas escuchando, un clic entraba en todas.
   */
  const clicDeCalce = useCallback(
    async (clientX: number, clientY: number): Promise<boolean> => {
      const instance = viewer.current;
      if (!instance || pasoDelCalce === "apagado") return false;

      if (pasoDelCalce === "modelo") {
        // **`pointOnModel` y no un rayo propio**: ya existe y **viene con el ajuste a vértices**
        // del medidor puesto, que es exactamente lo que se quiere al marcar una esquina. Escribí un
        // segundo camino sin ajuste antes de encontrarlo, y era peor además de duplicado.
        const enElModelo = await instance.pointOnModel(clientX, clientY);
        // Pinchar al vacío no avanza el paso ni deja el par a medias: se ignora y se sigue
        // esperando el punto del modelo. Avanzar sin punto pediría el de la nube para nada.
        if (enElModelo === null) return true;
        // El modelo no lleva desplazamiento restado: su vuelta al sistema del archivo es solo el
        // cambio de ejes.
        puntoDelModelo.current = escenaAArchivo(enElModelo, [0, 0, 0]);
        setPasoDelCalce("nube");
        return true;
      }

      const enLaNube = instance.pickPointCloud(clientX, clientY);
      if (enLaNube === null) return true;
      const local = puntoDelModelo.current;
      if (local === null) {
        setPasoDelCalce("modelo");
        return true;
      }
      // **El par se guarda en coordenadas del archivo**, que es el sistema de los datos. Guardarlo
      // en coordenadas de escena lo ataría a la convención del renderizador de hoy.
      setPares((actuales) => [...actuales, { local, nube: enLaNube.archivo }]);
      puntoDelModelo.current = null;
      setPasoDelCalce("modelo");
      return true;
    },
    [pasoDelCalce],
  );

  /** Quita el último par señalado. Es el «deshacer» del gesto, y sin él hay que empezar de cero. */
  const quitarUltimoPar = useCallback(() => {
    setPares((actuales) => actuales.slice(0, -1));
    puntoDelModelo.current = null;
    setPasoDelCalce((actual) => (actual === "apagado" ? actual : "modelo"));
  }, []);

  /**
   * El resultado del calce con los pares señalados, recalculado en cada par.
   *
   * **Se enseña mientras se señala y no al final.** El residuo es lo que dice si los puntos que se
   * están marcando son los mismos en las dos cosas; verlo al terminar obliga a empezar de nuevo sin
   * saber cuál estaba mal.
   */
  const calceDePares = useMemo(() => {
    if (pares.length < 3) return null;
    return calzarConPuntos(pares);
  }, [pares]);

  /** Aplica el calce señalado a mano. */
  const aplicarCalceDePares = useCallback(() => {
    const instance = viewer.current;
    if (!instance || calceDePares === null) return;
    instance.alignPointCloud(calceDePares.alineacion);
    setCalce(
      `Calzada con ${pares.length} pares · residuo medio ` +
        `${(calceDePares.residuo.medio * 1000).toFixed(0)} mm, máximo ` +
        `${(calceDePares.residuo.maximo * 1000).toFixed(0)} mm.`,
    );
    setPasoDelCalce("apagado");
    void refrescarNube();
  }, [calceDePares, pares.length, refrescarNube]);

  /** Mide lo construido contra lo modelado, en la zona del elemento seleccionado. */
  const medirDesviacionDelElemento = useCallback(
    async (toleranciaM: number) => {
      const instance = viewer.current;
      const guid = selected?.guid ?? null;
      if (!instance || guid === null) return;
      const medida = await instance.measureDeviation(guid, { toleranciaM, pintar: true });
      setMedicion(medida);
      setMedicionDe(guid);
    },
    [selected],
  );

  /**
   * La medición se borra al cambiar de elemento.
   *
   * **Dejarla puesta sería lo peor que puede hacer esta pantalla**: seis cifras junto al nombre de
   * otro elemento se leen como suyas, y quien abra una observación con ellas estará anotando la
   * desviación de una viga sobre un pilar.
   */
  useEffect(() => {
    if (medicionDe !== null && selected?.guid !== medicionDe) {
      setMedicion(null);
      setMedicionDe(null);
    }
  }, [selected, medicionDe]);

  /**
   * El borrador de la nota cuando se anota una desviación: las cifras ya escritas.
   *
   * Medir y tener que copiar seis números a mano es donde se pierden los hallazgos — o donde se
   * transcriben mal, que es peor. Sigue siendo un borrador: el campo se edita como cualquier otro.
   */
  const borradorDeDesviacion = useMemo(() => {
    if (medicion === null || medicion.resumen.puntos === 0) return null;
    const mm = (m: number) => `${(m * 1000).toFixed(0)} mm`;
    const r = medicion.resumen;
    return (
      `Desviación medida contra el levantamiento, con tolerancia de ` +
      `${(medicion.toleranciaM * 1000).toFixed(0)} mm:\n` +
      `· Media ${mm(r.media)} · Mediana ${mm(r.mediana)} · Máxima ${mm(r.maxima)}\n` +
      `· Percentil 95 ${mm(r.p95)} · Sesgo ${r.sesgo >= 0 ? "+" : ""}${mm(r.sesgo)}\n` +
      `· ${r.fuera} de ${r.puntos} puntos fuera de tolerancia` +
      (r.signoFiable ? "" : "\n· Aviso: el signo puede ser del calce, no de la obra.")
    );
  }, [medicion]);

  /** Cierra la nube y **suelta el `blob:`**, que si no se queda el archivo entero en memoria. */
  const cerrarNube = useCallback(() => {
    viewer.current?.unloadPointCloud();
    if (urlDeLaNube.current !== null) {
      URL.revokeObjectURL(urlDeLaNube.current);
      urlDeLaNube.current = null;
    }
    setNube(null);
    setNubeInforme(null);
    setNubePuntos(0);
    setNubeRecortada(false);
    // El aviso es de **esta** nube: dejarlo puesto diría de la siguiente algo que no se ha medido.
    setNubeAvisoDeColor(null);
  }, []);

  /** Encuadra la nube: lo primero que se hace al abrir un levantamiento. */
  const encuadrarNube = useCallback(() => {
    viewer.current?.frameCloud();
  }, []);

  /**
   * Cambia de qué sale el color. **Se anota el modo real y no el pedido**: si el archivo no trae
   * RGB, el visor cae a la altura, y dejar el desplegable diciendo «color del levantamiento» sobre
   * una nube pintada por altura es la interfaz mintiendo.
   */
  const colorearNube = useCallback((modo: ModoDeColor) => {
    const real = viewer.current?.cloud?.colorear(modo);
    if (real === undefined) return;
    setNubeColor(real);
    // **Y el motivo, que es la mitad que faltaba.** Que el desplegable vuelva solo a «Por altura»
    // es honesto y mudo: quien lo pulsa no sabe si el archivo no trae ese dato o si algo falla.
    // Pasó de verdad — «no cargan bien la intensidad y el RGB», sobre una nube que estaba en
    // clasificación y cuyos quince millones de puntos vienen todos con la misma clase.
    setNubeAvisoDeColor(real === modo ? null : MOTIVO_DEL_COLOR[modo]);
  }, []);

  const tamanoDeNube = useCallback((px: number) => {
    const nubeViva = viewer.current?.cloud;
    if (!nubeViva) return;
    nubeViva.tamanoDePunto = px;
    setNubeTamano(nubeViva.tamanoDePunto);
  }, []);

  const densidadDeNube = useCallback((tope: number) => {
    setNubeTecho(tope);
  }, []);

  // El techo cambia → se rehace la selección. Va en un efecto y no dentro del propio control
  // porque `refrescarNube` lee el techo, y llamarlo antes de que el estado asiente usaría el viejo.
  useEffect(() => {
    if (nube !== null) void refrescarNube();
  }, [nubeTecho, nube, refrescarNube]);

  /**
   * La nube afina **cuando la cámara se para**, y no mientras se mueve.
   *
   * Es lo que la hace usable: al acercarse a una zona llega su detalle, y al alejarse se suelta.
   * Enganchado a `rest` —el evento de «los controles se detuvieron»— y no a cada fotograma, porque
   * cada refresco puede pedir nodos por la red: hacerlo durante una órbita sería pedir y tirar lo
   * mismo cien veces.
   */
  useEffect(() => {
    const controles = viewer.current?.camera.controls;
    if (controles === undefined || nube === null) return;
    const alPararse = () => void refrescarNube();
    controles.addEventListener("rest", alPararse);
    return () => controles.removeEventListener("rest", alPararse);
  }, [nube, refrescarNube]);

  /** Recorta la nube a la zona del modelo, o quita el recorte. El visor pone la holgura. */
  const recortarNubeAlModelo = useCallback(
    (recortar: boolean) => {
      const hecho = viewer.current?.clipCloudToModel(recortar ? 1 : null) ?? false;
      // Si se pidió recortar y no hay modelo abierto, la casilla vuelve sola: prometer un recorte
      // que no ocurrió es peor que no ofrecerlo.
      setNubeRecortada(recortar && hecho);
      void refrescarNube();
    },
    [refrescarNube],
  );

  /**
   * Abre un archivo, sea un modelo, un plano o una nube de puntos.
   *
   * **La extensión decide**, y acá es lo correcto: son formatos que no se parecen en nada y se
   * sueltan en el mismo sitio. Un `.dxf` entra como plano de referencia, un `.laz` como
   * levantamiento, y cualquier otra cosa se intenta como IFC.
   *
   * **La nube entra por la misma puerta que el modelo, y eso es la decisión.** Darle un botón
   * propio la convertiría en otra aplicación dentro de la aplicación; el trabajo de coordinar es
   * mirar las tres cosas juntas, así que las tres se abren igual.
   */
  const openFile = useCallback(
    (file: File) => {
      const nombre = file.name.toLowerCase();
      if (nombre.endsWith(".dxf")) return openDxf(file);
      if (nombre.endsWith(".laz") || nombre.endsWith(".las")) return openCloud(file);
      return openIfc(file);
    },
    [openDxf, openIfc, openCloud],
  );

  /**
   * Abre **todo lo que se soltó**, y no solo el primero.
   *
   * **Antes se tomaba `files.item(0)` y los demás se perdían en silencio**, medido el 2026-09-09
   * soltando `muro-en-utm.ifc` y su levantamiento juntos: entró el modelo y la sección «Nube de
   * puntos» siguió diciendo «vacío», sin un aviso. Es el peor reparto posible —éxito parcial sin
   * decirlo— y encima es justo el gesto que esta pantalla invita: la puerta dice «arrastra el
   * archivo a cualquier parte del lienzo», y desde `F12.13` el levantamiento es un documento como
   * el modelo. Quien tiene los dos, suelta los dos.
   *
   * **Van de uno en uno y esperando a cada uno**, no en paralelo: cada carga mueve la misma máquina
   * de estados y el pipeline de Fragments no admite dos modelos a la vez —es el mismo motivo por el
   * que el visor no se destruye para volver a crearse—. Uno detrás de otro es más lento y es lo que
   * funciona.
   */
  const openFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) await openFile(file);
    },
    [openFile],
  );

  /**
   * Abre una revisión del registro documental, por su identificador.
   *
   * **Es la costura entre las dos mitades del producto**: hasta ahora el visor abría archivos
   * del disco de quien lo usaba y no sabía nada de proyectos, y el registro guardaba
   * revisiones —DXF e IFC incluidos— y no podía mostrarlas.
   *
   * Dos peticiones y no una, a propósito: primero los metadatos, que dicen **qué** se va a
   * abrir y con qué nombre, y después los bytes. Así se puede avisar de lo que se está
   * cargando antes de descargar veinte megas, y el nombre —que es lo que decide si entra como
   * plano o como modelo— no hay que sacarlo de una cabecera del binario.
   *
   * La cookie de sesión viaja porque el SPA y la API comparten origen. Un 403 aquí no es un
   * fallo del visor: es que ese rol no puede ver esa revisión —una `S0` en curso, por
   * ejemplo— y así se dice.
   */
  const abrirRevision = useCallback(
    async (revisionId: string) => {
      setStatus({ kind: "loading", name: revisionId, stage: "reading" });
      try {
        const meta = await fetch(`/api/revisiones/${revisionId}/`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!meta.ok) {
          setStatus({
            kind: "error",
            message:
              meta.status === 403
                ? "Tu rol no puede abrir esta revisión."
                : meta.status === 404
                  ? "Esa revisión no existe o no está disponible."
                  : `El registro respondió ${meta.status}.`,
          });
          return;
        }
        const datos = (await meta.json()) as {
          nombre: string;
          contenido: string;
          correlativo: string;
          puedeObservar?: boolean;
          entregable: { id: string; codigo: string };
          proyecto?: { id: string; codigo: string };
        };

        const etiqueta = `${datos.entregable.codigo} rev. ${datos.correlativo}`;
        setStatus({ kind: "loading", name: etiqueta, stage: "reading" });

        if (datos.nombre.toLowerCase().endsWith(".copc.laz")) {
          // **La nube no se descarga: se lee por tramos** (`F12.13`).
          //
          // Es la única que sale del camino común, y por una razón medida: el COPC del CC 741 son
          // 124,7 MB, y el lector solo necesita la cabecera y los nodos que caen en pantalla. Meter
          // esos bytes en un `File` primero descargaría el archivo entero **antes** de mirar nada
          // — justo lo que el formato existe para evitar.
          //
          // El endpoint responde `206` a un `Range` desde `apps/documents/rangos.py`; sin esa mitad
          // esta línea no serviría de nada.
          await abrirNube(datos.contenido, datos.nombre, { revocable: false });
        } else {
          const archivo = await fetch(datos.contenido, { credentials: "same-origin" });
          if (!archivo.ok) {
            setStatus({
              kind: "error",
              message: `No se pudo leer el archivo (${archivo.status}).`,
            });
            return;
          }
          // El nombre original viaja en los metadatos, y es el que decide el camino: `openFile`
          // manda un `.dxf` al lector de planos y todo lo demás al de IFC.
          await openFile(new File([await archivo.blob()], datos.nombre));
        }

        // **Después de abrir, no antes**: `openIfc` borra el origen a propósito —un archivo del
        // disco no tiene registro donde anotar— y ponerlo antes se perdería en esa limpieza.
        setOrigen({
          revisionId,
          entregableId: datos.entregable.id,
          puedeObservar: datos.puedeObservar === true,
          // **Lo que permite volver.** Sin esto el visor era un callejón sin salida: se entraba
          // desde el registro y la única salida era el botón de atrás del navegador — que además
          // descarta el modelo cargado, veinte megas y medio minuto de conversión.
          //
          // La obra va con `...` condicional y no como `proyecto?.id`: con
          // `exactOptionalPropertyTypes`, una clave puesta a `undefined` **no es lo mismo** que una
          // clave ausente, y la diferencia importa — `rutasDeVuelta` decide por presencia.
          ...(datos.proyecto !== undefined
            ? { proyectoId: datos.proyecto.id, proyectoCodigo: datos.proyecto.codigo }
            : {}),
          entregableCodigo: datos.entregable.codigo,
          revisionCorrelativo: datos.correlativo,
        });
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      }
    },
    [openFile, abrirNube],
  );

  /**
   * Lo mismo, pero **entrando desde un enlace compartido y sin cuenta**.
   *
   * Es casi `abrirRevision` y no se fusionan, a propósito: la diferencia no es un parámetro, es
   * **de qué superficie se fía cada una**. Aquella habla con `/api/`, que acota por la sesión;
   * esta con `/compartido/<testigo>/`, que acota por el testigo y sirve una sola revisión.
   * Fusionarlas dejaría una función con un `if` decidiendo si la petición lleva credenciales, y
   * ese `if` es exactamente el que no conviene que exista.
   *
   * Y no pone `origen`: el origen es lo que permite volver al expediente y anotar sobre la
   * revisión, y quien entra por un enlace no tiene ni expediente al que volver ni permiso para
   * anotar. Con `origen` en `null`, los botones de observar ya no se dibujan — la misma regla que
   * gobierna un archivo abierto desde el disco.
   */
  const abrirCompartido = useCallback(
    async (testigo: string) => {
      setStatus({ kind: "loading", name: "…", stage: "reading" });
      try {
        const ficha = await pedirFicha(testigo);
        setCompartido(ficha);
        const etiqueta = `${ficha.entregable.codigo} rev. ${ficha.correlativo}`;
        setStatus({ kind: "loading", name: etiqueta, stage: "reading" });

        if (ficha.nombre.toLowerCase().endsWith(".copc.laz")) {
          await abrirNube(ficha.contenido, ficha.nombre, { revocable: false });
        } else {
          const archivo = await fetch(ficha.contenido);
          if (!archivo.ok) {
            setStatus({
              kind: "error",
              message: `No se pudo leer el archivo (${archivo.status}).`,
            });
            return;
          }
          await openFile(new File([await archivo.blob()], ficha.nombre));
        }
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      }
    },
    [openFile, abrirNube],
  );

  /**
   * Si la URL pide una revisión, se abre en cuanto el visor está listo.
   *
   * Se espera al visor a propósito: `abrirRevision` necesita la instancia, y arrancar la
   * descarga antes solo adelantaría el fallo.
   */
  useEffect(() => {
    if (status.kind !== "ready" || viewer.current === null) return;

    // **El enlace compartido manda sobre el `?revision=`.** Estando en `/compartido/<testigo>/`,
    // un `?revision=` en la misma URL solo puede venir de que alguien lo pegó: pedirlo daría 401 y
    // dejaría la pantalla en un error que no explica nada a quien viene de fuera.
    if (testigo !== null) {
      if (testigo === revisionAbierta.current) return;
      revisionAbierta.current = testigo;
      void abrirCompartido(testigo);
      return;
    }

    const pedida = revisionPedida();
    if (pedida === null || pedida === revisionAbierta.current) return;

    // Se marca antes de pedirla: sin esto, cada cambio de estado a `ready` —y hay varios
    // durante una carga— volvería a abrir la misma revisión.
    revisionAbierta.current = pedida;
    void abrirRevision(pedida);
  }, [status.kind, abrirRevision, abrirCompartido, testigo]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      // **Los archivos hay que leerlos ya**: `dataTransfer` se vacía al terminar el manejador, así
      // que guardar la lista para abrirla después dejaría cero archivos.
      const files = event.dataTransfer.files;
      if (files.length > 0) void openFiles(files);
    },
    [openFiles],
  );

  const onCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      const instance = viewer.current;
      if (!instance) return;

      // **Un arrastre no es un clic.** Orbitar termina en un `click` sobre el lienzo, así
      // que sin esta guarda cada giro de cámara seleccionaba lo que quedara bajo el cursor
      // —o consumía un punto de medición— sin que nadie lo pidiera.
      const inicio = pressPoint.current;
      pressPoint.current = null;
      if (inicio !== null) {
        const recorrido = Math.hypot(event.clientX - inicio.x, event.clientY - inicio.y);
        if (recorrido > CLICK_TOLERANCE_PX) return;
      }

      // Un clic a la vez. El anterior todavía está preguntándole al worker.
      if (clickInFlight.current) return;
      clickInFlight.current = true;

      try {
        // **Calzar la nube se come el clic**, igual que alinear un plano y por lo mismo: mientras
        // se están señalando pares, seleccionar o medir sería justo lo que no se quiere.
        if (await clicDeCalce(event.clientX, event.clientY)) return;

        // **Alinear se come el clic**, y antes que nada: mientras se están señalando los cuatro
        // puntos, seleccionar o medir sería justo lo que no se quiere.
        if (aligning !== null) {
          const enPlano = aligning.points.length % 2 === 0;
          const punto = enPlano
            ? viewer.current?.snapOnPlan(event.clientX, event.clientY)?.point
            : ((await instance.pointOnModel(event.clientX, event.clientY)) ?? undefined);

          // Un clic al vacío no cuenta: el aviso sigue pidiendo lo mismo en vez de saltarse un
          // paso y dejar la alineación calzada con un punto que nadie eligió.
          if (punto === undefined) return;

          const puestos = [...aligning.points, punto];
          if (puestos.length < 4) {
            setAligning({ ...aligning, points: puestos });
            return;
          }

          const [planoA, modeloA, planoB, modeloB] = puestos as [Point3, Point3, Point3, Point3];
          const transform = await instance.alignPlan(
            aligning.planId,
            { planoA, modeloA, planoB, modeloB },
            aligning.adjustScale,
          );
          if (transform !== null) {
            setPlans((actuales) =>
              actuales.map((plan) => (plan.id === aligning.planId ? { ...plan, transform } : plan)),
            );
          }
          setAligning(null);
          return;
        }

        if (measureMode !== null) {
          // El punto lo pone el medidor donde tenga el cursor ajustado, que es el que se está
          // viendo marcado en pantalla. Las coordenadas solo las usa la perpendicular, que lanza su
          // propio rayo para poder leer la normal de la cara.
          // Solo cuenta el clic que registró: si cayó al vacío, el aviso sigue pidiendo lo mismo en
          // vez de pasar al paso siguiente como si hubiera entrado.
          const registrado = await instance.addMeasurePoint(event.clientX, event.clientY);
          // **Un clic que no encontró geometría se dice.** Antes el visor daba todo por registrado
          // y el aviso pasaba a pedir el punto siguiente: un clic al vacío se veía igual que uno
          // que entró, y eso es lo que se lee como «la medición no funciona».
          setMeasureMissed(!registrado);
          if (registrado) setMeasurePoints((actual) => actual + 1);
          return;
        }

        // Un clic al vacío devuelve `null`, que es la mitad de los clics en un visor y no es
        // un error: simplemente deselecciona.
        const item = await instance.pickAt(event.clientX, event.clientY);
        if (item !== null) {
          setSelected(item);
          setSelectedPlan(null);
          return;
        }

        // **El modelo tiene preferencia y el plano recoge lo que caiga fuera.** Así un plano
        // tendido bajo la losa no roba la selección del elemento que está encima, y a la vez se
        // puede clicar una línea del plano —que es lo que hace falta para revisarlo.
        const enPlano = instance.pickPlan(event.clientX, event.clientY);
        if (enPlano !== null) {
          setSelectedPlan(enPlano);
          setSelected(null);
          setPuntoDeNube(null);
          await instance.clearSelection();
          return;
        }

        // **Y la nube recoge lo último, que es lo que abre la coordinación sobre el levantamiento.**
        // `F12.14`. Seleccionar un elemento da su ficha; seleccionar un punto de la nube da su
        // coordenada, y desde ahí se puede dejar la nota. Es la misma simetría que ya tenía el
        // plano 2D con `Plan2DCard`: otra clase de selección, otra ficha.
        //
        // El orden —modelo, plano, nube— es el mismo que el de la medición y por lo mismo: con las
        // dos cosas delante, un clic sobre un muro modelado tiene que dar el muro.
        setPuntoDeNube(instance.pickPointCloud(event.clientX, event.clientY));
        setSelectedPlan(null);
        setSelected(null);
        await instance.clearSelection();
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      } finally {
        clickInFlight.current = false;
      }
    },
    // **`clicDeCalce` va en las dependencias, y faltaba.** Sin ella, `onCanvasClick` se quedaba
    // con la primera versión —la de cuando el calce estaba apagado— y el clic **caía en
    // seleccionar** en vez de tomar el punto. Se vio en pantalla: el muro quedaba seleccionado y
    // el panel seguía pidiendo «pincha el punto en el MODELO» para siempre.
    [measureMode, aligning, clicDeCalce],
  );

  /** Doble clic: cierra el contorno si se está midiendo un área, y si no encuadra el elemento. */
  const onCanvasDoubleClick = useCallback(() => {
    const instance = viewer.current;
    if (!instance) return;

    if (measureMode === "area") instance.finishMeasurement();
    else void instance.frameSelection();
  }, [measureMode]);

  // Escape cancela una alineación a medias. Es un gesto de cuatro clics y hay que poder salirse
  // sin dejar el plano movido a la mitad: la tecla es la que espera cualquiera que venga de un CAD.
  useEffect(() => {
    if (aligning === null) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAligning(null);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [aligning]);

  // Enter cierra el contorno de un área. Un contorno no tiene un número fijo de vértices, así
  // que alguien tiene que decir cuándo terminó, y buscar el botón con el ratón interrumpe.
  useEffect(() => {
    if (measureMode !== "area") return;
    const alPulsar = (evento: KeyboardEvent) => {
      // Escribiendo el nombre de una vista, Enter envía **ese** formulario; sin esta puerta
      // además cerraba el contorno que se estaba midiendo, sin que nadie lo pidiera.
      if (evento.key === "Enter" && !enUnCampo(evento)) viewer.current?.finishMeasurement();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [measureMode]);

  const onProjection = useCallback((next: Projection) => {
    setProjection(next);
    void viewer.current?.setProjection(next);
  }, []);

  const onNavigation = useCallback((next: NavigationMode) => {
    setNavigation(next);
    viewer.current?.setNavigationMode(next);
  }, []);

  const onStyle = useCallback((next: RenderStyle) => {
    setStyle(next);
    void viewer.current?.setRenderStyle(next);
  }, []);

  const onMeasureMode = useCallback((mode: MeasureMode | null) => {
    setMeasureMode(mode);
    setMeasurePoints(0);
    setMeasureMissed(false);
    // Medir y seleccionar no se mezclan: entrar a medir cierra la ficha y suelta el elemento
    // resaltado, que si no se queda violeta debajo de las cotas y estorba para ver.
    if (mode !== null) setSelected(null);
    viewer.current?.setMeasureMode(mode);
  }, []);

  const onSnapMode = useCallback((mode: SnapMode) => {
    setSnapMode(mode);
    viewer.current?.setSnapMode(mode);
  }, []);

  const onDistanceMode = useCallback((mode: DistanceMode) => {
    setDistanceMode(mode);
    viewer.current?.setDistanceMode(mode);
  }, []);

  /** Apaga o enciende una cota. Apagada sigue existiendo y vuelve con otro clic. */
  const onToggleMeasurement = useCallback((id: string, visible: boolean) => {
    const instance = viewer.current;
    if (!instance) return;
    instance.setMeasurementVisible(id, visible);
    setDrawn(instance.listMeasurements());
  }, []);

  const onDeleteMeasurement = useCallback((id: string) => {
    const instance = viewer.current;
    if (!instance) return;
    instance.deleteMeasurement(id);
    setDrawn(instance.listMeasurements());
    setMeasurementCount(instance.measurementCount);
  }, []);

  /**
   * Descarta la medida a medias y deja las tomadas donde estaban.
   *
   * **Estaba en el visor y no la llamaba nadie.** `cancelMeasurement` existe desde que las
   * mediciones son propias y `diag.html` la comprueba —tres vértices puestos, cero después—, pero
   * desde la pantalla la única salida de un área a medio contornear era pulsar "Seleccionar", que
   * la descarta de rebote y encima cambia de modo.
   */
  const onCancelMeasurement = useCallback(() => {
    viewer.current?.cancelMeasurement();
    setMeasurePoints(0);
    setMeasureMissed(false);
  }, []);

  // **`Esc` sale de una medida a medias**, que es el mismo gesto con el que ya se sale de un calce
  // y el que espera cualquiera que venga de un CAD. No hace falta que haya puntos puestos: pulsarla
  // sin nada empezado no rompe nada y ahorra tener que mirar si contó el primer clic.
  useEffect(() => {
    if (measureMode === null) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !enUnCampo(evento)) onCancelMeasurement();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [measureMode, onCancelMeasurement]);

  const onClearMeasurements = useCallback(() => {
    viewer.current?.clearMeasurements();
    setDrawn([]);
  }, []);

  /** Guarda la vista actual con un nombre y la persiste. */
  const onSaveView = useCallback((name: string) => {
    const instance = viewer.current;
    if (!instance) return;

    void instance.captureView(name).then((vista) => {
      setViews((actuales) => {
        // Un nombre repetido reemplaza a la vista anterior: es lo que alguien espera al volver a
        // guardar "Planta baja" después de ajustar la cámara.
        const sinRepetida = actuales.filter((otra) => otra.name !== vista.name);
        const siguientes = [...sinRepetida, vista];
        escribirVistas(siguientes);
        return siguientes;
      });
    });
  }, []);

  const onApplyView = useCallback((view: SavedView) => {
    const instance = viewer.current;
    if (!instance) return;

    // La vista trae su propio estado de cámara y aspecto: la interfaz se sincroniza con él para que
    // la cinta no siga diciendo lo de antes.
    setProjection(view.camera.projection);
    setNavigation(view.camera.navigation);
    setHasSections(view.sections.length > 0);
    // Una vista dice qué se ve, entero: lo aislado antes deja de ser un paso que deshacer, porque
    // lo de antes ya no es lo que hay. El visor vacía su pila por lo mismo.
    setIsolations([]);
    void instance.applyView(view);
  }, []);

  const onDeleteView = useCallback((id: string) => {
    setViews((actuales) => {
      const siguientes = actuales.filter((vista) => vista.id !== id);
      escribirVistas(siguientes);
      return siguientes;
    });
  }, []);

  const onTogglePlan = useCallback((id: string, visible: boolean) => {
    setHiddenPlans((actual) => {
      const siguiente = new Set(actual);
      if (visible) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
    void viewer.current?.setPlanVisible(id, visible);
  }, []);

  const onTogglePlanLayer = useCallback((id: string, layer: string, visible: boolean) => {
    setHiddenPlanLayers((actual) => {
      const siguiente = new Set(actual);
      const clave = `${id}:${layer}`;
      if (visible) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
    void viewer.current?.setPlanLayerVisible(id, layer, visible);
  }, []);

  /**
   * Mueve, escala o gira un plano.
   *
   * El estado de la interfaz se actualiza con **lo que devuelve el visor**, no con lo que se pidió:
   * es el visor quien tiene la colocación buena, y si el plano ya no estuviera, la ficha no debe
   * quedarse mostrando un ajuste que no se aplicó a nada.
   */
  const onPlanTransform = useCallback((id: string, cambios: Partial<PlanTransform>) => {
    void viewer.current?.setPlanTransform(id, cambios).then((transform) => {
      if (transform === null || transform === undefined) return;
      setPlans((actuales) =>
        actuales.map((plan) => (plan.id === id ? { ...plan, transform } : plan)),
      );

      // **Cambiar la unidad reencuadra.** Pasar de milímetros a metros hace el plano mil veces más
      // grande y lo saca de la pantalla: sin esto, el plano "desaparecía" y no había forma de
      // saber que seguía ahí, mil veces más lejos. Solo pasa con la unidad; mover o girar unos
      // metros no debe robarle la cámara a quien está mirando otra cosa.
      if (cambios.metresPerUnit !== undefined) {
        setStandardView("top");
        viewer.current?.framePlan(id, "top");
      }
    });
  }, []);

  const onClosePlan = useCallback((id: string) => {
    setPlans((actuales) => actuales.filter((plan) => plan.id !== id));
    setHiddenPlans((actual) => {
      const siguiente = new Set(actual);
      siguiente.delete(id);
      return siguiente;
    });
    void viewer.current?.removePlan(id);
  }, []);

  /**
   * Entra y sale del **modo 2D**: el plano solo, mirado desde arriba.
   *
   * **Es la respuesta a "¿en la misma ventana o en dos?".** En la misma, porque la pregunta que
   * trae a alguien acá —lo que dice el plano, ¿está modelado?— se responde cruzando los dos; pero
   * revisar el CAD con el modelo encima es imposible, así que hay un modo que apaga los modelos,
   * pone la cámara en planta y la proyección ortográfica, que es como se mira un plano.
   *
   * No borra nada: los modelos quedan **apagados**, y salir del modo —o "Ver todo"— los devuelve.
   *
   * **Salir devuelve lo que había, no un estado de fábrica**, y es la misma lección que ya se
   * había pagado con el aislamiento: antes, salir encendía *todos* los modelos —incluido el que se
   * había apagado a mano antes de entrar— y dejaba la cámara en perspectiva isométrica aunque se
   * hubiera entrado desde una ortográfica. Un interruptor que no deshace lo suyo obliga a rehacer
   * a mano lo que uno ya había decidido.
   */
  const onModo2D = useCallback(
    (activar: boolean) => {
      const instance = viewer.current;
      if (instance === null) return;

      setModo2D(activar);
      if (activar) {
        antesDel2D.current = {
          modelosApagados: hiddenModels,
          projection,
          navigation,
        };
        setHiddenModels(new Set(models.map((modelo) => modelo.id)));
        for (const modelo of models) void instance.setModelVisible(modelo.id, false);
        // La postproducción está para que se lea un modelo; sobre un dibujo de líneas plano filtra
        // los colores y los deja lavados, y el plano deja de verse como en el CAD.
        instance.setPostproductionEnabled(false);
        setProjection("Orthographic");
        void instance.setProjection("Orthographic");
        setNavigation("Plan");
        instance.setNavigationMode("Plan");
        setStandardView("top");
        void instance.frameAll("top");
        return;
      }

      const previo = antesDel2D.current;
      const apagadosAntes = previo?.modelosApagados ?? new Set<string>();
      setHiddenModels(apagadosAntes);
      for (const modelo of models) {
        void instance.setModelVisible(modelo.id, !apagadosAntes.has(modelo.id));
      }
      instance.setPostproductionEnabled(true);

      const proyeccion = previo?.projection ?? "Perspective";
      const navegacion = previo?.navigation ?? "Orbit";
      setProjection(proyeccion);
      void instance.setProjection(proyeccion);
      setNavigation(navegacion);
      instance.setNavigationMode(navegacion);
      antesDel2D.current = null;

      setStandardView("iso");
      void instance.frameAll("iso");
    },
    [models, hiddenModels, projection, navigation],
  );

  /**
   * Genera un plano desde el modelo y lo añade a la lista.
   *
   * **Lo que entra en el plano es lo que está encendido**, así que no hay diálogo de selección:
   * apagar una disciplina antes de generar es la misma decisión que ya se toma para mirar.
   */
  const onGenerateDrawing = useCallback(
    async (view: DrawingView) => {
      const instance = viewer.current;
      if (instance === null) return;

      setGenerating("Proyectando las aristas del modelo…");
      try {
        const plano = await instance.createDrawing(view, (mensaje, avance) => {
          setGenerating(
            avance === undefined ? mensaje : `${mensaje} — ${Math.round(avance * 100)} %`,
          );
        });
        if (plano === null) {
          setStatus({
            kind: "error",
            // El caso más común es haber entrado en Modo 2D, que apaga los modelos: decirlo ahorra
            // el rato de mirar la pantalla sin entender por qué no sale nada.
            message: modo2D
              ? "No hay nada que proyectar: el Modo 2D tiene los modelos apagados."
              : "No hay nada encendido que proyectar.",
          });
          return;
        }
        // Nace apagado en la vista 3D —el dibujo cae encima del modelo—, así que la lista arranca
        // marcándolo como tal: encenderlo es un clic en su ojo.
        setDrawings((actuales) => [...actuales, plano]);
        setHiddenDrawings((actual) => new Set(actual).add(plano.id));
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      } finally {
        setGenerating(null);
      }
    },
    [modo2D],
  );

  /**
   * Descarga un plano generado como DXF.
   *
   * En **A3 y en milímetros**: lo que se pide al exportar es un plano imprimible, y un DXF en
   * unidades de mundo obliga a escalarlo a mano en el CAD.
   *
   * **Y la escala va en el nombre del archivo.** El DXF sale ya colocado a la escala en la que cabe
   * en el A3, que no es siempre la misma: depende del tamaño del edificio. Quien reciba «Planta
   * 1-200.dxf» sabe con qué lado del escalímetro medirlo sin abrirlo.
   */
  const onExportDrawing = useCallback(
    (id: string) => {
      const papel = { widthMm: 420, heightMm: 297, margin: 10 };
      const dxf = viewer.current?.exportDrawingDxf(id, papel);
      if (dxf === null || dxf === undefined) return;

      const plano = drawings.find((uno) => uno.id === id);
      const escala = viewer.current?.drawingPaperScale(id, papel);
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(new Blob([dxf], { type: "application/dxf" }));
      enlace.download = `${plano?.name ?? "plano"}${
        escala === null || escala === undefined ? "" : ` 1-${escala}`
      }.dxf`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    },
    [drawings],
  );

  /* --- Los cuadros del modelo: `F10.5` -------------------------------------------- */

  /** El cuadro que está abierto sobre el modelo, o `null`. */
  const [cuadro, setCuadro] = useState<Schedule | null>(null);

  const onCategorias = useCallback(
    async (modelId: string) => (await viewer.current?.categoriesOf(modelId)) ?? new Map(),
    [],
  );

  const onCuadro = useCallback(
    async (modelId: string, categoria: string) =>
      (await viewer.current?.scheduleOf(modelId, categoria)) ?? null,
    [],
  );

  /**
   * Descarga el cuadro como CSV.
   *
   * El nombre lleva la categoría y el modelo: quien lo recibe por correo tiene que saber de qué
   * cuadro es sin abrirlo, que es la misma regla que el informe del servidor.
   */
  const onDescargarCuadro = useCallback(
    (cual: Schedule) => {
      const modelo = models.find((uno) => uno.id === cual.modelId);
      const enlace = document.createElement("a");
      // **El tipo lleva `charset=utf-8` y el texto su BOM**, que es lo que necesita un Excel en
      // configuración castellana para no partir las tildes. El BOM lo pone `csvDe`.
      enlace.href = URL.createObjectURL(
        new Blob([csvDe(cual)], { type: "text/csv;charset=utf-8" }),
      );
      enlace.download = `${modelo?.name ?? "modelo"}-${cual.category}.csv`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    },
    [models],
  );

  /**
   * Lleva el visor al elemento de una fila del cuadro.
   *
   * **Es lo que convierte el cuadro en una herramienta de revisión** y no en una tabla: se ve el
   * perfil raro entre trescientos y se va a mirarlo donde está. Reusa el mismo camino que abrir una
   * observación —seleccionar y encuadrar—, así que el gesto es el que ya se conoce.
   */
  const onIrAlElementoDelCuadro = useCallback(
    (localId: number) => {
      if (cuadro === null) return;
      void viewer.current?.selectById(cuadro.modelId, localId);
    },
    [cuadro],
  );

  /**
   * Pone el cuadro cargado dentro de una lámina generada. `F10.4`.
   *
   * **La tabla del papel no es la de la pantalla**, y de eso se encarga `tablaDeCuadro`: en pantalla
   * hay veinticuatro columnas y se puede desplazar; en una lámina, veinticuatro columnas son
   * ilegibles a cualquier escala. Se quedan las que más filas llevan.
   */
  const onPonerCuadroEnPlano = useCallback(
    (planoId: string) => {
      if (cuadro === null) return;
      const tabla = viewer.current?.tablaDeCuadro(cuadro);
      if (tabla === undefined) return;
      void viewer.current?.addTableToDrawing(planoId, tabla);
    },
    [cuadro],
  );

  /**
   * Lleva las cotas medidas sobre el modelo a una lámina. `F7.3`.
   *
   * **El aviso dice cuántas se pusieron y no «hecho»**, porque puede ser menos que las que hay: una
   * cota entre dos puntos que se proyectan al mismo sitio —una medición vertical en una planta— no
   * es una cota y se salta. Un «hecho» dejaría a alguien buscando en el DXF una cota que no está.
   */
  /**
   * Qué anotaciones lleva puesta cada lámina. `F7.3`.
   *
   * **Se dice en la ficha del plano y no en un aviso general**, y el desglose importa: puede entrar
   * menos de lo medido, porque lo que se proyecta a un punto no es una cota —una medición vertical
   * en una planta— y lo que está a nivel no tiene pendiente que anotar. Un «hecho» dejaría a alguien
   * buscando en el DXF una cota que no está.
   */
  const [anotado, setAnotado] = useState<
    Readonly<Record<string, { cotas: number; angulos: number; pendientes: number }>>
  >({});

  /**
   * Descarga la lámina en PDF, dibujada por el servidor. `F7.5`.
   *
   * **El navegador manda la geometría ya proyectada y el servidor compone el papel.** Proyectar
   * aristas necesita un renderizador —en un servidor sin pantalla no lo hay— y el membrete de
   * J.E.J. ya vive allí: es la misma decisión que el usuario tomó para el informe, «desde el
   * servidor, así buscamos que sea interno».
   */
  const onLaminaPdf = useCallback(
    async (planoId: string) => {
      const proyectoId = origen?.proyectoId;
      if (proyectoId === undefined) {
        setStatus({
          kind: "error",
          // Sin obra no hay dónde sellar la hoja: el membrete lleva el código del proyecto.
          message:
            "Este modelo se abrió desde el disco, así que la lámina no tiene obra que sellar. " +
            "Ábrelo desde su expediente y el PDF sale con el membrete de la casa.",
        });
        return;
      }

      const hoja = viewer.current?.sheetOf(planoId);
      if (hoja === null || hoja === undefined) return;

      const respuesta = await fetch(`/documentos/proyectos/${proyectoId}/lamina/`, {
        method: "POST",
        credentials: "same-origin",
        headers: cabecerasDeEscritura(),
        body: JSON.stringify(hoja),
      });
      if (respuesta.status === 403) {
        setStatus({
          kind: "error",
          message: motivoDe403(await respuesta.json().catch(() => ({}))),
        });
        return;
      }
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          message: cuerpo.error ?? `El servidor respondió ${respuesta.status}.`,
        });
        return;
      }

      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(await respuesta.blob());
      enlace.download = `${hoja.nombre}.pdf`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    },
    [origen],
  );

  /**
   * Los hallazgos del modelo, para poder señalarlos en un plano. `F7.3`.
   *
   * **Los reporta el panel de coordinación, que ya los pide.** Pedirlos aquí otra vez serían dos
   * peticiones a la misma consulta y dos listas que pueden discrepar por medio segundo.
   */
  const [hallazgosDelModelo, setHallazgosDelModelo] = useState<
    readonly { guid: string; titulo: string }[]
  >([]);
  const [llamadasPuestas, setLlamadasPuestas] = useState<Readonly<Record<string, number>>>({});

  const onSenalarHallazgos = useCallback(
    async (planoId: string) => {
      const puestas =
        (await viewer.current?.addCalloutsToDrawing(planoId, hallazgosDelModelo)) ?? 0;
      setLlamadasPuestas((actual) => ({ ...actual, [planoId]: (actual[planoId] ?? 0) + puestas }));
    },
    [hallazgosDelModelo],
  );

  const onAcotarPlano = useCallback(async (planoId: string) => {
    const vacio = { cotas: 0, angulos: 0, pendientes: 0 };
    const puestas = (await viewer.current?.annotateDrawing(planoId)) ?? vacio;
    setAnotado((actual) => {
      // **Se acumula.** Anotar dos veces añade, no reemplaza: el número tiene que decir lo que hay
      // en la lámina y no lo que entró en la última pasada.
      const antes = actual[planoId] ?? vacio;
      return {
        ...actual,
        [planoId]: {
          cotas: antes.cotas + puestas.cotas,
          angulos: antes.angulos + puestas.angulos,
          pendientes: antes.pendientes + puestas.pendientes,
        },
      };
    });
  }, []);

  const onSection = useCallback((axis: SectionAxis) => {
    setHasSections(true);
    void viewer.current?.addSection(axis);
  }, []);

  const onClearSections = useCallback(() => {
    setHasSections(false);
    void viewer.current?.clearSections();
  }, []);

  const closeProperties = useCallback(() => {
    setSelected(null);
    void viewer.current?.clearSelection();
  }, []);

  const onToggleVisible = useCallback((node: SpatialNode, modelId: string, visible: boolean) => {
    setHidden((actual) => {
      const siguiente = new Set(actual);
      if (visible) siguiente.delete(node.key);
      else siguiente.add(node.key);
      return siguiente;
    });
    void viewer.current?.setVisible(modelId, node.localIds, visible);
  }, []);

  /**
   * Enciende **todo lo que hay**, modelos y planos.
   *
   * Los planos entran acá porque para quien mira la pantalla son parte de lo mismo: si "Ver todo"
   * dejara un plano apagado, el botón estaría mintiendo por un detalle de implementación.
   */
  const onShowAll = useCallback(() => {
    setHidden(new Set());
    setHiddenModels(new Set());
    setHiddenElements(new Set());
    setIsolations([]);
    setVisibilidadDeObservacion(false);
    void viewer.current?.showAll();

    for (const plan of plans) {
      void viewer.current?.setPlanVisible(plan.id, true);
      for (const capa of plan.layers) {
        void viewer.current?.setPlanLayerVisible(plan.id, capa.name, true);
      }
    }
    setHiddenPlans(new Set());
    setHiddenPlanLayers(new Set());
  }, [plans]);

  /**
   * Sale del último aislamiento **volviendo a lo de antes**, que no es lo mismo que "Ver todo".
   *
   * La diferencia es la que pidió el usuario: al aislar un pilar para mirarlo, salir tiene que
   * devolver el modelo tal como estaba —con la planta que se había apagado todavía apagada—, no
   * encenderlo entero. Aislar dentro de un aislamiento se deshace de a un paso.
   */
  const onUndoIsolate = useCallback(() => {
    const previo = isolations.at(-1);
    if (previo === undefined) return;

    setIsolations((actuales) => actuales.slice(0, -1));
    setHidden(previo.hidden);
    setHiddenModels(previo.hiddenModels);
    setHiddenElements(previo.hiddenElements);
    void viewer.current?.undoIsolation();
  }, [isolations]);

  /** La clave con la que se recuerda un elemento apagado. */
  const claveDe = (item: PickedItem) => `${item.modelId}:${item.localId}`;

  const selectionVisible = selected === null || !hiddenElements.has(claveDe(selected));

  /** `true` mientras se está mirando algo aislado, con el resto del modelo apagado por eso. */
  const isolated = isolations.length > 0;
  /**
   * `true` si hay **algo** fuera de la vista, aislado o apagado a mano.
   *
   * Es lo que decide que la barra de estado avise. Sin ese aviso, aislar desde la ficha y luego
   * cambiar de pestaña dejaba media pantalla apagada sin nada que dijera por qué ni cómo volver:
   * "Ver todo" vivía solo en la pestaña Modelo.
   */
  const hasHidden =
    isolated ||
    hidden.size > 0 ||
    hiddenModels.size > 0 ||
    hiddenElements.size > 0 ||
    hiddenPlans.size > 0 ||
    hiddenPlanLayers.size > 0 ||
    visibilidadDeObservacion;

  /**
   * A dónde lleva «Observar» con este elemento seleccionado, o `null` si no lleva a ninguna parte.
   *
   * **Es la mitad de `F4.1` que no necesita coordenadas**: el ancla es el GUID, la identidad estable
   * del elemento, y es la que después viaja en el BCF que abre el mandante. La cámara es otra cosa y
   * está pendiente — la escena del visor tiene el eje Y hacia arriba y BCF espera Z, y esa
   * transformación hay que medirla antes de exportarla.
   *
   * Devuelve `null` en tres casos, y los tres son "no hay dónde anotarlo", no "está deshabilitado":
   * el modelo no vino del registro, el usuario no puede abrir observaciones, o el elemento **no
   * trae GUID válido** — un ancla sin identidad no apunta a nada, y una observación que dice
   * «algo en este modelo» no es mejor que un correo.
   */
  /**
   * `true` si se puede dejar una nota sobre lo que está seleccionado.
   *
   * Tres motivos para que no, y los tres son «no hay dónde anotarlo», no «está deshabilitado»: el
   * modelo se abrió del disco, el rol no puede abrir observaciones —lo contesta el servidor—, o el
   * elemento no trae GUID válido. Un botón gris que no dice por qué manda a buscar el error donde
   * no está, así que el botón no se dibuja.
   */
  const sePuedeAnotar =
    origen !== null && origen.puedeObservar && selected !== null && selected.guid !== null;

  /**
   * Por qué **no** se puede anotar este elemento, o `null` si sí se puede.
   *
   * **La ficha callaba y eso era el hueco.** El botón no se dibuja cuando no hay dónde colgar la
   * observación —lo cual es correcto: un botón gris que no explica su gris manda a buscar el error
   * donde no está— pero entonces quien selecciona una silla en un IFC abierto del disco no ve
   * ningún camino y concluye que el producto no anota. Lo preguntó el usuario mirando esa pantalla:
   * «al cargar un elemento en IFC directamente, cómo le puedo dejar notas para comenzar con la
   * coordinación».
   *
   * Así que en vez de nada, va el motivo **con la salida**. Cada uno tiene una salida distinta y
   * por eso son tres mensajes y no uno.
   */
  const motivoSinAnotar: string | null =
    selected === null || sePuedeAnotar
      ? null
      : origen === null
        ? "Este modelo se abrió desde el disco, así que no hay obra donde archivar la nota. " +
          "Ábrelo desde su expediente —en la pantalla de la obra, «Modelos y planos que puedes " +
          "abrir»— y este elemento tendrá su botón para anotar."
        : !origen.puedeObservar
          ? "Tu rol puede ver este modelo pero no abrir observaciones sobre él."
          : "Este elemento no trae un GUID de IFC, así que no hay a qué anclar la nota: una " +
            "observación se encuentra otra vez por el GUID, y sin él no se podría volver a abrir.";

  /**
   * `true` si se puede anotar **el punto del levantamiento** que está señalado. `F12.14`.
   *
   * Le falta a propósito la condición del GUID: es justo la que no se puede cumplir sobre una nube,
   * y exigirla era lo que dejaba la coordinación esperando al modelo. Lo demás es lo mismo — hace
   * falta una obra donde archivar la nota y un rol que pueda abrirlas.
   */
  const sePuedeAnotarLaNube =
    origen !== null && origen.puedeObservar && puntoDeNube !== null && selected === null;

  /** Por qué no se puede anotar este punto, con su salida. Mismo criterio que el del elemento. */
  const motivoSinAnotarLaNube: string | null =
    puntoDeNube === null || sePuedeAnotarLaNube
      ? null
      : origen === null
        ? "Este levantamiento se abrió desde el disco, así que no hay obra donde archivar la " +
          "nota. Ábrelo desde su expediente —en la pantalla de la obra, «Modelos y planos que " +
          "puedes abrir»— y este punto tendrá su botón para anotar."
        : "Tu rol puede ver este levantamiento pero no abrir observaciones sobre él.";

  /** `true` mientras la tarjeta de nota está abierta encima del modelo. */
  const [notaAbierta, setNotaAbierta] = useState(false);

  /**
   * Cambia cada vez que se guarda una nota, para que el panel de coordinación se recargue.
   *
   * Sin esto la nota se guarda y **la lista sigue igual**, que se lee como que no se guardó — y
   * entonces alguien la escribe otra vez.
   */
  const [notasGuardadas, setNotasGuardadas] = useState(0);

  // Cambiar de elemento **o de punto** cierra la tarjeta: estaba anclada al anterior, y dejarla
  // abierta haría que la nota se guardara sobre un ancla distinta de la que se está mirando.
  useEffect(() => setNotaAbierta(false), [selected, puntoDeNube]);

  /**
   * Abre una observación del panel de coordinación: **lleva la cámara y selecciona el elemento**.
   *
   * Es la mitad que faltaba del ciclo: la observación se creaba desde el visor y para verla había
   * que salir a otra pantalla. Devuelve `false` si el GUID no está en ningún modelo abierto —suele
   * ser de otra disciplina—, y el panel lo dice junto a **esa** fila.
   *
   * Y deja la ficha abierta con el elemento: quien llega al problema quiere ver de qué elemento se
   * habla, no solo dónde está.
   */
  const onAbrirObservacion = useCallback(async (observacion: ObservacionDelModelo) => {
    const instancia = viewer.current;
    if (instancia === null) return false;

    const encontrado = await instancia.abrirObservacion(
      observacion.guid,
      observacion.camara,
      observacion.visibilidad,
    );

    // **Lo apagado por el viewpoint se anota aunque el elemento no aparezca.** La visibilidad se
    // aplica antes de buscarlo —así el encuadre se calcula sobre lo que va a quedar en pantalla— y
    // si la fila se descarta acá sin registrarlo, la barra de estado no ofrece la vuelta y medio
    // modelo queda apagado sin nada que diga por qué. Es la misma lección de `F1.5`.
    if (observacion.visibilidad !== null) setVisibilidadDeObservacion(true);

    if (encontrado === null) return false;

    setSelected(encontrado);
    setSelectedPlan(null);
    setPanelIzquierdo(true);
    return true;
  }, []);

  /** Apaga o enciende **el elemento seleccionado**, que es lo que se pidió tener a un botón. */
  const onToggleSelectionVisible = useCallback(() => {
    const instance = viewer.current;
    if (instance === null || selected === null) return;

    const clave = `${selected.modelId}:${selected.localId}`;
    const encender = hiddenElements.has(clave);

    setHiddenElements((actual) => {
      const siguiente = new Set(actual);
      if (encender) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
    void instance.setVisible(selected.modelId, [selected.localId], encender);
  }, [selected, hiddenElements]);

  /**
   * Entra en un aislamiento, sea de un elemento o de un nodo del árbol.
   *
   * Aislar deja todo lo demás oculto, así que los iconos del árbol y los del panel de modelos
   * dejarían de decir la verdad: se limpian, y el estado que mostraban queda apuntado en la pila
   * para poder devolverlo al salir. Ver {@link onUndoIsolate}.
   */
  const isolate = useCallback(
    (modelId: string, localIds: readonly number[]) => {
      setIsolations((actuales) => [...actuales, { hidden, hiddenModels, hiddenElements }]);
      setHidden(new Set());
      setHiddenModels(new Set());
      setHiddenElements(new Set());
      void viewer.current?.isolate(modelId, localIds);
    },
    [hidden, hiddenModels, hiddenElements],
  );

  /** Aislar el elemento seleccionado: lo mismo que aislar un nodo del árbol, con un solo id. */
  const onIsolateSelection = useCallback(() => {
    if (selected === null) return;
    isolate(selected.modelId, [selected.localId]);
  }, [selected, isolate]);

  const onIsolateNode = useCallback(
    (modelId: string, localIds: readonly number[]) => {
      isolate(modelId, localIds);
    },
    [isolate],
  );

  const onToggleModel = useCallback((modelId: string, visible: boolean) => {
    setHiddenModels((actual) => {
      const siguiente = new Set(actual);
      if (visible) siguiente.delete(modelId);
      else siguiente.add(modelId);
      return siguiente;
    });
    void viewer.current?.setModelVisible(modelId, visible);
  }, []);

  /**
   * Cierra un modelo y lo saca de todas las listas.
   *
   * La ficha de propiedades se cierra si estaba mostrando un elemento de ese modelo: dejarla
   * abierta sobre un modelo que ya no está sería mostrar un dato que nadie puede comprobar.
   */
  const onCloseModel = useCallback((modelId: string) => {
    setModels((actual) => actual.filter((modelo) => modelo.id !== modelId));
    setTrees((actual) => actual.filter((tree) => tree.modelId !== modelId));
    setHiddenModels((actual) => {
      const siguiente = new Set(actual);
      siguiente.delete(modelId);
      return siguiente;
    });
    setSelected((actual) => (actual?.modelId === modelId ? null : actual));
    void viewer.current?.closeModel(modelId);
  }, []);

  const onMoveModel = useCallback((index: number, direction: -1 | 1) => {
    setModels((actual) => {
      const destino = index + direction;
      if (destino < 0 || destino >= actual.length) return actual;

      const copia = [...actual];
      const [movido] = copia.splice(index, 1);
      if (movido !== undefined) copia.splice(destino, 0, movido);
      return copia;
    });
  }, []);

  // El árbol sigue el orden del panel de modelos: dos listas de lo mismo en órdenes distintos
  // se leen como dos cosas distintas.
  const orderedTrees = useMemo(
    () =>
      models
        .map((modelo) => trees.find((tree) => tree.modelId === modelo.id))
        .filter((tree): tree is ModelTree => tree !== undefined),
    [models, trees],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <Ribbon
        brand={
          <span className="flex min-w-0 items-center gap-3">
            {/* La marca lleva al portal: es donde uno espera que lleve el logo, y desde acá era
                lo único que faltaba para poder salir. */}
            {/* **Entrando por un enlace, la marca no lleva a ninguna parte.** Quien viene de fuera
                no tiene cuenta: pulsar el logo lo dejaría en la pantalla de entrar, que le pide algo
                que no tiene y le sugiere que debería. Se queda como marca y no como salida. */}
            <a
              href={compartido === null ? "/" : undefined}
              className={[
                "flex shrink-0 items-center gap-2",
                compartido === null ? "hover:opacity-80" : "cursor-default",
              ].join(" ")}
              title={compartido === null ? "AeroBim — al portal" : "AeroBim"}
            >
              {/* **Sin placa.** Hubo una placa blanca aquí y duró una tarde: resolvía el contraste
                  —el relleno del dibujo original es `#1B2A4A` y la cinta es `#18202f`, o sea
                  1,15:1— y ponía a cambio un parche blanco que no pertenece a la paleta. La
                  variante oscura resuelve las dos cosas, y además se adapta a cualquier superficie
                  porque lo transparente no tiene color con el que chocar. */}
              <img src={RUTA_MARCA} alt="" className="h-7 w-auto" />
              <span className="text-sm font-semibold">AeroBim</span>
            </a>
            {/* ══════════════════════════════════════════════════════════════════════════════
                **LA VUELTA, ESCRITA.**

                Ya se podía volver: el logo de al lado lleva a `/`. No servía, y el usuario lo dijo
                con las palabras exactas —«al entrar al visor bim buscar la forma de volver»—
                después de haber estado dentro.

                Y es que un logo que navega **no se ve**: es la convención de la web, sí, pero aquí
                el visor ocupa la pantalla completa sin ninguna otra cosa alrededor, así que no hay
                nada que sugiera que esto es «una página» de la que se sale. Lo único que lo decía
                era un `title`, que aparece tras un segundo de reposo del ratón encima de un sitio
                donde no hay motivo para dejar el ratón.

                Un enlace con su palabra no se puede no ver. El logo sigue llevando al portal —eso
                no se quita, quien lo busque ahí lo encuentra—: esto es la señal, no el mecanismo.

                **Entrando por un enlace compartido no se dibuja**, por lo mismo que el logo deja
                de navegar: quien viene de fuera no tiene cuenta, y ofrecerle una salida al portal
                lo dejaría en la pantalla de entrar pidiéndole algo que no tiene.
                ══════════════════════════════════════════════════════════════════════════════ */}
            {compartido === null && (
              <a
                href="/"
                // `shrink-0` para que no sea lo primero que se estrecha cuando el nombre del
                // expediente de al lado es largo: una salida a medio recortar no es una salida.
                // Y `hidden sm:inline-flex` no: en un teléfono es **más** necesaria, no menos.
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-borde px-2.5 py-1 text-xs text-fg-2 transition-colors duration-[--duracion-corta] ease-[--ease-ab] hover:border-accent hover:bg-surface-3 hover:text-fg"
                title="Volver al registro documental"
              >
                <IconArrowLeft className="h-3.5 w-3.5" />
                Al portal
              </a>
            )}
            {/* De dónde vino lo que está abierto. No se dibuja si es un archivo del disco.
                Y entrando por un enlace, en su lugar va qué es y hasta cuándo: quien viene de fuera
                no tiene expediente al que volver, así que necesita lo contrario de una vuelta. */}
            {compartido === null ? <Origen origen={origen} /> : <Compartido ficha={compartido} />}
          </span>
        }
        actions={
          <>
            <StatusBadge status={status} />
            {/* **El interruptor de tema, junto a Abrir.** Es donde está en el portal —la barra de
                arriba, a la derecha— así que quien cruza de una mitad a la otra lo busca en el
                mismo sitio.

                Lleva su nombre en `aria-label` y no un texto visible: es un botón de icono, y por
                eso hereda el área de toque de 44 px de la regla `button[aria-label]` de
                `index.css`. El símbolo cambia para decir **a qué se va**, no en qué se está — un
                interruptor que muestra el estado actual se lee al revés la mitad de las veces. */}
            <button
              type="button"
              aria-label={tema === "oscuro" ? "Cambiar al tema claro" : "Cambiar al tema oscuro"}
              title={tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
              onClick={() => setTema(cambiarTema(tema === "oscuro" ? "claro" : "oscuro"))}
              className="rounded-md px-2 py-1 text-xs text-fg-2 transition-colors duration-[--duracion-corta] ease-[--ease-ab] hover:bg-surface-3 hover:text-fg"
            >
              {tema === "oscuro" ? "☀" : "☾"}
            </button>
            {/* **Abrir es uno solo para todo lo que la aplicación sabe leer.** Antes decía
                "Abrir IFC" y un plano no tenía por dónde entrar; ahora el mismo botón —y el mismo
                arrastrar y soltar— toma el modelo y el plano, y es la extensión la que decide. */}
            <label className="cursor-pointer rounded-md bg-action px-3 py-1 text-xs font-medium text-sobre-accion hover:bg-action-hover">
              Abrir
              <input
                ref={entradaDeArchivo}
                type="file"
                // La nube entra por la misma puerta que el modelo y el plano: `F12.1`.
                accept=".ifc,.dxf,.laz,.las"
                // **Varios de una vez, igual que soltándolos**: el modelo y su levantamiento se
                // eligen juntos, y las dos puertas tienen que hacer lo mismo o una miente.
                multiple
                className="hidden"
                disabled={status.kind !== "ready"}
                onChange={(event) => {
                  const files = event.target.files;
                  if (files !== null && files.length > 0) void openFiles(files);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        }
        collapsed={ribbonCollapsed}
        onToggleCollapse={() => setRibbonCollapsed((actual) => !actual)}
        tab={tab}
        // **Lo que habilita la cámara es que haya algo en la escena, no que haya un modelo.** Con
        // un DXF solo, el cubo de vistas movía la cámara —`frameAll` cuenta los planos— y los
        // botones de encuadre, vista, proyección y navegación de al lado estaban grises.
        // **Y la nube también cuenta, que es la tercera vez que este mismo hueco aparece.** Con
        // solo un levantamiento abierto, medido: **los quince botones de la pestaña Vista
        // apagados y ninguno vivo**. La nube es una fuente de la escena como el modelo y el plano,
        // y en obra **llega antes que el IFC** — se vuela y se mide lo construido semanas antes de
        // que exista el modelo de esa etapa. Con la puerta cerrada así, el levantamiento se abría
        // para mirarlo y nada más.
        enabled={models.length > 0 || plans.length > 0 || nube !== null}
        // **La misma condición que la puerta de entrada del lienzo, y tiene que serlo**: son las
        // dos mitades de la misma pantalla vacía. Si discreparan, se vería la cinta ofreciendo
        // «Empezar» con un modelo delante, o treinta y seis botones grises sobre el lienzo vacío.
        vacio={models.length === 0 && plans.length === 0 && nube === null}
        onDelRegistro={() => irASeccion("registro")}
        onAbrirDelDisco={() => entradaDeArchivo.current?.click()}
        hasModels={models.length > 0}
        projection={projection}
        navigation={navigation}
        style={style}
        measureMode={measureMode}
        snapMode={snapMode}
        distanceMode={distanceMode}
        hasSections={hasSections}
        hasSelection={selected !== null}
        selectionVisible={selectionVisible}
        isolated={isolated}
        hasHidden={hasHidden}
        hasPlans={plans.length > 0}
        modo2D={modo2D}
        onModo2D={onModo2D}
        gridAxisCount={models.reduce((total, modelo) => total + modelo.gridAxes.length, 0)}
        gridVisible={gridVisible}
        onGridVisible={(visible) => {
          setGridVisible(visible);
          void viewer.current?.setGridVisible(visible);
        }}
        planSnap={planSnap}
        onPlanSnap={(activo) => {
          setPlanSnap(activo);
          viewer.current?.setPlanSnapEnabled(activo);
        }}
        measurementCount={measurementCount}
        measureInProgress={measureMode !== null && measurePoints > 0}
        onTab={setTab}
        onToggleSelectionVisible={onToggleSelectionVisible}
        onIsolateSelection={onIsolateSelection}
        onUndoIsolate={onUndoIsolate}
        onFrameAll={() => {
          setStandardView("iso");
          void viewer.current?.frameAll();
        }}
        onView={(view: StandardView) => {
          setStandardView(view);
          void viewer.current?.frameAll(view);
        }}
        onFrameSelection={() => void viewer.current?.frameSelection()}
        onProjection={onProjection}
        onNavigation={onNavigation}
        onStyle={onStyle}
        onMeasureMode={onMeasureMode}
        onSnapMode={onSnapMode}
        onDistanceMode={onDistanceMode}
        onFinishMeasurement={() => viewer.current?.finishMeasurement()}
        onCancelMeasurement={onCancelMeasurement}
        onClearMeasurements={onClearMeasurements}
        onSection={onSection}
        onClearSections={onClearSections}
        onShowAll={onShowAll}
        onTogglePanel={(lado) => {
          if (lado === "izquierda") setPanelIzquierdo((actual) => !actual);
          else setNavegadorPlegado((actual) => !actual);
        }}
        panelIzquierdo={panelIzquierdo}
        panelDerecho={!navegadorPlegado}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {panelIzquierdo && (
          // **Los paneles ceden antes que el modelo.** Con `shrink-0` y una ventana estrecha —412 px
          // en una prueba— los dos paneles se comían el ancho entero y el lienzo quedaba en cero: el
          // modelo desaparecía sin explicación. Ahora se encogen y el lienzo tiene mínimo garantizado.
          <aside
            style={{ width: anchoIzquierdo }}
            className="min-w-0 shrink border-r border-borde bg-surface"
          >
            {/* Tres fichas para tres clases de selección, y el orden es el del clic: el modelo
                manda, el plano recoge lo que caiga fuera y la nube lo último. */}
            {selectedPlan !== null && selected === null ? (
              <Plan2DCard hit={selectedPlan} onClose={() => setSelectedPlan(null)} />
            ) : puntoDeNube !== null && selected === null ? (
              <PuntoDeNubeCard
                punto={puntoDeNube}
                onClose={() => setPuntoDeNube(null)}
                observar={sePuedeAnotarLaNube ? () => setNotaAbierta(true) : null}
                motivoSinObservar={motivoSinAnotarLaNube}
              />
            ) : (
              <PropertiesPanel
                item={selected}
                visible={selectionVisible}
                isolated={isolated}
                onClose={closeProperties}
                onToggleVisible={onToggleSelectionVisible}
                onIsolate={onIsolateSelection}
                onUndoIsolate={onUndoIsolate}
                observar={sePuedeAnotar ? () => setNotaAbierta(true) : null}
                motivoSinObservar={motivoSinAnotar}
              />
            )}
          </aside>
        )}

        {panelIzquierdo && (
          <Resizer
            orientacion="vertical"
            ayuda="Arrastra para cambiar el ancho del panel de propiedades"
            onArrastrar={(delta) =>
              setAnchoIzquierdo((actual) =>
                Math.min(ANCHO_PANEL.maximo, Math.max(ANCHO_PANEL.minimo, actual + delta)),
              )
            }
          />
        )}

        {/* El lienzo nunca baja de 240 px: es lo que impide que los paneles lo dejen en cero.

            **El arrastrar y soltar vive acá y no en el lienzo de dentro.** La puerta de entrada
            ocupa el centro, y aunque su contenedor es `pointer-events-none` —así que la mayor parte
            de ella deja pasar la suelta al lienzo de detrás— **sus dos botones no**: son
            `pointer-events-auto` para poder pulsarlos, y soltar un archivo justo encima de «Del
            registro» caía en el botón, que está fuera del `canvasHost`. Medido: el objetivo de la
            suelta era `BUTTON` y `closest("canvas")` daba `null`. Y ahí es donde uno suelta, porque
            es lo único que se ve. Colgado del contenedor, cualquier sitio del centro sirve —
            también el cubo de vistas y las tarjetas flotantes, que tienen sus propios eventos. */}
        <div
          className="relative flex min-h-0 min-w-[240px] flex-1 shrink-0"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div
            ref={canvasHost}
            // El cursor dice qué va a hacer el próximo clic: la cruz de precisión mientras se mide
            // y la mano cuando se selecciona. Sin esa señal, los dos modos se ven igual.
            className={[
              "min-h-0 min-w-0 flex-1",
              models.length === 0
                ? ""
                : measureMode !== null
                  ? "cursor-crosshair"
                  : "cursor-pointer",
            ].join(" ")}
            onPointerDown={(event) => {
              pressPoint.current = { x: event.clientX, y: event.clientY };
              // Orbitar deja de ser una vista normalizada: el cubo no debe seguir diciendo
              // "Planta" con la cámara en cualquier otro sitio.
              setStandardView(null);
            }}
            onClick={(event) => void onCanvasClick(event)}
            onDoubleClick={onCanvasDoubleClick}
          />

          {/* **La tarjeta de nota, encima del modelo.** Va acá —dentro del contenedor del lienzo—
              y no en un panel, porque el punto entero es no dejar de ver lo que se está
              describiendo. Se arrastra por su cabecera para destapar justo lo que hace falta. */}
          {/* **Un ancla o la otra, y la misma tarjeta.** Dejar una nota es el mismo gesto sobre un
              elemento del modelo y sobre un punto del levantamiento; lo único que cambia es de qué
              cuelga, así que no hay dos tarjetas. */}
          {notaAbierta && (selected !== null || puntoDeNube !== null) && origen !== null && (
            <NotaFlotante
              item={selected}
              punto={selected === null ? (puntoDeNube?.archivo ?? null) : null}
              descripcionInicial={borradorDeDesviacion}
              revisionId={origen.revisionId}
              camaraDeAhora={() => viewer.current?.cameraState ?? null}
              visibilidadDeAhora={async () =>
                (await viewer.current?.captureVisibilityBcf()) ?? null
              }
              fotoDeAhora={() => viewer.current?.capturarImagen() ?? null}
              marcadoDeAhora={() => viewer.current?.capturarMarcadoBcf() ?? []}
              onCerrar={() => setNotaAbierta(false)}
              onGuardada={() => setNotasGuardadas((cuantas) => cuantas + 1)}
            />
          )}

          {/* **El cuadro, encima del modelo y no en el panel.** Un cuadro de perfiles de acero
              trae veinticuatro columnas y el panel de la derecha mide unos 320 px: ahí dentro no es
              una tabla, es una lista de celdas cortadas. Mismo reparto que la nota flotante. */}
          {cuadro !== null && (
            <CuadroFlotante
              cuadro={cuadro}
              onCerrar={() => setCuadro(null)}
              onDescargar={() => onDescargarCuadro(cuadro)}
              onIrAlElemento={onIrAlElementoDelCuadro}
            />
          )}

          <ViewCube
            view={standardView}
            disabled={models.length === 0 && plans.length === 0 && nube === null}
            onView={(view) => {
              setStandardView(view);
              void viewer.current?.frameAll(view);
            }}
          />

          {/*
           * **El recuadro de la suelta va en la marca y a opacidad entera**, y las dos cosas son
           * medidas. Llevaba `border-accent/70`, y `--color-accent` **sí cambia con el tema**: en
           * claro es `#5b3a9e`, que sobre el fondo del lienzo —`#202932`, y el lienzo es oscuro en
           * los dos temas— da **1,79:1**. O sea que la única señal de que la suelta va a entrar
           * era invisible justo mientras se arrastra el archivo.
           *
           * La marca no cambia con el tema y da **3,57:1**, que es lo que WCAG 1.4.11 pide de algo
           * que informa sin ser texto. Y el `/70` sobra: al 70 % ese mismo violeta se queda por
           * debajo de 3:1, así que la opacidad se comía el margen entero.
           */}
          {dragging && (
            <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-brand" />
          )}

          {/* **La nube cuenta como "hay algo abierto".** Sin ella en esta condición, el lienzo
              seguía diciendo «arrastra un IFC aquí» **por encima de la nube ya cargada** — se vio
              en la primera prueba de `F12.1`. Una pantalla que pide lo que ya tiene delante. */}
          {models.length === 0 &&
            plans.length === 0 &&
            nube === null &&
            status.kind !== "loading" && (
              <PuertaDeEntrada
                onDelRegistro={() => irASeccion("registro")}
                onAbrirDelDisco={() => entradaDeArchivo.current?.click()}
                deshabilitado={status.kind !== "ready"}
              />
            )}
        </div>

        {/* Plegado no hay ancho que arrastrar: el rail mide lo que mide un icono con su área de
            toque, y estirarlo no enseñaría nada más. */}
        {!navegadorPlegado && (
          <Resizer
            orientacion="vertical"
            ayuda="Arrastra para cambiar el ancho del navegador"
            // Este tirador está a la **izquierda** del panel: arrastrarlo hacia la izquierda lo
            // agranda, y por eso el incremento va restado.
            onArrastrar={(delta) =>
              setAnchoDerecho((actual) =>
                Math.min(ANCHO_PANEL.maximo, Math.max(ANCHO_PANEL.minimo, actual - delta)),
              )
            }
          />
        )}

        {/* **El navegador está siempre**, plegado a rail o desplegado. La diferencia con el panel
            de la izquierda es el motivo: ahí lo que se enseña depende de que haya algo
            seleccionado, así que esconderlo no pierde nada; acá es el contenido del proyecto, y sin
            él la pantalla deja de decir qué hay abierto. */}
        <aside
          style={navegadorPlegado ? undefined : { width: anchoDerecho }}
          className={[
            "min-w-0 border-l border-borde bg-surface",
            navegadorPlegado ? "shrink-0" : "shrink",
          ].join(" ")}
        >
          <ProjectBrowser
            plegado={navegadorPlegado}
            onDesplegarEn={irASeccion}
            pedida={seccionPedida}
            // **Lo que un enlace compartido no puede traer.** Las tres piden sesión: el selector
            // del registro, las observaciones de la obra y sus vistas guardadas. Sin ocultarlas,
            // las tres contestarían 401 y quien viene de fuera vería tres secciones rotas en vez
            // de un modelo. Ver `compartido.ts`.
            ocultas={compartido !== null ? ["registro", "coordinacion", "vistas-proyecto"] : []}
            registro={
              <Selector
                onAbrir={(revisionId) => void abrirRevision(revisionId)}
                // Abrir dos modelos a la vez los cruza en el mismo worker: mientras carga uno,
                // el resto de la lista no acepta clics.
                deshabilitado={status.kind === "loading"}
              />
            }
            coordinacion={
              <Coordinacion
                proyectoId={origen?.proyectoId ?? null}
                onAbrir={onAbrirObservacion}
                recargar={notasGuardadas}
                sePuedeAnotar={sePuedeAnotar}
                // Solo lo que hace falta para señalar en un plano: el GUID y el título. Pasar la
                // observación entera acoplaría el generador de planos a la forma de la API.
                onCargadas={(lista) =>
                  setHallazgosDelModelo(
                    lista.map((una) => ({ guid: una.guid, titulo: una.titulo })),
                  )
                }
              />
            }
            modelCount={models.length}
            hayNube={nube !== null}
            planCount={plans.length}
            drawingCount={drawings.length}
            generados={
              <DrawingsPanel
                drawings={drawings}
                hidden={hiddenDrawings}
                onLaminaPdf={(id) => void onLaminaPdf(id)}
                onAddTable={onPonerCuadroEnPlano}
                cuadroCargado={cuadro?.category ?? null}
                onAddDimensions={onAcotarPlano}
                // **Se cuenta de `drawn` y no se le pregunta al visor**: `drawn` es el estado de
                // React, así que el botón aparece y desaparece al medir sin depender de que algo
                // fuerce un redibujado. Solo las de distancia encendidas, que son las que se
                // pueden llevar a un plano.
                cotasDisponibles={
                  drawn.filter((una) => una.visible && una.kind === "distance").length
                }
                anotado={anotado}
                onAddCallouts={(id) => void onSenalarHallazgos(id)}
                hallazgosDisponibles={hallazgosDelModelo.length}
                llamadasPuestas={llamadasPuestas}
                generating={generating}
                onGenerate={(vista) => void onGenerateDrawing(vista)}
                onCancel={() => setGenerating(null)}
                onToggle={(id, visible) => {
                  setHiddenDrawings((actual) => {
                    const siguiente = new Set(actual);
                    if (visible) siguiente.delete(id);
                    else siguiente.add(id);
                    return siguiente;
                  });
                  void viewer.current?.setDrawingVisible(id, visible);
                }}
                onToggleHidden={(id, visible) =>
                  void viewer.current?.setDrawingHiddenVisible(id, visible)
                }
                onExport={onExportDrawing}
                onClose={(id) => {
                  setDrawings((actuales) => actuales.filter((uno) => uno.id !== id));
                  void viewer.current?.removeDrawing(id);
                }}
              />
            }
            cotas={drawn}
            vistas={views}
            vistasDelProyecto={
              <VistasCompartidas
                proyectoId={origen?.proyectoId ?? null}
                onCapturar={async (nombre) =>
                  (await viewer.current?.captureVistaCompartida(nombre)) ?? null
                }
                onAplicar={async (vista) => {
                  await viewer.current?.applyVistaCompartida(vista);
                  // Una vista compartida puede traer medio modelo apagado, y la barra de estado
                  // tiene que ofrecer la vuelta: es el mismo estado que anota `F4.7` al abrir una
                  // observación.
                  setVisibilidadDeObservacion(vista.visibilidad !== null);
                  setHasSections(vista.cortes.length > 0);
                }}
              />
            }
            puedeGuardarVista={models.length > 0}
            onToggleMeasurement={onToggleMeasurement}
            onDeleteMeasurement={onDeleteMeasurement}
            onSaveView={onSaveView}
            onApplyView={onApplyView}
            onDeleteView={onDeleteView}
            estructura={
              orderedTrees.length === 0 ? (
                // **El estado vacío dice cómo llenarse.** `F9.5`: decir solo «no hay nada» deja a
                // alguien buscando la puerta, y esto es lo primero que se ve al abrir el visor.
                <p className="p-3 text-xs leading-snug text-fg-3">
                  Todavía no hay ningún modelo abierto.{" "}
                  <span className="text-fg-2">
                    Arrastra un IFC aquí, usa <strong>Abrir</strong> arriba, o saca uno de{" "}
                    <strong>Del registro</strong>.
                  </span>
                </p>
              ) : (
                <SpatialTree
                  trees={orderedTrees}
                  hidden={hidden}
                  onIsolate={onIsolateNode}
                  onToggleVisible={onToggleVisible}
                />
              )
            }
            calce={
              <CalcePanel
                hayNube={nube !== null}
                hayModelo={models.length > 0}
                elementoSeleccionado={
                  selected?.guid != null
                    ? (selected.name ?? selected.category ?? "el elemento")
                    : null
                }
                calce={calce}
                medicion={medicion}
                pares={pares.length}
                paso={pasoDelCalce}
                residuo={
                  calceDePares === null
                    ? null
                    : {
                        medio: calceDePares.residuo.medio,
                        maximo: calceDePares.residuo.maximo,
                        peor: calceDePares.residuo.peor,
                      }
                }
                giroIndeterminado={calceDePares?.giroIndeterminado ?? false}
                onSenalar={() => setPasoDelCalce("modelo")}
                onParar={() => setPasoDelCalce("apagado")}
                onQuitarPar={quitarUltimoPar}
                onAplicarPares={aplicarCalceDePares}
                onCalzarAuto={() => void calzarAutomaticamente()}
                onMedir={(t: number) => void medirDesviacionDelElemento(t)}
                onObservar={() => setNotaAbierta(true)}
              />
            }
            nubes={
              <NubesPanel
                ficha={nube}
                informe={nubeInforme}
                puntos={nubePuntos}
                color={nubeColor}
                avisoDeColor={nubeAvisoDeColor}
                tamanoDePunto={nubeTamano}
                recortada={nubeRecortada}
                onAbrir={() => entradaDeArchivo.current?.click()}
                onColor={colorearNube}
                onTamano={tamanoDeNube}
                onDensidad={densidadDeNube}
                onRecorte={recortarNubeAlModelo}
                onEncuadrar={encuadrarNube}
                onCerrar={cerrarNube}
              />
            }
            cuadros={
              <CuadrosPanel
                models={models}
                cargarCategorias={onCategorias}
                cargarCuadro={onCuadro}
                onVerTabla={setCuadro}
                onDescargar={onDescargarCuadro}
              />
            }
            planos={
              <PlansPanel
                plans={plans}
                hiddenPlans={hiddenPlans}
                hiddenLayers={hiddenPlanLayers}
                aligningPlanId={aligning?.planId ?? null}
                onLabelHeight={(id, metros) => void viewer.current?.setPlanLabelHeight(id, metros)}
                onSectionAtPlan={(_id, alturaM) => {
                  setHasSections(true);
                  void viewer.current?.sectionAtHeight(alturaM);
                }}
                onAlign={(id, ajustarEscala) => {
                  const plan = plans.find((uno) => uno.id === id);
                  if (plan === undefined) return;
                  // Calzar y medir a la vez no tiene sentido y se pisarían los clics.
                  onMeasureMode(null);
                  setAligning({
                    planId: id,
                    planName: plan.name,
                    points: [],
                    adjustScale: ajustarEscala,
                  });
                }}
                onTogglePlan={onTogglePlan}
                onToggleLayer={onTogglePlanLayer}
                onTransform={onPlanTransform}
                onFrame={(id) => {
                  setStandardView("top");
                  viewer.current?.framePlan(id, "top");
                }}
                onClose={onClosePlan}
              />
            }
            modelos={
              models.length === 0 ? (
                <p className="p-3 text-xs leading-snug text-fg-3">
                  Ninguno.{" "}
                  <span className="text-fg-2">
                    Con dos modelos abiertos, esta lista es donde se apaga uno para mirar el otro —
                    que es en lo que consiste coordinar.
                  </span>
                </p>
              ) : (
                <ModelsPanel
                  models={models}
                  hidden={hiddenModels}
                  onToggleVisible={onToggleModel}
                  onMove={onMoveModel}
                  onClose={onCloseModel}
                />
              )
            }
          />
        </aside>
      </div>

      <StatusBar
        measureMode={measureMode}
        measurePoints={measurePoints}
        measureMissed={measureMissed}
        measurement={measurement}
        selected={selected}
        modelCount={models.length}
        measurementCount={measurementCount}
        isolated={isolated}
        hasHidden={hasHidden}
        aligning={
          aligning === null ? null : { planName: aligning.planName, placed: aligning.points.length }
        }
        onUndoIsolate={onUndoIsolate}
        onShowAll={onShowAll}
      />
    </div>
  );
}

function StatusBadge({ status }: { readonly status: Status }) {
  if (status.kind === "starting") {
    return <span className="text-xs text-fg-2">Iniciando visor…</span>;
  }
  if (status.kind === "loading") {
    return (
      <span className="text-xs text-accent" title={`${status.name}: ${ETAPAS[status.stage]}`}>
        {status.name} — {ETAPAS[status.stage]}…
      </span>
    );
  }
  if (status.kind === "error") {
    return (
      <span className="max-w-md truncate text-xs text-danger" title={status.message}>
        {status.message}
      </span>
    );
  }
  return <span className="text-xs text-fg-3">Listo</span>;
}

/** Mensaje legible sin exponer la traza cruda. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido al abrir el modelo";
}
