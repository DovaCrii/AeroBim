import { describe, expect, it } from "vitest";

import {
  cajaDeNodo,
  contenida,
  dentroDeLosPlanos,
  nodosVisibles,
  pixelesDeNodo,
  seTocan,
  type Caja,
  type Cubo,
  type NodoDelArbol,
  type Plano,
} from "./octree.js";

/** Un cubo de 100 m con el origen en cero: los números salen de cabeza. */
const CUBO: Cubo = [0, 0, 0, 100, 100, 100];

describe("cajaDeNodo", () => {
  it("la raiz es el cubo entero", () => {
    expect(cajaDeNodo(CUBO, { d: 0, x: 0, y: 0, z: 0 })).toEqual([0, 0, 0, 100, 100, 100]);
  });

  it("el nivel 1 son ocho cubos de medio lado", () => {
    expect(cajaDeNodo(CUBO, { d: 1, x: 0, y: 0, z: 0 })).toEqual([0, 0, 0, 50, 50, 50]);
    expect(cajaDeNodo(CUBO, { d: 1, x: 1, y: 1, z: 1 })).toEqual([50, 50, 50, 100, 100, 100]);
    expect(cajaDeNodo(CUBO, { d: 1, x: 1, y: 0, z: 0 })).toEqual([50, 0, 0, 100, 50, 50]);
  });

  it("y los ocho cubos del nivel 1 cubren el cubo entero sin solaparse", () => {
    let volumen = 0;
    for (let x = 0; x < 2; x += 1) {
      for (let y = 0; y < 2; y += 1) {
        for (let z = 0; z < 2; z += 1) {
          const c = cajaDeNodo(CUBO, { d: 1, x, y, z });
          volumen += (c[3] - c[0]) * (c[4] - c[1]) * (c[5] - c[2]);
        }
      }
    }
    expect(volumen).toBe(100 ** 3);
  });

  it("funciona con un cubo que no empieza en cero, que es el caso real", () => {
    // Un levantamiento en UTM: el cubo esta a seis millones de metros del origen.
    const utm: Cubo = [345_000, 6_298_000, 500, 345_100, 6_298_100, 600];
    expect(cajaDeNodo(utm, { d: 1, x: 1, y: 0, z: 1 })).toEqual([
      345_050, 6_298_000, 550, 345_100, 6_298_050, 600,
    ]);
  });

  it("a mas profundidad, cajas mas chicas, y el lado es exacto", () => {
    for (const d of [0, 1, 2, 3, 8]) {
      const c = cajaDeNodo(CUBO, { d, x: 0, y: 0, z: 0 });
      expect(c[3] - c[0], `d=${d}`).toBeCloseTo(100 / 2 ** d, 10);
    }
  });
});

describe("seTocan y contenida", () => {
  const a: Caja = [0, 0, 0, 10, 10, 10];

  it("dos cajas separadas no se tocan", () => {
    expect(seTocan(a, [20, 0, 0, 30, 10, 10])).toBe(false);
    expect(seTocan(a, [0, 0, -30, 10, 10, -20])).toBe(false);
  });

  it("dos cajas que se solapan si", () => {
    expect(seTocan(a, [5, 5, 5, 15, 15, 15])).toBe(true);
  });

  it("y el contacto por una cara cuenta: no se pierde un borde", () => {
    // Un nodo que toca exactamente el limite del recorte tiene puntos en ese plano.
    expect(seTocan(a, [10, 0, 0, 20, 10, 10])).toBe(true);
  });

  it("contenida distingue dentro de solapada", () => {
    expect(contenida([2, 2, 2, 8, 8, 8], a)).toBe(true);
    expect(contenida(a, a)).toBe(true);
    expect(contenida([5, 5, 5, 15, 15, 15], a)).toBe(false);
  });
});

