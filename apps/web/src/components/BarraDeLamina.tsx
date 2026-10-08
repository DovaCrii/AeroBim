import { useEffect } from "react";

import { IconArrowLeft, IconChevronLeft, IconChevronRight } from "./icons.js";
import { TITULO_DE_CLASE, etiquetaDePosicion, laminaVecina, porClase } from "./laminas.js";

/** Lo que la barra necesita saber de cada lámina: su identidad, cómo se llama y cuánto mide. */
export interface LaminaEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly anchoM: number;
  readonly altoM: number;
  /** Un perfil está desarrollado por PK: su ancho es el largo del trazado. */
  readonly esPerfil: boolean;
}

/** Una tecla de flecha no debe cambiar de lámina si la persona está escribiendo o eligiendo en un control. */
function esControlDeEdicion(destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false;
  return (
    destino.isContentEditable ||
    destino instanceof HTMLInputElement ||
    destino instanceof HTMLTextAreaElement ||
    destino instanceof HTMLSelectElement
  );
}

/**
 * La barra del **visor 2D de láminas** (2026-10-05): dónde se está, cómo volver y cómo pasar de una
 * lámina a otra.
 *
 * Un plano o un perfil generado se dibuja sobre el modelo, y mirarlo así lo mezcla con la geometría. El
 * visor 2D lo deja **solo**: apaga los modelos, los planos de referencia y la nube, pone la cámara en
 * planta y ortográfica y encuadra la lámina. Esta barra es lo que mantiene a la persona orientada
 * mientras tanto, y tiene tres trabajos:
 *
 * - **Decir que el modelo no está** —está apagado a propósito—, para que no parezca que se perdió.
 * - **Volver**, que restaura la vista tal como estaba al entrar: cámara, qué estaba encendido, estilo.
 * - **Cambiar de lámina sin salir**, y hacerlo cuando son 193: un perfil con una transversal cada
 *   0,1 m no cabe como fila de botones. Por eso es **una sola fila**: anterior y siguiente (también
 *   con las flechas del teclado), un desplegable agrupado y «12 de 193».
 *
 * Va arriba y en el centro, con las mismas piezas de cristal que las otras barras del lienzo.
 */
export function BarraDeLamina({
  laminas,
  actual,
  onVer,
  onSalir,
}: {
  readonly laminas: readonly LaminaEnLista[];
  /** La lámina que se está viendo. */
  readonly actual: string;
  readonly onVer: (id: string) => void;
  readonly onSalir: () => void;
}) {
  const ids = laminas.map((una) => una.id);
  const indice = ids.indexOf(actual);
  const vista = indice >= 0 ? laminas[indice] : undefined;
  const anterior = laminaVecina(ids, actual, -1, false);
  const siguiente = laminaVecina(ids, actual, 1, false);

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
      if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
      if (esControlDeEdicion(evento.target)) return;
      const destino = evento.key === "ArrowLeft" ? anterior : siguiente;
      if (destino === null || destino === actual) return;
      evento.preventDefault();
      onVer(destino);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [anterior, siguiente, actual, onVer]);

  const boton =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-borde text-fg-2 hover:bg-surface-3 hover:text-fg disabled:text-apagado-fg disabled:hover:bg-transparent";

  return (
    <div
      role="toolbar"
      aria-label="Visor 2D de láminas"
      className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-borde bg-surface/90 px-2 py-1.5 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onSalir}
        className="flex shrink-0 items-center gap-1.5 rounded-sm bg-action px-2.5 py-1 text-xs font-medium text-sobre-accion hover:bg-action-hover"
        title="Sale del visor 2D y deja la vista como estaba, con el modelo encendido"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        Volver al modelo
      </button>

      {vista !== undefined && (
        <p className="min-w-0 truncate text-xs text-fg-2">
          <span className="font-medium text-fg">{vista.nombre}</span>
          {" · "}
          {vista.anchoM.toFixed(1)} × {vista.altoM.toFixed(1)} m
          {vista.esPerfil && " · desarrollado por PK"}
        </p>
      )}

      {/* Con una sola lámina no hay a dónde cambiar: el selector sería ruido. */}
      {laminas.length > 1 && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={boton}
            disabled={anterior === null || anterior === actual}
            onClick={() => anterior !== null && onVer(anterior)}
            aria-label="Lámina anterior"
            title="Lámina anterior (flecha izquierda)"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>

          <label className="sr-only" htmlFor="selector-de-lamina">
            Ir a una lámina
          </label>
          <select
            id="selector-de-lamina"
            value={actual}
            onChange={(evento) => onVer(evento.target.value)}
            className="h-7 w-44 max-w-[40vw] rounded-sm border border-borde-campo bg-surface-2 px-1.5 text-nota text-fg"
          >
            {porClase(laminas).map((grupo) => (
              <optgroup key={grupo.clase} label={TITULO_DE_CLASE[grupo.clase]}>
                {grupo.laminas.map((una) => (
                  <option key={una.id} value={una.id}>
                    {una.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            type="button"
            className={boton}
            disabled={siguiente === null || siguiente === actual}
            onClick={() => siguiente !== null && onVer(siguiente)}
            aria-label="Lámina siguiente"
            title="Lámina siguiente (flecha derecha)"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>

          <span
            className="w-16 shrink-0 text-right text-nota text-fg-3 tabular-nums"
            aria-live="polite"
          >
            {etiquetaDePosicion(indice, laminas.length)}
          </span>
        </div>
      )}
    </div>
  );
}
