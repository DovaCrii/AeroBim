import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  MAXIMO_TRIANGULOS,
  medirDesviacion,
  triangulosEnLaCaja,
  type MallaDeFragments,
} from "./desviacion.js";

/**
 * **`packages/viewer` no tenía ni una prueba hasta hoy.** Todo lo suyo se comprobaba a mano en
 * `diag.html`, que sirve para mirar una vez y no impide que algo se rompa la semana que viene: el
 * gate no lo corre nadie.
 *
 * No todo el paquete se puede probar en Node —la mitad necesita WebGL, una escena y una cámara— pero
 * **esto sí**: medir la desviación es geometría con `Box3` y `Matrix4`, y ninguna de las dos toca la
 * tarjeta gráfica. Lo que el diagnóstico comprobaba a mano queda aquí, en el gate.
 */

/**
 * Una losa de 10 × 10 m en el plano `y = 0`, como se la pasaría Fragments.
 *
 * `segmentos` importa para el recorte: con uno solo, la losa son **dos triángulos que abarcan el
 * plano entero**, así que media caja los toca a los dos y no se puede comprobar que recorte. Es lo
 * que hizo fallar la primera versión de esa prueba — y el fallo era de la prueba, no del recorte.
 */
function losa(transform = new THREE.Matrix4(), segmentos = 1): MallaDeFragments {
  const geo = new THREE.PlaneGeometry(10, 10, segmentos, segmentos).rotateX(-Math.PI / 2);
  const indices = geo.getIndex()?.array as Uint16Array;
  return {
    positions: (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array,
    indices,
    transform,
  };
}

/** Una nube de `n × n` puntos a la altura `y`, dentro de ±4 m. */
function nubePlana(y: number, n = 20): THREE.Group {
  const posiciones: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      posiciones.push(-4 + (i * 8) / (n - 1), y, -4 + (j * 8) / (n - 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(posiciones.length), 3, true));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const grupo = new THREE.Group();
  grupo.add(new THREE.Points(geo, new THREE.PointsMaterial()));
  grupo.updateMatrixWorld(true);
  return grupo;
}

const TODA: THREE.Box3 = new THREE.Box3(new THREE.Vector3(-6, -2, -6), new THREE.Vector3(6, 2, 6));

describe("triangulosEnLaCaja", () => {
  it("saca los triangulos de una malla", () => {
    const { triangulos, fuera } = triangulosEnLaCaja([losa()], TODA);
    expect(triangulos.length).toBe(2); // un plano de Three.js son dos triángulos
    expect(fuera).toBe(0);
  });

  it("la caja recorta: media losa trae menos", () => {
    const dividida = losa(new THREE.Matrix4(), 4); // 32 triángulos, uno por cada trozo
    const todos = triangulosEnLaCaja([dividida], TODA).triangulos.length;
    expect(todos).toBe(32);

    const media = new THREE.Box3(new THREE.Vector3(-6, -2, -6), new THREE.Vector3(-3, 2, 6));
    const { triangulos } = triangulosEnLaCaja([dividida], media);
    expect(triangulos.length).toBeLessThan(todos);
    expect(triangulos.length).toBeGreaterThan(0);
  });

  it("una caja que no toca nada devuelve cero, y no levanta", () => {
    const lejos = new THREE.Box3(
      new THREE.Vector3(100, 100, 100),
      new THREE.Vector3(110, 110, 110),
    );
    expect(triangulosEnLaCaja([losa()], lejos).triangulos).toHaveLength(0);
  });

  it("**aplica la matriz de la malla**, que es lo que hace que cien pilares iguales no midan uno", () => {
    // Fragments guarda una malla y una matriz por instancia. Sin aplicarla, las dos losas darían
    // los mismos triángulos y la desviación de la segunda saldría como la de la primera.
    const movida = new THREE.Matrix4().makeTranslation(0, 5, 0);
    const { triangulos } = triangulosEnLaCaja(
      [losa(movida)],
      new THREE.Box3(new THREE.Vector3(-6, 3, -6), new THREE.Vector3(6, 7, 6)),
    );
    expect(triangulos.length).toBe(2);
    for (const t of triangulos) for (const v of t) expect(v[1]).toBeCloseTo(5, 6);
  });

  it("y con la matriz aplicada, la losa movida ya no esta donde estaba", () => {
    const movida = new THREE.Matrix4().makeTranslation(0, 5, 0);
    expect(triangulosEnLaCaja([losa(movida)], TODA).triangulos).toHaveLength(0);
  });

  it("respeta el tope y dice cuantos dejo fuera", () => {
    const { triangulos, fuera } = triangulosEnLaCaja([losa()], TODA, 1);
    expect(triangulos).toHaveLength(1);
    expect(fuera).toBe(1);
  });

  it("una malla sin posiciones se salta en vez de reventar", () => {
    const vacia: MallaDeFragments = { transform: new THREE.Matrix4() };
    expect(triangulosEnLaCaja([vacia, losa()], TODA).triangulos).toHaveLength(2);
  });

  it("el tope por omision es el declarado", () => {
    expect(MAXIMO_TRIANGULOS).toBe(50_000);
  });
});

describe("medirDesviacion", () => {
  it("mide la distancia que se puso, y ese es el numero que importa", () => {
    // Es lo mismo que comprueba el diagnóstico en el navegador, y ahora lo corre el gate.
    const m = medirDesviacion([losa()], nubePlana(0.05), TODA, { toleranciaM: 0.02 });
    expect(m.puntos).toBe(400);
    expect(m.triangulos).toBe(2);
    expect(m.resumen.media).toBeCloseTo(0.05, 6);
    expect(m.resumen.maxima).toBeCloseTo(0.05, 6);
    expect(m.resumen.fuera).toBe(400);
  });

  it("el signo dice de que lado: por encima positivo, por debajo negativo", () => {
    expect(
      medirDesviacion([losa()], nubePlana(0.05), TODA, { toleranciaM: 0.02 }).resumen.sesgo,
    ).toBeGreaterThan(0);
    expect(
      medirDesviacion([losa()], nubePlana(-0.05), TODA, { toleranciaM: 0.02 }).resumen.sesgo,
    ).toBeLessThan(0);
  });

  it("una nube pegada a la superficie no se sale de la tolerancia", () => {
    const m = medirDesviacion([losa()], nubePlana(0.001), TODA, { toleranciaM: 0.02 });
    expect(m.resumen.fuera).toBe(0);
    expect(m.resumen.signoFiable).toBe(true);
  });

  it("sin triangulos no mide nada, y **lo dice** en vez de devolver cero desviacion", () => {
    const m = medirDesviacion([], nubePlana(0.05), TODA, { toleranciaM: 0.02 });
    expect(m.puntos).toBe(0);
    expect(m.resumen.puntos).toBe(0);
    expect(m.triangulos).toBe(0);
  });

  it("sin puntos en la caja tampoco, y no levanta", () => {
    const lejos = new THREE.Box3(
      new THREE.Vector3(100, 100, 100),
      new THREE.Vector3(110, 110, 110),
    );
    const m = medirDesviacion([losa()], nubePlana(0.05), lejos, { toleranciaM: 0.02 });
    expect(m.puntos).toBe(0);
  });

  it("solo mide los puntos DENTRO de la caja", () => {
    // La caja cubre la mitad en X, así que tienen que quedar 200 de los 400.
    const media = new THREE.Box3(new THREE.Vector3(-4.1, -2, -6), new THREE.Vector3(0, 2, 6));
    const m = medirDesviacion([losa()], nubePlana(0.05), media, { toleranciaM: 0.02 });
    expect(m.puntos).toBe(200);
    // Y sigue midiendo lo mismo: el recorte cambia cuántos, no cuánto.
    expect(m.resumen.media).toBeCloseTo(0.05, 6);
  });

  it("aplica la matriz del calce a la nube", () => {
    // **Medir contra los puntos sin calzar daría la desviación de la nube mal puesta**, que es un
    // número real de una pregunta que nadie hizo.
    const nube = nubePlana(0.05);
    nube.matrixAutoUpdate = false;
    nube.matrix.makeTranslation(0, 0.2, 0);
    const m = medirDesviacion([losa()], nube, TODA, { toleranciaM: 0.02 });
    expect(m.puntos).toBe(400);
    expect(m.resumen.media).toBeCloseTo(0.25, 6);
  });

  it("pintar pinta, y no pintar no toca el color", () => {
    const conPintura = nubePlana(0.05);
    medirDesviacion([losa()], conPintura, TODA, { toleranciaM: 0.02, pintar: true });
    const color = (conPintura.children[0] as THREE.Points).geometry.getAttribute("color");
    expect((color.array as Uint8Array).some((v) => v !== 0)).toBe(true);

    const sinPintura = nubePlana(0.05);
    medirDesviacion([losa()], sinPintura, TODA, { toleranciaM: 0.02 });
    const otro = (sinPintura.children[0] as THREE.Points).geometry.getAttribute("color");
    expect((otro.array as Uint8Array).every((v) => v === 0)).toBe(true);
  });

  it("devuelve la tolerancia con la que se midio, para que el informe no la pierda", () => {
    const m = medirDesviacion([losa()], nubePlana(0.05), TODA, { toleranciaM: 0.037 });
    expect(m.toleranciaM).toBe(0.037);
  });
});
