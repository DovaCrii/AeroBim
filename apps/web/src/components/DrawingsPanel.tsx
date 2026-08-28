import type { GeneratedDrawing } from "@aerobim/viewer";
import { IconEye, IconEyeOff, IconX } from "./icons.js";

/**
 * Los planos generados **desde el modelo**, con su exportación.
 *
 * Es la otra mitad de la Fase 7: la de entrada trae el CAD que ya existe, esta saca del modelo un
 * dibujo que alguien pueda imprimir o seguir trabajando en su CAD. Por eso lo que manda en la ficha
 * es **el botón de exportar**: el plano se genera para salir del visor.
 */
export function DrawingsPanel({
  drawings,
  hidden,
  generating,
  onGenerate,
  onCancel,
  onToggle,
  onToggleHidden,
  onExport,
  onClose,
}: {
  readonly drawings: readonly GeneratedDrawing[];
  /** Planos apagados en la vista 3D, por identificador. */
  readonly hidden: ReadonlySet<string>;
  /** El aviso de avance mientras se proyecta, o `null` si no se está generando. */
  readonly generating: string | null;
  readonly onGenerate: (view: "plan" | "front" | "side") => void;
  /** Deja de esperar la proyección: la aplicación vuelve, el trabajo de fondo se abandona. */
  readonly onCancel: () => void;
  readonly onToggle: (id: string, visible: boolean) => void;
  readonly onToggleHidden: (id: string, visible: boolean) => void;
  readonly onExport: (id: string) => void;
  readonly onClose: (id: string) => void;
}) {
  return (
    <div className="p-1.5">
      {/* **Tres vistas y ninguna configuración de entrada.** Lo que entra en el plano es lo que
          está encendido en el modelo, que es la decisión que ya se toma para mirar: pedirla otra
          vez en un diálogo sería preguntar dos veces lo mismo. */}
      <div className="flex gap-1">
        {(
          [
            ["plan", "Planta"],
            ["front", "Frontal"],
            ["side", "Lateral"],
          ] as const
        ).map(([vista, nombre]) => (
          <button
            key={vista}
            type="button"
            onClick={() => onGenerate(vista)}
            disabled={generating !== null}
            className="flex-1 rounded bg-brand px-2 py-1 text-nota font-medium text-white hover:opacity-90 disabled:bg-white/10 disabled:text-white/30"
            title={`Proyecta lo que está a la vista y arma el plano de ${nombre.toLowerCase()}`}
          >
            {nombre}
          </button>
        ))}
      </div>

      {generating !== null && (
        // **Con salida.** Proyectar un modelo grande tarda, y si el aviso se queda quieto no hay
        // forma de saber si va lento o si se colgó: el botón devuelve la aplicación sin esperar.
        <div className="flex items-center gap-2 px-1 pt-2">
          <p className="min-w-0 flex-1 truncate text-nota text-brand">{generating}</p>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-micro text-white/60 hover:bg-white/10 hover:text-white"
            title="Deja de esperar la proyección y devuelve la aplicación"
          >
            Dejar de esperar
          </button>
        </div>
      )}

      {drawings.length === 0 && generating === null && (
        <p className="px-1 pt-2 text-nota leading-snug text-white/35">
          Ninguno. Un plano se saca proyectando las aristas de lo que está encendido: apaga lo que
          no quieras que salga y elige la vista.
        </p>
      )}

      <ul className="pt-1.5">
        {drawings.map((plano) => {
          const visible = !hidden.has(plano.id);
          return (
            <li key={plano.id} className="mb-1 rounded-md border border-white/10 px-1.5 py-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(plano.id, !visible)}
                  className={visible ? "text-brand" : "text-white/30 hover:text-white/60"}
                  title={visible ? "Apagar este plano" : "Encender este plano"}
                  aria-label={visible ? "Apagar este plano" : "Encender este plano"}
                  aria-pressed={visible}
                >
                  {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
                </button>

                <span className="min-w-0 flex-1 truncate text-xs text-white/85">{plano.name}</span>

                <button
                  type="button"
                  onClick={() => onClose(plano.id)}
                  className="shrink-0 text-white/30 hover:text-red-400"
                  title="Cerrar este plano"
                  aria-label="Cerrar este plano"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="pt-0.5 text-micro text-white/35">
                {plano.sizeM[0].toFixed(1)} × {plano.sizeM[1].toFixed(1)} m ·{" "}
                {plano.segments.toLocaleString("es-CL")} trazos ·{" "}
                {(plano.elapsedMs / 1000).toFixed(1)} s en generarse
              </p>

              <label className="flex items-center gap-2 pt-1 text-micro text-white/50">
                <input
                  type="checkbox"
                  onChange={(e) => onToggleHidden(plano.id, e.target.checked)}
                  className="accent-brand"
                />
                {/* En un plano de arquitectura las aristas ocultas son la mitad del ruido: se
                    generan igual y se encienden solo cuando se quieren. */}
                Mostrar las {plano.hiddenSegments.toLocaleString("es-CL")} aristas ocultas
              </label>

              <button
                type="button"
                onClick={() => onExport(plano.id)}
                className="mt-1 w-full rounded border border-brand/40 px-2 py-1 text-nota text-brand hover:bg-brand/15"
                title="Descarga el plano en DXF, en milímetros y colocado en una hoja A3"
              >
                Exportar a DXF (A3)
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
