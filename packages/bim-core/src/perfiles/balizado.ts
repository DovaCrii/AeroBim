/**
 * **El balizado del eje**: dónde van las balizas (marcas con su PK) a lo largo de un trazado.
 *
 * Es aritmética pura sobre el eje en coordenadas de la escena (`sistema: "escena"`, metros): sin
 * Three.js ni DOM. El visor pone los rótulos; esto decide **cada cuántos metros** y **en qué PK**.
 */

import { largoDelEjeM, puntoEn, type EjeDePerfil, type PuntoEnPlantaM } from "./eje.js";

/** Los intervalos de baliza que se usan, en metros: los de un trazador, no cualquier número. */
const INTERVALOS_M = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;

/** Cuántas balizas, como máximo, caben en un eje sin amontonarse. */
export const MAXIMO_DE_BALIZAS = 15;

/**
 * El intervalo de las balizas para un eje de `largoM`: el menor de la serie 1, 2, 5, 10, 20, 50…
 * con el que salen **a lo sumo {@link MAXIMO_DE_BALIZAS}** tramos (en un eje largo, ~8–15).
 *
 * Un eje de 18,9 m da 2 m (9 tramos); uno de 60 m, 5 m (12); uno de 600 m, 50 m (12).
 */
export function intervaloDeBalizasM(largoM: number): number {
  if (!(largoM > 0) || !Number.isFinite(largoM)) return INTERVALOS_M[0];
  for (const intervaloM of INTERVALOS_M) {
    if (Math.floor(largoM / intervaloM) <= MAXIMO_DE_BALIZAS) return intervaloM;
  }
  return INTERVALOS_M[INTERVALOS_M.length - 1]!;
}

/** Una baliza: un PK y el punto del eje donde cae. */
export interface BalizaDeEje {
  readonly pkM: number;
  readonly puntoM: PuntoEnPlantaM;
  /** Hacia dónde apunta el eje ahí, unitario. */
  readonly direccion: PuntoEnPlantaM;
  /** Es la del final del eje: su PK no cae en un múltiplo del intervalo, y se escribe con decimales. */
  readonly esFinal: boolean;
}

/**
 * Las balizas del eje: el PK 0, uno cada `intervaloM`, y el final del eje.
 *
 * El final entra siempre —es el PK que más se pide— salvo que quede a menos de un tercio de
 * intervalo de la baliza anterior, que entonces cede su sitio para que no se monten los rótulos.
 */
export function balizasDelEje(eje: EjeDePerfil, intervaloM?: number): BalizaDeEje[] {
  const totalM = largoDelEjeM(eje);
  if (!(totalM > 0)) return [];
  const paso = intervaloM ?? intervaloDeBalizasM(totalM);
  if (!(paso > 0)) return [];

  const pks: { pkM: number; esFinal: boolean }[] = [];
  // Por multiplicación y no sumando: sumar acumula error y el último PK sale torcido.
  for (let i = 0; i * paso < totalM; i += 1) pks.push({ pkM: i * paso, esFinal: false });
  const ultima = pks[pks.length - 1]!;
  if (pks.length > 1 && totalM - ultima.pkM < paso / 3) pks.pop();
  pks.push({ pkM: totalM, esFinal: true });

  const balizas: BalizaDeEje[] = [];
  for (const { pkM, esFinal } of pks) {
    const sitio = puntoEn(eje, pkM);
    if (sitio === null) continue;
    balizas.push({ pkM, puntoM: sitio.puntoM, direccion: sitio.direccion, esFinal });
  }
  return balizas;
}
