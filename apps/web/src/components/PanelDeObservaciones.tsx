/**
 * El panel «Observaciones» del visor de documentos (`F15.1`).
 *
 * Es la lista de hallazgos a la derecha de la página, como el panel «Issues» de ProjectWise: cada
 * observación con su número —el mismo que lleva su marca en la página—, su estado, su responsable y su
 * plazo, y filtros con su cuenta. Elegir una lleva a su página y la resalta; elegir una marca de la página
 * la resalta aquí. El detalle y el hilo siguen en su ficha (`F15.4` los traerá aquí).
 */

import { useEffect, useRef } from "react";

import { HiloDeObservacion } from "./HiloDeObservacion.js";
import {
  FILTROS,
  cuentas,
  estaCerrada,
  filtrar,
  textoDePlazo,
  type FiltroDeObservaciones,
  type ObservacionDeDocumento,
} from "../observaciones-panel.js";

export function PanelDeObservaciones({
  observaciones,
  numeros,
  filtro,
  onFiltro,
  elegida,
  onElegir,
  onRespondida,
  hoy,
}: {
  observaciones: readonly ObservacionDeDocumento[];
  numeros: ReadonlyMap<string, number>;
  filtro: FiltroDeObservaciones;
  onFiltro: (filtro: FiltroDeObservaciones) => void;
  elegida: string | null;
  onElegir: (id: string) => void;
  /** Se contestó en el hilo de una observación: su estado cambió y su hilo creció. */
  onRespondida: (id: string, estado: string, estadoTexto: string) => void;
  /** Hoy, `AAAA-MM-DD`: entra por parámetro para que lo que dice el plazo no dependa del reloj. */
  hoy: string;
}) {
  // En el orden de las marcas —1, 2, 3…—, no en el que llegaron: una lista que salta de número se lee mal.
  const visibles = [...filtrar(observaciones, filtro)].sort(
    (a, b) => (numeros.get(a.id) ?? 0) - (numeros.get(b.id) ?? 0),
  );
  const total = cuentas(observaciones);
  const elegidaRef = useRef<HTMLLIElement>(null);

  // Si la elegida se eligió desde la página, la lista la trae a la vista.
  useEffect(() => {
    elegidaRef.current?.scrollIntoView({ block: "nearest" });
  }, [elegida]);

  return (
    <aside
      aria-label="observaciones del documento"
      className="flex w-80 shrink-0 flex-col border-l border-borde bg-surface"
    >
      <header className="border-b border-borde px-4 pt-3 pb-2">
        <h2 className="text-base font-semibold text-fg">Observaciones</h2>
        <div role="group" aria-label="filtrar" className="mt-2 flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => onFiltro(f.id)}
              className={`rounded-sm px-2 py-1 text-xs ${
                filtro === f.id
                  ? "bg-accent text-surface"
                  : "bg-surface-2 text-fg-2 hover:bg-surface-3"
              }`}
            >
              {f.texto} {total[f.id]}
            </button>
          ))}
        </div>
      </header>

      {visibles.length === 0 ? (
        <p className="px-4 py-6 text-sm text-fg-3">
          {observaciones.length === 0
            ? "Este documento no tiene observaciones."
            : "Ninguna observación con este filtro."}
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {visibles.map((o) => {
            const plazo = textoDePlazo(o, hoy);
            const esta = o.id === elegida;
            return (
              <li
                key={o.id}
                ref={esta ? elegidaRef : undefined}
                className={`border-b border-borde ${esta ? "bg-surface-2" : ""}`}
              >
                <button
                  type="button"
                  aria-current={esta ? "true" : undefined}
                  onClick={() => onElegir(o.id)}
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-surface"
                  >
                    {numeros.get(o.id)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{o.titulo}</span>
                    <span className="mt-0.5 block text-xs text-fg-2">
                      <span className={estaCerrada(o) ? "text-ok" : "text-fg"}>
                        {o.estadoTexto}
                      </span>
                      {" · "}
                      {o.responsable} · pág. {o.pagina}
                    </span>
                    {plazo !== null && (
                      <span
                        className={`mt-0.5 block text-xs ${o.vencida ? "text-danger" : "text-fg-2"}`}
                      >
                        {plazo}
                      </span>
                    )}
                    {o.comentarios > 0 && (
                      <span className="mt-0.5 block text-xs text-fg-3">
                        {o.comentarios} {o.comentarios === 1 ? "comentario" : "comentarios"}
                      </span>
                    )}
                  </span>
                </button>
                {esta && (
                  <div className="flex flex-col gap-2 px-4 pb-3 pl-13 text-xs">
                    <HiloDeObservacion
                      observacionId={o.id}
                      onEstado={(estado, texto) => onRespondida(o.id, estado, texto)}
                    />
                    <a className="text-accent underline" href={o.url}>
                      Abrir la ficha
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
