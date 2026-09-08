/**
 * El texto que lleva una cota **encima**, en la escena. `F12.9`.
 *
 * ## El problema
 *
 * Las tres magnitudes de una distancia —directa, horizontal y desnivel— vivían **en la barra de
 * abajo**, y solo las de la última medición tomada. O sea que con tres cotas en pantalla no había
 * forma de saber cuál era cuál sin volver a medirla, y el desnivel de la primera se había ido.
 *
 * Es la referencia que el usuario trajo el 2026-09-03: un acotado de Cyclone 3DR, con la cifra
 * sobre la línea y las tres componentes al lado.
 *
 * ## Por qué es una función pura en su propio archivo
 *
 * Porque es lo único de esto que puede estar mal de forma comprobable: el redondeo, el separador
 * decimal, el orden de las líneas y qué se enseña cuando no hay desnivel. Lo demás —pegar el texto
 * en el elemento HTML de la etiqueta— es una línea que se ve mirando.
 *
 * `index.ts` tiene 3.000 líneas y ninguna prueba unitaria propia: una función de formato ahí dentro
 * habría nacido sin oráculo.
 */

/** Las tres magnitudes de una distancia, tal como las da `distancePartsM` de `bim-core`. */
export interface PartesDeCota {
  readonly directM: number;
  readonly horizontalM: number;
  readonly verticalM: number;
}

/**
 * Por debajo de esto el desnivel **no se escribe**.
 *
 * Un milímetro. Medir dos puntos del mismo suelo da un desnivel de `1e-7` por el redondeo del
 * `float32` de la geometría, y escribir «Δ 0,000 m» en cada cota horizontal es ruido en tres de
 * cada cuatro mediciones — además de sugerir que hay un desnivel medido cuando lo que hay es cero.
 *
 * Y un milímetro y no `1e-9`: la tolerancia de un levantamiento es el centímetro, así que por
 * debajo del milímetro no hay dato, hay aritmética.
 */
export const DESNIVEL_MINIMO_M = 0.001;

/** Cuántos decimales lleva una longitud en metros. Milímetros, que es lo que se replantea. */
const DECIMALES = 3;

/**
 * Un número en metros, con coma decimal.
 *
 * **Coma y no punto**, y no es una preferencia: el producto está en español y la coma es el
 * separador decimal en español. `toFixed` da punto siempre, así que se cambia aquí —en un solo
 * sitio— en vez de en cada plantilla.
 */
export function metros(valor: number): string {
  return `${valor.toFixed(DECIMALES).replace(".", ",")} m`;
}

/**
 * El texto de una cota de distancia, en su forma corta o larga.
 *
 * **Dos formas y no una**, y la razón es el sitio: una cota vive **sobre el modelo**, así que su
 * texto compite con lo que hay que mirar. La corta —`#3 · 2,693 m`— es lo que se lleva una cota
 * cualquiera; la larga sale solo en la que interesa ahora.
 *
 * El ordinal va delante y con `#` porque es la convención del CAD: es lo que permite decir «la 3»
 * en voz alta, y lo que hace que la lista de «Mediciones tomadas» y la escena hablen de lo mismo.
 *
 * @param ordinal Su número, empezando en 1.
 * @param partes Las tres magnitudes.
 * @param expandida Si se escriben las tres líneas.
 */
export function textoDeCota(
  ordinal: number,
  partes: PartesDeCota,
  expandida: boolean,
): readonly string[] {
  const cabeza = `#${ordinal} · ${metros(partes.directM)}`;
  if (!expandida) return [cabeza];

  const lineas = [cabeza, `H ${metros(partes.horizontalM)}`];
  // **El desnivel solo si lo hay.** Ver `DESNIVEL_MINIMO_M`: escribirlo siempre pondría
  // «Δ 0,000 m» en tres de cada cuatro cotas, y sugeriría un dato donde hay un cero.
  if (partes.verticalM >= DESNIVEL_MINIMO_M) lineas.push(`Δ ${metros(partes.verticalM)}`);
  return lineas;
}

/**
 * El siguiente ordinal, **sin reusar huecos**.
 *
 * Es la numeración de un CAD: si se borra la 2, la siguiente es la 4 y no la 2. Reusar el hueco
 * renumeraría una cota que alguien ya anotó en una libreta o citó en una observación — y una cota
 * cuyo número cambia deja de servir para señalarla.
 *
 * Así que no se cuenta cuántas hay: se mira el mayor que se haya dado.
 */
export function siguienteOrdinal(dados: readonly number[]): number {
  return dados.length === 0 ? 1 : Math.max(...dados) + 1;
}
