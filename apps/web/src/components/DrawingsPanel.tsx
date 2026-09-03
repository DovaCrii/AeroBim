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
  onLaminaPdf,
  onAddTable,
  cuadroCargado,
  onAddDimensions,
  cotasDisponibles,
  anotado,
  onAddCallouts,
  hallazgosDisponibles,
  llamadasPuestas,
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
  /** Descarga la lámina en PDF, dibujada por el servidor. `F7.5`. */
  readonly onLaminaPdf: (id: string) => void;
  /** Lleva las cotas medidas sobre el modelo a esa lámina. `F7.3`. */
  readonly onAddDimensions: (id: string) => void;
  /** Cuántas mediciones de distancia hay encendidas hoy. */
  readonly cotasDisponibles: number;
  /** Qué anotaciones lleva puestas cada lámina, por identificador. `F7.3`. */
  readonly anotado: Readonly<
    Record<string, { cotas: number; angulos: number; pendientes: number }>
  >;
  /** Señala en esa lámina los hallazgos del modelo. `F7.3`. */
  readonly onAddCallouts: (id: string) => void;
  /** Cuántos hallazgos del modelo hay cargados hoy. */
  readonly hallazgosDisponibles: number;
  /** Cuántas llamadas lleva puestas cada lámina. */
  readonly llamadasPuestas: Readonly<Record<string, number>>;
  /** Pone el cuadro cargado dentro de esa lámina. `F10.4`. */
  readonly onAddTable: (id: string) => void;
  /** La categoría del cuadro que hay cargado, o `null` si no hay ninguno. */
  readonly cuadroCargado: string | null;
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
            className="flex-1 rounded-sm bg-action px-2 py-1 text-nota font-medium text-fg hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
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
          <p className="min-w-0 flex-1 truncate text-nota text-accent">{generating}</p>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-sm border border-borde px-1.5 py-0.5 text-micro text-fg-2 hover:bg-surface-3 hover:text-fg"
            title="Deja de esperar la proyección y devuelve la aplicación"
          >
            Dejar de esperar
          </button>
        </div>
      )}

      {drawings.length === 0 && generating === null && (
        <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
          Ninguno. Un plano se saca proyectando las aristas de lo que está encendido: apaga lo que
          no quieras que salga y elige la vista.
        </p>
      )}

      <ul className="pt-1.5">
        {drawings.map((plano) => {
          const visible = !hidden.has(plano.id);
          return (
            <li key={plano.id} className="mb-1 rounded-md border border-borde px-1.5 py-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(plano.id, !visible)}
                  className={visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
                  title={visible ? "Apagar este plano" : "Encender este plano"}
                  aria-label={visible ? "Apagar este plano" : "Encender este plano"}
                  aria-pressed={visible}
                >
                  {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
                </button>

                <span className="min-w-0 flex-1 truncate text-xs text-fg">{plano.name}</span>

                <button
                  type="button"
                  onClick={() => onClose(plano.id)}
                  className="shrink-0 text-fg-3 hover:text-danger"
                  title="Cerrar este plano"
                  aria-label="Cerrar este plano"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="pt-0.5 text-micro text-fg-3">
                {plano.sizeM[0].toFixed(1)} × {plano.sizeM[1].toFixed(1)} m ·{" "}
                {plano.segments.toLocaleString("es-CL")} trazos ·{" "}
                {(plano.elapsedMs / 1000).toFixed(1)} s en generarse
              </p>

              <label className="flex items-center gap-2 pt-1 text-micro text-fg-2">
                <input
                  type="checkbox"
                  onChange={(e) => onToggleHidden(plano.id, e.target.checked)}
                  className="accent-action"
                />
                {/* En un plano de arquitectura las aristas ocultas son la mitad del ruido: se
                    generan igual y se encienden solo cuando se quieren. */}
                Mostrar las {plano.hiddenSegments.toLocaleString("es-CL")} aristas ocultas
              </label>

              {/* **Las cotas medidas sobre el modelo, dentro de la lámina.** `F7.3`. Es el flujo que
                  una oficina hace de verdad: se mide con el ajuste a vértice, se genera la planta, y
                  las cotas van dentro. Acotar encima del dibujo sería medir dos veces la misma cosa
                  y arriesgarse a dos números distintos. */}
              {cotasDisponibles > 0 && (
                <button
                  type="button"
                  onClick={() => onAddDimensions(plano.id)}
                  className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
                  title="Lleva a esta lámina las cotas, los ángulos y las pendientes de lo que has medido"
                >
                  Anotar con{" "}
                  {cotasDisponibles === 1 ? "la medición" : `las ${cotasDisponibles} mediciones`}
                </button>
              )}

              {/* **Se dice qué entró de cada cosa, no «hecho».** Puede ser menos que lo medido: lo
                  que se proyecta a un punto no es una cota —una medición vertical en una planta— y
                  lo que está a nivel no tiene pendiente que anotar. Un «hecho» dejaría a alguien
                  buscando en el DXF una cota que no está. */}
              {anotado[plano.id] !== undefined && (
                <p className="pt-0.5 text-micro text-fg-3">
                  {anotado[plano.id]!.cotas +
                    anotado[plano.id]!.angulos +
                    anotado[plano.id]!.pendientes ===
                  0
                    ? "No entró ninguna anotación: lo medido se proyecta a un punto en esta vista."
                    : [
                        `${anotado[plano.id]!.cotas} cotas`,
                        `${anotado[plano.id]!.angulos} ángulos`,
                        `${anotado[plano.id]!.pendientes} pendientes`,
                      ].join(" · ") + ". Salen en el DXF."}
                </p>
              )}

              {/* **Las llamadas son lo que conecta el plano con la coordinación.** `F7.3`: un plano
                  que dice «aquí falta la cota del vano V-03» es un plano con el que se va a obra;
                  sin ellas, el plano y la lista de hallazgos son dos papeles que hay que cruzar a
                  mano. Solo aparece con hallazgos del modelo cargados. */}
              {hallazgosDisponibles > 0 && (
                <button
                  type="button"
                  onClick={() => onAddCallouts(plano.id)}
                  className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
                  title="Señala en la lámina los hallazgos cuyo elemento esté dibujado"
                >
                  Señalar{" "}
                  {hallazgosDisponibles === 1
                    ? "el hallazgo"
                    : `los ${hallazgosDisponibles} hallazgos`}
                </button>
              )}

              {/* Y cuántos entraron: es normal que sean menos, porque la planta proyecta lo que
                  estaba encendido y un hallazgo de la estructura no cabe en un plano de
                  arquitectura. */}
              {llamadasPuestas[plano.id] !== undefined && (
                <p className="pt-0.5 text-micro text-fg-3">
                  {llamadasPuestas[plano.id] === 0
                    ? "Ningún hallazgo tiene su elemento dibujado en esta vista."
                    : `${llamadasPuestas[plano.id]} señalados en la lámina.`}
                </p>
              )}

              {/* **El cuadro se pone antes de exportar, no después.** `F10.4`: la tabla va dentro
                  de la lámina, así que tiene que estar puesta cuando se serializa. El botón solo
                  aparece con un cuadro cargado —si no, no hay nada que poner— y dice cuál es: poner
                  «el cuadro» sin saber de qué categoría es una lámina que hay que volver a hacer. */}
              {cuadroCargado !== null && (
                <button
                  type="button"
                  onClick={() => onAddTable(plano.id)}
                  className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
                  title="Dibuja el cuadro debajo del plano, dentro de la misma lámina"
                >
                  Poner el cuadro de {cuadroCargado}
                </button>
              )}

              <button
                type="button"
                onClick={() => onExport(plano.id)}
                className="mt-1 w-full rounded-sm border border-accent/40 px-2 py-1 text-nota text-accent hover:bg-accent/15"
                title="Descarga el plano en DXF, en milímetros y colocado en una hoja A3"
              >
                Exportar a DXF (A3)
              </button>

              {/* **Y el PDF, que es la otra salida.** `F7.5`: un DXF se abre en un CAD y un PDF se
                  manda por correo, se firma y se cuelga. Lo dibuja el servidor, que es donde vive el
                  membrete de la casa. */}
              <button
                type="button"
                onClick={() => onLaminaPdf(plano.id)}
                className="mt-1 w-full rounded-sm border border-accent/40 px-2 py-1 text-nota text-accent hover:bg-accent/15"
                title="Descarga la lámina en PDF, en Carta y con el membrete de la casa"
              >
                Exportar a PDF (Carta)
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
