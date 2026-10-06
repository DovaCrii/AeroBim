/**
 * La malla de un perfil: cuadrícula y regla de PK y de cota, **como líneas del dibujo** (`F13.11`).
 *
 * Va dentro del dibujo y no sobre la pantalla para que salga también en el DXF y en el PDF: una lámina
 * de perfil sin escala no se puede medir con una regla. Es dominio puro —solo números— y las líneas se
 * entregan como pares `[s, cota, s, cota, …]`, el mismo formato que usa el perfil.
 *
 * Los pasos son «redondos» (1, 2 o 5 por una potencia de diez) y **absolutos**: las líneas caen en PK
 * y cotas múltiplos del paso, no a partir del borde del dibujo, así que un PK 1+250 está siempre en
 * una línea y no en un sitio que depende de dónde cortó la franja.
 */

/** El rango que ocupa el dibujo, en metros: PK a lo largo y cota en vertical. */
export interface RangoDePerfil {
  readonly sMinM: number;
  readonly sMaxM: number;
  readonly cotaMinM: number;
  readonly cotaMaxM: number;
}

export interface MallaDePerfil {
  /** Cada cuántos metros de PK va una línea vertical. */
  readonly pasoPkM: number;
  /** Cada cuántos metros de cota va una línea horizontal. */
  readonly pasoCotaM: number;
  /** La cuadrícula: líneas verticales y horizontales, `[s, cota, s, cota, …]`. */
  readonly cuadricula: readonly number[];
  /** La regla: marcas cortas cada paso/5 y largas en cada paso, sobre el borde inferior. */
  readonly regla: readonly number[];
}

/**
 * Un paso 1, 2 o 5 × 10ⁿ que da **cerca de `divisiones`** líneas sobre `extensionM`.
 * Devuelve 1 si la extensión no es un número positivo: una malla sin paso no existe.
 */
export function pasoLimpio(extensionM: number, divisiones: number): number {
  if (!(extensionM > 0) || !(divisiones > 0)) return 1;
  const crudo = extensionM / divisiones;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const mantisa = crudo / potencia;
  const base = mantisa < 1.5 ? 1 : mantisa < 3.5 ? 2 : mantisa < 7.5 ? 5 : 10;
  return base * potencia;
}

/** Los múltiplos de `paso` dentro de `[min, max]`, sin arrastrar el error de la suma flotante. */
function multiplos(min: number, max: number, paso: number): number[] {
  const primero = Math.ceil(min / paso - 1e-9);
  const ultimo = Math.floor(max / paso + 1e-9);
  const valores: number[] = [];
  // Un tope duro: un rango enorme con un paso diminuto no debe colgar la pestaña.
  for (let k = primero; k <= ultimo && valores.length < 2000; k += 1)
    valores.push(k === 0 ? 0 : k * paso);
  return valores;
}

/** Cuántos decimales hacen falta para escribir un paso sin perder nada: 5 → 0, 0,5 → 1, 0,05 → 2. */
export function decimalesDelPaso(pasoM: number): number {
  if (!(pasoM > 0)) return 0;
  for (let d = 0; d < 6; d += 1) {
    const escalado = pasoM * 10 ** d;
    if (Math.abs(escalado - Math.round(escalado)) < 1e-9) return d;
  }
  return 6;
}

/** Lo que va escrito sobre la malla: el PK en cada línea vertical y la cota en cada horizontal. */
export interface RotulosDeMalla {
  readonly pk: readonly { readonly sM: number; readonly texto: string }[];
  readonly cotas: readonly { readonly cotaM: number; readonly texto: string }[];
}

/**
 * Los rótulos de una malla (`F13.11`): **una cifra por línea de la cuadrícula**, en los mismos valores en
 * que están las líneas, así que lo escrito y lo dibujado no pueden discrepar. El PK se escribe con el
 * formateador que pase quien llama —aquí no se sabe cómo se escribe un PK— y la cota con los decimales que
 * pide el paso: con paso de 2 m, «102», no «102,00».
 */
export function rotulosDeMalla(
  rango: RangoDePerfil,
  malla: MallaDePerfil,
  textoDePk: (sM: number, decimales: number) => string,
): RotulosDeMalla {
  const decPk = decimalesDelPaso(malla.pasoPkM);
  const decCota = decimalesDelPaso(malla.pasoCotaM);
  return {
    pk: multiplos(rango.sMinM, rango.sMaxM, malla.pasoPkM).map((sM) => ({
      sM,
      texto: textoDePk(sM, decPk),
    })),
    cotas: multiplos(rango.cotaMinM, rango.cotaMaxM, malla.pasoCotaM).map((cotaM) => ({
      cotaM,
      texto: cotaM.toFixed(decCota),
    })),
  };
}

/** La malla de un perfil con sus pasos, o `null` si el rango no tiene extensión. */
export function mallaDePerfil(rango: RangoDePerfil): MallaDePerfil | null {
  const anchoM = rango.sMaxM - rango.sMinM;
  const altoM = rango.cotaMaxM - rango.cotaMinM;
  if (!(anchoM > 0) || !(altoM > 0)) return null;

  // Unas diez líneas a lo largo y seis en vertical: se lee sin ser un papel cuadriculado.
  const pasoPkM = pasoLimpio(anchoM, 10);
  const pasoCotaM = pasoLimpio(altoM, 6);

  const cuadricula: number[] = [];
  for (const s of multiplos(rango.sMinM, rango.sMaxM, pasoPkM)) {
    cuadricula.push(s, rango.cotaMinM, s, rango.cotaMaxM);
  }
  for (const c of multiplos(rango.cotaMinM, rango.cotaMaxM, pasoCotaM)) {
    cuadricula.push(rango.sMinM, c, rango.sMaxM, c);
  }

  // La regla va hacia dentro desde el borde inferior: no ensancha el dibujo.
  const largaM = altoM * 0.03;
  const cortaM = largaM / 2;
  const regla: number[] = [];
  const subpasoM = pasoPkM / 5;
  for (const s of multiplos(rango.sMinM, rango.sMaxM, subpasoM)) {
    const esPaso = Math.abs(s / pasoPkM - Math.round(s / pasoPkM)) < 1e-6;
    regla.push(s, rango.cotaMinM, s, rango.cotaMinM + (esPaso ? largaM : cortaM));
  }

  return { pasoPkM, pasoCotaM, cuadricula, regla };
}
