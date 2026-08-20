import {
  BimViewer,
  type DistanceMode,
  type DrawnMeasurement,
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
  type RenderStyle,
  type SavedView,
  type SectionAxis,
  type SnapMode,
  type SpatialNode,
  type StandardView,
} from "@aerobim/viewer";
import { parseSavedViews } from "@aerobim/bim-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModelsPanel } from "./components/ModelsPanel.js";
import { PlansPanel } from "./components/PlansPanel.js";
import { ProjectBrowser } from "./components/ProjectBrowser.js";
import { Resizer } from "./components/Resizer.js";
import { Plan2DCard, PropertiesPanel } from "./components/PropertiesPanel.js";
import { Ribbon, type RibbonTab } from "./components/Ribbon.js";
import { SpatialTree } from "./components/SpatialTree.js";
import { StatusBar } from "./components/StatusBar.js";
import { ViewCube } from "./components/ViewCube.js";

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

/** Dónde se recuerdan los anchos de los paneles laterales. */
const CLAVE_PANELES = "aerobim.paneles.ancho.v1";

/** Cuánto puede medir un panel lateral: ni tan angosto que no quepa un nombre, ni media pantalla. */
const ANCHO_PANEL = { minimo: 200, maximo: 620 } as const;

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
  /** Las cotas dibujadas, para poder apagarlas o borrarlas una por una. */
  const [drawn, setDrawn] = useState<readonly DrawnMeasurement[]>([]);
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
   * `true` si medir se engancha a los trazos del plano.
   *
   * Encendido por defecto —es lo que hace útil medir sobre un plano—, y apagable porque midiendo el
   * modelo con un plano debajo, engancharse al CAD sin querer falsea la medida.
   */
  const [planSnap, setPlanSnap] = useState(true);
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
  const [panelDerecho, setPanelDerecho] = useState(true);
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
  const [anchoIzquierdo, setAnchoIzquierdo] = useState(() => leerAncho("izquierda", 288));
  const [anchoDerecho, setAnchoDerecho] = useState(() => leerAncho("derecha", 288));

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
    const host = canvasHost.current;
    if (!host) return;

    let cancelled = false;
    let desuscribir: (() => void) | null = null;

    BimViewer.create(host, { convertWorker: workerDeConversion() })
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
   * Abre un archivo, sea un modelo o un plano.
   *
   * **La extensión decide**, y acá es lo correcto: son dos formatos que no se parecen en nada y se
   * sueltan en el mismo sitio. Un `.dxf` entra como plano de referencia; cualquier otra cosa se
   * intenta como IFC, que es lo que la aplicación abre.
   */
  const openFile = useCallback(
    (file: File) => (file.name.toLowerCase().endsWith(".dxf") ? openDxf(file) : openIfc(file)),
    [openDxf, openIfc],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files.item(0);
      if (file) void openFile(file);
    },
    [openFile],
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
        setSelectedPlan(enPlano);
        setSelected(null);
        await instance.clearSelection();
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      } finally {
        clickInFlight.current = false;
      }
    },
    [measureMode, aligning],
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
      if (evento.key === "Enter") viewer.current?.finishMeasurement();
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
    hiddenPlanLayers.size > 0;

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
          <span className="flex items-center gap-2" title="AeroBim — visor y coordinador BIM">
            <img src="/aerobim-mark.svg" alt="" className="h-6 w-auto" />
            <span className="text-sm font-semibold">AeroBim</span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={status} />
            {/* **Abrir es uno solo para todo lo que la aplicación sabe leer.** Antes decía
                "Abrir IFC" y un plano no tenía por dónde entrar; ahora el mismo botón —y el mismo
                arrastrar y soltar— toma el modelo y el plano, y es la extensión la que decide. */}
            <label className="cursor-pointer rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90">
              Abrir
              <input
                type="file"
                accept=".ifc,.dxf"
                className="hidden"
                disabled={status.kind !== "ready"}
                onChange={(event) => {
                  const file = event.target.files?.item(0);
                  if (file) void openFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        }
        collapsed={ribbonCollapsed}
        onToggleCollapse={() => setRibbonCollapsed((actual) => !actual)}
        tab={tab}
        enabled={models.length > 0}
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
        planSnap={planSnap}
        onPlanSnap={(activo) => {
          setPlanSnap(activo);
          viewer.current?.setPlanSnapEnabled(activo);
        }}
        measurementCount={measurementCount}
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
        onClearMeasurements={onClearMeasurements}
        onSection={onSection}
        onClearSections={onClearSections}
        onShowAll={onShowAll}
        onTogglePanel={(lado) => {
          if (lado === "izquierda") setPanelIzquierdo((actual) => !actual);
          else setPanelDerecho((actual) => !actual);
        }}
        panelIzquierdo={panelIzquierdo}
        panelDerecho={panelDerecho}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {panelIzquierdo && (
          // **Los paneles ceden antes que el modelo.** Con `shrink-0` y una ventana estrecha —412 px
          // en una prueba— los dos paneles se comían el ancho entero y el lienzo quedaba en cero: el
          // modelo desaparecía sin explicación. Ahora se encogen y el lienzo tiene mínimo garantizado.
          <aside
            style={{ width: anchoIzquierdo }}
            className="min-w-0 shrink border-r border-white/10 bg-ink/50"
          >
            {selectedPlan !== null && selected === null ? (
              <Plan2DCard hit={selectedPlan} onClose={() => setSelectedPlan(null)} />
            ) : (
              <PropertiesPanel
                item={selected}
                visible={selectionVisible}
                isolated={isolated}
                onClose={closeProperties}
                onToggleVisible={onToggleSelectionVisible}
                onIsolate={onIsolateSelection}
                onUndoIsolate={onUndoIsolate}
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

        {/* El lienzo nunca baja de 240 px: es lo que impide que los paneles lo dejen en cero. */}
        <div className="relative flex min-h-0 min-w-[240px] flex-1 shrink-0">
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
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          />

          <ViewCube
            view={standardView}
            disabled={models.length === 0 && plans.length === 0}
            onView={(view) => {
              setStandardView(view);
              void viewer.current?.frameAll(view);
            }}
          />

          {dragging && (
            <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-brand/70" />
          )}

          {models.length === 0 && plans.length === 0 && status.kind !== "loading" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-white/40">
                Arrastra un <span className="text-white/70">IFC</span> o un{" "}
                <span className="text-white/70">DXF</span> aquí, o usa{" "}
                <span className="text-white/70">Abrir</span>
              </p>
            </div>
          )}
        </div>

        {panelDerecho && (
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

        {panelDerecho && (
          <aside
            style={{ width: anchoDerecho }}
            className="min-w-0 shrink border-l border-white/10 bg-ink/50"
          >
            <ProjectBrowser
              planCount={plans.length}
              cotas={drawn}
              vistas={views}
              puedeGuardarVista={models.length > 0}
              onToggleMeasurement={onToggleMeasurement}
              onDeleteMeasurement={onDeleteMeasurement}
              onSaveView={onSaveView}
              onApplyView={onApplyView}
              onDeleteView={onDeleteView}
              estructura={
                orderedTrees.length === 0 ? (
                  <p className="p-3 text-xs text-white/35">Todavía no hay ningún modelo abierto.</p>
                ) : (
                  <SpatialTree
                    trees={orderedTrees}
                    hidden={hidden}
                    onIsolate={onIsolateNode}
                    onToggleVisible={onToggleVisible}
                  />
                )
              }
              planos={
                <PlansPanel
                  plans={plans}
                  hiddenPlans={hiddenPlans}
                  hiddenLayers={hiddenPlanLayers}
                  aligningPlanId={aligning?.planId ?? null}
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
                  <p className="p-3 text-xs text-white/35">Ninguno.</p>
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
        )}
      </div>

      <StatusBar
        measureMode={measureMode}
        measurePoints={measurePoints}
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
    return <span className="text-xs text-white/50">Iniciando visor…</span>;
  }
  if (status.kind === "loading") {
    return (
      <span className="text-xs text-brand" title={`${status.name}: ${ETAPAS[status.stage]}`}>
        {status.name} — {ETAPAS[status.stage]}…
      </span>
    );
  }
  if (status.kind === "error") {
    return (
      <span className="max-w-md truncate text-xs text-red-400" title={status.message}>
        {status.message}
      </span>
    );
  }
  return <span className="text-xs text-white/40">Listo</span>;
}

/** Mensaje legible sin exponer la traza cruda. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido al abrir el modelo";
}
