/**
 * Los temas de la obra, **colgados de su elemento en la escena** como globos numerados, y el detalle del
 * que se elige (`F15.3`). Es la presentación de iTwin Design Review: un globo con el número del tema sobre
 * el elemento, y al pulsarlo, una tarjeta con su estado, su responsable y el camino a su vista guardada.
 *
 * Los globos son HTML sobre el lienzo, no geometría: se reposicionan al mover la cámara con
 * `BimViewer.onCameraChange` + `puntosEnPantalla`. Cuelgan de **la cara de arriba del elemento** (por GUID)
 * y se esconden si el punto queda detrás de la cámara o fuera del lienzo. **No se ocultan tras los muros**:
 * un globo visible a través de la pared dice «hay algo aquí» aunque no se vea el elemento, que en
 * coordinación es lo que se quiere.
 */

import type { BimViewer } from "@aerobim/viewer";
import { useCallback, useEffect, useMemo, useState } from "react";

import { numeroDeTema, type ObservacionDelModelo } from "../temas.js";
import { HiloDeObservacion } from "./HiloDeObservacion.js";

interface Posicion {
  readonly x: number;
  readonly y: number;
}

export function GlobosDeTemas({
  viewer,
  temas,
  modelos,
  elegido,
  onElegir,
  onAbrirVista,
  onCerrar,
}: {
  viewer: BimViewer | null;
  /** Cuántos modelos hay abiertos: al cambiar, hay que volver a buscar dónde está cada elemento. */
  modelos: number;
  temas: readonly ObservacionDelModelo[];
  /** El tema elegido, o `null`. */
  elegido: string | null;
  onElegir: (id: string) => void;
  /** Lleva la cámara al punto de vista guardado del tema y selecciona su elemento. */
  onAbrirVista: (tema: ObservacionDelModelo) => void;
  onCerrar: () => void;
}) {
  const [centros, setCentros] = useState<ReadonlyMap<string, readonly [number, number, number]>>(
    new Map(),
  );
  const [posiciones, setPosiciones] = useState<ReadonlyMap<string, Posicion>>(new Map());

  // Lo que cambió al contestar (el estado), sin volver a pedir la lista entera de temas.
  const [estadoLocal, setEstadoLocal] = useState<ReadonlyMap<string, string>>(new Map());

  const guids = useMemo(() => [...new Set(temas.map((t) => t.guid))], [temas]);

  // Dónde está cada elemento: se pide una vez por lista, no por fotograma.
  useEffect(() => {
    if (viewer === null || guids.length === 0) {
      setCentros(new Map());
      return;
    }
    let vivo = true;
    void viewer.centrosDeElementos(guids).then((c) => {
      if (vivo) setCentros(c);
    });
    return () => {
      vivo = false;
    };
  }, [viewer, guids, modelos]);

  const reposicionar = useCallback(() => {
    if (viewer === null) return;
    const entradas = [...centros.entries()];
    const puntos = viewer.puntosEnPantalla(entradas.map(([, c]) => c));
    const ancho = viewer.anchoDelLienzo();
    const alto = viewer.altoDelLienzo();
    const siguiente = new Map<string, Posicion>();
    entradas.forEach(([guid], i) => {
      const p = puntos[i];
      if (p === undefined || !p.delante) return;
      // Fuera del lienzo no se dibuja: el globo se vería pegado al borde de otro panel.
      if (p.x < 0 || p.y < 0 || p.x > ancho || p.y > alto) return;
      siguiente.set(guid, { x: p.x, y: p.y });
    });
    setPosiciones(siguiente);
  }, [viewer, centros]);

  useEffect(() => {
    reposicionar();
    if (viewer === null) return;
    return viewer.onCameraChange(reposicionar);
  }, [viewer, reposicionar]);

  const tema = temas.find((t) => t.id === elegido) ?? null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-label="temas en el modelo"
      >
        {temas.map((t, i) => {
          const sitio = posiciones.get(t.guid);
          if (sitio === undefined) return null;
          const esta = t.id === elegido;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={esta}
              title={`${numeroDeTema(i)} · ${t.titulo}`}
              onClick={() => onElegir(t.id)}
              // El globo apunta hacia abajo: su punta (la esquina inferior central) es el punto.
              style={{ left: sitio.x, top: sitio.y }}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-md px-2 py-0.5 text-xs font-bold text-white shadow-md ${
                t.vencida ? "bg-[#b4233a]" : "bg-[#7c3aed]"
              } ${esta ? "z-10 ring-4 ring-accent/50" : ""}`}
            >
              {numeroDeTema(i)}
              <span
                aria-hidden="true"
                className={`absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent ${
                  t.vencida ? "border-t-[#b4233a]" : "border-t-[#7c3aed]"
                }`}
              />
            </button>
          );
        })}
      </div>

      {tema !== null && (
        <section
          aria-label="detalle del tema"
          className="absolute right-3 bottom-3 z-20 w-72 rounded-lg border border-borde bg-surface/95 p-3 shadow-[var(--shadow-xl)] backdrop-blur-sm"
        >
          <header className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold text-fg">
              <span className="mr-1.5 rounded bg-[#7c3aed] px-1.5 py-0.5 text-xs font-bold text-white">
                {numeroDeTema(temas.indexOf(tema))}
              </span>
              {tema.titulo}
            </h3>
            <button
              type="button"
              aria-label="cerrar el detalle"
              onClick={onCerrar}
              className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3"
            >
              ×
            </button>
          </header>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-fg-3">Estado</dt>
            <dd className="text-fg">{estadoLocal.get(tema.id) ?? tema.estadoTexto}</dd>
            <dt className="text-fg-3">Prioridad</dt>
            <dd className="text-fg">{tema.prioridadTexto}</dd>
            <dt className="text-fg-3">Responsable</dt>
            <dd className="text-fg">{tema.responsable}</dd>
            {tema.vence !== null && (
              <>
                <dt className="text-fg-3">Vence</dt>
                <dd className={tema.vencida ? "text-danger" : "text-fg"}>
                  {tema.vence}
                  {tema.vencida ? " · vencido" : ""}
                </dd>
              </>
            )}
            {tema.esInterferencia && (
              <>
                <dt className="text-fg-3">Origen</dt>
                <dd className="text-fg">Interferencia detectada</dd>
              </>
            )}
          </dl>
          <div className="mt-3 border-t border-borde pt-3">
            <HiloDeObservacion
              key={tema.id}
              observacionId={tema.id}
              onEstado={(_estado, texto) =>
                setEstadoLocal((actual) => new Map(actual).set(tema.id, texto))
              }
            />
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => onAbrirVista(tema)}
              className="rounded-sm bg-accent px-2.5 py-1 font-medium text-surface hover:bg-accent-hover"
            >
              Ir a la vista guardada
            </button>
            <a className="text-accent underline" href={tema.url}>
              Abrir la ficha
            </a>
          </div>
        </section>
      )}
    </>
  );
}
