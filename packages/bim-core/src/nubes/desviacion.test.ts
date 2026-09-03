import { describe, expect, it } from "vitest";

import {
  colorDeDesviacion,
  distanciaAlModelo,
  distanciaAlTriangulo,
  resumirDesviaciones,
  SIN_MEDIR,
  type Distancia,
  type Punto,
  type Triangulo,
} from "./desviacion.js";

/**
 * Un triángulo en el plano `z = 0`, con la normal hacia `+z`: los números salen de cabeza y el
 * signo se puede razonar sin dibujar nada.
 */
const PLANO: Triangulo = [
  [0, 0, 0],
  [4, 0, 0],
  [0, 3, 0],
];

describe("distanciaAlTriangulo — sobre la cara", () => {
  it("un punto encima del centro mide su altura", () => {
    const d = distanciaAlTriangulo([1, 1, 2.5], PLANO);
    expect(d.metros).toBeCloseTo(2.5, 12);
    expect(d.pie[2]).toBeCloseTo(0, 12);
    expect(d.lado).toBe(1);
  });

  it("y por debajo, la misma distancia con el lado cambiado", () => {
    const d = distanciaAlTriangulo([1, 1, -2.5], PLANO);
    expect(d.metros).toBeCloseTo(2.5, 12);
    expect(d.lado).toBe(-1);
  });

  it("un punto en la propia cara mide cero", () => {
    const d = distanciaAlTriangulo([1, 1, 0], PLANO);
    expect(d.metros).toBeCloseTo(0, 12);
    expect(d.lado).toBe(0);
  });

  it("los tres vertices miden cero", () => {
    for (const v of PLANO) {
      expect(distanciaAlTriangulo(v, PLANO).metros).toBeCloseTo(0, 12);
    }
  });
});

describe("distanciaAlTriangulo — NO es la distancia al plano", () => {
  it("un punto en el plano pero fuera del triangulo mide su separacion de verdad", () => {
    // **Es el error que hace parecer una nube pegada a un pilar que está tres metros más allá.**
    // `(10, 0, 0)` está en el plano `z = 0`, así que la distancia al plano es cero — y al
    // triángulo son 6 m, desde el vértice `(4, 0, 0)`.
    const d = distanciaAlTriangulo([10, 0, 0], PLANO);
    expect(d.metros).toBeCloseTo(6, 12);
    expect(d.pie).toEqual([4, 0, 0]);
  });

  it("y a un lado, la distancia es a la arista, no al plano", () => {
    // `(-2, 1, 0)`: en el plano, y a 2 m de la arista que va de (0,0,0) a (0,3,0).
    const d = distanciaAlTriangulo([-2, 1, 0], PLANO);
    expect(d.metros).toBeCloseTo(2, 12);
    expect(d.pie[0]).toBeCloseTo(0, 12);
    expect(d.pie[1]).toBeCloseTo(1, 12);
  });

  it("cerca de un vertice, el pie es el vertice", () => {
    const d = distanciaAlTriangulo([-1, -1, 0], PLANO);
    expect(d.metros).toBeCloseTo(Math.SQRT2, 12);
    expect(d.pie).toEqual([0, 0, 0]);
  });

  it("la hipotenusa tambien recorta: no todo lo que esta 'dentro' de la caja esta dentro", () => {
    // `(4, 3, 0)` es la esquina de la caja del triángulo, y está **fuera** del triángulo. La
    // distancia es a la hipotenusa, que va de (4,0,0) a (0,3,0).
    const d = distanciaAlTriangulo([4, 3, 0], PLANO);
    // La recta 3x + 4y = 12; distancia de (4,3) = |12 + 12 - 12| / 5 = 2,4.
    expect(d.metros).toBeCloseTo(2.4, 10);
  });
});

