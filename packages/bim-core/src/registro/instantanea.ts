/**
 * La foto de lo que se estaba mirando, y la comprobación de que **hay algo en la foto**.
 *
 * **Un tema de BCF sin imagen es media observación.** Todo visor del mercado —Solibri, Navisworks,
 * BCF Manager— dibuja la lista de temas con su miniatura al lado, y es lo que hace que quien la
 * recibe sepa de qué se le habla antes de cargar el modelo. Los nuestros salían sin ninguna: el
 * mandante abría una lista de títulos.
 *
 * ## Por qué esto existe y no basta con `toDataURL`
 *
 * **Un lienzo de WebGL puede devolver una imagen en blanco sin fallar.** El búfer de dibujo se borra
 * cuando el navegador compone el cuadro, así que leerlo un instante tarde devuelve un rectángulo
 * vacío —y `toDataURL` **no avisa**: devuelve un PNG perfectamente válido, todo del mismo color—. Ya
 * pasó algo idéntico en este repositorio con las pestañas que no pintan.
 *
 * Y una imagen en blanco dentro de un BCF **es peor que ninguna**: la lista del otro extremo se
 * llena de rectángulos vacíos, que afirman «así se ve el problema» sobre nada. La regla del
 * repositorio es la misma de siempre — antes que decir algo falso, no se dice.
 *
 * Así que quien captura **comprueba lo que capturó** antes de mandarlo. La comprobación vive acá,
 * donde se prueba sin navegador, con píxeles escritos a mano.
 */

/**
 * Cuánta diferencia de color tiene que haber para que la imagen cuente como dibujada.
 *
 * Es el rango —máximo menos mínimo— del canal que más varía, sobre 255. **Ocho es deliberadamente
 * bajo**: no se pide que la imagen sea bonita, se pide que **no sea un rectángulo liso**. Un modelo
 * gris sobre fondo oscuro pasa de sobra; un búfer borrado no llega.
 */
export const RANGO_MINIMO = 8;

/**
 * Cuántos píxeles se miran como mucho.
 *
 * Un lienzo de 1600 × 900 son 1,44 millones de píxeles y recorrerlos todos para contestar «¿hay
 * algo?» es trabajo tirado: se muestrea a saltos regulares, que además reparte la muestra por toda
 * la imagen en vez de concentrarla en una esquina.
 */
export const MUESTRAS = 4096;

/**
 * `true` si la imagen es un rectángulo liso: no hay nada que enseñar.
 *
 * Recibe los píxeles en **RGBA**, que es como los entrega `getImageData` de un lienzo. Devuelve
 * `true` también cuando no hay píxeles o cuando la imagen es **enteramente transparente**, que es lo
 * que sale de un búfer que nunca se dibujó.
 */
export function pareceEnBlanco(pixeles: ArrayLike<number>): boolean {
  const total = Math.floor(pixeles.length / 4);
  if (total === 0) return true;

  const salto = Math.max(1, Math.floor(total / MUESTRAS));

  let opaco = false;
  const min = [255, 255, 255];
  const max = [0, 0, 0];

  for (let i = 0; i < total; i += salto) {
    const base = i * 4;
    // **Un píxel transparente no dice nada de su color.** El lienzo sin dibujar deja RGB en cero
    // con alfa en cero, y contarlo como negro haría pasar por «dibujada» cualquier imagen con una
    // esquina transparente y otra pintada.
    if ((pixeles[base + 3] ?? 0) === 0) continue;
    opaco = true;

    for (let canal = 0; canal < 3; canal += 1) {
      const valor = pixeles[base + canal] ?? 0;
      if (valor < (min[canal] as number)) min[canal] = valor;
      if (valor > (max[canal] as number)) max[canal] = valor;
    }
  }

  if (!opaco) return true;

  const rango = Math.max(
    (max[0] as number) - (min[0] as number),
    (max[1] as number) - (min[1] as number),
    (max[2] as number) - (min[2] as number),
  );
  return rango < RANGO_MINIMO;
}
