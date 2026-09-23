import type { BcfCamera, VisibilidadBcf } from "@aerobim/bim-core";
import { useCallback, useEffect, useState } from "react";
import { cabecerasDeEscritura } from "../csrf.js";

/** Una observación anclada al modelo, tal como la manda el registro. */
export interface ObservacionDelModelo {
  readonly id: string;
  readonly titulo: string;
  readonly guid: string;
  readonly prioridad: string;
  readonly prioridadTexto: string;
  readonly estadoTexto: string;
  readonly responsable: string;
  readonly vence: string | null;
  readonly vencida: boolean;
  readonly camara: BcfCamera | null;
  /**
   * Qué se veía cuando se anotó, o `null` si no se guardó ninguna restricción.
   *
   * **La cámara sola no basta**: un hallazgo encontrado aislando una planta no se entiende con el
   * edificio entero encima, aunque se mire desde el mismo sitio.
   */
  readonly visibilidad: VisibilidadBcf | null;
  /**
   * `true` si la abrió una corrida de interferencias y no una persona.
   *
   * **No es un detalle de adorno**: una corrida sobre dos disciplinas reales abre decenas y las
   * mezcla con las pocas que escribió alguien. Sin poder separarlas, la nota que un revisor
   * redactó a mano se pierde entre el resultado de una máquina.
   */
  readonly esInterferencia: boolean;
  /** El otro elemento de la pareja, cuando es una interferencia. */
  readonly contra: string | null;
  /** `true` si está a nombre de quien mira. Es lo primero que se filtra en una lista larga. */
  readonly esMia: boolean;
  /**
   * `true` si apareció desde la última vez que **esta persona** miró esta obra.
   *
   * **Es la pregunta que ningún otro filtro contesta.** «Mías», «Choques» y «Notas» separan de
   * quién es y de dónde viene cada hallazgo; ninguno dice qué cambió. Con treinta y cinco filas
   * abiertas y trece problemas nuevos de la corrida de hoy, sin esto hay que releer la lista
   * entera para encontrarlos.
   */
  readonly esNueva: boolean;
  readonly url: string;
}

/** Qué se está mirando de la lista. */
type Filtro = "todas" | "nuevas" | "mias" | "interferencias" | "notas";

const FILTROS: readonly { readonly cual: Filtro; readonly texto: string }[] = [
  { cual: "todas", texto: "Todas" },
  // **«Nuevas» va justo después de «Todas»**, y antes que «Mías»: al abrir el panel después de una
  // corrida, «qué cambió» es la primera pregunta, y repartir viene después de saber qué hay.
  { cual: "nuevas", texto: "Nuevas" },
  { cual: "mias", texto: "Mías" },
  { cual: "interferencias", texto: "Choques" },
  { cual: "notas", texto: "Notas" },
];

function pasa(observacion: ObservacionDelModelo, filtro: Filtro): boolean {
  if (filtro === "nuevas") return observacion.esNueva;
  if (filtro === "mias") return observacion.esMia;
  if (filtro === "interferencias") return observacion.esInterferencia;
  if (filtro === "notas") return !observacion.esInterferencia;
  return true;
}

type Estado =
  | { readonly kind: "sin-proyecto" }
  | { readonly kind: "cargando" }
  | {
      readonly kind: "listo";
      readonly observaciones: readonly ObservacionDelModelo[];
      readonly puedeDescartar: boolean;
    }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

/** Cuán fuerte se pinta cada prioridad. **El texto va siempre**; el color es refuerzo. */
const TONO: Record<string, string> = {
  alta: "text-danger",
  media: "text-fg-2",
  baja: "text-fg-3",
};

/**
 * Las observaciones del modelo, y el clic que lleva al problema.
 *
 * **Es la mitad que faltaba del ciclo de coordinación.** La observación se creaba desde el visor
 * —desde la ficha de un elemento, con su GUID y su cámara— y para **verla** había que salir a otra
 * pantalla: quien coordinaba tenía el hallazgo en un sitio y el modelo en otro.
 *
 * Un clic hace las dos cosas que hacen falta: **pone la cámara donde estaba quien lo encontró y
 * selecciona el elemento**. Es lo que Solibri hace bien y lo que convierte una lista en una
 * herramienta de coordinación.
 *
 * Se piden **por proyecto y no por revisión**: un hallazgo sobre una viga de la estructura importa
 * mirando el modelo de arquitectura, que es de lo que trata coordinar.
 */
