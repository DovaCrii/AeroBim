import {
  BimViewer,
  type DistanceMode,
  type DrawnMeasurement,
  type LoadedModel,
  type MeasureMode,
  type Measurement,
  type ModelTree,
  type NavigationMode,
  type PickedItem,
  type Projection,
  type RenderStyle,
  type SectionAxis,
  type SnapMode,
  type SpatialNode,
  type StandardView,
} from "@aerobim/viewer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModelsPanel } from "./components/ModelsPanel.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { SpatialTree } from "./components/SpatialTree.js";
import { ToolPanel, ToolRail, type PanelId } from "./components/ToolRail.js";

type Status =
  | { readonly kind: "starting" }
  | { readonly kind: "ready" }
  | { readonly kind: "loading"; readonly name: string }
  | { readonly kind: "error"; readonly message: string };

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
   * Qué muestra el panel lateral, o `null` si está cerrado.
   *
   * **Uno a la vez, y en el mismo sitio.** Antes el árbol ocupaba una columna fija y los modelos
   * flotaban sobre la esquina del modelo; entre los dos se comían un tercio de la pantalla incluso
   * cuando no se estaban usando.
   */
  const [panel, setPanel] = useState<PanelId | null>(null);
  /** `true` cuando la columna de herramientas muestra el nombre de cada una, no solo el icono. */
  const [railExpanded, setRailExpanded] = useState(false);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    let cancelled = false;
    let desuscribir: (() => void) | null = null;

    BimViewer.create(host)
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

  const openIfc = useCallback(async (file: File) => {
    const instance = viewer.current;
    if (!instance) return;

    setStatus({ kind: "loading", name: file.name });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await instance.loadIfc(bytes, file.name);
      setModels((current) => [...current, loaded]);
      setTrees(await instance.getSpatialTrees());
      setStatus({ kind: "ready" });
      // Al abrir el primer modelo se muestra su estructura: es lo primero que alguien quiere
      // recorrer, y deja a la vista que el panel lateral existe.
      setPanel((actual) => actual ?? "structure");

      // El árbol aparece recién ahora y estrecha el lienzo, así que el encuadre que hizo
      // `loadIfc` se queda corto y el modelo sale cortado. Se reencuadra una vez que el
      // navegador ya aplicó el nuevo ancho.
      requestAnimationFrame(() => void instance.frameAll());
    } catch (error: unknown) {
      setStatus({ kind: "error", message: describe(error) });
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files.item(0);
      if (file) void openIfc(file);
    },
    [openIfc],
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
        if (measureMode !== null) {
          // El punto lo pone el medidor donde tenga el cursor ajustado, que es el que se está
          // viendo marcado en pantalla.
          await instance.addMeasurePoint();
          setMeasurePoints((actual) => actual + 1);
          return;
        }

        // Un clic al vacío devuelve `null`, que es la mitad de los clics en un visor y no es
        // un error: simplemente deselecciona.
        const item = await instance.pickAt(event.clientX, event.clientY);
        setSelected(item);
        if (item === null) await instance.clearSelection();
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      } finally {
        clickInFlight.current = false;
      }
    },
    [measureMode],
  );

  /** Doble clic: cierra el contorno si se está midiendo un área, y si no encuadra el elemento. */
  const onCanvasDoubleClick = useCallback(() => {
    const instance = viewer.current;
    if (!instance) return;

    if (measureMode === "area") instance.finishMeasurement();
    else void instance.frameSelection();
  }, [measureMode]);

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

  const onShowAll = useCallback(() => {
    setHidden(new Set());
    setHiddenModels(new Set());
    void viewer.current?.showAll();
  }, []);

  const onIsolateNode = useCallback((modelId: string, localIds: readonly number[]) => {
    // Aislar deja todo lo demás oculto, así que los iconos del árbol y los del panel de
    // modelos dejarían de decir la verdad. Se limpian: el estado que se muestra es "nada
    // oculto a mano".
    setHidden(new Set());
    setHiddenModels(new Set());
    void viewer.current?.isolate(modelId, localIds);
  }, []);

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
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <img src="/aerobim-mark.svg" alt="" className="h-8 w-auto" />
        <div>
          <h1 className="text-sm font-semibold">AeroBim</h1>
          <p className="text-xs text-white/50">Visor y coordinador BIM</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <StatusBadge status={status} />

          <label className="cursor-pointer rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            Abrir IFC
            <input
              type="file"
              accept=".ifc"
              className="hidden"
              disabled={status.kind !== "ready"}
              onChange={(event) => {
                const file = event.target.files?.item(0);
                if (file) void openIfc(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ToolRail
          enabled={models.length > 0}
          active={panel}
          expanded={railExpanded}
          projection={projection}
          navigation={navigation}
          style={style}
          measureMode={measureMode}
          hasSections={hasSections}
          hasModels={models.length > 0}
          measurementCount={measurementCount}
          // Pulsar la herramienta abierta cierra el panel: es la forma de recuperar la pantalla
          // entera sin buscar un botón de cerrar.
          onSelect={(siguiente) => setPanel((actual) => (actual === siguiente ? null : siguiente))}
          onToggleExpanded={() => setRailExpanded((actual) => !actual)}
          onFrameAll={() => void viewer.current?.frameAll()}
        />

        {panel !== null && (
          <aside className="w-72 shrink-0 border-r border-white/10 bg-ink/60">
            {panel === "structure" ? (
              <SpatialTree
                trees={orderedTrees}
                hidden={hidden}
                onIsolate={onIsolateNode}
                onToggleVisible={onToggleVisible}
                onShowAll={onShowAll}
              />
            ) : panel === "models" ? (
              <ModelsPanel
                models={models}
                hidden={hiddenModels}
                onToggleVisible={onToggleModel}
                onMove={onMoveModel}
                onClose={onCloseModel}
              />
            ) : (
              <ToolPanel
                panel={panel}
                projection={projection}
                navigation={navigation}
                style={style}
                measureMode={measureMode}
                snapMode={snapMode}
                distanceMode={distanceMode}
                drawn={drawn}
                hasSections={hasSections}
                hasSelection={selected !== null}
                onView={(view: StandardView) => void viewer.current?.frameAll(view)}
                onFrameSelection={() => void viewer.current?.frameSelection()}
                onProjection={onProjection}
                onNavigation={onNavigation}
                onStyle={onStyle}
                onMeasureMode={onMeasureMode}
                onSnapMode={onSnapMode}
                onDistanceMode={onDistanceMode}
                onToggleMeasurement={onToggleMeasurement}
                onDeleteMeasurement={onDeleteMeasurement}
                onSection={onSection}
                onClearSections={onClearSections}
                onFinishMeasurement={() => viewer.current?.finishMeasurement()}
                onClearMeasurements={onClearMeasurements}
              />
            )}
          </aside>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1">
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

          {dragging && (
            <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-brand/70" />
          )}

          {models.length === 0 && status.kind !== "loading" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-white/40">
                Arrastra un archivo IFC aqui, o usa <span className="text-white/70">Abrir IFC</span>
              </p>
            </div>
          )}

          {models.length > 0 && (
            <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
              {measureMode !== null ? (
                <MeasureHud mode={measureMode} points={measurePoints} measurement={measurement} />
              ) : (
                <p className="rounded-md bg-ink/80 px-2.5 py-1 text-xs text-white/60">
                  {selected === null
                    ? "Clic en un elemento para ver sus propiedades · doble clic para acercarse"
                    : `Seleccionado: ${selected.category ?? "elemento"}${
                        selected.name === null ? "" : ` · ${selected.name}`
                      } — doble clic para encuadrarlo`}
                </p>
              )}
            </div>
          )}

          {selected !== null && <PropertiesPanel item={selected} onClose={closeProperties} />}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: Status }) {
  if (status.kind === "starting") {
    return <span className="text-xs text-white/50">Iniciando visor…</span>;
  }
  if (status.kind === "loading") {
    return <span className="text-xs text-brand">Convirtiendo {status.name}…</span>;
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

/**
 * El aviso de la medición: qué falta para completarla, y el resultado cuando ya está.
 *
 * **Las tres distancias van separadas y con su nombre.** Entre dos puntos de una rampa la directa,
 * la de planta y el desnivel son tres números distintos, y en obra se usa uno o otro según para
 * qué: la horizontal para replantear, el desnivel para una cota. Un solo número obliga a adivinar
 * cuál se está leyendo — ver `distancePartsM` en `bim-core`.
 */
function MeasureHud({
  mode,
  points,
  measurement,
}: {
  readonly mode: MeasureMode;
  readonly points: number;
  readonly measurement: Measurement | null;
}) {
  if (measurement === null) {
    return (
      <p className="rounded-md bg-ink/80 px-2.5 py-1 text-xs text-brand">
        {instruccion(mode, points)}
      </p>
    );
  }

  if (measurement.mode === "distance") {
    return (
      <div className="flex items-center gap-3 rounded-md bg-ink/85 px-3 py-1.5 text-xs">
        <Magnitud etiqueta="Directa" valor={`${measurement.distanceM.toFixed(3)} m`} destacada />
        <Magnitud etiqueta="En planta" valor={`${measurement.horizontalM.toFixed(3)} m`} />
        <Magnitud etiqueta="Desnivel" valor={`${measurement.verticalM.toFixed(3)} m`} />
        <span className="text-white/40">clic para medir de nuevo</span>
      </div>
    );
  }

  if (measurement.mode === "angle") {
    return (
      <div className="flex items-center gap-3 rounded-md bg-ink/85 px-3 py-1.5 text-xs">
        <Magnitud etiqueta="Ángulo" valor={`${measurement.angleDeg.toFixed(1)}°`} destacada />
        <span className="text-white/40">clic para medir de nuevo</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md bg-ink/85 px-3 py-1.5 text-xs">
      <Magnitud etiqueta="Área" valor={`${measurement.areaM2.toFixed(2)} m²`} destacada />
      <Magnitud etiqueta="Perímetro" valor={`${measurement.perimeterM.toFixed(2)} m`} />
      <Magnitud etiqueta="Vértices" valor={String(measurement.vertices)} />
    </div>
  );
}

/** Una magnitud con su nombre encima, para que no haya que deducir qué es cada número. */
function Magnitud({
  etiqueta,
  valor,
  destacada = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly destacada?: boolean;
}) {
  return (
    <span className="flex flex-col items-start leading-tight">
      <span className="text-[10px] tracking-wide text-white/40 uppercase">{etiqueta}</span>
      <span className={destacada ? "font-mono text-brand" : "font-mono text-white/80"}>
        {valor}
      </span>
    </span>
  );
}

/**
 * Qué falta para completar la medida.
 *
 * Cuenta los puntos ya puestos: un texto que no cambia después de cada clic no deja saber si el
 * clic entró, y eso es exactamente lo que hacía pensar que la medición no funcionaba.
 */
function instruccion(mode: MeasureMode, points: number): string {
  if (mode === "distance") {
    return points === 0 ? "Clic en el primer punto" : "Clic en el segundo punto";
  }
  if (mode === "angle") {
    if (points === 0) return "Clic en el primer punto";
    if (points === 1) return "Clic en el vértice del ángulo";
    return "Clic en el tercer punto";
  }
  if (points < 3) return `Contorno del área: ${points} de 3 puntos mínimos`;
  return `Contorno del área: ${points} puntos — Enter o doble clic para cerrarlo`;
}

/** Mensaje legible sin exponer la traza cruda. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido al abrir el modelo";
}
