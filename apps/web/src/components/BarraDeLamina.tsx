import { IconArrowLeft } from "./icons.js";

/** Lo que la barra necesita saber de cada lámina: su identidad, cómo se llama y cuánto mide. */
export interface LaminaEnLista {
  readonly id: string;
  readonly nombre: string;
  readonly anchoM: number;
  readonly altoM: number;
  /** Un perfil está desarrollado por PK: su ancho es el largo del trazado. */
  readonly esPerfil: boolean;
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
 * - **Cambiar de lámina sin salir**: un perfil trae sus transversales, y recorrer el longitudinal y
 *   las cuatro estaciones no puede costar entrar y salir cinco veces.
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
  const vista = laminas.find((una) => una.id === actual);
  return (
    <div
      role="toolbar"
      aria-label="Visor 2D de láminas"
      className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-1 rounded-lg border border-borde bg-surface/90 px-2 py-1.5 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
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
      </div>

      {/* Con una sola lámina no hay a dónde cambiar: la fila de pestañas sería ruido. */}
      {laminas.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Láminas">
          {laminas.map((una) => (
            <button
              key={una.id}
              type="button"
              onClick={() => onVer(una.id)}
              aria-pressed={una.id === actual}
              title={`${una.nombre} · ${una.anchoM.toFixed(1)} × ${una.altoM.toFixed(1)} m`}
              className={[
                "max-w-48 truncate rounded-sm px-2 py-0.5 text-nota transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
                una.id === actual
                  ? "bg-action/30 text-fg"
                  : "text-fg-3 hover:bg-surface-3 hover:text-fg-2",
              ].join(" ")}
            >
              {una.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
