import { IconEye, IconEyeOff, IconFrameSelection, IconIsolate, IconUnisolate } from "./icons.js";

/**
 * La barra flotante sobre el visor: **Visibilidad** y **Selección** (2026-10-05).
 *
 * Es la idea que se tomó de la barra inferior de That Open Platform, y se toma como idea: las
 * acciones que se repiten treinta veces al día —apagar, aislar, salir, ver todo, encuadrar lo
 * elegido— a un clic del modelo y **sin depender de que la cinta esté abierta**. Con la cinta plegada
 * para dejarle el lienzo al modelo, antes se perdían justo las que más se usan sobre él.
 *
 * **Se movió, no se copió.** Estas acciones vivían en la cinta (grupo «Visibilidad»), en la ficha de
 * la selección y en la barra de estado; una cuarta copia habría empeorado lo que se quería arreglar.
 * Salieron de la cinta, que queda más corta; la ficha y la barra de estado conservan su atajo
 * contextual.
 *
 * Mismas reglas que tenían en la cinta —incluida la de que «Salir» y «Ver todo» son dos botones, y
 * por qué—, mismo tamaño táctil y mismos iconos: un mandato con dos dibujos obliga a leerlos.
 */
export function BarraDelVisor({
  tieneSeleccion,
  seleccionVisible,
  aislado,
  hayOcultos,
  onAlternarSeleccion,
  onAislar,
  onSalirDelAislamiento,
  onVerTodo,
  onEncuadrarSeleccion,
}: {
  readonly tieneSeleccion: boolean;
  /** Si el elemento elegido está encendido: decide si el primer botón dice «Apagar» o «Encender». */
  readonly seleccionVisible: boolean;
  readonly aislado: boolean;
  /** Hay algo apagado: «Ver todo» se resalta, porque tiene algo que hacer. */
  readonly hayOcultos: boolean;
  readonly onAlternarSeleccion: () => void;
  readonly onAislar: () => void;
  readonly onSalirDelAislamiento: () => void;
  readonly onVerTodo: () => void;
  readonly onEncuadrarSeleccion: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Visibilidad y selección"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-stretch gap-1 rounded-lg border border-borde bg-surface/90 px-1.5 pt-1 pb-0.5 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <Grupo rotulo="Visibilidad">
        <Boton
          icono={seleccionVisible ? <IconEyeOff /> : <IconEye />}
          nombre={seleccionVisible ? "Apagar" : "Encender"}
          ayuda={
            tieneSeleccion
              ? "Apaga o enciende el elemento seleccionado. También en su ficha"
              : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onAlternarSeleccion}
        />
        <Boton
          icono={<IconIsolate />}
          nombre="Aislar"
          ayuda={
            tieneSeleccion
              ? "Deja solo el elemento seleccionado a la vista"
              : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onAislar}
        />
        {/* «Salir» deshace el aislamiento y devuelve lo de antes —lo apagado a mano sigue
            apagado—; «Ver todo» enciende el modelo entero. Por eso son dos. */}
        <Boton
          icono={<IconUnisolate />}
          nombre="Salir"
          ayuda={
            aislado
              ? "Sale del aislamiento y vuelve a como estaba el modelo antes de aislar"
              : "No hay ningún aislamiento del que salir"
          }
          resaltado={aislado}
          desactivado={!aislado}
          onClick={onSalirDelAislamiento}
        />
        <Boton
          icono={<IconEye />}
          nombre="Ver todo"
          ayuda="Enciende todo el modelo, incluido lo que se apagó a mano"
          resaltado={hayOcultos}
          onClick={onVerTodo}
        />
      </Grupo>

      <span aria-hidden className="my-1 w-px self-stretch bg-borde" />

      <Grupo rotulo="Selección">
        <Boton
          icono={<IconFrameSelection />}
          nombre="Encuadrar"
          ayuda={
            tieneSeleccion ? "Lleva la cámara a lo seleccionado" : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onEncuadrarSeleccion}
        />
      </Grupo>
    </div>
  );
}

function Grupo({
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

function Boton({
  icono,
  nombre,
  ayuda,
  onClick,
  desactivado = false,
  resaltado = false,
}: {
  readonly icono: React.ReactNode;
  readonly nombre: string;
  readonly ayuda: string;
  readonly onClick: () => void;
  readonly desactivado?: boolean;
  /** Un mandato que ahora tiene algo que hacer. No es un estado: no lleva `aria-pressed`. */
  readonly resaltado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactivado}
      title={`${nombre} — ${ayuda}`}
      className={[
        "flex min-h-11 w-14 flex-col items-center justify-center gap-px rounded-sm px-0.5 py-1",
        "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
        desactivado
          ? "text-apagado-fg"
          : resaltado
            ? "bg-action/30 text-fg"
            : "text-fg-2 hover:bg-surface-3 hover:text-fg",
      ].join(" ")}
    >
      <span
        className={["[&>svg]:h-5 [&>svg]:w-5", resaltado && !desactivado ? "text-accent" : ""].join(
          " ",
        )}
      >
        {icono}
      </span>
      <span className="text-nota leading-none">{nombre}</span>
    </button>
  );
}