describe("distanciaAlTriangulo — el pie siempre esta en el triangulo", () => {
  it("y a la distancia que se dice, para cualquier punto", () => {
    // Dos propiedades que tienen que cumplirse siempre, y juntas atrapan casi cualquier error de
    // región: el pie pertenece al triángulo, y la distancia es la que separa punto y pie.
    const puntos: Punto[] = [
      [1, 1, 5],
      [10, 0, 0],
      [-3, -4, 1],
      [2, 5, -2],
      [0.001, 0.001, 0],
      [4, 3, 7],
      [-1, 1.5, 0],
      [100, 100, 100],
    ];
    for (const p of puntos) {
      const d = distanciaAlTriangulo(p, PLANO);
      const medida = Math.hypot(p[0] - d.pie[0], p[1] - d.pie[1], p[2] - d.pie[2]);
      expect(d.metros, `${JSON.stringify(p)} distancia`).toBeCloseTo(medida, 10);
      // El pie está en el plano del triángulo (z = 0) y dentro de él.
      expect(d.pie[2], `${JSON.stringify(p)} pie fuera del plano`).toBeCloseTo(0, 10);
      const [x, y] = d.pie;
      expect(x, `${JSON.stringify(p)} pie x`).toBeGreaterThanOrEqual(-1e-9);
      expect(y, `${JSON.stringify(p)} pie y`).toBeGreaterThanOrEqual(-1e-9);
      expect(3 * x + 4 * y, `${JSON.stringify(p)} pie fuera de la hipotenusa`).toBeLessThanOrEqual(
        12 + 1e-9,
      );
    }
  });

  it("nunca da menos que la distancia al triangulo, comprobado por fuerza bruta", () => {
    // El oráculo: se muestrea el triángulo con coordenadas baricéntricas y se toma el mínimo. Es
    // lento y tosco, y por eso mismo sirve — no comparte una línea de código con lo que comprueba.
    const muestras: Punto[] = [];
    const N = 24;
    for (let i = 0; i <= N; i += 1) {
      for (let j = 0; i + j <= N; j += 1) {
        const u = i / N;
        const v = j / N;
        muestras.push([
          (PLANO[0][0] as number) * (1 - u - v) + PLANO[1][0] * u + PLANO[2][0] * v,
          (PLANO[0][1] as number) * (1 - u - v) + PLANO[1][1] * u + PLANO[2][1] * v,
          0,
        ]);
      }
    }

    for (const p of [
      [1, 1, 5],
      [10, 0, 0],
      [-3, -4, 1],
      [2, 5, -2],
      [4, 3, 0],
      [1.7, 1.2, 0.3],
    ] as Punto[]) {
      const exacta = distanciaAlTriangulo(p, PLANO).metros;
      let bruta = Infinity;
      for (const q of muestras) {
        bruta = Math.min(bruta, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
      // La exacta no puede ser mayor que la de la muestra, y no puede ser mucho menor: el muestreo
      // tiene una malla de 1/24 del lado.
      expect(exacta, `${JSON.stringify(p)}`).toBeLessThanOrEqual(bruta + 1e-9);
      expect(exacta, `${JSON.stringify(p)}`).toBeGreaterThan(bruta - 0.3);
    }
  });
});

describe("distanciaAlTriangulo — triangulos degenerados", () => {
  it("dos vertices iguales: mide al segmento que de verdad es", () => {
    const aguja: Triangulo = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 0],
    ];
    const d = distanciaAlTriangulo([2, 3, 0], aguja);
    expect(d.metros).toBeCloseTo(3, 10);
    expect(Number.isNaN(d.metros)).toBe(false);
  });

  it("tres vertices alineados: sigue dando un numero", () => {
    const recta: Triangulo = [
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0],
    ];
    const d = distanciaAlTriangulo([2, 5, 0], recta);
    expect(Number.isFinite(d.metros)).toBe(true);
    expect(d.metros).toBeCloseTo(5, 6);
  });

  it("los tres vertices iguales: mide a ese punto", () => {
    const punto: Triangulo = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    const d = distanciaAlTriangulo([1, 1, 4], punto);
    expect(d.metros).toBeCloseTo(3, 10);
  });
});

describe("distanciaAlModelo", () => {
  it("se queda con la superficie mas cercana", () => {
    const otro: Triangulo = [
      [0, 0, 10],
      [4, 0, 10],
      [0, 3, 10],
    ];
    const d = distanciaAlModelo([1, 1, 8], [PLANO, otro]);
    expect(d?.metros).toBeCloseTo(2, 10);
  });

  it("sin triangulos devuelve null, no infinito", () => {
    // Con `Infinity` las estadísticas saldrían con un número enorme en vez de decir que no se
    // midió nada, que es lo que de verdad pasó.
    expect(distanciaAlModelo([0, 0, 0], [])).toBeNull();
  });
});

