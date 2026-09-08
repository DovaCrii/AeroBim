/**
 * Lo que se dibujó sobre el modelo, dentro del viewpoint: la primera mitad de `F4.5`.
 *
 * **El BCF ya lleva a dónde mirar, qué se veía y una foto. Lo que no lleva es qué señalaba quien
 * anotó.** El título dice «la viga del eje C choca con el ducto» y en la pantalla había una cota de
 * 4 cm entre las dos: ese número es el hallazgo, y se quedaba aquí.
 *
 * ## Las cotas ya dibujadas **son** el marcado
 *
 * Esta es la decisión de fondo, y no es un atajo: BCF 2.1 guarda el marcado como **segmentos de
 * recta en coordenadas del modelo** —`<Lines>` dentro del viewpoint— y el visor ya tiene puntos en
 * coordenadas del modelo, porque medir consiste precisamente en poner puntos ahí. Convertir las
 * mediciones visibles en líneas es ensamblar dos piezas que existen, no construir una tercera.
 *
 * Y lo que sale es lo que el otro extremo entiende: Solibri y Navisworks dibujan esas líneas sobre
 * su propio modelo, así que la cota viaja **en tres dimensiones** y no como un trazo pintado encima
 * de una imagen.
 *
 * ## Cómo se convierte cada medida
 *
 * | Medida          | Puntos | Segmentos                        |
 * | --------------- | ------ | -------------------------------- |
 * | Distancia       | 2      | 1 — el propio tramo medido       |
 * | Perpendicular   | 2      | 1 — del punto al pie en la cara  |
 * | Ángulo          | 3      | 2 — los dos lados desde el vértice |
 * | Área            | n ≥ 3  | n — el contorno, **cerrado**     |
 *
 * ## Y ninguna sale a medias
 *
 * Con el tope alcanzado **se dejan fuera las mediciones que no caben enteras**, no los segmentos
 * que sobran. Medio contorno de un área no es un área: es una polilínea abierta que afirma una
 * forma que nadie dibujó. Es el mismo criterio con el que la visibilidad prefiere callarse antes
 * que escribir un viewpoint que apaga el modelo.
 */

import type { Point3 } from "../measure/geometry.js";
import { escenaAIfc } from "./viewpoint.js";

/** Un segmento de recta en el sistema del IFC, como lo escribe `<Line>` de BCF. */
export interface LineaIfc {
  readonly inicio: Point3;
  readonly fin: Point3;
}

/** Qué clase de medida es. Los mismos nombres que usa el visor. */
export type ClaseDeMedida = "distance" | "angle" | "area" | "perpendicular";

/** Una medición tal como la dibujó el visor: sus puntos, en coordenadas de la escena. */
export interface MedicionDibujada {
  readonly kind: ClaseDeMedida;
  readonly puntos: readonly Point3[];
}

/**
 * Cuántos segmentos se admiten en un viewpoint.
 *
 * **No es un límite del formato**: es que un BCF no es un archivo de dibujo. Doscientos segmentos
 * son ya un contorno de doscientos vértices, muy por encima de lo que alguien señala a mano, y el
 * archivo va por correo con una foto dentro.
 */
export const MAXIMO_LINEAS = 200;

/** Bajo esto, los dos extremos son el mismo punto y el segmento no dibuja nada. */
const EPSILON_M = 0.0005;

function esDegenerado(a: Point3, b: Point3): boolean {
  return (
    Math.abs(a[0] - b[0]) < EPSILON_M &&
    Math.abs(a[1] - b[1]) < EPSILON_M &&
    Math.abs(a[2] - b[2]) < EPSILON_M
  );
}

/** Los segmentos de una sola medición, ya en el sistema del IFC. `[]` si no da ninguno. */
function segmentosDe(medicion: MedicionDibujada): readonly LineaIfc[] {
  const puntos = medicion.puntos.map(escenaAIfc);

  // Un contorno se cierra: el último vértice vuelve al primero. Los demás son cadenas abiertas.
  const cierra = medicion.kind === "area";
  const minimo = cierra ? 3 : 2;
  if (puntos.length < minimo) return [];

  const segmentos: LineaIfc[] = [];
  const tramos = cierra ? puntos.length : puntos.length - 1;
  for (let i = 0; i < tramos; i += 1) {
    const inicio = puntos[i] as Point3;
    const fin = puntos[(i + 1) % puntos.length] as Point3;
    if (!esDegenerado(inicio, fin)) segmentos.push({ inicio, fin });
  }
  return segmentos;
}

/**
 * Las mediciones dibujadas, convertidas en los segmentos que escribe un viewpoint de BCF.
 *
 * Recibe las coordenadas **de la escena** y devuelve las **del IFC**: la conversión es la misma
 * `escenaAIfc` que usan la cámara y los cortes, así que no hay dos formas de llevar un punto al
 * sistema del modelo.
 *
 * Devuelve una lista vacía cuando no hay nada que dibujar, y eso no es un fallo: la mayoría de las
 * observaciones se abren sin haber medido nada.
 */
export function lineasDesdeMediciones(
  mediciones: readonly MedicionDibujada[],
): readonly LineaIfc[] {
  const salida: LineaIfc[] = [];

  for (const medicion of mediciones) {
    const segmentos = segmentosDe(medicion);
    if (segmentos.length === 0) continue;
    // **Entera o nada.** Medio contorno afirma una forma que nadie dibujó.
    if (salida.length + segmentos.length > MAXIMO_LINEAS) continue;
    salida.push(...segmentos);
  }

  return salida;
}
