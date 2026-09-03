/**
 * Cuánto se aparta lo construido de lo modelado: `F2.4`, el objetivo de salida de la Fase 2.
 *
 * ## Qué se mide, exactamente
 *
 * De **cada punto del levantamiento** a la **superficie del modelo más cercana**. No al revés, y no
 * entre cajas: un punto es una medida de dónde está la obra de verdad, y la superficie es lo que
 * decía el proyecto. La diferencia entre las dos es lo que nadie puede ver hoy sin software de pago.
 *
 * ## Y con signo, que es la mitad del valor
 *
 * Un muro **5 cm más grueso** y uno **5 cm más delgado** dan la misma distancia y son problemas
 * opuestos: uno se come el espacio libre y el otro deja un hueco. El signo sale de la normal del
 * triángulo — positivo cuando el punto está del lado al que apunta— así que el informe puede decir
 * «sobra material» o «falta», y no solo «hay 5 cm».
 *
 * **Cuando el modelo no tiene las normales hacia fuera de forma consistente, el signo no significa
 * nada**, y eso pasa en IFC exportados con las caras invertidas. Por eso el resumen da también la
 * distancia sin signo: si las dos cuentan lo mismo, el signo es de fiar; si no, se dice.
 *
 * ## Lo que este módulo no hace
 *
 * **No decide qué es un defecto.** Cinco centímetros pueden ser tolerancia en una excavación y un
 * problema grave en un pilar; eso lo pone quien coordina, y la tolerancia se recibe como argumento.
 * Inventar un umbral aquí sería que el programa opine sobre la obra.
 *
 * Y **no busca el triángulo más cercano entre millones**. Recibe los triángulos que ya se han
 * acotado —los de la caja del elemento— porque acotar es trabajo del visor, que es quien tiene el
 * octree y las cajas. Acá está la aritmética, que es lo que se puede probar sin navegador.
 */

/** Un punto en el espacio. */
export type Punto = readonly [number, number, number];

/** Un triángulo del modelo, con sus tres vértices en el orden que da la malla. */
export type Triangulo = readonly [Punto, Punto, Punto];

/** Lo que se sabe de la distancia de un punto a una superficie. */
export interface Distancia {
  /** La distancia, siempre positiva. */
  metros: number;
  /** El signo según la normal del triángulo: `1` delante, `-1` detrás, `0` justo encima. */
  lado: number;
  /** El punto de la superficie que quedó más cerca. Sirve para dibujar la medida. */
  pie: [number, number, number];
}

/**
 * La distancia de un punto a un triángulo, exacta.
 *
 * **No es la distancia al plano del triángulo**, y confundirlas es el error que hace que una nube
 * junto a un muro parezca pegada a un pilar que está en el mismo plano tres metros más allá. Se
 * resuelve por regiones —cara, tres aristas, tres vértices— que es la solución cerrada clásica: no
 * itera y no tiene casos degenerados que resolver a dedo.
 *
 * Un triángulo degenerado —dos vértices iguales, o los tres alineados— devuelve la distancia al
 * segmento o al punto que de verdad es, en vez de dividir por cero. Las mallas de IFC los traen: un
 * muro con un vano deja triángulos de área cero en el recorte.
 */
