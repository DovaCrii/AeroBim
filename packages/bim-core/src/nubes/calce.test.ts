import { describe, expect, it } from "vitest";

import { calzarConPuntos, residuoDe, type ParDePuntos } from "./calce.js";
import { alineacionDeMapa, localAMapa, type Alineacion, type Punto3 } from "./georreferencia.js";

/**
 * El oráculo es una **transformación conocida aplicada a puntos conocidos**: se gira y desplaza una
 * nube de esquinas a mano, se le pide a `calzarConPuntos` que recupere la transformación, y se
 * compara con la que se aplicó. Si el ajuste devuelve otra cosa, la prueba lo dice — no hace falta
 * ningún dato externo, y es lo que pedía el plan para esta fase.
 */

/** Esquinas de un edificio en coordenadas locales del modelo. */
const ESQUINAS: Punto3[] = [
  [0, 0, 0],
  [24, 0, 0],
  [24, 13, 0],
  [0, 13, 0],
  [12, 6.5, 9.6],
];

/** La transformación de verdad: Santiago, girado 30°. */
function conocida(giroGrados = 30, escala = 1): Alineacion {
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

/** Los pares que vería alguien señalando esas esquinas en la nube. */
function paresDe(a: Alineacion, puntos: readonly Punto3[] = ESQUINAS): ParDePuntos[] {
  return puntos.map((local) => ({ local, nube: localAMapa(local, a) }));
}

describe("calzarConPuntos — recuperar una transformacion conocida", () => {
  it("con cinco esquinas exactas, recupera giro y desplazamiento sin residuo", () => {
    const real = conocida();
    const c = calzarConPuntos(paresDe(real));

    expect(c.alineacion.giroGrados).toBeCloseTo(30, 8);
    expect(c.alineacion.este).toBeCloseTo(real.este, 5);
    expect(c.alineacion.norte).toBeCloseTo(real.norte, 5);
    expect(c.alineacion.altura).toBeCloseTo(real.altura, 6);
    expect(c.residuo.maximo).toBeLessThan(1e-6);
    expect(c.giroIndeterminado).toBe(false);
    expect(c.pares).toBe(5);
  });

  it("y con cualquier giro, incluidos los cuadrantes que se pierden al dividir", () => {
    for (const grados of [0, 17.5, 89.9, 90, 135, 179, -45, -120, -179.5]) {
      const real = conocida(grados);
      const c = calzarConPuntos(paresDe(real));
      expect(c.alineacion.giroGrados, `${grados}°`).toBeCloseTo(grados, 6);
      expect(c.residuo.maximo, `${grados}°`).toBeLessThan(1e-6);
    }
  });

  it("la alineacion recuperada lleva los puntos donde estan", () => {
    const real = conocida(63.4);
    const c = calzarConPuntos(paresDe(real));
    for (const esquina of ESQUINAS) {
      const esperado = localAMapa(esquina, real);
      const obtenido = localAMapa(esquina, c.alineacion);
      for (let i = 0; i < 3; i += 1) {
        expect(obtenido[i], `${JSON.stringify(esquina)}[${i}]`).toBeCloseTo(
          esperado[i] as number,
          5,
        );
      }
    }
  });
});

describe("calzarConPuntos — la escala", () => {
  it("por defecto se queda en 1, aunque los datos pidan otra", () => {
    const c = calzarConPuntos(paresDe(conocida(30, 1.05)));
    expect(c.alineacion.escala).toBe(1);
    expect(c.escalaAjustada).toBe(false);
    // Y el residuo lo delata en vez de esconderlo: es el punto de no ajustarla.
    expect(c.residuo.maximo).toBeGreaterThan(0.5);
  });

  it("pedida, la recupera — y cuenta la altura, no solo la planta", () => {
    for (const escala of [1.05, 0.997, 1.2]) {
      const c = calzarConPuntos(paresDe(conocida(30, escala)), { conEscala: true });
      expect(c.alineacion.escala, String(escala)).toBeCloseTo(escala, 8);
      expect(c.residuo.maximo, String(escala)).toBeLessThan(1e-6);
      expect(c.escalaAjustada).toBe(true);
    }
  });

  it("y con puntos que solo varian en altura, la escala sale de ahi", () => {
    // Si la escala se midiera solo en planta, este caso daria 1 y el residuo no bajaria.
    const verticales: Punto3[] = [
      [0, 0, 0],
      [10, 0, 3],
      [10, 8, 7],
      [0, 8, 12],
    ];
    const real = conocida(0, 1.1);
    const c = calzarConPuntos(paresDe(real, verticales), { conEscala: true });
    expect(c.alineacion.escala).toBeCloseTo(1.1, 8);
  });
});

describe("calzarConPuntos — lo que no se puede saber", () => {
  it("sin pares, la identidad y el giro indeterminado", () => {
    const c = calzarConPuntos([]);
    expect(c.pares).toBe(0);
    expect(c.giroIndeterminado).toBe(true);
    expect(c.alineacion.escala).toBe(1);
    expect(c.alineacion.giroGrados).toBe(0);
    expect(c.residuo.peor).toBe(-1);
  });

  it("con un solo par, se sabe el desplazamiento y NO el giro", () => {
    const c = calzarConPuntos([{ local: [1, 2, 3], nube: [345_001, 6_298_002, 563] }]);
    expect(c.giroIndeterminado).toBe(true);
    // El desplazamiento si es correcto: el punto cae donde debe.
    expect(localAMapa([1, 2, 3], c.alineacion)[0]).toBeCloseTo(345_001, 6);
    expect(localAMapa([1, 2, 3], c.alineacion)[1]).toBeCloseTo(6_298_002, 6);
    expect(c.residuo.maximo).toBeLessThan(1e-6);
  });

  it("con todos los puntos en la misma vertical, el giro tampoco se determina", () => {
    // Tres puntos en el mismo sitio en planta y a distinta altura: no hay direccion que girar.
    const c = calzarConPuntos([
      { local: [5, 5, 0], nube: [100, 200, 10] },
      { local: [5, 5, 3], nube: [100, 200, 13] },
      { local: [5, 5, 6], nube: [100, 200, 16] },
    ]);
    expect(c.giroIndeterminado).toBe(true);
    expect(c.alineacion.giroGrados).toBe(0);
  });

  it("con dos pares basta para el giro, y se dice que ya no es indeterminado", () => {
    const real = conocida(42);
    const c = calzarConPuntos(paresDe(real, [ESQUINAS[0] as Punto3, ESQUINAS[1] as Punto3]));
    expect(c.giroIndeterminado).toBe(false);
    expect(c.alineacion.giroGrados).toBeCloseTo(42, 6);
  });
});

describe("el residuo dice la verdad sobre el calce", () => {
  it("un punto senalado mal sube el maximo y lo senala", () => {
    const real = conocida(30);
    const pares = paresDe(real);
    // El tercero se senala 40 cm corrido, que es un error de pulso corriente.
    const malo = pares[2] as ParDePuntos;
    pares[2] = { local: malo.local, nube: [malo.nube[0] + 0.4, malo.nube[1], malo.nube[2]] };

    const c = calzarConPuntos(pares);
    expect(c.residuo.peor).toBe(2);
    expect(c.residuo.maximo).toBeGreaterThan(0.2);
    // Y el medio lo diluye: es justo por lo que se devuelven los dos.
    expect(c.residuo.medio).toBeLessThan(c.residuo.maximo);
  });

  it("mas ruido, mas residuo — la relacion es monotona", () => {
    const real = conocida(30);
    let anterior = -1;
    for (const ruido of [0, 0.01, 0.05, 0.2, 1]) {
      const pares = paresDe(real).map((p, i) => ({
        local: p.local,
        // Un desplazamiento determinista, no aleatorio: la prueba tiene que dar lo mismo siempre.
        nube: [p.nube[0] + ruido * (i % 2 === 0 ? 1 : -1), p.nube[1], p.nube[2]] as Punto3,
      }));
      const medio = calzarConPuntos(pares).residuo.medio;
      expect(medio, `ruido ${ruido}`).toBeGreaterThanOrEqual(anterior);
      anterior = medio;
    }
  });

  it("el residuo por par tiene un valor por par, en el mismo orden", () => {
    const c = calzarConPuntos(paresDe(conocida()));
    expect(c.residuo.porPar).toHaveLength(ESQUINAS.length);
    expect(c.residuo.porPar[c.residuo.peor]).toBe(c.residuo.maximo);
  });
});

describe("residuoDe — comprobar la georreferencia del archivo contra la realidad", () => {
  it("una alineacion correcta no tiene residuo sobre pares nuevos", () => {
    const real = conocida(30);
    const nuevos = paresDe(real, [
      [3, 3, 0],
      [21, 11, 2.5],
    ]);
    expect(residuoDe(nuevos, real).maximo).toBeLessThan(1e-6);
  });

  it("y una que el archivo declara mal se delata: es la unica forma de saberlo", () => {
    // El archivo dice 30° pero el edificio esta a 32°: dos grados sobre 24 m son casi un metro.
    const declarada = conocida(30);
    const verdadera = conocida(32);
    const r = residuoDe(paresDe(verdadera), declarada);
    expect(r.maximo).toBeGreaterThan(0.4);
  });

  it("sin pares no se puede comprobar nada, y no se finge un cero significativo", () => {
    const r = residuoDe([], conocida());
    expect(r.peor).toBe(-1);
    expect(r.porPar).toEqual([]);
  });
});