describe("resumirDesviaciones", () => {
  const d = (metros: number, lado: number): Distancia => ({ metros, lado, pie: [0, 0, 0] });

  it("sin medidas dice que no midio nada, y no cero desviacion", () => {
    expect(resumirDesviaciones([], 0.02)).toEqual(SIN_MEDIR);
    expect(resumirDesviaciones([], 0.02).puntos).toBe(0);
  });

  it("las cuentas basicas, comprobables a mano", () => {
    const r = resumirDesviaciones([d(0.01, 1), d(0.02, 1), d(0.03, 1), d(0.04, 1)], 0.025);
    expect(r.puntos).toBe(4);
    expect(r.media).toBeCloseTo(0.025, 12);
    expect(r.mediana).toBeCloseTo(0.025, 12);
    expect(r.maxima).toBeCloseTo(0.04, 12);
    expect(r.rms).toBeCloseTo(Math.sqrt((1e-4 + 4e-4 + 9e-4 + 16e-4) / 4), 12);
    expect(r.fuera).toBe(2);
  });

  it("el sesgo distingue una obra corrida de una obra mal rematada", () => {
    // **Es la razón de que exista el sesgo.** Los dos casos tienen la misma media sin signo.
    const corrida = resumirDesviaciones([d(0.03, 1), d(0.03, 1), d(0.03, 1), d(0.03, 1)], 0.01);
    const rematada = resumirDesviaciones([d(0.03, 1), d(0.03, -1), d(0.03, 1), d(0.03, -1)], 0.01);

    expect(corrida.media).toBeCloseTo(rematada.media, 12);
    expect(corrida.sesgo).toBeCloseTo(0.03, 12);
    expect(rematada.sesgo).toBeCloseTo(0, 12);
  });

  it("y el signo se declara NO fiable cuando todo lo que se sale cae del mismo lado", () => {
    // Es lo que produce un modelo con las caras invertidas o una nube mal calzada: el sesgo
    // saldría enorme y parecería medido.
    const todoIgual = resumirDesviaciones([d(0.5, 1), d(0.6, 1), d(0.55, 1)], 0.02);
    expect(todoIgual.signoFiable).toBe(false);

    const repartido = resumirDesviaciones([d(0.5, 1), d(0.6, -1), d(0.55, 1)], 0.02);
    expect(repartido.signoFiable).toBe(true);
  });

  it("si nada se sale de la tolerancia, el signo es fiable: no hay nada que dudar", () => {
    const dentro = resumirDesviaciones([d(0.001, 1), d(0.002, 1)], 0.02);
    expect(dentro.fuera).toBe(0);
    expect(dentro.signoFiable).toBe(true);
  });

  it("la mediana no la mueve un punto disparatado, y la maxima si", () => {
    const limpio = [d(0.01, 1), d(0.011, 1), d(0.012, 1), d(0.013, 1), d(0.014, 1)];
    const conBasura = [...limpio, d(9, 1)];
    const a = resumirDesviaciones(limpio, 0.02);
    const b = resumirDesviaciones(conBasura, 0.02);

    expect(Math.abs(b.mediana - a.mediana)).toBeLessThan(0.002);
    expect(b.maxima).toBeCloseTo(9, 10);
    // Y la media sí se va, que es por lo que se dan las dos.
    expect(b.media).toBeGreaterThan(a.media * 10);
  });

  it("el percentil 95 interpola, y con pocos puntos eso importa", () => {
    // Con veinte medidas, redondear la posición daría la 19 o la 20 y pueden diferir en
    // centímetros. Con interpolación, el resultado no salta.
    const veinte = Array.from({ length: 20 }, (_, i) => d((i + 1) / 100, 1));
    const r = resumirDesviaciones(veinte, 1);
    // posición = 0,95 · 19 = 18,05 → entre 0,19 y 0,20, muy cerca de 0,19.
    expect(r.p95).toBeCloseTo(0.1905, 6);
  });

  it("con una sola medida no levanta y todo cuadra", () => {
    const r = resumirDesviaciones([d(0.05, -1)], 0.02);
    expect(r.puntos).toBe(1);
    expect(r.media).toBeCloseTo(0.05, 12);
    expect(r.mediana).toBeCloseTo(0.05, 12);
    expect(r.p95).toBeCloseTo(0.05, 12);
    expect(r.sesgo).toBeCloseTo(-0.05, 12);
  });
});

describe("colorDeDesviacion", () => {
  it("dentro de la tolerancia es verde, y muy fuera es rojo", () => {
    const dentro = colorDeDesviacion(0, 0.02);
    expect(dentro[0]).toBe(0);
    expect(dentro[1]).toBeGreaterThan(150);

    const fuera = colorDeDesviacion(1, 0.02);
    expect(fuera[0]).toBe(255);
    expect(fuera[1]).toBeLessThan(20);
  });

  it("hay techo: un punto disparatado no aplasta la escala", () => {
    // Sin techo, un punto de vegetación a diez metros dejaría todo lo demás en el mismo verde.
    expect(colorDeDesviacion(0.06, 0.02)).toEqual(colorDeDesviacion(10, 0.02));
  });

  it("el signo no cambia el color: lo que se ve es cuanto, no de que lado", () => {
    // El lado se lee en el informe, con el sesgo. En la nube, dos colores por lado harían falta
    // cuatro colores para decir lo mismo y no se distinguirian de un vistazo.
    expect(colorDeDesviacion(0.03, 0.02)).toEqual(colorDeDesviacion(-0.03, 0.02));
  });

  it("con tolerancia imposible sale gris, y no dividido por cero", () => {
    for (const mala of [0, -1, Number.NaN]) {
      expect(colorDeDesviacion(0.01, mala)).toEqual([160, 160, 160]);
    }
  });
});
