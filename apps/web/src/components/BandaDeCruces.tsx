import {
  crucesEn,
  filasDeBanda,
  nombreDeClase,
  pasoDeGraduacion,
  type CruceDePerfil,
} from "@aerobim/bim-core";
import { textoDePk } from "@aerobim/viewer";
import { useMemo } from "react";

/**
 * La **banda de cruces** bajo un perfil: qué cruza el trazado, y en qué tramos (2026-10-05).
 *
 * Es la idea de las láminas de perfil de topografía, que debajo del dibujo ponen una **banda de datos**
 * alineada con el abscisado: qué hay en cada punto del trazado. Aquí la banda dice **qué elementos del
 * modelo cruza el eje** —muros, losas, vigas— con una fila por clase y una barra que marca los tramos de
 * PK donde hay algo de ella.
 *
 * ## Qué hace con el cursor
 *
 * Mientras se pasa el cursor por el perfil dibujado, la banda **dice dónde está** —PK y cota— y **qué hay
 * justo ahí** y a lo largo de esa vertical, y una línea recorre las barras. Es la respuesta a «¿qué es lo
 * que cruza en este momento?»: no hace falta ir al modelo ni abrir una tabla.
 *
 * ## Lo que se afirma y lo que no
 *
 * Los tramos salen de la **caja envolvente** de cada elemento, no de su geometría: uno diagonal puede figurar
 * en un tramo que no ocupa del todo. La banda lo dice en su pie. Y no es un corte exacto: el perfil es la
 * proyección de una franja, como ya dice la tarjeta que lo crea.
 */
export function BandaDeCruces({
  cruces,
  largoM,
  cursor,
}: {
  readonly cruces: readonly CruceDePerfil[];
  /** El largo del trazado, en metros de PK: lo que mide la regla. */
  readonly largoM: number;
  /** Dónde está el cursor sobre el perfil, o `null` si no está encima. */
  readonly cursor: { readonly pkM: number; readonly cotaM: number } | null;
}) {
  const filas = useMemo(() => filasDeBanda(cruces), [cruces]);
  const paso = pasoDeGraduacion(largoM, 8);
  const marcas = useMemo(() => {
    const lista: number[] = [];
    for (let pk = 0; pk <= largoM + 1e-9; pk += paso) lista.push(pk);
    return lista;
  }, [largoM, paso]);

  const dentro = cursor !== null && cursor.pkM >= 0 && cursor.pkM <= largoM;
  const justoAqui = dentro ? crucesEn(cruces, cursor.pkM, cursor.cotaM) : [];
  const enLaVertical = dentro ? crucesEn(cruces, cursor.pkM) : [];
  const pct = (m: number) => `${Math.min(100, Math.max(0, (m / largoM) * 100))}%`;

  return (
    <section
      aria-label="Qué cruza el perfil"
      className="flex h-56 shrink-0 flex-col border-t border-borde bg-surface"
    >
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-borde px-2 py-1">
        <h2 className="text-xs font-semibold">
          Qué cruza el perfil{" "}
          <span className="font-normal text-fg-3 tabular-nums">{cruces.length}</span>
        </h2>
        {/* `aria-live` en cortés: el cursor cambia treinta veces por segundo y no se anuncia cada vez. */}
        <p className="min-w-0 flex-1 truncate text-nota text-fg-2" aria-live="off">
          {!dentro ? (
            <span className="text-fg-3">
              Pasa el cursor por el perfil para ver qué cruza en cada punto.
            </span>
          ) : (
            <>
              <span className="font-medium text-fg tabular-nums">
                PK {textoDePk(cursor.pkM)} · cota {cursor.cotaM.toFixed(2)} m
              </span>
              {" · "}
              <span>justo aquí: {justoAqui.length === 0 ? "nada" : resumen(justoAqui)}</span>
              {enLaVertical.length > justoAqui.length && (
                <span className="text-fg-3"> · en esta vertical: {resumen(enLaVertical)}</span>
              )}
            </>
          )}
        </p>
      </header>

      {filas.length === 0 ? (
        <p className="p-3 text-xs leading-snug text-fg-3">
          El trazado no cruza ningún elemento del modelo. Ensancha la franja, o enciende lo que
          quieras ver en el perfil.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-1">
          <div className="grid grid-cols-[10rem_1fr] items-center gap-x-2 gap-y-1">
            {/* La regla de PK: la misma graduación que lleva el dibujo, en un paso que se lee. */}
            <span />
            <div className="relative h-4 border-b border-borde" aria-hidden>
              {marcas.map((pk) => (
                <span
                  key={pk}
                  className="absolute top-0 -translate-x-1/2 text-nota text-fg-3 tabular-nums"
                  style={{ left: pct(pk) }}
                >
                  {textoDePk(pk).replace(/\.00$/, "")}
                </span>
              ))}
            </div>

            {filas.map((fila) => (
              <FilaDeLaBanda
                key={fila.categoria}
                fila={fila}
                largoM={largoM}
                cursorM={dentro ? cursor.pkM : null}
              />
            ))}
          </div>
        </div>
      )}

      <p className="shrink-0 border-t border-borde px-2 py-0.5 text-nota text-fg-3">
        Por caja envolvente: un elemento diagonal puede figurar en un tramo que no ocupa del todo.
      </p>
    </section>
  );
}

function FilaDeLaBanda({
  fila,
  largoM,
  cursorM,
}: {
  readonly fila: ReturnType<typeof filasDeBanda>[number];
  readonly largoM: number;
  readonly cursorM: number | null;
}) {
  const porCiento = (m: number) => (m / largoM) * 100;
  return (
    <>
      <span className="truncate text-nota text-fg-2" title={fila.categoria}>
        {nombreDeClase(fila.categoria)}{" "}
        <span className="text-fg-3 tabular-nums">× {fila.cuantos}</span>
      </span>
      <div className="relative h-4 rounded-sm bg-surface-2">
        {fila.tramos.map(([desde, hasta]) => (
          <span
            key={`${desde}-${hasta}`}
            title={`${nombreDeClase(fila.categoria)} · de PK ${textoDePk(desde)} a ${textoDePk(hasta)}`}
            className="absolute top-0 h-full rounded-xs bg-accent/60"
            style={{
              left: `${Math.max(0, porCiento(desde))}%`,
              // Un tramo estrecho no desaparece: un mínimo de 2 px para que se vea que hay algo.
              width: `max(2px, ${Math.max(0, porCiento(hasta) - porCiento(desde))}%)`,
            }}
          />
        ))}
        {cursorM !== null && (
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-warn"
            style={{ left: `${Math.min(100, Math.max(0, porCiento(cursorM)))}%` }}
          />
        )}
      </div>
    </>
  );
}

/** «Muro × 2, Losa»: las clases que hay, con cuántas son si pasan de una. */
function resumen(cruces: readonly CruceDePerfil[]): string {
  const cuenta = new Map<string, number>();
  for (const c of cruces) cuenta.set(c.categoria, (cuenta.get(c.categoria) ?? 0) + 1);
  return [...cuenta]
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, cuantos]) =>
      cuantos > 1 ? `${nombreDeClase(categoria)} × ${cuantos}` : nombreDeClase(categoria),
    )
    .join(", ");
}
