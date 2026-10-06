/**
 * El hilo de una observación, como una conversación, con la caja para contestar (`F15.4`).
 *
 * Es el panel de comentarios de las dos referencias —mensajes propios a la derecha, ajenos a la izquierda,
 * «hace 4 h» bajo cada uno y la caja abajo—, hablando con `HiloDeObservacionAPI`. Se usa en el panel del
 * documento y en la tarjeta de un tema en la escena: la misma pieza, para que no haya dos hilos que se
 * parezcan y se separen.
 *
 * Solo texto: adjuntar una imagen sigue siendo de la ficha (`F12.11`).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cabecerasDeEscritura } from "../csrf.js";
import { avisoDeRespuesta, haceCuanto, type HiloCargado, type MensajeDelHilo } from "../hilo.js";

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
  const fin = useRef<HTMLDivElement>(null);
  const ruta = `/api/observaciones/${observacionId}/hilo/`;

  useEffect(() => {
    let vivo = true;
    setCarga({ kind: "cargando" });
    setAviso(null);
    setFallo(null);
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
        setCarga({ kind: "listo", hilo: (await respuesta.json()) as HiloCargado });
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
        body: JSON.stringify({ texto: limpio }),
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
      setAviso(avisoDeRespuesta(datos.avisados));
      onEstado?.(datos.estado, datos.estadoTexto);
    } catch {
      // El texto no se borra: perder lo escrito por un corte de red es lo peor que puede pasar aquí.
      setFallo("No se pudo guardar. Tu texto sigue aquí.");
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, ruta, onEstado]);

  if (carga.kind === "cargando") return <p className="text-xs text-fg-3">Leyendo el hilo…</p>;
  if (carga.kind === "sin-permiso") {
    return <p className="text-xs text-fg-3">Tu rol no puede leer el hilo de esta observación.</p>;
  }
  if (carga.kind === "error") return <p className="text-xs text-fg-3">{carga.mensaje}</p>;

  const { hilo } = carga;
  const ahora = Date.now();

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
                {m.texto}
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
          className="flex flex-col gap-1.5"
        >
          <textarea
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              // Intro envía; Mayús+Intro hace salto de línea: es lo que hace cualquier chat.
              if (evento.key === "Enter" && !evento.shiftKey) {
                evento.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            placeholder="Escribe una respuesta"
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
