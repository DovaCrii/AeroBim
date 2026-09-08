import { describe, expect, it } from "vitest";

import {
  alineacionDeMapa,
  alineacionDeNorteVerdadero,
  localAMapa,
  mapaALocal,
  type ConversionDeMapa,
  type Punto3,
} from "./georreferencia.js";

/** Una obra en Santiago, girada 30° — el caso corriente y comprobable a mano. */
const SANTIAGO: ConversionDeMapa = {
  este: 345_000,
  norte: 6_298_000,
  altura: 560,
  abscisaEjeX: Math.cos(Math.PI / 6),
  ordenadaEjeX: Math.sin(Math.PI / 6),
  escala: 1,
};

describe("alineacionDeMapa", () => {
  it("saca el giro de las dos componentes, con su cuadrante", () => {
    expect(alineacionDeMapa(SANTIAGO).giroGrados).toBeCloseTo(30, 10);
    expect(alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 1, ordenadaEjeX: 0 }).giroGrados).toBe(0);
    expect(
      alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 0, ordenadaEjeX: 1 }).giroGrados,
    ).toBeCloseTo(90, 10);
  });

  it("y distingue el suroeste del noreste, que es lo que pierde una division", () => {
    // (-1,-1) y (1,1) dan el mismo cociente. Con `atan2` son 225° y 45°: 180° de diferencia, que
    // es el edificio al revés.
    const noreste = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 1, ordenadaEjeX: 1 });
    const suroeste = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: -1, ordenadaEjeX: -1 });
    expect(noreste.giroGrados).toBeCloseTo(45, 10);
    expect(suroeste.giroGrados).toBeCloseTo(-135, 10);
    expect(Math.abs(noreste.giroGrados - suroeste.giroGrados)).toBeCloseTo(180, 10);
  });

  it("no exige el vector normalizado: el esquema no lo pide", () => {
    const largo = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 300, ordenadaEjeX: 400 });
    expect(largo.cos).toBeCloseTo(0.6, 12);
    expect(largo.sen).toBeCloseTo(0.8, 12);
    // Y no se cuela como escala: la escala es su propio campo.
    expect(largo.escala).toBe(1);
  });

  it("el vector nulo es «sin giro declarado», no cero grados medidos", () => {
    for (const par of [
      { abscisaEjeX: 0, ordenadaEjeX: 0 },
      { abscisaEjeX: null, ordenadaEjeX: null },
      { abscisaEjeX: undefined, ordenadaEjeX: undefined },
      { abscisaEjeX: 1, ordenadaEjeX: null },
      { abscisaEjeX: Number.NaN, ordenadaEjeX: 1 },
    ]) {
      const a = alineacionDeMapa({ ...SANTIAGO, ...par });
      expect(a.via, JSON.stringify(par)).toBe("sin giro declarado");
      // Se comporta como sin giro, pero el desplazamiento se conserva: lo que falta es la
      // orientacion, no la posicion.
      expect(a.cos).toBe(1);
      expect(a.sen).toBe(0);
      expect(a.este).toBe(345_000);
    }
  });

  it("la escala ausente es 1, que es lo que dice el esquema", () => {
    for (const escala of [null, undefined, 0]) {
      expect(alineacionDeMapa({ ...SANTIAGO, escala }).escala, String(escala)).toBe(1);
    }
    expect(alineacionDeMapa({ ...SANTIAGO, escala: 0.999_6 }).escala).toBe(0.999_6);
  });

  it("con giro declarado, la via lo dice", () => {
    expect(alineacionDeMapa(SANTIAGO).via).toBe("IfcMapConversion");
  });
});

