/**
 * La matriz que lleva la nube al sistema del modelo, dentro de la escena del visor.
 *
 * ## Por qué esto no es «multiplicar y ya»
 *
 * Al calzar una nube con un modelo hay **tres cambios de sistema encadenados**, y equivocarse en
 * cualquiera de ellos deja la nube en un sitio verosímil pero falso — que es el peor resultado
 * posible, porque no se nota hasta que alguien mide:
 *
 * 1. La nube en la escena **ya lleva restado su desplazamiento** y **los ejes cambiados**: un punto
 *    de la pantalla no es un punto del archivo.
 * 2. La alineación de `calce.ts` y de `georreferencia.ts` está en **coordenadas del archivo**, con la
 *    cota en Z, porque es una propiedad de los datos y no de nuestro renderizador.
 * 3. Y lo que hay que mover es **la nube al modelo**, no al revés: mover el modelo movería las
 *    observaciones, las vistas guardadas y los planos, que están anotados sobre él.
 *
 * Así que la transformación que se le cuelga al objeto de la nube es la composición de las tres, y
 * **con la alineación invertida**. Escrita a mano en el visor sería un puñado de senos y cosenos sin
 * forma de comprobarlos; escrita acá se prueba con una transformación conocida.
 *
 * ## El giro, con los signos escritos
 *
 * **El signo del giro es donde se equivoca todo el mundo, y aquí se equivocó también**: la primera
 * versión de esta función lo puso al revés y las pruebas lo cazaron con la nube a 69 metros de donde
 * debía. Así que la derivación va escrita, y no de memoria.
 *
 * Con `S(f) = (f.x, f.z, −f.y)` el paso de archivo a escena, y `A` la alineación, lo que se quiere
 * es `T = S ∘ A⁻¹ ∘ (S⁻¹ + d)`. Sustituyendo y agrupando, con `k = 1/s`:
 *
 * ```
 * T.x = k·( cos·p.x            − sen·p.z ) + k·( ax·cos + ay·sen )
 * T.y = k·(            1·p.y            ) + k·( az )
 * T.z = k·( sen·p.x            + cos·p.z ) + k·( ax·sen − ay·cos )
 * ```
 *
 * donde `(ax, ay, az)` es el desplazamiento del cargador menos el de la alineación. Esa parte lineal
 * es un giro alrededor del eje **Y** de la escena de ángulo **−θ** —no `+θ`—, y tiene sentido:
 * `A⁻¹` deshace el giro, así que el ángulo va con el signo cambiado.
 *
 * La prueba no compara estos dieciséis números contra otros dieciséis: **aplica la matriz** a puntos
 * conocidos y exige que caigan sobre el modelo. Es lo único que no se puede satisfacer con una
 * fórmula mal copiada.
 */

import type { Alineacion } from "./georreferencia.js";

/**
 * Una matriz 4×4 en **orden por columnas**, que es el que espera `THREE.Matrix4.fromArray`.
 *
 * Se devuelve como arreglo plano y no como objeto para que `bim-core` no tenga que conocer Three.js
 * — la regla del paquete— y para que la prueba compare dieciséis números y no una estructura.
 */
export type Matriz4 = number[];

/**
 * Del punto de la escena al punto del archivo: deshace lo que hizo el cargador.
 *
 * Es la operación que hace falta al **señalar un punto sobre la nube**: lo que se pincha está en
 * coordenadas de la escena, y el par de calce tiene que estar en las del archivo.
 */
export function escenaAArchivo(
  punto: readonly [number, number, number],
  desplazamiento: readonly [number, number, number],
): [number, number, number] {
  // La escena es `(x, z, -y)` del archivo. De vuelta: `x` es `x`, `y` es `-z`, `z` es `y`.
  return [
    punto[0] + desplazamiento[0],
    -punto[2] + desplazamiento[1],
    punto[1] + desplazamiento[2],
  ];
}

/** Del punto del archivo al de la escena: lo mismo que hace el cargador con cada punto. */
export function archivoAEscena(
  punto: readonly [number, number, number],
  desplazamiento: readonly [number, number, number],
): [number, number, number] {
  return [
    punto[0] - desplazamiento[0],
    punto[2] - desplazamiento[2],
    -(punto[1] - desplazamiento[1]),
  ];
}

/**
 * La matriz que hay que colgarle al objeto de la nube para que caiga sobre el modelo.
 *
 * `alineacion` va del sistema **local del modelo** al de la nube —es lo que devuelven
 * `calzarConPuntos` y `alineacionDeMapa`— así que acá se invierte: lo que se mueve es la nube.
 *
 * `desplazamiento` es el que el cargador le restó a la nube, en coordenadas del archivo.
 *
 * **Se aplica como matriz del objeto y no reescribiendo los puntos**, y eso importa: los puntos ya
 * están en coordenadas locales pequeñas, así que el giro y el desplazamiento los hace la tarjeta sin
 * perder precisión, y calzar de nuevo cuesta cambiar dieciséis números en vez de volver a subir
 * cientos de megas.
 *
 * Con escala cero devuelve una matriz de ceros —no hay inversa— en vez de `NaN` repartidos: una
 * matriz de ceros colapsa la nube en un punto, que se ve al instante; los `NaN` la hacen
 * desaparecer sin decir por qué.
 */
