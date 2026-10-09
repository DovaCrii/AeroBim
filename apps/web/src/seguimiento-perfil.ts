/**
 * El seguimiento de un perfil: **dónde va la lámina que se mira dentro del eje** (2026-10-09).
 *
 * Un perfil con transversales cada 0,1 m son cientos de láminas casi idénticas, y la regla inferior de
 * cada una es una distancia dentro de su franja, no un PK: nada decía en qué punto del trazado se estaba.
 * Esto calcula lo que hace falta para pintarlo —las balizas del eje como fracciones de su largo y la
 * posición de la lámina actual— sin Three ni DOM, para poder probarlo.
 */

import {
  balizasDelEje,
  largoDelEjeM,
  type CruceDePerfil,
  type EjeDePerfil,
} from "@aerobim/bim-core";

export interface BalizaDeSeguimiento {
  readonly pkM: number;
  /** De 0 (inicio del eje) a 1 (final). */
  readonly fraccion: number;
  readonly esFinal: boolean;
}

export interface SeguimientoDelPerfil {
  readonly largoM: number;
  /** Dónde está la lámina que se mira, o `null` si es el longitudinal, que cubre todo el eje. */
  readonly posicionM: number | null;
  readonly fraccionActual: number | null;
  readonly balizas: readonly BalizaDeSeguimiento[];
}

/** Calcula el seguimiento de una lámina de un perfil; `null` si el eje no tiene largo. */
export function seguimientoDeLamina(
  eje: EjeDePerfil,
  pkM: number | undefined,
): SeguimientoDelPerfil | null {
  const largoM = largoDelEjeM(eje);
  if (!(largoM > 0)) return null;
  const balizas = balizasDelEje(eje).map((b) => ({
    pkM: b.pkM,
    fraccion: Math.min(1, Math.max(0, b.pkM / largoM)),
    esFinal: b.esFinal,
  }));
  const posicionM = pkM === undefined ? null : Math.min(largoM, Math.max(0, pkM));
  return {
    largoM,
    posicionM,
    fraccionActual: posicionM === null ? null : posicionM / largoM,
    balizas,
  };
}

/**
 * Qué balizas llevan **número** en la barra: como mucho `maximo`, repartidas parejo y con el primero y
 * el último siempre. Poner el PK de las quince se montaría en una barra de 600 px.
 */
export function balizasConNumero(
  balizas: readonly BalizaDeSeguimiento[],
  maximo: number,
): readonly BalizaDeSeguimiento[] {
  if (balizas.length <= maximo || maximo < 2) return balizas.length <= maximo ? balizas : [];
  const salida: BalizaDeSeguimiento[] = [];
  const paso = (balizas.length - 1) / (maximo - 1);
  for (let i = 0; i < maximo; i++) {
    const baliza = balizas[Math.round(i * paso)];
    if (baliza !== undefined && salida.at(-1) !== baliza) salida.push(baliza);
  }
  return salida;
}

/**
 * La transversal más cercana a `pkM` de entre las del mismo perfil, o `undefined` si no hay ninguna.
 * Sirve para saltar a un punto del eje pinchando su baliza.
 */
export function laMasCercana<T extends { readonly pkM?: number }>(
  laminas: readonly T[],
  pkM: number,
): T | undefined {
  let mejor: T | undefined;
  let distancia = Infinity;
  for (const lamina of laminas) {
    if (lamina.pkM === undefined) continue;
    const d = Math.abs(lamina.pkM - pkM);
    if (d < distancia) {
      distancia = d;
      mejor = lamina;
    }
  }
  return mejor;
}

/** La silueta del perfil en una columna de PK: de qué cota a qué cota hay algo, o `null` si no hay nada. */
export interface ColumnaDeSilueta {
  readonly minM: number;
  readonly maxM: number;
}

export interface SiluetaDePerfil {
  readonly columnas: readonly (ColumnaDeSilueta | null)[];
  readonly cotaMinM: number;
  readonly cotaMaxM: number;
}

/**
 * La silueta del perfil —**el perfil tipo** que se dibuja en la barra de seguimiento—: para cada una de
 * `muestras` columnas repartidas a lo largo del eje, la cota más baja y la más alta de los elementos que
 * lo cruzan en ese PK. Sale de los cruces del longitudinal, que ya traen su tramo de PK y de cota.
 * Devuelve `null` si no hay cruces o el eje no tiene largo.
 */
export function siluetaDePerfil(
  cruces: readonly CruceDePerfil[],
  largoM: number,
  muestras: number,
): SiluetaDePerfil | null {
  if (!(largoM > 0) || cruces.length === 0 || muestras < 2) return null;
  const columnas: (ColumnaDeSilueta | null)[] = [];
  let cotaMinM = Infinity;
  let cotaMaxM = -Infinity;
  for (let i = 0; i < muestras; i++) {
    const pk = (i / (muestras - 1)) * largoM;
    let minM = Infinity;
    let maxM = -Infinity;
    for (const c of cruces) {
      if (pk < c.desdeM || pk > c.hastaM) continue;
      minM = Math.min(minM, c.cotaMinM);
      maxM = Math.max(maxM, c.cotaMaxM);
    }
    if (minM <= maxM) {
      columnas.push({ minM, maxM });
      cotaMinM = Math.min(cotaMinM, minM);
      cotaMaxM = Math.max(cotaMaxM, maxM);
    } else {
      columnas.push(null);
    }
  }
  if (!(cotaMinM <= cotaMaxM)) return null;
  return { columnas, cotaMinM, cotaMaxM };
}
