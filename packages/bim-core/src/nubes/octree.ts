/**
 * Qué nodos del octree hace falta bajar, y cuáles no: la aritmética de `F2.3`.
 *
 * ## El problema que resuelve
 *
 * `F2.1` carga la nube **por niveles enteros** hasta que se acaba el presupuesto. Funciona y deja
 * ver la nube, pero gasta el presupuesto en lo que no se está mirando: con la cámara metida en una
 * esquina del levantamiento, la mitad de los puntos que se pagaron están detrás.
 *
 * Un octree existe justamente para no hacer eso. Cada nodo ocupa una caja conocida —se deriva de su
 * clave y del cubo del archivo—, así que se puede preguntar **antes de bajarlo** si se ve y a qué
 * tamaño. Bajar solo lo que se ve, y con el detalle que corresponde a su distancia, es la diferencia
 * entre abrir 50 millones de puntos y no poder.
 *
 * ## Por qué vive en `bim-core` y no en el visor
 *
 * Es geometría: cajas, planos y comparaciones. Se prueba en Node con números escritos a mano —una
 * caja dentro, una fuera, una a medias— y la respuesta no depende de Three.js ni de la tarjeta. En
 * el visor quedaría mezclada con la cámara y solo se podría comprobar mirando la pantalla, que es
 * justo lo que este repositorio no puede hacer.
 *
 * ## La regla de detalle, y por qué es un tamaño en pantalla y no una distancia
 *
 * La tentación es «baja los nodos que estén a menos de X metros». Eso está mal en cuanto la cámara
 * cambia de campo visual o la ventana de tamaño: el mismo nodo a los mismos metros ocupa la mitad de
 * pantalla si la ventana es la mitad. Lo que decide si un nodo aporta detalle **es cuántos píxeles
 * ocupa**, así que la regla se escribe así, y el visor le pasa lo que sabe de su cámara.
 */

/** El cubo del octree: `[minX, minY, minZ, maxX, maxY, maxZ]`, tal como lo trae un COPC. */
export type Cubo = readonly [number, number, number, number, number, number];

/** La clave de un nodo: profundidad y su celda en esa profundidad. */
export interface ClaveDeNodo {
  d: number;
  x: number;
  y: number;
  z: number;
}

/** Una caja alineada con los ejes: `[minX, minY, minZ, maxX, maxY, maxZ]`. */
export type Caja = [number, number, number, number, number, number];

/**
 * Un plano, como `ax + by + cz + d = 0` con la normal apuntando **hacia dentro** del volumen.
 *
 * Es la convención de los seis planos de un tronco de visión en Three.js: un punto está dentro
 * cuando `a·x + b·y + c·z + d ≥ 0` en los seis. Escribirlo al revés deja el recorte invertido —se
 * vería solo lo que está fuera de la pantalla— y es un error que en una nube se lee como «no carga
 * nada».
 */
