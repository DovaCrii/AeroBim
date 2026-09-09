/**
 * La puerta de entrada del visor: lo que se ve cuando no hay nada abierto. `F12.4`.
 *
 * **Lo que había antes era una frase gris en el medio del lienzo** —«Arrastra un IFC, un DXF o un
 * levantamiento aquí, o usa Abrir»— que nombraba dos gestos y no ofrecía ninguno: el arrastre no se
 * puede pulsar, y «Abrir» era un rótulo que apuntaba a otro sitio de la pantalla. La primera
 * pantalla del producto pedía leer para poder empezar.
 *
 * Ahora los gestos **son** los controles. Tres, en el orden en que conviene usarlos:
 *
 * 1. **Del registro**, primero y primario, porque es de donde sale el trabajo de verdad: un modelo
 *    del expediente llega con su obra, su revisión y su código, y es lo que permite después anotar
 *    un hallazgo donde alguien lo va a leer. Un archivo del disco no tiene obra
 *    (ver `Origen.tsx`).
 * 2. **Abrir del disco**, para el archivo que todavía no está en el registro.
 * 3. **Arrastrar**, que se queda como texto: es un gesto, no un botón, y decirlo basta.
 *
 * **Sin tarjeta a propósito.** Una caja con borde y fondo sobre el lienzo vacío parece un diálogo
 * que hay que cerrar. Esto no interrumpe nada: es el estado de reposo de la pantalla.
 *
 * Es el patrón de la pantalla de inicio de Revit y de la de AutoCAD —de dónde abrir, y nada más
 * hasta que haya algo abierto—, con la forma que `docs/UX.md` toma de Asana: dos niveles
 * tipográficos, aire, y las acciones a la vista.
 *
 * **La trampa que hay debajo, escrita porque no da error:** el contenedor es
 * `pointer-events-none` para que orbitar y medir sigan llegando al lienzo que está detrás, así que
 * los botones tienen que devolverse `pointer-events-auto` a mano. Sin eso se ven, se enfocan con el
 * tabulador… y el clic pasa de largo.
 */

import { IconAbrirDelDisco, IconRegistro } from "./icons.js";

export function PuertaDeEntrada({
  onDelRegistro,
  onAbrirDelDisco,
  deshabilitado = false,
}: {
  /** Abre el panel del navegador con la sección «Del registro» desplegada. */
  readonly onDelRegistro: () => void;
  /** Abre el selector de archivos del sistema. */
  readonly onAbrirDelDisco: () => void;
  /** `true` mientras se está cargando algo: no se puede pedir un segundo modelo a la vez. */
  readonly deshabilitado?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {/*
         * **Esto se pinta sobre el lienzo, no sobre un panel**, así que va con
         * `text-sobre-lienzo` y no con `text-fg`. Ver el token en `index.css`: la primera versión
         * usaba la escala del shell y en el tema claro daba **1,08:1** — el título y las tres
         * palabras que importan, invisibles sobre el lienzo, que es oscuro en los dos temas.
         */}
        {/* `h2` y no `h1`: el `h1` de la pantalla es la marca de la cinta. */}
        <h2 className="text-lg leading-tight font-medium text-sobre-lienzo">
          Abre algo para empezar
        </h2>
        <p className="text-sm text-sobre-lienzo-2">
          Un modelo <span className="text-sobre-lienzo">IFC</span>, el plano{" "}
          <span className="text-sobre-lienzo">DXF</span> del proyecto, o el{" "}
          <span className="text-sobre-lienzo">levantamiento</span> de la obra.
        </p>

        <div className="pointer-events-auto mt-1 flex flex-wrap items-stretch justify-center gap-2">
          <Gesto
            icon={<IconRegistro />}
            label="Del registro"
            hint="Elige una revisión del expediente. Llega con su obra y su código"
            primario
            deshabilitado={deshabilitado}
            onClick={onDelRegistro}
          />
          <Gesto
            icon={<IconAbrirDelDisco />}
            label="Abrir del disco"
            hint="Un IFC, un DXF o un levantamiento .copc.laz de este equipo"
            deshabilitado={deshabilitado}
            onClick={onAbrirDelDisco}
          />
        </div>

        <p className="text-nota text-sobre-lienzo-3">
          o arrastra el archivo a cualquier parte del lienzo
        </p>
      </div>
    </div>
  );
}

/** Uno de los dos gestos: icono a la izquierda, nombre a la derecha, y el alto de toque de `F9.4`. */
function Gesto({
  icon,
  label,
  hint,
  onClick,
  primario = false,
  deshabilitado,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
  readonly primario?: boolean;
  readonly deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={`${label} — ${hint}`}
      className={[
        "flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium",
        "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
        "[&>span>svg]:h-[18px] [&>span>svg]:w-[18px]",
        // **El deshabilitado lleva fondo, y antes no lo llevaba.** Sin relleno se apoyaba en el
        // lienzo, o sea que su texto era un par contra una tercera superficie —la misma trampa que
        // dejó el título invisible en tema claro—. Con `bg-surface-2` los tres estados son pares de
        // chrome sobre chrome, que es lo que el gate ya mide: 3,6:1 en oscuro y 3,64 en claro, que
        // es lo que este sistema pide de lo apagado —no pasa AA a propósito, y se lee—.
        deshabilitado
          ? "border border-borde bg-surface-2 text-apagado-fg"
          : primario
            ? "bg-action text-sobre-accion hover:bg-action-hover"
            : "border border-borde bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg",
      ].join(" ")}
    >
      {/* El icono hereda el color del botón. Darle uno propio le costaría contraste al apagado y
          al primario, que son los dos que ya están medidos. */}
      <span>{icon}</span>
      {label}
    </button>
  );
}
