import {
  BimViewer,
  type LoadedModel,
  type MeasureMode,
  type Measurement,
  type ModelTree,
  type NavigationMode,
  type PickedItem,
  type Projection,
  type RenderStyle,
  type SectionAxis,
  type SpatialNode,
} from "@aerobim/viewer";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetricsPanel } from "./components/MetricsPanel.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { SpatialTree } from "./components/SpatialTree.js";
import { ViewToolbar } from "./components/ViewToolbar.js";

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
 */
const CLICK_TOLERANCE_PX = 4;

export function App() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<BimViewer | null>(null);
  /** Dónde se pulsó el ratón, para distinguir un clic de un arrastre de cámara. */
  const pressPoint = useRef<{ x: number; y: number } | null>(null);
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
  const [hasSections, setHasSections] = useState(false);
  /** Nodos del árbol ocultos, por clave. El árbol los lee para dibujar su icono. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    let cancelled = false;

    BimViewer.create(host)
      .then((instance) => {
        if (cancelled) return;
        viewer.current = instance;
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

      try {
        if (measureMode !== null) {
          // Devuelve `null` mientras faltan puntos, o si el clic cayó al vacío.
          const resultado = await instance.addMeasurePoint(event.clientX, event.clientY);
          if (resultado !== null) setMeasurement(resultado);
          return;
        }

        // Un clic al vacío devuelve `null`, que es la mitad de los clics en un visor y no es
        // un error: simplemente deselecciona.
        const item = await instance.pickAt(event.clientX, event.clientY);
        setSelected(item);
        if (item === null) await instance.clearSelection();
      } catch (error: unknown) {
        setStatus({ kind: "error", message: describe(error) });
      }
    },
    [measureMode],
  );

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
    // Cambiar de modo descarta lo anterior: una cota a medias solo estorba, y mezclar
    // puntos de una distancia con los de un área da un número sin sentido.
    setMeasurement(null);
    viewer.current?.setMeasureMode(mode);
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
    void viewer.current?.showAll();
  }, []);

  const onIsolateNode = useCallback((modelId: string, localIds: readonly number[]) => {
    // Aislar deja todo lo demás oculto, así que los iconos del árbol dejarían de decir la
    // verdad. Se limpian: el estado que se muestra es "nada oculto a mano".
    setHidden(new Set());
    void viewer.current?.isolate(modelId, localIds);
  }, []);

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

          {models.length > 0 && (
            <button
              type="button"
              onClick={() => void viewer.current?.frameAll()}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Encuadrar
            </button>
          )}

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
        {trees.length > 0 && (
          <SpatialTree
            trees={trees}
            hidden={hidden}
            onIsolate={onIsolateNode}
            onToggleVisible={onToggleVisible}
            onShowAll={onShowAll}
          />
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div
            ref={canvasHost}
            className="min-h-0 min-w-0 flex-1"
            onPointerDown={(event) => {
              pressPoint.current = { x: event.clientX, y: event.clientY };
            }}
            onClick={(event) => void onCanvasClick(event)}
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
            <p className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
              {measureMode !== null
                ? describeMeasurement(measureMode, measurement)
                : selected === null
                  ? "Haz clic en un elemento para ver sus propiedades"
                  : ""}
            </p>
          )}

          {selected !== null && <PropertiesPanel item={selected} onClose={closeProperties} />}

          {models.length > 0 && <MetricsPanel models={models} />}

          {models.length > 0 && (
            <ViewToolbar
              projection={projection}
              navigation={navigation}
              style={style}
              measureMode={measureMode}
              hasSections={hasSections}
              onProjection={onProjection}
              onNavigation={onNavigation}
              onStyle={onStyle}
              onMeasureMode={onMeasureMode}
              onSection={onSection}
              onClearSections={onClearSections}
            />
          )}
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
 * Qué decir según el modo de medición y lo que haya medido.
 *
 * El texto también instruye: dice cuántos puntos faltan, porque un modo de medición sin
 * indicación deja al usuario haciendo clics sin saber por qué no pasa nada.
 */
function describeMeasurement(mode: MeasureMode, measurement: Measurement | null): string {
  if (measurement === null) {
    if (mode === "distance") return "Clic en dos puntos del modelo";
    if (mode === "angle") return "Clic en tres puntos — el segundo es el vértice";
    return "Clic en el contorno; desde el tercer punto se muestra el área";
  }

  if (measurement.mode === "distance") {
    return `Distancia: ${measurement.distanceM.toFixed(3)} m — clic para medir de nuevo`;
  }
  if (measurement.mode === "angle") {
    return `Ángulo: ${measurement.angleDeg.toFixed(1)}° — clic para medir de nuevo`;
  }
  return (
    `Área: ${measurement.areaM2.toFixed(2)} m² · perímetro ${measurement.perimeterM.toFixed(2)} m ` +
    `(${measurement.points.length} vértices) — sigue clicando para ampliar`
  );
}

/** Mensaje legible sin exponer la traza cruda. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido al abrir el modelo";
}