export function distanciaAlTriangulo(punto: Punto, triangulo: Triangulo): Distancia {
  const [a, b, c] = triangulo;

  const ab = resta(b, a);
  const ac = resta(c, a);
  const ap = resta(punto, a);

  const d1 = producto(ab, ap);
  const d2 = producto(ac, ap);
  if (d1 <= 0 && d2 <= 0) return desde(punto, a, triangulo);

  const bp = resta(punto, b);
  const d3 = producto(ab, bp);
  const d4 = producto(ac, bp);
  if (d3 >= 0 && d4 <= d3) return desde(punto, b, triangulo);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return desde(punto, suma(a, escalar(ab, v)), triangulo);
  }

  const cp = resta(punto, c);
  const d5 = producto(ab, cp);
  const d6 = producto(ac, cp);
  if (d6 >= 0 && d5 <= d6) return desde(punto, c, triangulo);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return desde(punto, suma(a, escalar(ac, w)), triangulo);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return desde(punto, suma(b, escalar(resta(c, b), w)), triangulo);
  }

  // Dentro de la cara: se reparte por coordenadas baricéntricas.
  const denominador = va + vb + vc;
  if (denominador === 0) {
    // Triángulo degenerado: los tres vértices alineados o coincidentes. Se cae al más cercano de
    // los tres, que es la respuesta correcta y no un `NaN`.
    let mejor = desde(punto, a, triangulo);
    for (const v of [b, c]) {
      const otro = desde(punto, v, triangulo);
      if (otro.metros < mejor.metros) mejor = otro;
    }
    return mejor;
  }
  const v = vb / denominador;
  const w = vc / denominador;
  return desde(punto, suma(a, suma(escalar(ab, v), escalar(ac, w))), triangulo);
}

/**
 * La distancia de un punto a la más cercana de varias superficies.
 *
 * Devuelve `null` cuando no hay triángulos: no hay modelo contra el que medir, y devolver
 * `Infinity` haría que las estadísticas de más abajo salieran con un número enorme en vez de decir
 * que no se midió nada.
 */
export function distanciaAlModelo(
  punto: Punto,
  triangulos: readonly Triangulo[],
): Distancia | null {
  let mejor: Distancia | null = null;
  for (const t of triangulos) {
    const d = distanciaAlTriangulo(punto, t);
    if (mejor === null || d.metros < mejor.metros) mejor = d;
  }
  return mejor;
}

/** El resumen de un montón de desviaciones, que es lo que se enseña y se pone en el informe. */
export interface ResumenDeDesviacion {
  /** Cuántos puntos se midieron. */
  puntos: number;
  /** La media de las distancias **sin signo**, en metros. */
  media: number;
  /** La mediana, que no la mueve un punto suelto disparatado. */
  mediana: number;
  /** La peor: la que decide si hay un problema. */
  maxima: number;
  /** La cuadrática media, que es como se informa la exactitud de un ajuste. */
  rms: number;
  /**
   * La media **con signo**, en metros.
   *
   * Es la que distingue «la obra está corrida 3 cm hacia un lado» —media con signo de 3 cm— de
   * «la obra está mal rematada» —media con signo cerca de cero y máxima de 3 cm—. Son dos problemas
   * distintos y con la distancia a secas se ven iguales.
   */
  sesgo: number;
  /** Cuántos puntos pasan de la tolerancia dada. */
  fuera: number;
  /** El percentil 95, que es lo que se suele exigir en un control de obra. */
  p95: number;
  /**
   * `true` si el signo es de fiar: hay puntos de los dos lados o de ninguno, de forma coherente.
   *
   * Se pone en `false` cuando **todos** los puntos caen del mismo lado con desviaciones grandes, que
   * es lo que pasa con un modelo de normales invertidas o con una nube mal calzada: entonces el
   * signo no informa de nada y decirlo es mejor que dar un sesgo que parece medido.
   */
  signoFiable: boolean;
}

/** Un resumen vacío, para cuando no se midió nada. */
export const SIN_MEDIR: ResumenDeDesviacion = {
  puntos: 0,
  media: 0,
  mediana: 0,
  maxima: 0,
  rms: 0,
  sesgo: 0,
  fuera: 0,
  p95: 0,
  signoFiable: false,
};

/**
 * Resume las desviaciones medidas.
 *
 * `toleranciaM` es la exigencia, en metros, y **la pone quien coordina**: cinco centímetros pueden
 * ser tolerancia en una excavación y un problema grave en un pilar.
 *
 * Con la lista vacía devuelve {@link SIN_MEDIR}, que dice `puntos: 0` — y eso es distinto de «cero
 * desviación», que es lo que parecería un resumen con todo a cero sin el recuento.
 */