describe("localAMapa", () => {
  it("el origen local cae en el desplazamiento declarado", () => {
    expect(localAMapa([0, 0, 0], alineacionDeMapa(SANTIAGO))).toEqual([345_000, 6_298_000, 560]);
  });

  it("sin giro, es una suma y se comprueba de cabeza", () => {
    const a = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 1, ordenadaEjeX: 0 });
    const [e, n, h] = localAMapa([10, 20, 3], a);
    expect(e).toBeCloseTo(345_010, 9);
    expect(n).toBeCloseTo(6_298_020, 9);
    expect(h).toBeCloseTo(563, 9);
  });

  it("con 90° de giro, el eje X local apunta al norte", () => {
    const a = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 0, ordenadaEjeX: 1 });
    const [e, n] = localAMapa([10, 0, 0], a);
    expect(e).toBeCloseTo(345_000, 9);
    expect(n).toBeCloseTo(6_298_010, 9);
  });

  it("el giro no cambia las distancias, que es lo que lo hace un giro", () => {
    const a = alineacionDeMapa(SANTIAGO);
    const p: Punto3 = [12, 5, 0];
    const q: Punto3 = [30, -7, 0];
    const dLocal = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const [pe, pn] = localAMapa(p, a);
    const [qe, qn] = localAMapa(q, a);
    expect(Math.hypot(pe - qe, pn - qn)).toBeCloseTo(dLocal, 9);
  });

  it("la escala se aplica tambien a la altura: un edificio no se achata", () => {
    const a = alineacionDeMapa({ ...SANTIAGO, escala: 2, abscisaEjeX: 1, ordenadaEjeX: 0 });
    const [, , h] = localAMapa([0, 0, 3], a);
    expect(h).toBeCloseTo(566, 9); // 560 + 2*3
  });
});

describe("mapaALocal", () => {
  it("es la inversa exacta de localAMapa", () => {
    const a = alineacionDeMapa({ ...SANTIAGO, escala: 0.999_6 });
    for (const p of [
      [0, 0, 0],
      [12.345, -6.789, 3.21],
      [1000, 1000, -5],
      [-40, 80, 0],
    ] as Punto3[]) {
      const vuelta = mapaALocal(localAMapa(p, a), a);
      for (let i = 0; i < 3; i += 1) {
        expect(vuelta[i], `${JSON.stringify(p)}[${i}]`).toBeCloseTo(p[i] as number, 6);
      }
    }
  });

  it("trae un punto del levantamiento al sistema del modelo", () => {
    // Es el sentido que se usa de verdad: el modelo no se mueve, la nube viene a el.
    const a = alineacionDeMapa({ ...SANTIAGO, abscisaEjeX: 1, ordenadaEjeX: 0 });
    const [x, y, z] = mapaALocal([345_010, 6_298_020, 563], a);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(20, 6);
    expect(z).toBeCloseTo(3, 6);
  });

  it("una escala de cero no tiene inversa, y lo dice con NaN", () => {
    // La escala 0 se normaliza a 1 al resolver, asi que hay que forzarla para probar la division.
    const a = { ...alineacionDeMapa(SANTIAGO), escala: 0 };
    expect(mapaALocal([1, 2, 3], a).every((v) => !Number.isFinite(v))).toBe(true);
  });
});

describe("alineacionDeNorteVerdadero", () => {
  it("el norte por defecto —el eje Y— no gira nada", () => {
    const a = alineacionDeNorteVerdadero([0, 1]);
    expect(a.giroGrados).toBeCloseTo(0, 10);
    expect(a.via).toBe("TrueNorth");
  });

  it("orienta pero no situa, y el desplazamiento queda en cero", () => {
    const a = alineacionDeNorteVerdadero([0.5, Math.sqrt(3) / 2]);
    expect(a.giroGrados).toBeCloseTo(-30, 8);
    expect([a.este, a.norte, a.altura]).toEqual([0, 0, 0]);
    expect(a.escala).toBe(1);
  });

  it("es la inversa de la vista del mapa, no la misma: el signo importa", () => {
    // Si el norte del mapa cae a 30° en coordenadas locales, el eje X local visto desde el mapa
    // esta a -30°. Tomarlo del mismo signo espeja el edificio en planta.
    const norte = alineacionDeNorteVerdadero([Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)]);
    const mapa = alineacionDeMapa({
      este: 0,
      norte: 0,
      altura: 0,
      abscisaEjeX: Math.cos(-Math.PI / 6),
      ordenadaEjeX: Math.sin(-Math.PI / 6),
    });
    expect(norte.giroGrados).toBeCloseTo(mapa.giroGrados, 8);
  });

  it("el vector nulo es «sin giro declarado»", () => {
    const a = alineacionDeNorteVerdadero([0, 0]);
    expect(a.via).toBe("sin giro declarado");
    expect(a.giroGrados).toBe(0);
  });
});
