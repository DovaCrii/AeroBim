/**
 * Calzar la nube con el modelo señalando puntos que son el mismo punto.
 *
 * ## Por qué esto hace falta, y no es el camino de repuesto
 *
 * `IfcMapConversion` resuelve la alineación leyendo el archivo, y sería el camino único si los
 * archivos la trajeran. **No la traen.** La mayoría de los IFC de obra siguen siendo IFC2X3, donde
 * la entidad **no existe**, y en los IFC4 de obra suele venir vacía. Así que calzar a mano no es el
 * plan B: es el plan que se va a usar casi siempre.
 *
 * La forma es la que ya conoce cualquiera que haya alineado un levantamiento: se señalan tres o
 * cuatro **puntos que son el mismo punto** en las dos —una esquina de pilar, el vértice de un
 * antepecho— y de ahí sale la transformación. Es el problema de Procrustes ortogonal, y tiene
 * solución cerrada: no se itera, no se «ajusta», sale de una vez.
 *
 * ## Tres decisiones que cambian el resultado, y por qué
 *
 * **1. El giro es solo alrededor del vertical.** Un edificio y un levantamiento están los dos
 * aplomados: el eje Z de los dos es la gravedad. Dejar que el ajuste gire libremente en tres
 * dimensiones le permite **inclinar el edificio** para absorber el error de quien señaló los puntos,
 * y entonces el residuo baja mientras la alineación empeora. Es el fallo clásico de estos ajustes, y
 * la restricción lo cierra de raíz.
 *
 * **2. La escala se queda en 1 salvo que se pida.** El levantamiento está en metros y el modelo
 * también. Una escala ajustada de 1,003 no es que el edificio mida distinto: es un error de unidades
 * o unos puntos mal señalados, y absorberlo en la escala **esconde el problema en vez de
 * enseñarlo**. Se puede pedir —`conEscala`— y entonces sale informada, para poder mirarla y
 * desconfiar.
 *
 * **3. El residuo se devuelve siempre, y con el peor caso.** Una alineación sin residuo es la
 * mentira con dos decimales de la que ya sabemos: `F2.4` va a medir desviaciones de milímetros sobre
 * esto. Se dan el cuadrático medio y **el máximo**, porque el medio esconde el punto que se señaló
 * mal y el máximo lo delata.
 *
 * ## Y cuántos puntos hacen falta de verdad
 *
 * | Puntos | Qué se puede sacar                                                        |
 * | ------ | ------------------------------------------------------------------------- |
 * | 0      | Nada                                                                      |
 * | 1      | Solo el desplazamiento. El giro queda **indeterminado**, y se dice        |
 * | 2      | Giro y desplazamiento. El residuo ya significa algo, pero poco           |
 * | 3+     | Giro, desplazamiento y un residuo en el que se puede confiar              |
 *
 * Con dos puntos idénticos —o todos en el mismo sitio— el giro **no está determinado por los datos**
 * y devolver 0° sería inventarlo. Se detecta y se informa.
 */

import type { Alineacion, Punto3 } from "./georreferencia.js";

/** Un punto señalado en las dos: donde está en el modelo, y donde está en la nube. */
export interface ParDePuntos {
  /** En coordenadas locales del modelo. */
  local: Punto3;
  /** El mismo punto, en coordenadas de la nube. */
  nube: Punto3;
}

/** Qué tan bien calzó, que es la mitad del resultado. */
export interface Residuo {
  /** El error cuadrático medio, en metros. */
  medio: number;
  /** El error del punto que peor calzó, en metros. Es el que delata una selección mala. */
  maximo: number;
  /** Cuál fue ese punto, por su posición en la lista que se pasó. */
  peor: number;
  /** El error de cada par, en el mismo orden. */
  porPar: number[];
}

/** Lo que se sabe y lo que no, después de calzar. */
export interface Calce {
  /** La transformación resultante, en el mismo formato que la de `IfcMapConversion`. */
  alineacion: Alineacion;
  residuo: Residuo;
  /** Cuántos pares se usaron. */
  pares: number;
  /**
   * `true` si los datos **no determinan el giro**: un solo par, o todos los puntos en el mismo
   * sitio en planta. La alineación sale sin giro, y eso es un supuesto y no una medida.
   */
  giroIndeterminado: boolean;
  /** `true` si se dejó ajustar la escala. Cuando es `false`, la escala vale exactamente 1. */
  escalaAjustada: boolean;
}

/** Cómo se pidió el calce. */
export interface OpcionesDeCalce {
  /**
   * Dejar que la escala se ajuste. **Apagado por defecto**, y a conciencia: ver el punto 2 del
   * encabezado del módulo.
   */
  conEscala?: boolean;
}

/**
 * La transformación que mejor lleva los puntos del modelo a los de la nube.
 *
 * «Mejor» es en el sentido de mínimos cuadrados, con giro solo alrededor del vertical. La solución
 * es cerrada —centroides, una suma de productos cruzados y un `atan2`— así que no hay iteraciones ni
 * un punto de partida que pueda salir mal.
 *
 * Con la lista vacía devuelve la identidad y el giro marcado como indeterminado: es lo honesto, y
 * levantar obligaría a quien llama a envolver cada llamada por un caso que va a pasar —la lista
 * empieza vacía—.
 */