export function matrizDeCalce(
  alineacion: Alineacion,
  desplazamiento: readonly [number, number, number],
): Matriz4 {
  const { cos, sen, escala, este, norte, altura } = alineacion;
  if (escala === 0 || !Number.isFinite(escala)) return Array.from({ length: 16 }, () => 0);

  // Los tres pasos, cada uno afín, así que la composición también:
  //
  //   archivo = (p.x + dx,  −p.z + dy,  p.y + dz)
  //   modelo  = R(−θ)·(archivo − t) / s
  //   escena' = (modelo.x,  modelo.z,  −modelo.y)
  //
  // Sustituidos y agrupados dan las tres filas del encabezado. Se escriben aquí tal cual, sin
  // reutilizar variables intermedias, porque el paso donde se colaba el error era justamente
  // encadenar dos negaciones a ojo.
  const k = 1 / escala;

  // El desplazamiento del cargador menos el de la alineación, en coordenadas del archivo.
  const ax = desplazamiento[0] - este;
  const ay = desplazamiento[1] - norte;
  const az = desplazamiento[2] - altura;

  const tx = k * (ax * cos + ay * sen);
  const ty = k * az;
  const tz = k * (ax * sen - ay * cos);

  // Por columnas: la primera es la imagen del eje X de la escena, la segunda la del Y, la tercera
  // la del Z. Es un giro de −θ alrededor de Y, escalado por k.
  return [k * cos, 0, k * sen, 0, 0, k, 0, 0, -k * sen, 0, k * cos, 0, tx, ty, tz, 1];
}

/**
 * Un plano de la escena, pasado a coordenadas del archivo.
 *
 * ## Por qué esto existe: un defecto que daba números creíbles
 *
 * El octree vive en **coordenadas del archivo**: la clave de un nodo, `(d, x, y, z)`, indexa las
 * celdas en los ejes del archivo, con la cota en Z. La primera versión del cargador le pasaba a
 * `cajaDeNodo` el cubo **ya convertido a la escena**, y entonces el índice del norte se aplicaba
 * sobre la altura y al revés: las cajas de los nodos salían en sitios que no existen.
 *
 * **Y no fallaba de forma visible.** El recorte seguía descartando nodos y devolviendo cuentas
 * verosímiles —«597 fuera de vista»— solo que eran los nodos equivocados. Es el mismo patrón que
 * los 200 mm del `float32`: el error no se ve, se mide.
 *
 * La respuesta correcta es no convertir el octree, sino **llevar la cámara al sistema del archivo**.
 * Es lo que hacen esta función y {@link cajaAArchivo}.
 *
 * ## La sustitución, escrita
 *
 * Un plano de la escena dice `a·px + b·py + c·pz + k ≥ 0`. Con `p = (fx − dx, fz − dz, −(fy − dy))`:
 *
 * ```
 * a·fx − c·fy + b·fz + ( k − a·dx + c·dy − b·dz ) ≥ 0
 * ```
 *
 * O sea: la normal se permuta a `(a, −c, b)` y la constante absorbe el desplazamiento.
 */
export function planoAArchivo(
  plano: { a: number; b: number; c: number; d: number },
  desplazamiento: readonly [number, number, number],
): { a: number; b: number; c: number; d: number } {
  const { a, b, c, d: k } = plano;
  return {
    a,
    b: -c,
    c: b,
    d: k - a * desplazamiento[0] + c * desplazamiento[1] - b * desplazamiento[2],
  };
}

/**
 * Una caja de la escena, pasada a coordenadas del archivo.
 *
 * El cambio de ejes **niega uno**, así que el mínimo y el máximo de ese eje se intercambian: dejarlos
 * en su orden daría una caja con el mínimo por encima del máximo, que no toca nada — y el recorte
 * descartaría la nube entera sin decir por qué.
 */
export function cajaAArchivo(
  caja: readonly [number, number, number, number, number, number],
  desplazamiento: readonly [number, number, number],
): [number, number, number, number, number, number] {
  const a = escenaAArchivo([caja[0], caja[1], caja[2]], desplazamiento);
  const b = escenaAArchivo([caja[3], caja[4], caja[5]], desplazamiento);
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2]),
  ];
}

/**
 * Aplica una matriz por columnas a un punto. Está acá para poder **probar la matriz**.
 *
 * Sin esto, comprobar `matrizDeCalce` sería comparar dieciséis números contra otros dieciséis
 * escritos a mano —que es comparar una fórmula contra sí misma—. Aplicándola a puntos conocidos se
 * comprueba lo que de verdad importa: que la nube caiga donde el modelo.
 */
export function aplicar(
  m: Matriz4,
  punto: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = punto;
  return [
    (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
    (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
    (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
  ];
}
