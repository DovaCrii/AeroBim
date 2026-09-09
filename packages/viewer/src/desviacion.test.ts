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

/**
 * El muro de `muro-en-utm.ifc` contra su levantamiento, con un corrimiento conocido.
 *
 * **Esto reproduce en Node lo que se midio en la aplicacion el 2026-09-09** con
 * `levantamiento-del-muro.copc.laz`, y existe para contestar una pregunta que quedo escrita como
 * pregunta: tres de las seis cifras cayeron sobre el corrimiento sin margen -mediana 150 mm, que es
 * `|ΔN|`; percentil 95 240 mm, que es `|ΔE|`; sesgo +72 mm, que es `≈ΔH`- **y la maxima dio 361 mm,
 * que pasa de los 293 que mide la norma del corrimiento**. Un punto de la nube no puede estar mas
 * lejos del muro que lo que se corrio la nube, asi que o faltaba entender algo o habia un defecto.
 *
 * Faltaba entender algo, y esta en `measureDeviation`: **la caja se agranda 30 cm a proposito**
 * -«lo construido se sale de lo modelado, asi que cenirse a la caja del modelo dejaria fuera justo
 * los puntos que delatan el problema»-. Con ese margen entran a la cuenta puntos **del suelo**, que
 * no son del muro: uno a 30 cm de la esquina esta a `√(0,30² + 0,30²) = 424 mm` del triangulo mas
 * cercano. Los 361 mm caen dentro de eso.
 *
 * **Reproducido aqui al milimetro**, midiendo los mismos puntos por separado:
 *
 * | Que se mide | Puntos | Mediana | Maxima      | Sesgo  |
 * | ----------- | ------ | ------- | ----------- | ------ |
 * | solo muro   | 10 287 | 150 mm  | **293 mm**  | +62 mm |
 * | solo suelo  | 288    | 150 mm  | **361 mm**  | +116 mm |
 * | los dos     | 10 575 | 150 mm  | **361 mm**  | +63 mm |
 *
 * `293` es exactamente la norma del corrimiento, y `361` es exactamente lo que dijo la aplicacion.
 * O sea que la medida es correcta y **el numero invita a leerlo mal**: «maxima 361 mm» sobre un muro
 * se entiende como «el muro esta 36 cm fuera de sitio» cuando son 288 puntos del suelo de al lado
 * frente a diez mil del muro. Es la misma familia que la cifra del calce que se dejo de ensenar el
 * mismo dia. Lo que fija esta prueba es la atribucion: **midiendo solo los puntos del muro, nada
 * pasa del corrimiento**.
 *
 * **Y de paso corrige una lectura mia que era una casualidad.** Al medirlo en la aplicacion anote
 * que el percentil 95 -240 mm- «era `|ΔE|`, las testas». No lo es: aqui, con otro muestreo de los
 * mismos planos, el p95 sale **168 mm**. El p95 depende de **la mezcla de puntos** -cuantos de cada
 * cara entran, y con la nube real eso lo decide el nivel de detalle cargado-, asi que no es una
 * constante de la geometria. La mediana y la maxima si lo son, y son las que esta prueba fija.
 */