export function Coordinacion({
  proyectoId,
  onAbrir,
  recargar,
  sePuedeAnotar = false,
  onCargadas,
}: {
  /** La obra de la que está abierto el modelo, o `null` si vino de un archivo del disco. */
  readonly proyectoId: string | null;
  /** Lleva la cámara y selecciona. Devuelve `false` si el GUID no está en ningún modelo abierto. */
  readonly onAbrir: (observacion: ObservacionDelModelo) => Promise<boolean>;
  /** Cambia para volver a pedir la lista: al guardar una nota, por ejemplo. */
  readonly recargar?: number;
  /**
   * Avisa de la lista recién cargada, para quien la necesite fuera de este panel.
   *
   * Hoy la usa `F7.3` para señalar los hallazgos en una lámina. **Se reporta en vez de pedirla otra
   * vez**: dos peticiones a la misma consulta son dos listas que pueden discrepar por medio segundo.
   */
  readonly onCargadas?: (observaciones: readonly ObservacionDelModelo[]) => void;
  /**
   * `true` si ahora mismo hay un elemento seleccionado sobre el que se puede anotar.
   *
   * **Es lo que permite que el panel enseñe el gesto en vez de solo decir que no hay nada.** El
   * usuario preguntó «cómo puedo cargar una observación, no está claro eso» teniendo el botón a la
   * vista: un estado vacío que no dice cómo llenarse deja a alguien buscando.
   */
  readonly sePuedeAnotar?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ kind: "sin-proyecto" });
  /** El GUID que no se encontró, para poder decirlo junto a su fila y no en un aviso suelto. */
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);
  /**
   * Qué se está mirando. **Arranca en «todas»** a propósito: filtrar de entrada esconde trabajo, y
   * quien abre el panel todavía no sabe cuánto hay.
   */
  const [filtro, setFiltro] = useState<Filtro>("todas");
  /** Cuál se está descartando, con el motivo a medio escribir. */
  const [descartando, setDescartando] = useState<{ id: string; motivo: string } | null>(null);
  /** Las que se descartaron en esta sesión: se van de la lista sin volver a pedirla. */
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(new Set());
  /**
   * `true` si se acaba de decir «ya lo vi todo».
   *
   * Espeja lo que hizo el servidor —mover la marca a ahora— sin volver a pedir la lista, por la
   * misma razón que al descartar: recargarla entera pierde el sitio y la posición del
   * desplazamiento, y triando treinta y cinco filas eso se nota.
   */
  const [todoVisto, setTodoVisto] = useState(false);

  useEffect(() => {
    if (proyectoId === null) {
      setEstado({ kind: "sin-proyecto" });
      return;
    }

    let cancelado = false;
    setEstado({ kind: "cargando" });
    // **La lista que llega trae su propio «qué es nuevo»**, así que el espejo local se olvida: si
    // no, después de recargar seguiría diciendo que no hay nada nuevo.
    setTodoVisto(false);

    void (async () => {
      try {
        const respuesta = await fetch(`/api/proyectos/${proyectoId}/observaciones-modelo/`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (cancelado) return;

        // Un 403 es que este rol no puede leer observaciones, no que algo falló: decirlo como
        // error manda a buscar el problema donde no está.
        if (respuesta.status === 403) return setEstado({ kind: "sin-permiso" });
        if (!respuesta.ok) {
          return setEstado({
            kind: "error",
            mensaje: `El registro respondió ${respuesta.status}.`,
          });
        }

        const datos = (await respuesta.json()) as {
          observaciones?: readonly ObservacionDelModelo[];
          puedeDescartar?: boolean;
        };
        if (!cancelado) {
          const observaciones = datos.observaciones ?? [];
          setEstado({
            kind: "listo",
            observaciones,
            puedeDescartar: datos.puedeDescartar === true,
          });
          // **La lista se reporta hacia arriba en vez de pedirla otra vez.** `F7.3` la necesita
          // para señalar los hallazgos en un plano, y una segunda petición sería la misma consulta
          // dos veces —y dos listas que pueden discrepar por medio segundo.
          onCargadas?.(observaciones);
        }
      } catch (error: unknown) {
        if (!cancelado) {
          setEstado({ kind: "error", mensaje: error instanceof Error ? error.message : "" });
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [proyectoId, recargar]);

  const abrir = useCallback(
    async (observacion: ObservacionDelModelo) => {
      const encontrada = await onAbrir(observacion);
      // **Se dice cuál no se encontró, no «no se encontró».** Con quince filas, un aviso suelto
      // obliga a adivinar de cuál habla.
      setNoEncontrada(encontrada ? null : observacion.id);
    },
    [onAbrir],
  );

  if (estado.kind === "sin-proyecto") {
    return (
      <p className="p-3 text-xs leading-snug text-fg-3">
        Abre un modelo del registro y acá aparecen las observaciones de su obra ancladas a
        elementos.
      </p>
    );
  }

  if (estado.kind === "cargando") {
    return <p className="p-3 text-xs text-fg-3">Buscando observaciones…</p>;
  }

  if (estado.kind === "sin-permiso") {
    return (
      <p className="p-3 text-xs leading-snug text-fg-3">
        Tu rol no puede ver las observaciones de esta obra.
      </p>
    );
  }

  if (estado.kind === "error") {
    return <p className="p-3 text-xs leading-snug text-fg-3">{estado.mensaje}</p>;
  }

  if (estado.observaciones.length === 0) {
    return (
      <div className="space-y-1.5 p-3 text-xs leading-snug text-fg-3">
        <p>Ninguna nota todavía sobre un elemento de esta obra.</p>
        {/* **El estado vacío enseña el gesto.** Decir solo «no hay nada» deja a alguien buscando
            cómo llenarlo, que es literalmente lo que pasó: «cómo puedo cargar una observación, no
            está claro eso» — con el botón a la vista. */}
        <p className="text-fg-2">
          {sePuedeAnotar ? (
            <>
              Pulsa <strong className="text-accent">Dejar una nota</strong> en la ficha del elemento
              que tienes seleccionado, a la izquierda.
            </>
          ) : (
            <>
              Haz clic en un elemento del modelo y usa <strong>Dejar una nota</strong> en su ficha,
              a la izquierda.
            </>
          )}
        </p>
        <p>Las notas sobre un documento se ven en su propia pantalla, no acá.</p>
      </div>
    );
  }

  const vivas = estado.observaciones
    .filter((una) => !descartadas.has(una.id))
    // **El espejo se aplica aquí y no en cada sitio que pregunta.** Con `esNueva` ya resuelto, el
    // filtro, la cuenta del chip y la marca de la fila leen todos el mismo valor; comprobar
    // `todoVisto` en los tres es la forma segura de que uno se olvide.
    .map((una) => (todoVisto && una.esNueva ? { ...una, esNueva: false } : una));
  const visibles = vivas.filter((una) => pasa(una, filtro));
  const cuantas = (cual: Filtro) => vivas.filter((una) => pasa(una, cual)).length;
  const nuevas = cuantas("nuevas");

  async function marcarVisto() {
    const respuesta = await fetch(`/api/proyectos/${proyectoId}/coordinacion-vista/`, {
      method: "POST",
      credentials: "same-origin",
      headers: cabecerasDeEscritura(),
      body: "{}",
    });
    if (!respuesta.ok) return;
    setTodoVisto(true);
    // **Y se sale del filtro «nuevas»**, que se acaba de quedar vacío: dejarlo puesto enseñaría
    // «Nada con este filtro» justo después de un gesto que funcionó.
    if (filtro === "nuevas") setFiltro("todas");
  }

  async function descartar(id: string, motivo: string) {
    const respuesta = await fetch(`/api/observaciones/${id}/descartar/`, {
      method: "POST",
      credentials: "same-origin",
      headers: cabecerasDeEscritura(),
      body: JSON.stringify({ motivo }),
    });
    if (!respuesta.ok) return;
    // **Se va de la lista sin volver a pedirla.** Triando treinta y cinco conflictos, recargar
    // entera después de cada uno pierde el sitio y la posición del desplazamiento.
    setDescartadas((actuales) => new Set(actuales).add(id));
    setDescartando(null);
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* **Los filtros con su cuenta al lado.** Una corrida de interferencias abre decenas y las
          mezcla con las pocas que escribió una persona: sin separarlas, la nota que un revisor
          redactó a mano se pierde entre el resultado de una máquina. Y el número va en el propio
          filtro porque es la mitad de la información — «Choques 35» dice qué hay que hacer.

          **El que está a cero se inhabilita pero no se esconde.** Las cuentas cambian mientras se
          tría, y un objetivo que se mueve bajo el dedo en una lista de treinta y cinco es peor que
          un cero. */}
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-borde px-2 py-1.5">
        {FILTROS.map(({ cual, texto }) => {
          const total = cuantas(cual);
          return (
            <button
              key={cual}
              type="button"
              onClick={() => setFiltro(cual)}
              aria-pressed={filtro === cual}
              disabled={total === 0 && cual !== "todas"}
              className={[
                // 12 px y no 11: es la navegación del panel y lleva una cifra dentro. El micro
                // queda para las etiquetas de una palabra —la prioridad, el «choque»—, que se
                // reconocen por su forma antes de leerse.
                "rounded-sm px-1.5 py-0.5 text-nota transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
                filtro === cual
                  ? "bg-action/30 text-fg"
                  : total === 0 && cual !== "todas"
                    ? "text-apagado-fg"
                    : "text-fg-3 hover:bg-surface-3 hover:text-fg-2",
              ].join(" ")}
            >
              {texto} <span className="tabular-nums">{total}</span>
            </button>
          );
        })}

        {/* **«Ya lo vi» solo aparece cuando hay algo nuevo que ver.** Un botón permanente para
            marcar como visto una lista sin novedades es un control que no hace nada, y de paso
            invita a pulsarlo antes de mirar. */}
        {nuevas > 0 && (
          <button
            type="button"
            onClick={() => void marcarVisto()}
            title="Deja de marcar como nuevas las que están en la lista ahora"
            className="ml-auto rounded-sm px-1.5 py-0.5 text-nota text-fg-3 underline transition-colors duration-[--duracion-corta] ease-[--ease-ab] hover:bg-surface-3 hover:text-fg-2"
          >
            ya lo vi
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="p-3 text-nota leading-snug text-fg-3">
          Nada con este filtro.{" "}
          <span className="text-fg-2">
            Vuelve a <strong>Todas</strong> para ver el resto.
          </span>
        </p>
      ) : (
        <ul className="min-h-0 overflow-x-clip overflow-y-auto p-2 text-xs">
          {visibles.map((observacion) => (
            /* **Cada hallazgo es una tarjeta, y no una fila con cosas debajo.**
               Medido sobre la lista de 35: las dos acciones caían a **43,8 px de su propio título y
               a 11 del título siguiente**, o sea que por proximidad —la única pista que había—
               «no es un problema» pertenecía cuatro veces más a la fila de abajo que a la suya. En
               una lista de triaje donde descartar es permanente, eso no es un detalle: es descartar
               el conflicto equivocado.
               Y no se arregla con proximidad —tres líneas de alto parecido no se agrupan solas—,
               se arregla **dibujando el grupo**: un papel propio por hallazgo, con su borde. */
            <li
              key={observacion.id}
              /* **Lo nuevo se marca con un filo y con una palabra**, no con una sola de las dos.
                 El filo es lo que se recorre con la vista bajando por treinta y cinco tarjetas —una
                 palabra en la segunda línea no se ve en ese barrido—, y la palabra es lo que
                 sobrevive a que uno de cada doce hombres no distinga el color. */
              className={[
                "mb-1.5 rounded-sm bg-surface-2 transition-colors duration-[--duracion-corta] ease-[--ease-ab] hover:bg-surface-3",
                observacion.esNueva ? "border-l-2 border-accent" : "",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => void abrir(observacion)}
                className="w-full rounded-sm px-2 pt-1.5 text-left"
                title={`${observacion.titulo} · ${observacion.guid}`}
              >
                <span className="flex items-start gap-1.5">
                  {/* La prioridad con texto y no solo con color: uno de cada doce hombres no
                      distingue rojo de verde. */}
                  <span
                    className={`shrink-0 text-micro font-semibold uppercase ${TONO[observacion.prioridad] ?? "text-fg-2"}`}
                  >
                    {observacion.prioridadTexto}
                  </span>
                  {/* **De dónde viene la fila**, con palabra y no solo con color. Un choque lo
                      encontró una máquina y una nota la escribió alguien: no se leen igual. */}
                  {observacion.esInterferencia && (
                    <span className="shrink-0 rounded-xs bg-warn/20 px-1 text-nota text-warn">
                      choque
                    </span>
                  )}
                  {/* **El título sube a 15 px y la línea de abajo baja a 12**, y salió de medir la
                      pantalla: los dos estaban en 13 px, así que la jerarquía la llevaba solo el
                      color y la tarjeta se leía como un bloque gris. El título es lo que se recorre
                      treinta y cinco veces; lo demás es metadato y se lee cuando ya te fijaste en
                      uno. El contraste no era el problema —el peor par da 5,5:1—, era el tamaño. */}
                  {/* **Dos líneas y no puntos suspensivos.** Con el título a 15 px en un panel
                      estrecho, «Muro cortina eje 4 × Conducto de extrac…» se corta justo donde
                      dejaría de distinguirse de la fila siguiente, y el título es la identidad del
                      problema. El tope de dos líneas evita que una tarjeta se estire sola. */}
                  <span className="line-clamp-2 text-sm">{observacion.titulo}</span>
                </span>
                <span className="mt-0.5 block truncate text-nota text-fg-3">
                  {observacion.esNueva && <span className="text-accent">nueva · </span>}
                  {observacion.responsable}
                  {observacion.esMia && " · tuya"}
                  {observacion.vence !== null && ` · vence ${observacion.vence}`}
                  {observacion.vencida && " · ⚠ vencida"}
                  {observacion.camara === null && " · sin cámara guardada"}
                </span>
              </button>

              {noEncontrada === observacion.id && (
                <p className="px-2 pb-1 text-nota leading-snug text-warn">
                  Ese elemento no está en ningún modelo abierto. Suele ser de otra disciplina: abre
                  su modelo y vuelve a intentarlo.
                </p>
              )}

              {/* Las dos acciones, **dentro del papel de su hallazgo** y separadas entre sí: son
                  irreversibles a distinto precio —una abre una pestaña, la otra cierra el asunto
                  para siempre— y pegadas se pulsa la que no era. */}
              <span className="flex items-center gap-4 px-2 pt-0.5 pb-1.5">
                {/* El enlace a su pantalla, que es donde se comenta y se cierra. Va aparte del
                    botón porque son dos cosas distintas: mirar el problema y responderlo. */}
                <a
                  href={observacion.url}
                  target="_blank"
                  rel="noopener"
                  className="text-nota text-fg-3 underline hover:text-fg-2"
                >
                  abrir su ficha
                </a>

                {/* **Descartar sin salir del modelo.** Es lo que decide si una corrida de
                    interferencias sirve dos veces: si triar decenas exige abrir la ficha de cada
                    una en otra pestaña, nadie lo hace y a la corrida siguiente vuelven todas. */}
                {estado.puedeDescartar && descartando?.id !== observacion.id && (
                  <button
                    type="button"
                    onClick={() => setDescartando({ id: observacion.id, motivo: "" })}
                    className="text-nota text-fg-3 underline hover:text-danger"
                  >
                    no es un problema
                  </button>
                )}
              </span>

              {descartando?.id === observacion.id && (
                <form
                  className="mt-1 flex gap-1 px-2 pb-1"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    void descartar(observacion.id, descartando.motivo);
                  }}
                >
                  {/* **El motivo se exige, y no es burocracia.** La pareja de GUID hace que
                      descartar sea permanente: la corrida siguiente no vuelve a abrir el
                      conflicto, así que esto es lo único que le queda a quien pregunte dentro de
                      seis meses por qué nadie miró esa viga. */}
                  <input
                    type="text"
                    value={descartando.motivo}
                    onChange={(evento) =>
                      setDescartando({ id: observacion.id, motivo: evento.target.value })
                    }
                    placeholder="Por qué no es un problema"
                    maxLength={300}
                    autoFocus
                    className="min-w-0 flex-1 rounded-sm border border-borde bg-surface-3 px-2 py-1 text-nota text-fg placeholder:text-fg-3"
                  />
                  <button
                    type="submit"
                    disabled={descartando.motivo.trim() === ""}
                    className="shrink-0 rounded-sm bg-action px-2 py-1 text-nota font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescartando(null)}
                    className="shrink-0 rounded-sm px-1.5 py-1 text-nota text-fg-3 hover:bg-surface-3 hover:text-fg-2"
                  >
                    Dejarlo
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
