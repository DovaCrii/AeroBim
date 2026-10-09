/**
 * Qué hoja y qué escala le corresponden a una lámina generada. Cálculo puro: sin Three ni DOM.
 *
 * Una lámina se mide en **metros del modelo**, pero se lleva a un papel, y quien la mira en pantalla
 * quiere saber cuánto ocupará ahí. Estas funciones responden a eso con **las escalas del escalímetro**
 * y las hojas ISO en horizontal, que son las que usa la exportación a DXF.
 */

/** Las escalas entre las que se elige al llevar un plano al papel, de la mayor a la menor. */
export const ESCALAS_DE_ESCALIMETRO = [
  20, 25, 50, 75, 100, 200, 250, 500, 1000, 2000, 5000,
] as const;

/** Una hoja ISO en horizontal, con su margen útil. */
export interface Hoja {
  readonly nombre: "A4" | "A3" | "A2" | "A1" | "A0";
  readonly anchoMm: number;
  readonly altoMm: number;
}

/** De la más pequeña a la mayor. */
export const HOJAS: readonly Hoja[] = [
  { nombre: "A4", anchoMm: 297, altoMm: 210 },
  { nombre: "A3", anchoMm: 420, altoMm: 297 },
  { nombre: "A2", anchoMm: 594, altoMm: 420 },
  { nombre: "A1", anchoMm: 841, altoMm: 594 },
  { nombre: "A0", anchoMm: 1189, altoMm: 841 },
];

/** Margen por lado que se deja libre en la hoja, en milímetros. Es el de la exportación a DXF. */
export const MARGEN_DE_HOJA_MM = 10;

/**
 * La escala más legible a la que ya se considera un plano de lectura: más pequeña que 1:200 el
 * texto y las cotas dejan de poder leerse a simple vista.
 */
export const ESCALA_MAXIMA_LEGIBLE = 200;

/**
 * La mayor escala normalizada con la que un dibujo de `anchoM × altoM` metros cabe en `hoja`, o
 * `null` si no cabe ni a la menor. Es la misma elección que hace el DXF.
 */
export function escalaQueCabe(anchoM: number, altoM: number, hoja: Hoja): number | null {
  if (!(anchoM > 0) || !(altoM > 0)) return null;
  const anchoUtil = hoja.anchoMm - 2 * MARGEN_DE_HOJA_MM;
  const altoUtil = hoja.altoMm - 2 * MARGEN_DE_HOJA_MM;
  for (const escala of ESCALAS_DE_ESCALIMETRO) {
    if ((anchoM * 1000) / escala <= anchoUtil && (altoM * 1000) / escala <= altoUtil) return escala;
  }
  return null;
}

export interface SugerenciaDeHoja {
  readonly hoja: Hoja;
  /** El denominador: `100` es 1:100. */
  readonly escala: number;
}

/**
 * La hoja más pequeña en la que la lámina cabe **a una escala legible** (1:200 o mayor), y con qué
 * escala. Si ninguna hoja lo logra —una planta de cientos de metros— se da la mayor hoja con la escala
 * que quepa; y `null` solo si ni así cabe o las medidas no valen.
 */
export function sugerirHoja(anchoM: number, altoM: number): SugerenciaDeHoja | null {
  for (const hoja of HOJAS) {
    const escala = escalaQueCabe(anchoM, altoM, hoja);
    if (escala !== null && escala <= ESCALA_MAXIMA_LEGIBLE) return { hoja, escala };
  }
  const mayor = HOJAS[HOJAS.length - 1]!;
  const escala = escalaQueCabe(anchoM, altoM, mayor);
  return escala === null ? null : { hoja: mayor, escala };
}

/** «1:100». */
export function rotuloDeEscala(escala: number): string {
  return `1:${escala}`;
}

/** Cuántos píxeles de pantalla mide un milímetro de papel, a 96 ppp (la referencia de CSS). */
export const PX_POR_MM_DE_PAPEL = 96 / 25.4;

/**
 * Cuántos píxeles de pantalla debe ocupar **un metro del modelo** para que la lámina se vea a
 * `escala` sobre una pantalla de 96 ppp: a 1:100, 1 m son 10 mm de papel, unos 37,8 px.
 */
export function pxPorMetroAEscala(escala: number): number {
  return (1000 / escala) * PX_POR_MM_DE_PAPEL;
}

/** Un punto sobre el papel de una lámina: el eje horizontal y el vertical, en metros del modelo. */
export interface PuntoDeLamina {
  readonly pkM: number;
  readonly cotaM: number;
}

export interface MedidaDeLamina {
  /** En línea recta, en metros del modelo. */
  readonly distanciaM: number;
  readonly dHorizontalM: number;
  readonly dVerticalM: number;
  /** Lo mismo **medido sobre la hoja** a `escala`, en milímetros; `null` si no hay escala. */
  readonly enPapelMm: number | null;
}

/**
 * La distancia entre dos puntos de una lámina, en metros del modelo y en milímetros de papel a
 * `escala` (1:`escala`). Es la cifra que se comprueba con un escalímetro sobre la hoja impresa.
 */
export function medirEnLamina(
  a: PuntoDeLamina,
  b: PuntoDeLamina,
  escala: number | null,
): MedidaDeLamina {
  const dHorizontalM = b.pkM - a.pkM;
  const dVerticalM = b.cotaM - a.cotaM;
  const distanciaM = Math.hypot(dHorizontalM, dVerticalM);
  return {
    distanciaM,
    dHorizontalM,
    dVerticalM,
    enPapelMm: escala !== null && escala > 0 ? (distanciaM * 1000) / escala : null,
  };
}
