import { textoDePk } from "@aerobim/viewer";

import type { CruceDePerfil, EjeDePerfil } from "@aerobim/bim-core";

import {
  balizasConNumero,
  seguimientoDeLamina,
  siluetaDePerfil,
  type SeguimientoDelPerfil as Seguimiento,
} from "../seguimiento-perfil.js";

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
  cruces,
  onIrA,
}: {
  readonly eje: EjeDePerfil;
  /** Los cruces del longitudinal: con ellos se dibuja el perfil tipo sobre la barra. */
  readonly cruces: readonly CruceDePerfil[] | undefined;
  /** El PK de la transversal que se mira, o `undefined` si es el longitudinal. */
  readonly pkM: number | undefined;
  readonly nombre: string;
  /** Pide saltar a la transversal más cercana a ese PK. */
  readonly onIrA: (pkM: number) => void;
}) {
  const s: Seguimiento | null = seguimientoDeLamina(eje, pkM);
  if (s === null) return null;
  const numeradas = balizasConNumero(s.balizas, 6);
  const silueta = cruces === undefined ? null : siluetaDePerfil(cruces, s.largoM, 80);
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
      {silueta !== null && <SiluetaDelPerfil silueta={silueta} />}
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

/**
 * **El perfil tipo**: la silueta de lo que hay a lo largo del eje, con la cota más baja y la más alta de
 * cada tramo. Es lo que dice «cómo crece» el trazado —dónde hay más edificio y dónde no— sobre la misma
 * escala de PK que la barra de abajo, así que una baliza cae justo bajo lo que cruza.
 */
function SiluetaDelPerfil({
  silueta,
}: {
  readonly silueta: NonNullable<ReturnType<typeof siluetaDePerfil>>;
}) {
  const ancho = 100;
  const alto = 24;
  const rango = Math.max(silueta.cotaMaxM - silueta.cotaMinM, 0.01);
  const x = (i: number) => (i / (silueta.columnas.length - 1)) * ancho;
  const y = (cota: number) => alto - ((cota - silueta.cotaMinM) / rango) * (alto - 2) - 1;
  const trozos: string[] = [];
  let actual: { i: number; c: { minM: number; maxM: number } }[] = [];
  const cerrar = () => {
    if (actual.length === 0) return;
    const arriba = actual.map(({ i, c }) => `${x(i)},${y(c.maxM)}`);
    const abajo = [...actual].reverse().map(({ i, c }) => `${x(i)},${y(c.minM)}`);
    trozos.push(`M${arriba.join(" L")} L${abajo.join(" L")} Z`);
    actual = [];
  };
  silueta.columnas.forEach((c, i) => {
    if (c === null) cerrar();
    else actual.push({ i, c });
  });
  cerrar();
  return (
    <div className="mb-0.5">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="h-7 w-full"
        role="img"
        aria-label={`Perfil tipo: cota de ${silueta.cotaMinM.toFixed(1)} a ${silueta.cotaMaxM.toFixed(1)} m`}
      >
        <path
          d={trozos.join(" ")}
          className="fill-accent/30 stroke-accent"
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="flex justify-between text-nota text-fg-3 tabular-nums">
        <span>Cota {silueta.cotaMinM.toFixed(1)} m</span>
        <span>{silueta.cotaMaxM.toFixed(1)} m</span>
      </p>
    </div>
  );
}
