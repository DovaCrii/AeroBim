import type { BimViewer, ElementoEncontrado } from "@aerobim/viewer";
import { useEffect, useRef, useState } from "react";

import { IconClose } from "./icons.js";

/** Cuántas filas se enseñan; el resto se dice con la cuenta. Más filas no se leen. */
const FILAS_VISIBLES = 12;
/** Cuántos resultados se piden: el tope de lo que se puede aislar sin decir «solo una parte». */
const MAXIMO_DE_RESULTADOS = 200;
/** Menos de dos letras devolvería media planta: se pide algo más antes de buscar. */
const MINIMO_DE_LETRAS = 2;

/**
 * El buscador de elementos del modelo (`F15.6`): una caja arriba, al centro del lienzo, para llegar a un
 * elemento por su **nombre, su clase IFC o su GUID** sin recorrer el árbol. Es la idea del buscador de
 * Synchro: escribir, ver la lista, y o ir a uno o **aislar el conjunto** de lo hallado.
 *
 * Busca en todos los modelos abiertos y no pide que haya una obra del registro: es del modelo, no del
 * expediente. Lo que devuelve son identidades (modelo y `localId`), así que elegir una fila hace lo que
 * hace un clic sobre el elemento —ficha incluida— y aislar usa el mismo aislamiento que el árbol.
 */
export function BuscadorDelVisor({
  viewer,
  modelos,
  onElegir,
  onAislar,
}: {
  viewer: BimViewer | null;
  /** Cuántos modelos hay abiertos: al cambiar, la búsqueda anterior ya no vale. */
  modelos: number;
  onElegir: (elemento: ElementoEncontrado) => void;
  onAislar: (elementos: readonly ElementoEncontrado[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [hallado, setHallado] = useState<{
    resultados: readonly ElementoEncontrado[];
    total: number;
  } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const consulta = texto.trim();
    if (viewer === null || consulta.length < MINIMO_DE_LETRAS) {
      setHallado(null);
      setBuscando(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    // Un respiro tras la última tecla: buscar en cada letra recorre el índice varias veces por segundo.
    const espera = setTimeout(() => {
      void viewer.buscarElementos(consulta, MAXIMO_DE_RESULTADOS).then((r) => {
        if (!vivo) return;
        setHallado(r);
        setBuscando(false);
      });
    }, 220);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [texto, viewer, modelos]);

  if (modelos === 0) return null;

  const hayResultados = hallado !== null && hallado.resultados.length > 0;
  const incompleto = hallado !== null && hallado.total > hallado.resultados.length;

  // **Ni centrado ni pegado a un borde: en el hueco que dejan las demás piezas.** Por la izquierda lo
  // ocupan la ficha de lo seleccionado y la barra de herramientas (352 px + 60 px), y por la derecha el
  // selector de vista; centrado, la caja caía encima de las dos.
  return (
    <div className="absolute top-3 right-[11rem] left-[30rem] z-20 max-w-md min-w-[16rem]">
      <div className="flex items-center gap-1 rounded-lg border border-borde bg-surface/90 px-2 py-1 shadow-[var(--shadow-xl)] backdrop-blur-sm">
        <input
          ref={caja}
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") setTexto("");
          }}
          placeholder="Buscar elementos: nombre, clase o GUID"
          aria-label="buscar elementos del modelo"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-fg placeholder:text-fg-3 focus:outline-none"
        />
        {texto !== "" && (
          <button
            type="button"
            aria-label="borrar la búsqueda"
            onClick={() => {
              setTexto("");
              caja.current?.focus();
            }}
            className="rounded-sm p-1 text-fg-2 hover:bg-surface-3 [&>svg]:h-4 [&>svg]:w-4"
          >
            <IconClose />
          </button>
        )}
      </div>

      {texto.trim().length >= MINIMO_DE_LETRAS && (
        <div
          role="region"
          aria-label="resultados de la búsqueda"
          className="mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-borde bg-surface/95 shadow-[var(--shadow-xl)] backdrop-blur-sm"
        >
          {buscando && hallado === null ? (
            <p className="px-3 py-2 text-xs text-fg-3">Buscando…</p>
          ) : !hayResultados ? (
            <p className="px-3 py-2 text-xs text-fg-3">
              Ningún elemento con «{texto.trim()}». Prueba con parte del nombre, una clase como
              IFCWALL o un GUID.
            </p>
          ) : (
            <>
              <ul>
                {hallado.resultados.slice(0, FILAS_VISIBLES).map((e) => (
                  <li key={`${e.modelId}:${e.localId}`}>
                    <button
                      type="button"
                      onClick={() => onElegir(e)}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="w-full truncate text-sm text-fg">
                        {e.nombre ?? "Sin nombre"}
                      </span>
                      <span className="w-full truncate text-xs text-fg-2">
                        {e.categoria}
                        {e.guid !== null && ` · ${e.guid}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borde px-3 py-2 text-xs">
                <span className="text-fg-2">
                  {hallado.total === 1 ? "1 elemento" : `${hallado.total} elementos`}
                  {hallado.resultados.length > FILAS_VISIBLES && ` · se enseñan ${FILAS_VISIBLES}`}
                </span>
                <button
                  type="button"
                  disabled={incompleto}
                  title={
                    incompleto
                      ? `Hay ${hallado.total} y solo se pueden aislar ${hallado.resultados.length}: afina la búsqueda`
                      : "Deja a la vista solo lo hallado; «Salir», en la barra de abajo, lo deshace"
                  }
                  onClick={() => onAislar(hallado.resultados)}
                  className="ml-auto rounded-sm bg-accent px-2.5 py-1 font-medium text-surface hover:bg-accent-hover disabled:opacity-50"
                >
                  Aislar {hallado.resultados.length === hallado.total ? "todos" : "los hallados"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
