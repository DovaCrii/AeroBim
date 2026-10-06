/**
 * La geometría de las marcas sobre una página (`F15.2`): el contorno de una nube de revisión y la punta de
 * una flecha. Todo en **píxeles de la página dibujada**, que es lo que se pinta; lo que se guarda son
 * fracciones y se multiplica por el tamaño al llegar aquí.
 *
 * Aparte del componente porque es lo que se puede hacer mal sin que nadie lo note —una nube cuyos arcos
 * apuntan hacia dentro es un contorno de sierra, no una nube— y se comprueba contando y midiendo.
 */

export interface Caja {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** La caja con las esquinas en orden, sea cual sea el sentido en que se arrastró. */
export function ordenada(caja: Caja): Caja {
  return {
    x1: Math.min(caja.x1, caja.x2),
    y1: Math.min(caja.y1, caja.y2),
    x2: Math.max(caja.x1, caja.x2),
    y2: Math.max(caja.y1, caja.y2),
  };
}

/** Cuántos arcos caben en un lado de `largo` píxeles con arcos de `radio`: al menos dos, o no es una nube. */
export function arcosEnLado(largo: number, radio: number): number {
  return Math.max(2, Math.round(largo / (2 * radio)));
}

/**
 * El contorno festoneado de una nube de revisión, como un trazo SVG.
 *
 * Va por los cuatro lados en sentido horario (en pantalla) y cada lado se parte en `arcosEnLado` arcos
 * iguales **que abultan hacia fuera** (`sweep` = 1). El radio de cada arco es la mitad de su cuerda, así
 * que los arcos son semicírculos y empalman en puntas.
 */
export function trazoDeNube(caja: Caja, radioPx: number): string {
  const { x1, y1, x2, y2 } = ordenada(caja);
  const lados: [number, number, number, number][] = [
    [x1, y1, x2, y1], // arriba, hacia la derecha
    [x2, y1, x2, y2], // derecha, hacia abajo
    [x2, y2, x1, y2], // abajo, hacia la izquierda
    [x1, y2, x1, y1], // izquierda, hacia arriba
  ];
  let trazo = `M ${x1} ${y1}`;
  for (const [ax, ay, bx, by] of lados) {
    const largo = Math.hypot(bx - ax, by - ay);
    const n = arcosEnLado(largo, radioPx);
    const r = largo / n / 2;
    for (let i = 1; i <= n; i += 1) {
      const px = ax + ((bx - ax) * i) / n;
      const py = ay + ((by - ay) * i) / n;
      trazo += ` A ${r} ${r} 0 0 1 ${px} ${py}`;
    }
  }
  return `${trazo} Z`;
}

/**
 * Los tres vértices de la punta de una flecha que termina en `(hastaX, hastaY)` viniendo de
 * `(desdeX, desdeY)`. Sin recorrido —dos puntos iguales— no hay dirección y no se dibuja nada.
 */
export function puntaDeFlecha(
  desdeX: number,
  desdeY: number,
  hastaX: number,
  hastaY: number,
  largoPx: number,
): readonly [number, number][] {
  const dx = hastaX - desdeX;
  const dy = hastaY - desdeY;
  const largo = Math.hypot(dx, dy);
  if (largo === 0) return [];
  const ux = dx / largo;
  const uy = dy / largo;
  // Dos puntos atrás de la punta, abiertos 25° a cada lado.
  const abre = (25 * Math.PI) / 180;
  const atras = (signo: number): [number, number] => {
    const c = Math.cos(abre);
    const s = Math.sin(abre) * signo;
    return [hastaX - largoPx * (ux * c - uy * s), hastaY - largoPx * (uy * c + ux * s)];
  };
  return [[hastaX, hastaY], atras(1), atras(-1)];
}
