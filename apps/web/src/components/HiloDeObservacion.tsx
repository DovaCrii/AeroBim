/**
 * El hilo de una observación, como una conversación, con la caja para contestar (`F15.4`).
 *
 * Es el panel de comentarios de las dos referencias —mensajes propios a la derecha, ajenos a la izquierda,
 * «hace 4 h» bajo cada uno y la caja abajo—, hablando con `HiloDeObservacionAPI`. Se usa en el panel del
 * documento y en la tarjeta de un tema en la escena: la misma pieza, para que no haya dos hilos que se
 * parezcan y se separen.
 *
 * **Con `@` se menciona a alguien de la obra**: al teclearla sale la lista de la gente a quien se puede
 * avisar, y quien se elige recibe aviso de este mensaje. Solo texto: adjuntar una imagen sigue siendo de
 * la ficha (`F12.11`).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cabecerasDeEscritura } from "../csrf.js";
import {
  avisoDeRespuesta,
  haceCuanto,
  idsMencionados,
  insertarMencion,
  mencionEnCurso,
  partirPorMenciones,
  sugerencias,
  type HiloCargado,
  type MensajeDelHilo,
} from "../hilo.js";

type Carga =
  | { readonly kind: "cargando" }
  | { readonly kind: "listo"; readonly hilo: HiloCargado }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

export function HiloDeObservacion({
  observacionId,
  onEstado,
}: {
  observacionId: string;
  /** Avisa del estado de la observación tras contestar: contestar la deja «respondida». */
  onEstado?: (estado: string, estadoTexto: string) => void;
}) {
  const [carga, setCarga] = useState<Carga>({ kind: "cargando" });
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  /** Dónde está el cursor en la caja: de él depende si se está escribiendo una mención. */
  const [cursor, setCursor] = useState(0);
  /** A quién se eligió de la lista (id → nombre). Solo cuenta quien sigue escrito al enviar. */
  const [elegidos, setElegidos] = useState<ReadonlyMap<number, string>>(new Map());
  const [resaltada, setResaltada] = useState(0);
  /** `Esc` cierra la lista de menciones; vuelve a abrirse con lo siguiente que se teclee. */
  const [listaCerrada, setListaCerrada] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const ruta = `/api/observaciones/${observacionId}/hilo/`;

  useEffect(() => {
    let vivo = true;
    setCarga({ kind: "cargando" });
    setAviso(null);
    setFallo(null);
    setElegidos(new Map());
    void (async () => {
      try {
        const respuesta = await fetch(ruta, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!vivo) return;
        // 403 es que este rol no lee hilos, no que algo falló: decirlo como error manda a buscarlo.
        if (respuesta.status === 403) return setCarga({ kind: "sin-permiso" });
        if (!respuesta.ok) {
          return setCarga({ kind: "error", mensaje: `El registro respondió ${respuesta.status}.` });
        }
        const datos = (await respuesta.json()) as HiloCargado;
        // Un servidor viejo no manda `mencionables`: sin él, simplemente no hay menciones.
        setCarga({ kind: "listo", hilo: { ...datos, mencionables: datos.mencionables ?? [] } });
      } catch {
        if (vivo) setCarga({ kind: "error", mensaje: "No se pudo leer el hilo." });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ruta]);

  // El último mensaje a la vista: es el que se acaba de escribir o el que hay que contestar.
  const cuantos = carga.kind === "listo" ? carga.hilo.comentarios.length : 0;
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "nearest" });
  }, [cuantos]);

  const mencionables = carga.kind === "listo" ? carga.hilo.mencionables : [];
  const enCurso = mencionEnCurso(texto, cursor);
  const ofrecidos =
    enCurso === null || listaCerrada ? [] : sugerencias(mencionables, enCurso.termino);
  const alElegida = Math.min(resaltada, Math.max(0, ofrecidos.length - 1));

  const elegir = useCallback(
    (persona: { id: number; nombre: string }) => {
      if (enCurso === null) return;
      const nuevo = insertarMencion(texto, cursor, enCurso, persona.nombre);
      setTexto(nuevo.texto);
      setCursor(nuevo.cursor);
      setElegidos((actual) => new Map(actual).set(persona.id, persona.nombre));
      setResaltada(0);
      // El cursor vuelve a la caja, justo detrás de la mención. `setTimeout` y no un fotograma: corre
      // aunque la pestaña no esté dibujando.
      setTimeout(() => {
        caja.current?.focus();
        caja.current?.setSelectionRange(nuevo.cursor, nuevo.cursor);
      }, 0);
    },
    [enCurso, texto, cursor],
  );

  const enviar = useCallback(async () => {
    const limpio = texto.trim();
    if (limpio === "" || enviando) return;
    setEnviando(true);
    setFallo(null);
    setAviso(null);
    try {
      const respuesta = await fetch(ruta, {
        method: "POST",
        credentials: "same-origin",
        headers: cabecerasDeEscritura(),
        body: JSON.stringify({ texto: limpio, menciones: idsMencionados(limpio, elegidos) }),
      });
      if (respuesta.status === 403) {
        setFallo("Tu rol no puede contestar en este hilo.");
        return;
      }
      if (!respuesta.ok) {
        setFallo(`No se pudo guardar (${respuesta.status}). Tu texto sigue aquí.`);
        return;
      }
      const datos = (await respuesta.json()) as {
        comentario: MensajeDelHilo;
        estado: string;
        estadoTexto: string;
        avisados: readonly string[] | null;
        avisadosPorMencion?: readonly string[] | null;
      };
      setCarga((actual) =>
        actual.kind === "listo"
          ? {
              kind: "listo",
              hilo: {
                ...actual.hilo,
                estado: datos.estado,
                estadoTexto: datos.estadoTexto,
                comentarios: [...actual.hilo.comentarios, datos.comentario],
              },
            }
          : actual,
      );
      setTexto("");
      setCursor(0);
      setElegidos(new Map());
      // Si falló el aviso de la mención se dice con el mismo aviso: quien escribe tiene que saber que el
      // otro puede no haberse enterado.
      setAviso(avisoDeRespuesta(datos.avisados, datos.avisadosPorMencion));
      onEstado?.(datos.estado, datos.estadoTexto);
    } catch {
      // El texto no se borra: perder lo escrito por un corte de red es lo peor que puede pasar aquí.
      setFallo("No se pudo guardar. Tu texto sigue aquí.");
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, ruta, onEstado, elegidos]);

  if (carga.kind === "cargando") return <p className="text-xs text-fg-3">Leyendo el hilo…</p>;
  if (carga.kind === "sin-permiso") {
    return <p className="text-xs text-fg-3">Tu rol no puede leer el hilo de esta observación.</p>;
  }
  if (carga.kind === "error") return <p className="text-xs text-fg-3">{carga.mensaje}</p>;

  const { hilo } = carga;
  const ahora = Date.now();
  const nombres = hilo.mencionables.map((m) => m.nombre);

  return (
    <div className="flex flex-col gap-2" aria-label="hilo de la observación">
      {hilo.comentarios.length === 0 ? (
        <p className="text-xs text-fg-3">Todavía nadie ha contestado.</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
          {hilo.comentarios.map((m) => (
            <li key={m.id} className={`flex flex-col ${m.esMio ? "items-end" : "items-start"}`}>
              <span
                className={`max-w-[92%] rounded-lg px-2.5 py-1.5 text-xs break-words whitespace-pre-wrap ${
                  m.esMio ? "bg-[#7c3aed] text-white" : "bg-surface-3 text-fg"
                }`}
              >
                {/* Las menciones **subrayadas y en negrita**, no solo de otro color: el color no lo ve
                    quien no distingue colores, y sobre el violeta de «lo mío» casi no se distinguiría. */}
                {partirPorMenciones(m.texto, nombres).map((trozo, i) =>
                  trozo.mencion ? (
                    <strong key={i} className="font-bold underline">
                      {trozo.texto}
                    </strong>
                  ) : (
                    <span key={i}>{trozo.texto}</span>
                  ),
                )}
              </span>
              <span className="mt-0.5 text-nota text-fg-3">
                {m.esMio ? "Tú" : m.autor} · {haceCuanto(m.creada, ahora)}
              </span>
              {m.imagen !== null && (
                <a className="text-nota text-accent underline" href={m.imagen}>
                  Ver la imagen adjunta
                </a>
              )}
            </li>
          ))}
          <div ref={fin} />
        </ul>
      )}

      {hilo.puedeComentar ? (
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            void enviar();
          }}
          className="relative flex flex-col gap-1.5"
        >
          {ofrecidos.length > 0 && (
            <ul
              role="listbox"
              aria-label="a quién mencionar"
              className="absolute right-0 bottom-full left-0 z-30 mb-1 overflow-hidden rounded-md border border-borde bg-surface shadow-[var(--shadow-xl)]"
            >
              {ofrecidos.map((persona, i) => (
                <li key={persona.id} role="option" aria-selected={i === alElegida}>
                  <button
                    type="button"
                    // `mousedown` y no `click`: el clic le quitaría el foco a la caja antes de elegir.
                    onMouseDown={(evento) => {
                      evento.preventDefault();
                      elegir(persona);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left text-xs ${
                      i === alElegida ? "bg-accent text-surface" : "text-fg hover:bg-surface-2"
                    }`}
                  >
                    {persona.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={caja}
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setCursor(evento.target.selectionStart);
              setResaltada(0);
              setListaCerrada(false);
            }}
            onSelect={(evento) => setCursor(evento.currentTarget.selectionStart)}
            onKeyDown={(evento) => {
              // Con la lista abierta, las flechas, Intro y Tab son de la lista, y Esc la cierra.
              if (ofrecidos.length > 0) {
                if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
                  evento.preventDefault();
                  const paso = evento.key === "ArrowDown" ? 1 : -1;
                  setResaltada((alElegida + paso + ofrecidos.length) % ofrecidos.length);
                  return;
                }
                if (evento.key === "Enter" || evento.key === "Tab") {
                  evento.preventDefault();
                  const persona = ofrecidos[alElegida];
                  if (persona !== undefined) elegir(persona);
                  return;
                }
                if (evento.key === "Escape") {
                  evento.preventDefault();
                  setListaCerrada(true);
                  return;
                }
              }
              // Intro envía; Mayús+Intro hace salto de línea: es lo que hace cualquier chat.
              if (evento.key === "Enter" && !evento.shiftKey) {
                evento.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            placeholder={
              hilo.mencionables.length > 0
                ? "Escribe una respuesta. Con @ mencionas a alguien de la obra"
                : "Escribe una respuesta"
            }
            aria-label="respuesta"
            className="w-full resize-none rounded-sm border border-borde-campo bg-surface-3 px-2 py-1.5 text-xs text-fg placeholder:text-fg-3"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={enviando || texto.trim() === ""}
              className="rounded-sm bg-accent px-2.5 py-1 text-xs font-medium text-surface hover:bg-accent-hover disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Responder"}
            </button>
            <span className="text-nota text-fg-3">Estado: {hilo.estadoTexto}</span>
          </div>
        </form>
      ) : (
        <p className="text-nota text-fg-3">Tu rol puede leer este hilo, no contestar.</p>
      )}

      {fallo !== null && (
        <p role="alert" className="text-xs text-danger">
          {fallo}
        </p>
      )}
      {aviso !== null && <p className="text-xs text-fg-2">{aviso}</p>}
    </div>
  );
}