export interface Plano {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * La caja que ocupa un nodo, derivada de su clave y del cubo.
 *
 * Un nodo a profundidad `d` ocupa un cubo de lado `lado / 2^d`, y su celda `(x, y, z)` dice cuál.
 * No hay nada que adivinar: es la definición del formato, y por eso el cubo del archivo **tiene que
 * estar declarado** — sin él esto no se puede calcular, y de ahí el aviso de `hayCubo`.
 */
export function cajaDeNodo(cubo: Cubo, clave: ClaveDeNodo): Caja {
  const lado = cubo[3] - cubo[0];
  const ancho = lado / 2 ** clave.d;
  const x0 = cubo[0] + clave.x * ancho;
  const y0 = cubo[1] + clave.y * ancho;
  const z0 = cubo[2] + clave.z * ancho;
  return [x0, y0, z0, x0 + ancho, y0 + ancho, z0 + ancho];
}

/** `true` si las dos cajas se tocan. El contacto por una cara cuenta: no se pierde un borde. */
export function seTocan(a: Caja, b: Caja): boolean {
  return (
    a[0] <= b[3] && a[3] >= b[0] && a[1] <= b[4] && a[4] >= b[1] && a[2] <= b[5] && a[5] >= b[2]
  );
}

/**
 * `true` si la caja está **del todo** dentro de la otra.
 *
 * Sirve para no recortar lo que ya cabe entero: un nodo contenido en la caja de recorte no hay que
 * mirarlo punto por punto.
 */
export function contenida(interior: Caja, exterior: Caja): boolean {
  return (
    interior[0] >= exterior[0] &&
    interior[1] >= exterior[1] &&
    interior[2] >= exterior[2] &&
    interior[3] <= exterior[3] &&
    interior[4] <= exterior[4] &&
    interior[5] <= exterior[5]
  );
}

/**
 * `true` si la caja **no está claramente fuera** de los planos: hay que considerarla.
 *
 * Es la prueba clásica de caja contra tronco de visión, y es **conservadora a propósito**: descarta
 * solo las cajas que quedan enteras al otro lado de algún plano. Puede dejar pasar alguna que en
 * realidad no se ve —el caso de la esquina, con cajas grandes y troncos estrechos— y eso es lo
 * correcto: dejar pasar un nodo de más cuesta memoria, y descartar uno de menos **abre un agujero en
 * la nube**, que es un defecto que parece del levantamiento.
 *
 * Para cada plano se toma el vértice de la caja **más favorable** —el que más hacia dentro está
 * según el signo de la normal—: si ni ese llega, la caja entera está fuera.
 */
export function dentroDeLosPlanos(caja: Caja, planos: readonly Plano[]): boolean {
  for (const p of planos) {
    const x = p.a >= 0 ? caja[3] : caja[0];
    const y = p.b >= 0 ? caja[4] : caja[1];
    const z = p.c >= 0 ? caja[5] : caja[2];
    if (p.a * x + p.b * y + p.c * z + p.d < 0) return false;
  }
  return true;
}

/**
 * Cuántos píxeles de alto ocupa un nodo, aproximado por su esfera envolvente.
 *
 * `altoDeLaVentana` en píxeles y `factorDeProyeccion` es `altoDeLaVentana / (2·tan(fov/2))` para una
 * cámara en perspectiva — lo que el visor calcula de la suya. Para una ortogonal, la distancia no
 * influye y el visor pasa la distancia como 1 con el factor ya resuelto.
 *
 * Se usa la esfera y no la caja proyectada porque **no depende de la orientación**: la caja
 * proyectada cambia de tamaño al girar la cámara, y con ella cambiaría el nivel de detalle de un
 * nodo mientras se orbita, que se ve como la nube parpadeando entre resoluciones.
 */
export function pixelesDeNodo(caja: Caja, distancia: number, factorDeProyeccion: number): number {
  const radio = Math.hypot(caja[3] - caja[0], caja[4] - caja[1], caja[5] - caja[2]) / 2;
  if (!Number.isFinite(distancia) || distancia <= 0) return Number.POSITIVE_INFINITY;
  return (2 * radio * factorDeProyeccion) / distancia;
}

/** Un nodo candidato, con lo que hace falta para decidir: su clave y cuántos puntos trae. */
export interface NodoDelArbol {
  clave: ClaveDeNodo;
  puntos: number;
}

/** Cómo se pide la selección. */
export interface CriterioDeSeleccion {
  /** El cubo del octree, del archivo. */
  cubo: Cubo;
  /** Los seis planos del tronco de visión. Vacío significa **no recortar por vista**. */
  planos?: readonly Plano[];
  /** Desde dónde se mira, para calcular el tamaño en pantalla. */
  camara?: readonly [number, number, number];
  /** `altoDeLaVentana / (2·tan(fov/2))`. Sin esto no se ordena por tamaño, solo por profundidad. */
  factorDeProyeccion?: number;
  /** Cuántos píxeles tiene que ocupar un nodo para valer la pena. Por omisión, 1. */
  pixelesMinimos?: number;
  /** La caja de recorte, si hay una. Los nodos que no la toquen se descartan. */
  recorte?: Caja;
  /** Cuántos puntos como mucho. Es el techo, y se respeta. */
  puntosMaximos: number;
  /** Profundidad máxima, si se quiere limitar el detalle a mano. */
  profundidadMaxima?: number;
}

/** El resultado: qué bajar, en qué orden, y qué se quedó fuera. */
export interface Seleccion {
  /** Los nodos elegidos, **ya ordenados por lo que más aportan**. */
  elegidos: NodoDelArbol[];
  /** La suma de sus puntos. */
  puntos: number;
  /** Cuántos nodos se descartaron por no verse. */
  fueraDeVista: number;
  /** Cuántos por el recorte por caja. */
  fueraDelRecorte: number;
  /** Cuántos por ser demasiado pequeños en pantalla. */
  demasiadoPequenos: number;
  /** Cuántos por el techo de puntos: se verían, pero no caben. */
  sinPresupuesto: number;
}

/**
 * Elige los nodos que hay que bajar.
 *
 * El orden importa tanto como la selección: **primero lo que más aporta**, que es lo grande en
 * pantalla y lo poco profundo. Así, si el presupuesto se acaba a medias, lo que falta es el detalle
 * fino de lo lejano y no un trozo de la nube — y mientras se descarga se va viendo algo cada vez
 * mejor en vez de aparecer una esquina completa y el resto vacío.
 *
 * **La raíz nunca se descarta por tamaño.** Es la muestra gruesa de la nube entera; sin ella, una
 * cámara alejada se quedaría sin nada que enseñar. Sí se descarta si el recorte por caja la deja
 * fuera, porque entonces la respuesta correcta es que no hay nada.
 */
export function nodosVisibles(
  nodos: readonly NodoDelArbol[],
  criterio: CriterioDeSeleccion,
): Seleccion {
  const planos = criterio.planos ?? [];
  const pixelesMinimos = criterio.pixelesMinimos ?? 1;
  const profundidadMaxima = criterio.profundidadMaxima ?? Number.POSITIVE_INFINITY;

  let fueraDeVista = 0;
  let fueraDelRecorte = 0;
  let demasiadoPequenos = 0;

  const candidatos: { nodo: NodoDelArbol; prioridad: number }[] = [];

  for (const nodo of nodos) {
    if (nodo.clave.d > profundidadMaxima) {
      demasiadoPequenos += 1;
      continue;
    }

    const caja = cajaDeNodo(criterio.cubo, nodo.clave);
    const esLaRaiz = nodo.clave.d === 0;

    if (criterio.recorte !== undefined && !seTocan(caja, criterio.recorte)) {
      fueraDelRecorte += 1;
      continue;
    }
    if (!esLaRaiz && planos.length > 0 && !dentroDeLosPlanos(caja, planos)) {
      fueraDeVista += 1;
      continue;
    }

    // La prioridad: los pixeles que ocupa. Sin camara no se puede calcular, y entonces se ordena
    // por profundidad -lo menos profundo primero-, que es la mejor aproximacion disponible.
    let prioridad: number;
    if (criterio.camara !== undefined && criterio.factorDeProyeccion !== undefined) {
      const centro = [
        (caja[0] + caja[3]) / 2,
        (caja[1] + caja[4]) / 2,
        (caja[2] + caja[5]) / 2,
      ] as const;
      const distancia = Math.hypot(
        centro[0] - criterio.camara[0],
        centro[1] - criterio.camara[1],
        centro[2] - criterio.camara[2],
      );
      prioridad = pixelesDeNodo(caja, distancia, criterio.factorDeProyeccion);
      if (!esLaRaiz && prioridad < pixelesMinimos) {
        demasiadoPequenos += 1;
        continue;
      }
    } else {
      // Sin camara: 2^-d, que es grande en la raiz y baja al profundizar.
      prioridad = 2 ** -nodo.clave.d;
    }

    candidatos.push({ nodo, prioridad });
  }

  // De mayor a menor aporte, y a igualdad de aporte lo menos profundo primero: entre dos nodos que
  // ocupan lo mismo, el de arriba cubre mas nube por punto descargado.
  candidatos.sort((a, b) => b.prioridad - a.prioridad || a.nodo.clave.d - b.nodo.clave.d);

  const elegidos: NodoDelArbol[] = [];
  let puntos = 0;
  let sinPresupuesto = 0;
  for (const { nodo } of candidatos) {
    // **El nodo entra entero o no entra.** Media hoja del octree es media caja de puntos, y eso se
    // ve como un corte recto en la nube.
    if (puntos + nodo.puntos > criterio.puntosMaximos) {
      sinPresupuesto += 1;
      continue;
    }
    elegidos.push(nodo);
    puntos += nodo.puntos;
  }

  return {
    elegidos,
    puntos,
    fueraDeVista,
    fueraDelRecorte,
    demasiadoPequenos,
    sinPresupuesto,
  };
}
