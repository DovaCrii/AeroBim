import { describe, expect, it } from "vitest";

import {
  aplicar,
  archivoAEscena,
  cajaAArchivo,
  escenaAArchivo,
  matrizDeCalce,
  planoAArchivo,
} from "./matriz.js";
import { alineacionDeMapa, localAMapa, type Alineacion } from "./georreferencia.js";
import { calzarConPuntos, type ParDePuntos } from "./calce.js";
import type { Punto3 } from "./georreferencia.js";

/**
 * La matriz **no se compara contra dieciséis números escritos a mano** — eso sería comparar la
 * fórmula contra sí misma. Se comprueba aplicándola: se toma una transformación conocida, se
 * fabrican los puntos que vería alguien señalando esquinas, y se exige que la matriz lleve **los
 * puntos de la nube a los del modelo**. Si un signo estuviera al revés, algún punto caería en otro
 * sitio.
 */

const DESPLAZAMIENTO: [number, number, number] = [345_000, 6_298_000, 560];

/** Esquinas de un edificio, en coordenadas locales del modelo. */
const ESQUINAS: Punto3[] = [
  [0, 0, 0],
  [24, 0, 0],
  [24, 13, 0],
  [0, 13, 0],
  [12, 6.5, 9.6],
  [3, 11, 4.2],
];

function conocida(giroGrados: number, escala = 1): Alineacion {
  const r = (giroGrados * Math.PI) / 180;
  return alineacionDeMapa({
    este: 345_012.5,
    norte: 6_298_044.25,
    altura: 561.3,
    abscisaEjeX: Math.cos(r),
    ordenadaEjeX: Math.sin(r),
    escala,
  });
}

describe("escenaAArchivo y archivoAEscena", () => {
  it("son inversas exactas la una de la otra", () => {
    for (const p of [
      [0, 0, 0],
      [12.5, 3.25, -40],
      [-7, 0.001, 99.6],
    ] as Punto3[]) {
      const vuelta = escenaAArchivo(archivoAEscena(p, DESPLAZAMIENTO), DESPLAZAMIENTO);
      for (let i = 0; i < 3; i += 1) expect(vuelta[i]).toBeCloseTo(p[i] as number, 9);
    }
  });

  it("la cota del archivo es la Y de la escena, y el norte la Z negada", () => {
    // Es la tabla del cargador, y comprobarla acá impide que las dos se separen.
    const escena = archivoAEscena([345_010, 6_298_020, 563], DESPLAZAMIENTO);
    expect(escena).toEqual([10, 3, -20]);
  });

  it("el origen del desplazamiento cae en el origen de la escena", () => {
    // Se compara componente a componente y no con `toEqual`: la componente Z sale de negar una
    // resta que da cero, o sea **`-0`**, y `toEqual` lo distingue de `0` aunque en aritmética sean
    // el mismo número. Cambiar el cargador para evitar un `-0` seria añadir una rama que no
    // arregla nada.
    const [x, y, z] = archivoAEscena(DESPLAZAMIENTO, DESPLAZAMIENTO);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(0, 12);
  });
});

describe("planoAArchivo", () => {
  /** Dentro del plano si `a·x + b·y + c·z + d ≥ 0`. */
  const dentro = (
    p: { a: number; b: number; c: number; d: number },
    q: readonly [number, number, number],
  ) => p.a * q[0] + p.b * q[1] + p.c * q[2] + p.d >= 0;

  it("un punto que esta dentro en la escena, esta dentro en el archivo", () => {
    // **Es la propiedad que importa**: el mismo punto, en los dos sistemas, con el mismo veredicto.
    // Si un signo estuviera al revés, el recorte descartaría lo que sí se ve.
    const planos = [
      { a: 1, b: 0, c: 0, d: 5 },
      { a: -1, b: 0, c: 0, d: 5 },
      { a: 0, b: 1, c: 0, d: 2 },
      { a: 0, b: 0, c: 1, d: 30 },
      { a: 0.6, b: -0.8, c: 0, d: 3 },
      { a: 0.3, b: 0.4, c: -0.866, d: -1.5 },
    ];
    const puntos: Punto3[] = [
      [0, 0, 0],
      [4.9, 1, -20],
      [-6, 0, 0],
      [2, -3, 40],
      [1.5, 12, -7.25],
      [-4, 0.5, 3],
    ];

    for (const plano of planos) {
      const enArchivo = planoAArchivo(plano, DESPLAZAMIENTO);
      for (const p of puntos) {
        const f = escenaAArchivo(p, DESPLAZAMIENTO);
        expect(dentro(enArchivo, f), `${JSON.stringify(plano)} / ${JSON.stringify(p)}`).toBe(
          dentro(plano, p),
        );
      }
    }
  });

  it("y la distancia al plano se conserva: es un movimiento rigido", () => {
    const plano = { a: 0.6, b: 0, c: -0.8, d: 3 };
    const enArchivo = planoAArchivo(plano, DESPLAZAMIENTO);
    for (const p of [
      [0, 0, 0],
      [10, 5, -3],
      [-7.5, 2, 8],
    ] as Punto3[]) {
      const f = escenaAArchivo(p, DESPLAZAMIENTO);
      const dEscena = plano.a * p[0] + plano.b * p[1] + plano.c * p[2] + plano.d;
      const dArchivo = enArchivo.a * f[0] + enArchivo.b * f[1] + enArchivo.c * f[2] + enArchivo.d;
      expect(dArchivo).toBeCloseTo(dEscena, 6);
    }
  });
});