export function calzarConPuntos(
  pares: readonly ParDePuntos[],
  opciones: OpcionesDeCalce = {},
): Calce {
  const n = pares.length;
  if (n === 0) return sinDatos();

  // Los centroides: el giro se calcula sobre los puntos centrados, que es lo que separa la rotacion
  // del desplazamiento en vez de resolver las dos a la vez.
  const cl = centroide(pares.map((p) => p.local));
  const cn = centroide(pares.map((p) => p.nube));

  // Las dos sumas que dan el giro. `cruzado` es el area orientada y `punto` la proyeccion: juntos
  // son el numerador y el denominador de la tangente del angulo, con su cuadrante.
  let cruzado = 0;
  let punto = 0;
  let normaEnPlanta = 0;
  // La escala se mide en tres dimensiones aunque el giro sea de dos: el giro es alrededor del
  // vertical, asi que la altura no rota, **pero si escala**. Sumar solo la planta daria una escala
  // sesgada en cuanto la nube tenga altura, que es siempre.
  let normaTotal = 0;
  let alturas = 0;
  for (const par of pares) {
    const ax = par.local[0] - cl[0];
    const ay = par.local[1] - cl[1];
    const az = par.local[2] - cl[2];
    const bx = par.nube[0] - cn[0];
    const by = par.nube[1] - cn[1];
    const bz = par.nube[2] - cn[2];
    cruzado += ax * by - ay * bx;
    punto += ax * bx + ay * by;
    normaEnPlanta += ax * ax + ay * ay;
    normaTotal += ax * ax + ay * ay + az * az;
    alturas += az * bz;
  }

  // Si los puntos del modelo estan todos en el mismo sitio en planta, no hay giro que medir: no es
  // que el giro sea cero, es que los datos no dicen nada de el.
  const indeterminado = n < 2 || normaEnPlanta === 0 || (cruzado === 0 && punto === 0);
  const giro = indeterminado ? 0 : Math.atan2(cruzado, punto);
  const cos = Math.cos(giro);
  const sen = Math.sin(giro);

  // La escala optima es la proyeccion de lo girado sobre lo original, en las tres dimensiones.
  // Solo si se pidio.
  const conEscala = opciones.conEscala === true;
  const escala =
    conEscala && normaTotal > 0 ? (cos * punto + sen * cruzado + alturas) / normaTotal : 1;

  const alineacion: Alineacion = {
    este: cn[0] - escala * (cl[0] * cos - cl[1] * sen),
    norte: cn[1] - escala * (cl[0] * sen + cl[1] * cos),
    altura: cn[2] - escala * cl[2],
    escala,
    cos,
    sen,
    giroGrados: (giro * 180) / Math.PI,
    via: "sin giro declarado",
  };

  return {
    alineacion,
    residuo: residuoDe(pares, alineacion),
    pares: n,
    giroIndeterminado: indeterminado,
    escalaAjustada: conEscala,
  };
}

/**
 * Lo que se equivoca una alineación sobre unos pares dados.
 *
 * Se expone aparte porque sirve para lo que no es calzar: comprobar contra pares nuevos una
 * alineación que salió de `IfcMapConversion`. Si el archivo dice una cosa y los puntos otra, esto lo
 * mide — y es la única forma de saber si la georreferencia del archivo es de fiar.
 */
export function residuoDe(pares: readonly ParDePuntos[], a: Alineacion): Residuo {
  if (pares.length === 0) return { medio: 0, maximo: 0, peor: -1, porPar: [] };

  const porPar: number[] = [];
  let suma = 0;
  let maximo = 0;
  let peor = 0;

  for (let i = 0; i < pares.length; i += 1) {
    const p = pares[i] as ParDePuntos;
    const [x, y, z] = p.local;
    const ex = a.este + a.escala * (x * a.cos - y * a.sen) - p.nube[0];
    const ey = a.norte + a.escala * (x * a.sen + y * a.cos) - p.nube[1];
    const ez = a.altura + a.escala * z - p.nube[2];
    const d = Math.hypot(ex, ey, ez);
    porPar.push(d);
    suma += d * d;
    if (d > maximo) {
      maximo = d;
      peor = i;
    }
  }

  return { medio: Math.sqrt(suma / pares.length), maximo, peor, porPar };
}

function centroide(puntos: readonly Punto3[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of puntos) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = puntos.length;
  return [x / n, y / n, z / n];
}

function sinDatos(): Calce {
  return {
    alineacion: {
      este: 0,
      norte: 0,
      altura: 0,
      escala: 1,
      cos: 1,
      sen: 0,
      giroGrados: 0,
      via: "sin giro declarado",
    },
    residuo: { medio: 0, maximo: 0, peor: -1, porPar: [] },
    pares: 0,
    giroIndeterminado: true,
    escalaAjustada: false,
  };
}