describe("dentroDeLosPlanos", () => {
  /** Una caja de 0 a 10 en X, y todo el espacio en Y y Z. Normales hacia dentro. */
  const franja: Plano[] = [
    { a: 1, b: 0, c: 0, d: 0 }, // x >= 0
    { a: -1, b: 0, c: 0, d: 10 }, // x <= 10
  ];

  it("lo que esta dentro pasa", () => {
    expect(dentroDeLosPlanos([2, 0, 0, 8, 1, 1], franja)).toBe(true);
  });

  it("lo que esta entero al otro lado de un plano se descarta", () => {
    expect(dentroDeLosPlanos([20, 0, 0, 30, 1, 1], franja)).toBe(false);
    expect(dentroDeLosPlanos([-30, 0, 0, -20, 1, 1], franja)).toBe(false);
  });

  it("lo que asoma se acepta: es conservador a proposito", () => {
    // Descartar un nodo que se ve a medias abre un agujero en la nube; aceptar uno de mas solo
    // cuesta memoria.
    expect(dentroDeLosPlanos([-5, 0, 0, 5, 1, 1], franja)).toBe(true);
    expect(dentroDeLosPlanos([8, 0, 0, 20, 1, 1], franja)).toBe(true);
  });

  it("sin planos, todo pasa", () => {
    expect(dentroDeLosPlanos([1e9, 1e9, 1e9, 2e9, 2e9, 2e9], [])).toBe(true);
  });

  it("las normales apuntan hacia dentro, y del reves se invierte el recorte", () => {
    // Es el error que deja el visor sin cargar nada: se veria solo lo de fuera de la pantalla.
    //
    // Se prueba con **un solo plano**, no invirtiendo la franja entera: invertir los dos planos de
    // una franja no da lo contrario de la franja, da una region **vacia** —`x <= 0` y `x >= 10` a
    // la vez—, porque el complemento de una franja no se puede escribir como una conjuncion de
    // planos. Escrito con los dos, la prueba no distinguiria el error del signo de esa otra cosa.
    const haciaDentro: Plano = { a: 1, b: 0, c: 0, d: 0 }; // x >= 0
    const haciaFuera: Plano = { a: -1, b: 0, c: 0, d: 0 }; // x <= 0

    expect(dentroDeLosPlanos([2, 0, 0, 8, 1, 1], [haciaDentro])).toBe(true);
    expect(dentroDeLosPlanos([2, 0, 0, 8, 1, 1], [haciaFuera])).toBe(false);
    expect(dentroDeLosPlanos([-8, 0, 0, -2, 1, 1], [haciaDentro])).toBe(false);
    expect(dentroDeLosPlanos([-8, 0, 0, -2, 1, 1], [haciaFuera])).toBe(true);
  });
});