describe("cajaAArchivo", () => {
  it("intercambia el minimo y el maximo del eje que se niega", () => {
    // La Z de la escena es el norte del archivo **negado**, así que el mínimo pasa a máximo. Sin
    // esto la caja sale del revés, no toca nada, y el recorte descarta la nube entera.
    const caja = cajaAArchivo([0, 0, -100, 50, 10, -20], DESPLAZAMIENTO);
    expect(caja[0]).toBeCloseTo(345_000, 6);
    expect(caja[3]).toBeCloseTo(345_050, 6);
    expect(caja[1]).toBeCloseTo(6_298_020, 6);
    expect(caja[4]).toBeCloseTo(6_298_100, 6);
    expect(caja[2]).toBeCloseTo(560, 6);
    expect(caja[5]).toBeCloseTo(570, 6);
  });

  it("el minimo nunca queda por encima del maximo", () => {
    for (const caja of [
      [0, 0, 0, 1, 1, 1],
      [-50, -3, -80, 50, 12, 0],
      [5, 5, 5, 5, 5, 5],
    ] as [number, number, number, number, number, number][]) {
      const f = cajaAArchivo(caja, DESPLAZAMIENTO);
      for (let i = 0; i < 3; i += 1) {
        expect((f[i] as number) <= (f[i + 3] as number), `eje ${i}`).toBe(true);
      }
    }
  });

  it("una caja que contiene un punto lo sigue conteniendo tras convertirla", () => {
    const caja: [number, number, number, number, number, number] = [-10, 0, -60, 30, 15, -5];
    const dentroDe = (
      c: readonly [number, number, number, number, number, number],
      q: readonly [number, number, number],
    ) =>
      q[0] >= c[0] && q[0] <= c[3] && q[1] >= c[1] && q[1] <= c[4] && q[2] >= c[2] && q[2] <= c[5];

    const f = cajaAArchivo(caja, DESPLAZAMIENTO);
    for (const p of [
      [0, 5, -30],
      [-9.9, 0.1, -59],
      [100, 100, 100],
      [-11, 5, -30],
    ] as Punto3[]) {
      expect(dentroDe(f, escenaAArchivo(p, DESPLAZAMIENTO)), JSON.stringify(p)).toBe(
        dentroDe(caja, p),
      );
    }
  });
});

describe("matrizDeCalce — la nube cae sobre el modelo", () => {
  /**
   * Comprueba el viaje completo, que es lo único que importa: un punto del modelo, llevado a la
   * nube por la transformación de verdad, pasado a la escena como hace el cargador, y devuelto por
   * la matriz — tiene que caer donde el modelo está en la escena.
   */
  function comprueba(alineacion: Alineacion, precision = 6): void {
    const m = matrizDeCalce(alineacion, DESPLAZAMIENTO);
    for (const local of ESQUINAS) {
      // Dónde está ese punto en la nube, y dónde lo pone el cargador en la escena.
      const enLaNube = localAMapa(local, alineacion);
      const enLaEscena = archivoAEscena(enLaNube, DESPLAZAMIENTO);
      // Y dónde está el modelo en la escena: el modelo no lleva desplazamiento, sus coordenadas
      // locales van directas con el cambio de ejes.
      const modeloEnLaEscena = archivoAEscena(local, [0, 0, 0]);

      const llevado = aplicar(m, enLaEscena);
      for (let i = 0; i < 3; i += 1) {
        expect(llevado[i], `${JSON.stringify(local)}[${i}]`).toBeCloseTo(
          modeloEnLaEscena[i] as number,
          precision,
        );
      }
    }
  }

  it("sin giro", () => {
    comprueba(conocida(0));
  });

  it("con 30 grados", () => {
    comprueba(conocida(30));
  });

  it("con cualquier giro, incluidos los cuadrantes", () => {
    for (const grados of [0, 17.5, 45, 89.9, 90, 135, 179, -45, -120, -179.5]) {
      comprueba(conocida(grados), 5);
    }
  });

  it("y con escala distinta de 1", () => {
    for (const escala of [0.999_6, 1.05, 0.5, 2]) {
      comprueba(conocida(30, escala), 5);
    }
  });

  it("la identidad deja la nube donde el cargador la puso", () => {
    // Una alineación que no mueve nada, salvo el propio desplazamiento del cargador.
    const identidad = alineacionDeMapa({
      este: DESPLAZAMIENTO[0],
      norte: DESPLAZAMIENTO[1],
      altura: DESPLAZAMIENTO[2],
      abscisaEjeX: 1,
      ordenadaEjeX: 0,
      escala: 1,
    });
    const m = matrizDeCalce(identidad, DESPLAZAMIENTO);
    for (const p of [
      [0, 0, 0],
      [10, 3, -20],
      [-5.5, 1.25, 7],
    ] as Punto3[]) {
      const llevado = aplicar(m, p);
      for (let i = 0; i < 3; i += 1) expect(llevado[i]).toBeCloseTo(p[i] as number, 9);
    }
  });

  it("el giro es alrededor de Y, y de −θ porque deshace la alineacion", () => {
    // **Esta prueba cazó el error.** La primera versión puso los dos senos al revés y dejaba la
    // nube a 69 m de su sitio. Se fija el signo aquí además de comprobar los puntos, porque un
    // giro invertido conserva las distancias: el residuo del calce no lo delataría.
    const m = matrizDeCalce(conocida(30), DESPLAZAMIENTO);
    const cos = Math.cos(Math.PI / 6);
    const sen = Math.sin(Math.PI / 6);
    expect(m[0]).toBeCloseTo(cos, 10);
    expect(m[2]).toBeCloseTo(sen, 10);
    expect(m[8]).toBeCloseTo(-sen, 10);
    expect(m[10]).toBeCloseTo(cos, 10);
    // La cota no se mezcla con la planta: el giro es alrededor del vertical.
    expect(m[1]).toBe(0);
    expect(m[4]).toBe(0);
    expect(m[6]).toBe(0);
    expect(m[9]).toBe(0);
    expect(m[5]).toBeCloseTo(1, 10);
  });

  it("una escala de cero da una matriz de ceros, no NaN", () => {
    // Una nube colapsada en un punto se ve al instante; una nube con NaN desaparece sin decir nada.
    const m = matrizDeCalce({ ...conocida(30), escala: 0 }, DESPLAZAMIENTO);
    expect(m.every((v) => v === 0)).toBe(true);
    expect(m.some((v) => Number.isNaN(v))).toBe(false);
  });
});