describe("el muro contra su levantamiento corrido", () => {
  /** El corrimiento del fixture, en ejes de la escena: a lo largo, hacia arriba, y en el grueso. */
  const A_LO_LARGO = 0.24;
  const ARRIBA = 0.075;
  const EN_EL_GRUESO = 0.15;
  const LARGO = 4;
  const ALTO = 3;
  const GRUESO = 0.2;

  /** El muro como se lo pasaria Fragments: doce triangulos, con su base en `y = 0`. */
  function muro(): MallaDeFragments {
    const geo = new THREE.BoxGeometry(LARGO, ALTO, GRUESO).translate(0, ALTO / 2, 0);
    return {
      positions: (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array,
      indices: geo.getIndex()?.array as Uint16Array,
      transform: new THREE.Matrix4(),
    };
  }

  function comoNube(posiciones: readonly number[]): THREE.Group {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([...posiciones], 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const grupo = new THREE.Group();
    grupo.add(new THREE.Points(geo, new THREE.PointsMaterial()));
    grupo.updateMatrixWorld(true);
    return grupo;
  }

  /** Las caras del muro muestreadas y **corridas**, que es lo que un escaner habria visto. */
  function nubeDelMuro(): THREE.Group {
    const p: number[] = [];
    const paso = 0.05;
    for (let x = -LARGO / 2; x <= LARGO / 2 + 1e-9; x += paso) {
      for (let y = 0; y <= ALTO + 1e-9; y += paso) {
        for (const z of [-GRUESO / 2, GRUESO / 2]) {
          p.push(x + A_LO_LARGO, y + ARRIBA, z + EN_EL_GRUESO);
        }
      }
      for (let z = -GRUESO / 2; z <= GRUESO / 2 + 1e-9; z += paso) {
        p.push(x + A_LO_LARGO, ALTO + ARRIBA, z + EN_EL_GRUESO);
      }
    }
    return comoNube(p);
  }

  /** El suelo alrededor, sin la huella del muro, y corrido igual. */
  function nubeDelSuelo(): THREE.Group {
    const p: number[] = [];
    const paso = 0.1;
    for (let x = -8; x <= 8 + 1e-9; x += paso) {
      for (let z = -8; z <= 8 + 1e-9; z += paso) {
        if (Math.abs(x) <= LARGO / 2 && Math.abs(z) <= GRUESO / 2) continue;
        p.push(x + A_LO_LARGO, ARRIBA, z + EN_EL_GRUESO);
      }
    }
    return comoNube(p);
  }

  /** La caja del muro con el margen que pone `measureDeviation`: 30 cm. */
  const MARGEN = 0.3;
  const cajaHolgada = new THREE.Box3(
    new THREE.Vector3(-LARGO / 2, 0, -GRUESO / 2),
    new THREE.Vector3(LARGO / 2, ALTO, GRUESO / 2),
  ).expandByScalar(MARGEN);

  it("son doce triangulos, como decia la aplicacion", () => {
    expect(triangulosEnLaCaja([muro()], cajaHolgada).triangulos.length).toBe(12);
  });

  it("los puntos del muro no pasan del corrimiento, y su mediana ES el corrimiento", () => {
    const m = medirDesviacion([muro()], nubeDelMuro(), cajaHolgada, { toleranciaM: 0.02 });
    const norma = Math.hypot(A_LO_LARGO, ARRIBA, EN_EL_GRUESO);
    expect(norma).toBeCloseTo(0.293, 3);
    // **Esta es la afirmacion que faltaba**: sin el suelo de por medio, ningun punto del
    // levantamiento esta mas lejos del muro que lo que se corrio la nube. Y no le sobra nada: la
    // maxima **es** la norma, porque la esquina del muro se corrio justo en las tres direcciones.
    expect(m.resumen.maxima).toBeCloseTo(norma, 3);
    // Y la mediana es el grueso: las dos caras largas son la mayoria de los puntos, y su normal
    // es justo el eje en que se corrio 150 mm.
    expect(m.resumen.mediana).toBeCloseTo(EN_EL_GRUESO, 3);
  });

  it("con el suelo dentro, la maxima la pone el suelo — y ahi estan los 361 mm", () => {
    const soloMuro = medirDesviacion([muro()], nubeDelMuro(), cajaHolgada, { toleranciaM: 0.02 });
    const conSuelo = medirDesviacion([muro()], nubeDelSuelo(), cajaHolgada, { toleranciaM: 0.02 });

    // El suelo aporta puntos mas lejanos que cualquiera del muro: es el margen de 30 cm haciendo
    // su trabajo, no un error de la medida.
    expect(conSuelo.resumen.maxima).toBeGreaterThan(soloMuro.resumen.maxima);
    // Y el tope es geometrico: la esquina del margen, `√(0,30² + 0,30²)`.
    expect(conSuelo.resumen.maxima).toBeLessThanOrEqual(Math.hypot(MARGEN, MARGEN) + 1e-6);
    // **Y son los 361 mm de la aplicacion, al milimetro.** Eso es lo que cierra la pregunta: no
    // era un defecto de la medida, era el margen de 30 cm trayendo el suelo a la cuenta.
    expect(conSuelo.resumen.maxima).toBeCloseTo(0.361, 3);
  });

  it("y el sesgo sale positivo: lo construido por fuera de lo modelado", () => {
    const m = medirDesviacion([muro()], nubeDelMuro(), cajaHolgada, { toleranciaM: 0.02 });
    // El corrimiento saca la nube del solido, asi que el signo tiene que decir «por fuera». Si
    // esto se pusiera negativo, el informe estaria acusando a la obra de lo contrario.
    expect(m.resumen.sesgo).toBeGreaterThan(0);
  });
});
