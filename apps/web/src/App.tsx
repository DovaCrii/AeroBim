import {
  BimViewer,
  type LoadedModel,
  type Measurement,
  type ModelTree,
  type NavigationMode,
  type PickedItem,
  type Projection,
  type RenderStyle,
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

export function App() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<BimViewer | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [models, setModels] = useState<readonly LoadedModel[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<PickedItem | null>(null);
  const [trees, setTrees] = useState<readonly ModelTree[]>([]);
  const [projection, setProjection] = useState<Projection>("Perspective");
  const [navigation, setNavigation] = useState<NavigationMode>("Orbit");
  const [style, setStyle] = useState<RenderStyle>("solid");
  const [measuring, setMeasuring] = useState(false);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

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

      try {
        if (measuring) {
          // Devuelve `null` mientras espera el segundo punto, o si el clic cayó al vacío.
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
    [measuring],
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

  const onToggleMeasure = useCallback(() => {
    setMeasuring((activo) => {
      const siguiente = !activo;
      if (!siguiente) {
        // Al salir del modo se limpia: una cota abandonada a medias solo estorba.
        viewer.current?.resetMeasurement();
        setMeasurement(null);
      }
      return siguiente;
    });
  }, []);

  const closeProperties = useCallback(() => {
    setSelected(null);
    void viewer.current?.clearSelection();
  }, []);

  const onIsolate = useCallback((modelId: string, localIds: readonly number[]) => {
    void viewer.current?.isolate(modelId, localIds);
  }, []);

  const onToggleVisible = useCallback(
    (modelId: string, localIds: readonly number[], visible: boolean) => {
      void viewer.current?.setVisible(modelId, localIds, visible);
    },
    [],
  );

  const onShowAll = useCallback(() => {
    void viewer.current?.showAll();
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
            onIsolate={onIsolate}
            onToggleVisible={onToggleVisible}
            onShowAll={onShowAll}
          />
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1">
          <div
            ref={canvasHost}
            className="min-h-0 min-w-0 flex-1"
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
              {measuring
                ? measurement !== null
                  ? `Distancia: ${measurement.distanceM.toFixed(3)} m — clic para medir de nuevo`
                  : "Clic en dos puntos del modelo para medir"
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
              measuring={measuring}
              onProjection={onProjection}
              onNavigation={onNavigation}
              onStyle={onStyle}
              onToggleMeasure={onToggleMeasure}
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

/** Mensaje legible sin exponer la traza cruda. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido al abrir el modelo";
}
