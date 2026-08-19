import { BimViewer, type LoadedModel } from "@aerobim/viewer";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetricsPanel } from "./components/MetricsPanel.js";

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
      setStatus({ kind: "ready" });
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

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <img src="/aerobim-mark.svg" alt="" className="h-8 w-auto" />
        <div>
          <h1 className="text-sm font-semibold">AeroBim</h1>
          <p className="text-xs text-white/50">Visor IFC · prueba de concepto (F0.4)</p>
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

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={canvasHost}
          className="min-h-0 flex-1"
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

        {models.length > 0 && <MetricsPanel models={models} />}
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