describe("matrizDeCalce con una alineacion sacada de puntos senalados", () => {
  it("el viaje entero: se senalan esquinas, se calza, y la nube cae sobre el modelo", () => {
    // **Es la prueba del flujo completo de `F2.2`**, y usa las tres piezas juntas: el calce sale de
    // pares señalados, la matriz de la alineación, y el resultado se comprueba sobre puntos que no
    // se señalaron.
    const real = conocida(37.5);
    const senalados: ParDePuntos[] = ESQUINAS.slice(0, 4).map((local) => ({
      local,
      nube: localAMapa(local, real),
    }));

    const calce = calzarConPuntos(senalados);
    expect(calce.giroIndeterminado).toBe(false);
    expect(calce.residuo.maximo).toBeLessThan(1e-6);

    const m = matrizDeCalce(calce.alineacion, DESPLAZAMIENTO);

    // Los dos puntos que NO se señalaron: si el calce fuera un ajuste a la fuerza, estos fallarían.
    for (const local of ESQUINAS.slice(4)) {
      const enLaEscena = archivoAEscena(localAMapa(local, real), DESPLAZAMIENTO);
      const modeloEnLaEscena = archivoAEscena(local, [0, 0, 0]);
      const llevado = aplicar(m, enLaEscena);
      for (let i = 0; i < 3; i += 1) {
        expect(llevado[i], `${JSON.stringify(local)}[${i}]`).toBeCloseTo(
          modeloEnLaEscena[i] as number,
          4,
        );
      }
    }
  });

  it("y con puntos senalados a mano alzada, el error se traslada pero no se multiplica", () => {
    // Con ruido en la selección, la nube no cae exacta —no puede— pero el desajuste tiene que ser
    // del orden del ruido y no de un metro. Un signo mal puesto daría un error enorme aunque el
    // residuo del calce fuera pequeño.
    const real = conocida(37.5);
    const RUIDO = 0.02; // 2 cm de pulso
    const senalados: ParDePuntos[] = ESQUINAS.map((local, i) => {
      const nube = localAMapa(local, real);
      const signo = i % 2 === 0 ? 1 : -1;
      return { local, nube: [nube[0] + RUIDO * signo, nube[1] - RUIDO * signo, nube[2]] };
    });

    const calce = calzarConPuntos(senalados);
    const m = matrizDeCalce(calce.alineacion, DESPLAZAMIENTO);

    let peor = 0;
    for (const local of ESQUINAS) {
      const enLaEscena = archivoAEscena(localAMapa(local, real), DESPLAZAMIENTO);
      const modeloEnLaEscena = archivoAEscena(local, [0, 0, 0]);
      const llevado = aplicar(m, enLaEscena);
      for (let i = 0; i < 3; i += 1) {
        peor = Math.max(peor, Math.abs((llevado[i] as number) - (modeloEnLaEscena[i] as number)));
      }
    }
    // Del orden del ruido: unos pocos centímetros, no un metro.
    expect(peor).toBeLessThan(RUIDO * 4);
  });
});
