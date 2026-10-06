/**
 * Las piezas de las **barras flotantes sobre el lienzo** (2026-10-05): el contenedor, el grupo con su
 * rótulo y el botón.
 *
 * Existen aparte para que las dos barras —la de visibilidad, abajo, y el selector de vista, arriba a
 * la derecha— sean **la misma superficie**: mismo cristal, mismo borde, mismo botón y mismo estado
 * activo. Dos barras que casi se parecen se leen como dos sistemas; con las mismas piezas se leen como
 * uno, y un ajuste de contraste o de tamaño táctil se hace una vez.
 *
 * El botón repite la forma «grande» de la cinta —icono arriba, nombre debajo, 44 px de alto—: es la
 * misma herramienta con otro sitio, y no debe cambiar de aspecto al subir al lienzo.
 */

/** Dónde se ancla una barra dentro del lienzo. */
export type Posicion = "abajo-centro" | "arriba-derecha" | "izquierda-arriba";

const ANCLAJE: Record<Posicion, string> = {
  "abajo-centro": "bottom-3 left-1/2 -translate-x-1/2",
  "arriba-derecha": "top-3 right-3",
  "izquierda-arriba": "top-3",
};

export function PanelFlotante({
  posicion,
  etiqueta,
  children,
  apagado = false,
  izquierda = "calc(var(--spacing) * 3)",
}: {
  readonly posicion: Posicion;
  /** El nombre accesible de la barra. */
  readonly etiqueta: string;
  readonly children: React.ReactNode;
  /** Sin nada que mandar, la barra se ve pero se atenúa: ocultarla movería la interfaz. */
  readonly apagado?: boolean;
  /**
   * Solo en `izquierda-arriba`: distancia al borde izquierdo, **con la misma variable `--spacing` que la
   * ficha** que flota en ese borde. `w-80` no son 20 rem aquí: `--spacing` vale 0,275 rem, así que son 22 —352 px—,
   * y con 340 px o con `21.25rem` la barra quedaba medio tapada. Se corre a la derecha de la ficha mientras
   * hay algo elegido.
   */
  readonly izquierda?: string;
}) {
  const vertical = posicion === "izquierda-arriba";
  return (
    <div
      role="toolbar"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      style={vertical ? { left: izquierda } : undefined}
      aria-label={etiqueta}
      className={[
        "absolute z-10 flex gap-1 rounded-lg border border-borde bg-surface/90 px-1.5 pt-1 pb-0.5 shadow-[var(--shadow-xl)] backdrop-blur-sm",
        vertical ? "flex-col items-center px-1 py-1.5" : "items-stretch",
        ANCLAJE[posicion],
        apagado ? "opacity-60" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** Un grupo de botones con su nombre debajo, como los de la cinta. */
export function GrupoFlotante({
  rotulo,
  children,
}: {
  readonly rotulo: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-label={rotulo} className="flex flex-col items-center">
      <div className="flex items-stretch gap-0.5">{children}</div>
      <p className="text-micro tracking-wide text-fg-3 uppercase">{rotulo}</p>
    </section>
  );
}

/** El separador entre dos grupos de una misma barra. */
export function SeparadorFlotante() {
  return <span aria-hidden className="my-1 w-px self-stretch bg-borde" />;
}

export function BotonFlotante({
  icono,
  nombre,
  ayuda,
  onClick,
  desactivado = false,
  resaltado = false,
  activo,
  compacto = false,
}: {
  readonly icono: React.ReactNode;
  readonly nombre: string;
  readonly ayuda: string;
  readonly onClick: () => void;
  readonly desactivado?: boolean;
  /** Un mandato que ahora tiene algo que hacer. No es un estado: no lleva `aria-pressed`. */
  readonly resaltado?: boolean;
  /** Un interruptor o una opción elegida: lleva `aria-pressed`. Omitirlo declara un mandato. */
  readonly activo?: boolean;
  /**
   * Solo el icono, de 40 px, para una barra vertical estrecha. **El nombre no se pierde**: va en `title` y en
   * `aria-label`, así que un lector de pantalla lo dice igual.
   */
  readonly compacto?: boolean;
}) {
  const encendido = activo === true || resaltado;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivado}
      title={`${nombre} — ${ayuda}`}
      aria-pressed={activo}
      aria-label={compacto ? nombre : undefined}
      className={[
        compacto
          ? "flex h-10 w-10 items-center justify-center rounded-sm"
          : "flex min-h-11 w-14 flex-col items-center justify-center gap-px rounded-sm px-0.5 py-1",
        "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
        desactivado
          ? "text-apagado-fg"
          : encendido
            ? "bg-action/30 text-fg"
            : "text-fg-2 hover:bg-surface-3 hover:text-fg",
      ].join(" ")}
    >
      <span
        className={["[&>svg]:h-5 [&>svg]:w-5", encendido && !desactivado ? "text-accent" : ""].join(
          " ",
        )}
      >
        {icono}
      </span>
      {!compacto && <span className="text-nota leading-none">{nombre}</span>}
    </button>
  );
}