export function resumirDesviaciones(
  distancias: readonly Distancia[],
  toleranciaM: number,
): ResumenDeDesviacion {
  const n = distancias.length;
  if (n === 0) return SIN_MEDIR;

  const absolutas = distancias.map((d) => d.metros).sort((x, y) => x - y);
  let suma = 0;
  let sumaCuadrados = 0;
  let sumaConSigno = 0;
  let fuera = 0;
  let delante = 0;
  let detras = 0;

  for (const d of distancias) {
    suma += d.metros;
    sumaCuadrados += d.metros * d.metros;
    sumaConSigno += d.metros * d.lado;
    if (d.metros > toleranciaM) {
      fuera += 1;
      if (d.lado > 0) delante += 1;
      else if (d.lado < 0) detras += 1;
    }
  }

  // El signo es de fiar salvo que **todo lo que se sale** caiga del mismo lado. Eso es lo que
  // produce un modelo con las caras invertidas o una nube mal calzada, y entonces el sesgo no
  // informa de la obra sino del error.
  const signoFiable = fuera === 0 || (delante > 0 && detras > 0);

  return {
    puntos: n,
    media: suma / n,
    mediana: percentil(absolutas, 0.5),
    maxima: absolutas[n - 1] as number,
    rms: Math.sqrt(sumaCuadrados / n),
    sesgo: sumaConSigno / n,
    fuera,
    p95: percentil(absolutas, 0.95),
    signoFiable,
  };
}

/**
 * El percentil de una lista **ya ordenada**, por interpolación lineal.
 *
 * Se interpola en vez de tomar el elemento de la posición redondeada porque con pocos puntos —diez,
 * veinte— el redondeo salta de golpe: el percentil 95 de veinte medidas sería la número 19 o la 20
 * según cómo se redondee, y esas dos pueden diferir en centímetros.
 */
function percentil(ordenadas: readonly number[], p: number): number {
  const n = ordenadas.length;
  if (n === 0) return 0;
  if (n === 1) return ordenadas[0] as number;
  const posicion = p * (n - 1);
  const abajo = Math.floor(posicion);
  const arriba = Math.min(abajo + 1, n - 1);
  const parte = posicion - abajo;
  return (ordenadas[abajo] as number) * (1 - parte) + (ordenadas[arriba] as number) * parte;
}

/**
 * El color de una desviación, de verde a rojo pasando por amarillo.
 *
 * `tolerancia` es donde acaba el verde. Por encima del **triple** de la tolerancia todo es rojo: sin
 * ese techo, una desviación disparatada —un punto de vegetación a diez metros del muro— dejaría toda
 * la escala aplastada en el verde y la nube saldría de un solo color.
 */
export function colorDeDesviacion(metros: number, toleranciaM: number): [number, number, number] {
  if (!(toleranciaM > 0)) return [160, 160, 160];
  const t = Math.min(1, Math.abs(metros) / (toleranciaM * 3));
  if (t < 0.5) {
    const k = t * 2;
    return [Math.round(k * 255), 200, 60];
  }
  const k = (t - 0.5) * 2;
  return [255, Math.round((1 - k) * 200), Math.round((1 - k) * 60)];
}

// --- Vectores, escritos a mano para no depender de nada -------------------------------

function resta(a: Punto, b: Punto): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function suma(a: Punto, b: Punto): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function escalar(a: Punto, k: number): [number, number, number] {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function producto(a: Punto, b: Punto): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** La distancia de `punto` a `pie`, con el lado según la normal del triángulo. */
function desde(punto: Punto, pie: Punto, triangulo: Triangulo): Distancia {
  const d = resta(punto, pie);
  const metros = Math.hypot(d[0], d[1], d[2]);

  const [a, b, c] = triangulo;
  const ab = resta(b, a);
  const ac = resta(c, a);
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];

  const proyeccion = producto(resta(punto, a), normal);
  const lado = proyeccion > 0 ? 1 : proyeccion < 0 ? -1 : 0;
  return { metros, lado, pie: [pie[0], pie[1], pie[2]] };
}