describe("pixelesDeNodo", () => {
  it("el doble de lejos, la mitad de pixeles", () => {
    const caja: Caja = [0, 0, 0, 10, 10, 10];
    const cerca = pixelesDeNodo(caja, 50, 800);
    const lejos = pixelesDeNodo(caja, 100, 800);
    expect(cerca / lejos).toBeCloseTo(2, 10);
  });

  it("una caja el doble de grande ocupa el doble", () => {
    const chica = pixelesDeNodo([0, 0, 0, 10, 10, 10], 100, 800);
    const grande = pixelesDeNodo([0, 0, 0, 20, 20, 20], 100, 800);
    expect(grande / chica).toBeCloseTo(2, 10);
  });

  it("una ventana el doble de alta da el doble de pixeles", () => {
    const caja: Caja = [0, 0, 0, 10, 10, 10];
    // El factor lleva dentro el alto de la ventana: es lo que hace que la regla no depende de una
    // distancia en metros elegida a dedo.
    expect(pixelesDeNodo(caja, 100, 1600) / pixelesDeNodo(caja, 100, 800)).toBeCloseTo(2, 10);
  });

  it("con la camara encima, el nodo ocupa todo: no se descarta por chico", () => {
    expect(pixelesDeNodo([0, 0, 0, 10, 10, 10], 0, 800)).toBe(Number.POSITIVE_INFINITY);
    expect(pixelesDeNodo([0, 0, 0, 10, 10, 10], -1, 800)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("nodosVisibles", () => {
  /** Un arbol de dos niveles: la raiz y los ocho hijos, con puntos parejos. */
  const ARBOL: NodoDelArbol[] = [
    { clave: { d: 0, x: 0, y: 0, z: 0 }, puntos: 100 },
    ...[0, 1].flatMap((x) =>
      [0, 1].flatMap((y) => [0, 1].map((z) => ({ clave: { d: 1, x, y, z }, puntos: 500 }))),
    ),
  ];

  it("sin recortes y con presupuesto de sobra, entra todo", () => {
    const s = nodosVisibles(ARBOL, { cubo: CUBO, puntosMaximos: 1_000_000 });
    expect(s.elegidos).toHaveLength(9);
    expect(s.puntos).toBe(100 + 8 * 500);
    expect(s.sinPresupuesto).toBe(0);
  });

  it("la raiz va primero: es lo que mas aporta por punto descargado", () => {
    const s = nodosVisibles(ARBOL, { cubo: CUBO, puntosMaximos: 1_000_000 });
    expect(s.elegidos[0]?.clave.d).toBe(0);
  });

  it("con el presupuesto justo entra la raiz, y lo que no cabe se cuenta", () => {
    const s = nodosVisibles(ARBOL, { cubo: CUBO, puntosMaximos: 100 });
    expect(s.elegidos).toHaveLength(1);
    expect(s.elegidos[0]?.clave.d).toBe(0);
    expect(s.puntos).toBe(100);
    expect(s.sinPresupuesto).toBe(8);
  });

  it("y nunca se pasa del techo, con cualquier techo", () => {
    for (const techo of [0, 1, 99, 100, 601, 2_500, 4_100]) {
      const s = nodosVisibles(ARBOL, { cubo: CUBO, puntosMaximos: techo });
      expect(s.puntos, `techo ${techo}`).toBeLessThanOrEqual(techo);
      expect(
        s.elegidos.reduce((t, n) => t + n.puntos, 0),
        `techo ${techo}`,
      ).toBe(s.puntos);
    }
  });

  it("el recorte por caja descarta los nodos que no la tocan", () => {
    // Solo el octante inferior: x, y, z todos por debajo de 50.
    const s = nodosVisibles(ARBOL, {
      cubo: CUBO,
      recorte: [0, 0, 0, 40, 40, 40],
      puntosMaximos: 1_000_000,
    });
    // La raiz toca -es el cubo entero- y de los ocho hijos, solo el 0-0-0.
    expect(s.elegidos).toHaveLength(2);
    expect(s.fueraDelRecorte).toBe(7);
    expect(s.elegidos.some((n) => n.clave.d === 1 && n.clave.x === 0)).toBe(true);
  });

  it("el recorte SI puede dejar fuera la raiz: entonces no hay nada que ensenar", () => {
    const s = nodosVisibles(ARBOL, {
      cubo: CUBO,
      recorte: [500, 500, 500, 600, 600, 600],
      puntosMaximos: 1_000_000,
    });
    expect(s.elegidos).toHaveLength(0);
    expect(s.fueraDelRecorte).toBe(9);
  });

  it("un nodo que toca el plano justo se conserva: la prueba es conservadora", () => {
    // `x <= 50` y los cuatro hijos con x=1 empiezan exactamente en 50. Tienen puntos en ese plano,
    // asi que descartarlos abriria un agujero. Es la decision documentada del modulo, y se prueba
    // para que nadie la "arregle" pensando que es un error de borde.
    const planos: Plano[] = [{ a: -1, b: 0, c: 0, d: 50 }];
    const s = nodosVisibles(ARBOL, { cubo: CUBO, planos, puntosMaximos: 1_000_000 });
    expect(s.fueraDeVista).toBe(0);
    expect(s.elegidos).toHaveLength(9);
  });

  it("el recorte por vista descarta lo de detras, pero nunca la raiz", () => {
    // `x <= 40`: los cuatro hijos con x=1 ocupan de 50 a 100, enteros al otro lado.
    const planos: Plano[] = [{ a: -1, b: 0, c: 0, d: 40 }];
    const s = nodosVisibles(ARBOL, { cubo: CUBO, planos, puntosMaximos: 1_000_000 });
    expect(s.fueraDeVista).toBe(4);
    // La raiz sigue: sin ella, una camara alejada se queda sin nada.
    expect(s.elegidos.some((n) => n.clave.d === 0)).toBe(true);
    expect(s.elegidos).toHaveLength(5);
  });

  it("la profundidad maxima limita el detalle a mano", () => {
    const s = nodosVisibles(ARBOL, { cubo: CUBO, profundidadMaxima: 0, puntosMaximos: 1e9 });
    expect(s.elegidos).toHaveLength(1);
    expect(s.demasiadoPequenos).toBe(8);
  });

  it("con camara, se ordena por lo que ocupa en pantalla", () => {
    // La camara pegada al octante 0-0-0: ese hijo tiene que ir antes que el 1-1-1, que esta al
    // otro extremo de la diagonal.
    const s = nodosVisibles(ARBOL, {
      cubo: CUBO,
      camara: [0, 0, 0],
      factorDeProyeccion: 800,
      puntosMaximos: 1_000_000,
    });
    const hijos = s.elegidos.filter((n) => n.clave.d === 1);
    const primero = hijos[0]?.clave;
    const ultimo = hijos[hijos.length - 1]?.clave;
    expect(primero).toEqual({ d: 1, x: 0, y: 0, z: 0 });
    expect(ultimo).toEqual({ d: 1, x: 1, y: 1, z: 1 });
  });

  it("y lo demasiado chico en pantalla se descarta, salvo la raiz", () => {
    // Camara a diez kilometros: nada ocupa un pixel, pero la raiz se queda.
    const s = nodosVisibles(ARBOL, {
      cubo: CUBO,
      camara: [0, 0, 10_000],
      factorDeProyeccion: 800,
      pixelesMinimos: 1000,
      puntosMaximos: 1_000_000,
    });
    expect(s.elegidos).toHaveLength(1);
    expect(s.elegidos[0]?.clave.d).toBe(0);
    expect(s.demasiadoPequenos).toBe(8);
  });

  it("las cuentas cuadran: cada nodo esta en un sitio y en uno solo", () => {
    const s = nodosVisibles(ARBOL, {
      cubo: CUBO,
      camara: [0, 0, 0],
      factorDeProyeccion: 800,
      pixelesMinimos: 5,
      recorte: [0, 0, 0, 60, 60, 60],
      profundidadMaxima: 1,
      puntosMaximos: 900,
    });
    const total =
      s.elegidos.length +
      s.fueraDeVista +
      s.fueraDelRecorte +
      s.demasiadoPequenos +
      s.sinPresupuesto;
    expect(total).toBe(ARBOL.length);
  });

  it("un arbol vacio no levanta y no elige nada", () => {
    const s = nodosVisibles([], { cubo: CUBO, puntosMaximos: 1e9 });
    expect(s.elegidos).toEqual([]);
    expect(s.puntos).toBe(0);
  });
});
