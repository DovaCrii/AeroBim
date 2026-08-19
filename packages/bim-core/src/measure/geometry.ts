/**
 * Geometría de las mediciones.
 *
 * Vive en el dominio y no en el visor porque **son números con consecuencias**: alguien va a
 * usar un área para pedir material o un ángulo para cortar una pieza. Acá se prueban contra
 * casos elementales verificables a mano, sin necesidad de un navegador.
 *
 * Los puntos son tuplas y no vectores de Three.js: `bim-core` no depende del motor de
 * dibujo, y la conversión ocurre en la envoltura del visor.
 */

/** Un punto en el espacio, en metros. */
export type Point3 = readonly [x: number, y: number, z: number];

function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v: Point3): number {
  return Math.sqrt(dot(v, v));
}

/** Distancia entre dos puntos, en metros. */
export function distanceM(a: Point3, b: Point3): number {
  return length(subtract(a, b));
}

/**
 * Ángulo en grados que forman `a` y `c` vistos desde el vértice `b`.
 *
 * Devuelve `0` si alguno de los dos lados tiene largo cero: sin dirección no hay ángulo, y
 * es preferible un cero explícito a un `NaN` que se propaga hasta la pantalla.
 */
export function angleAtDeg(a: Point3, b: Point3, c: Point3): number {
  const ba = subtract(a, b);
  const bc = subtract(c, b);

  const largos = length(ba) * length(bc);
  if (largos === 0) return 0;

  // Se acota a [-1, 1] porque el redondeo de coma flotante puede sacarlo del dominio de
  // `acos` y devolver `NaN` justo en los ángulos de 0° y 180°.
  const coseno = Math.min(1, Math.max(-1, dot(ba, bc) / largos));
  return (Math.acos(coseno) * 180) / Math.PI;
}

/** Largo total de una polilínea, en metros. */
export function perimeterM(points: readonly Point3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceM(points[i]!, points[i - 1]!);
  }
  return total;
}

/**
 * Área de un polígono cerrado en el espacio, en metros cuadrados.
 *
 * Usa el **área vectorial** —la mitad del módulo de la suma de productos cruzados de
 * vértices consecutivos— y no una proyección al plano horizontal. La diferencia importa: un
 * faldón de cubierta inclinado tiene más superficie que su sombra en planta, y proyectar
 * daría de menos justo cuando alguien está calculando cuánto material pedir.
 *
 * El resultado no depende de dónde esté el polígono respecto al origen: en un contorno
 * cerrado los términos de traslación se cancelan.
 *
 * Con menos de tres vértices no hay superficie y devuelve `0`. Si los puntos no son
 * coplanares el número deja de ser exacto, que es inherente a preguntar por el área de algo
 * que no es plano.
 */
export function polygonAreaM2(points: readonly Point3[]): number {
  if (points.length < 3) return 0;

  let acumulado: Point3 = [0, 0, 0];
  for (let i = 0; i < points.length; i += 1) {
    const actual = points[i]!;
    const siguiente = points[(i + 1) % points.length]!;
    const producto = cross(actual, siguiente);
    acumulado = [
      acumulado[0] + producto[0],
      acumulado[1] + producto[1],
      acumulado[2] + producto[2],
    ];
  }

  return length(acumulado) / 2;
}
