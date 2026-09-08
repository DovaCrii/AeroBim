/**
 * Lo que le pasa a una coordenada de levantamiento dentro de un `Float32Array`.
 *
 * ## El número que decide la Fase 2
 *
 * Un levantamiento chileno viene en UTM 19S, y ahí la coordenada norte de Santiago es del orden de
 * **6 298 000 m**. Three.js guarda las posiciones en `Float32Array` —es lo que acepta WebGL— y un
 * `float32` tiene 24 bits de mantisa: **unas siete cifras significativas**. Si la parte entera ya
 * gasta siete, no queda ninguna para los milímetros.
 *
 * Medido, no estimado, sobre una nube sintética en esas coordenadas:
 *
 * | Eje                  | Error máximo en `float32` |
 * | -------------------- | ------------------------- |
 * | Este  (345 000 m)    | **12,5 mm**               |
 * | Norte (6 298 000 m)  | **200 mm**                |
 * | Altura (560 m)       | 0 mm                      |
 *
 * Y los mismos puntos, **restando primero el desplazamiento**: 0,003 mm en los dos ejes
 * horizontales. Un factor de sesenta y cinco mil.
 *
 * **Veinte centímetros de error hacen imposible el cruce con el IFC**, que es la razón de ser de la
 * fase: `F2.4` mide la desviación entre lo construido y lo modelado, y una desviación de 5 mm no se
 * puede medir con una regla que se equivoca en 200. Peor todavía: el error **no es ruido**, es un
 * escalonado —los puntos se pegan a los valores representables— así que una nube así se ve *bien* y
 * miente con dos decimales.
 *
 * De ahí sale un requisito del pipeline de conversión, y no una recomendación: **el formato tiene
 * que traer el desplazamiento dentro del archivo**. LAS, LAZ y COPC lo traen —es el campo `offset`
 * de la cabecera—; un PLY o un XYZ con coordenadas absolutas, no. Ese requisito es la mitad de la
 * decisión de `F2.5`.
 *
 * ## Por qué esto vive en `bim-core` y no en el visor
 *
 * Es aritmética de coma flotante: se prueba en Node con números escritos a mano, y la respuesta no
 * depende de la tarjeta gráfica ni del navegador. `Math.fround` es exactamente el redondeo que
 * aplica un `Float32Array` al guardar, así que la prueba es la misma operación, no una imitación.
 */

/**
 * El error, en metros, que introduce guardar `metros` en un `float32`.
 *
 * Siempre positivo. `Math.fround` redondea al `float32` más cercano —lo mismo que hace asignar a un
 * `Float32Array`—, así que esto es el error real y no una cota teórica.
 */
export function errorEnFloat32(metros: number): number {
  if (!Number.isFinite(metros)) return Number.NaN;
  return Math.abs(Math.fround(metros) - metros);
}

/**
 * La distancia entre dos `float32` consecutivos en la magnitud de `metros`: el escalón.
 *
 * Es la resolución de verdad disponible a esa distancia del origen. El error de un punto suelto
 * puede ser cero por suerte —si cae justo en un valor representable—, pero el escalón no engaña:
 * ningún detalle más fino que él sobrevive.
 */
export function escalonDeFloat32(metros: number): number {
  if (!Number.isFinite(metros)) return Number.NaN;
  const v = Math.abs(Math.fround(metros));
  if (v === 0) return Number.MIN_VALUE;
  // El siguiente float32 hacia arriba, buscado duplicando un incremento hasta que se note.
  // Se hace así y no con exponentes a mano porque los subnormales y las potencias de dos exactas
  // rompen la formula corta, y acá lo que importa es que el numero sea el de verdad.
  let paso = v * Number.EPSILON;
  while (Math.fround(v + paso) === v) paso *= 2;
  return Math.fround(v + paso) - v;
}

/**
 * Si una nube en esa magnitud de coordenadas se puede medir con `tolerancia` metros de exigencia.
 *
 * `tolerancia` es la precisión que se le pide al resultado —por ejemplo 0,005 m para trabajar al
 * medio centímetro—. Devuelve `false` cuando el escalón del `float32` a esa distancia del origen ya
 * es mayor: entonces no hay nada que hacer salvo mover el origen.
 */
export function seSostieneEnFloat32(metros: number, tolerancia: number): boolean {
  if (!Number.isFinite(tolerancia) || tolerancia <= 0) return false;
  return escalonDeFloat32(metros) <= tolerancia;
}

/**
 * El desplazamiento que hay que restar a una nube para que quepa en `float32` sin perder precisión.
 *
 * Se devuelve **redondeado hacia abajo a un metro entero** y no el mínimo exacto de la nube, por dos
 * razones: un número redondo se puede leer y anotar en un informe, y un desplazamiento que dependa
 * del punto más bajo cambiaría al recortar la nube —dos recortes de la misma nube dejarían de estar
 * en el mismo sitio—.
 *
 * Recibe la extensión de la nube, que es justo lo que trae la cabecera de un LAS o un COPC: se lee
 * en un milisegundo y sin tocar un solo punto.
 */
export function desplazamientoLocal(
  minimo: readonly [number, number, number],
): [number, number, number] {
  return [Math.floor(minimo[0]), Math.floor(minimo[1]), Math.floor(minimo[2])];
}
