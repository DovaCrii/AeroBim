import { textoDePk } from "@aerobim/viewer";

import {
  balizasConNumero,
  seguimientoDeLamina,
  type SeguimientoDelPerfil as Seguimiento,
} from "../seguimiento-perfil.js";
import type { EjeDePerfil } from "@aerobim/bim-core";

/**
 * **Dónde va la lámina dentro del perfil**, en una barra al pie del visor 2D (2026-10-09).
 *
 * La regla inferior de una transversal mide el ancho de su franja, no un PK, y con cientos de láminas casi
 * iguales nada decía en qué punto del trazado se estaba. Esta barra es el eje entero, de su inicio a su
 * final, con las balizas numeradas y un marcador en el PK de la lámina que se mira; pinchar una baliza
 * salta a la transversal más cercana. Para el longitudinal, que cubre todo el eje, la barra va entera
 * resaltada.
 */
export function SeguimientoDelPerfil({
  eje,
  pkM,
  nombre,
  onIrA,
}: {
  readonly eje: EjeDePerfil;
  /** El PK de la transversal que se mira, o `undefined` si es el longitudinal. */
  readonly pkM: number | undefined;
  readonly nombre: string;
  /** Pide saltar a la transversal más cercana a ese PK. */
  readonly onIrA: (pkM: number) => void;
}) {
  const s: Seguimiento | null = seguimientoDeLamina(eje, pkM);
  if (s === null) return null;
  const numeradas = balizasConNumero(s.balizas, 6);
  const dondeEstoy =
    s.posicionM === null
      ? `${nombre} · todo el eje, de PK ${textoDePk(0)} a ${textoDePk(s.largoM, 1)}`
      : `PK ${textoDePk(s.posicionM)} de ${textoDePk(s.largoM, 1)}`;

  return (
    <div
      role="group"
      aria-label="Seguimiento del perfil"
      className="absolute bottom-3 left-1/2 z-20 w-[min(44rem,calc(100%-9rem))] -translate-x-1/2 rounded-lg border border-borde bg-surface/95 px-4 pt-2 pb-2.5 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-fg">Seguimiento del perfil</span>
        <span className="truncate text-fg-2 tabular-nums">{dondeEstoy}</span>
      </p>
      <div className="relative h-9">
        {/* El eje: una barra, resaltada entera cuando la lámina es el longitudinal. */}
        <div
          className={[
            "absolute top-3 right-0 left-0 h-1.5 rounded-full",
            s.fraccionActual === null ? "bg-accent" : "bg-surface-3",
          ].join(" ")}
        />
        {s.fraccionActual !== null && (
          <div
            className="absolute top-3 left-0 h-1.5 rounded-full bg-accent"
            style={{ width: `${s.fraccionActual * 100}%` }}
          />
        )}
        {s.balizas.map((b) => (
          <button
            key={b.pkM}
            type="button"
            onClick={() => onIrA(b.pkM)}
            title={`Ir a PK ${textoDePk(b.pkM, b.esFinal ? 1 : 2)}`}
            aria-label={`Ir a PK ${textoDePk(b.pkM, b.esFinal ? 1 : 2)}`}
            className="absolute top-1.5 h-6 w-3 -translate-x-1/2 cursor-pointer rounded-sm after:absolute after:top-1.5 after:left-1/2 after:h-3 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-fg-2 hover:after:bg-fg"
            style={{ left: `${b.fraccion * 100}%` }}
          />
        ))}
        {numeradas.map((b) => (
          <span
            key={`n-${b.pkM}`}
            className="pointer-events-none absolute top-[1.65rem] -translate-x-1/2 text-nota text-fg-2 tabular-nums"
            style={{ left: `${b.fraccion * 100}%` }}
          >
            {textoDePk(b.pkM, b.esFinal ? 1 : 0)}
          </span>
        ))}
        {s.fraccionActual !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-9 w-0.5 -translate-x-1/2 bg-accent"
            style={{ left: `${s.fraccionActual * 100}%` }}
          >
            <span className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-surface bg-accent" />
          </span>
        )}
      </div>
    </div>
  );
}
