/**
 * Qué cruza un perfil. Con la misma geometría simple que las pruebas del eje: una franja recta de 10 m a
 * lo largo de x, en el origen, así que `s` coincide con `x` y todo se calcula a mano.
 */
import { describe, expect, it } from "vitest";

import { franjaDeTramo, tramosDelEje, type Franja } from "./eje.js";
import {
  crucesEn,
  filasDeBanda,
  intervaloDeCaja,
  nombreDeClase,
  pasoDeGraduacion,
  type CruceDePerfil,
} from "./cruces.js";

/** Un eje recto de 10 m a lo largo de x: la franja cubre s de 0 a 10. */
const FRANJA: Franja = franjaDeTramo(
  tramosDelEje({
    sistema: "escena",
    verticesM: [
      [0, 0],
      [10, 0],
    ],
  })[0]!,
  2,
);

const caja = (x: [number, number], y: [number, number], z: [number, number]) => ({
  min: [x[0], y[0], z[0]] as const,
  max: [x[1], y[1], z[1]] as const,
});

function cruce(
  parcial: Partial<CruceDePerfil> & { desdeM: number; hastaM: number },
): CruceDePerfil {
  return {
    categoria: "IFCWALL",
    nombre: null,
    guid: null,
    cotaMinM: 0,
    cotaMaxM: 3,
    ...parcial,
  };
}

describe("el intervalo que ocupa una caja", () => {
  it("una caja dentro de la franja da su propio rango de PK y su cota", () => {
    // Un muro de x 2 a 5, de y 0 a 3, sobre el eje.
    const r = intervaloDeCaja(FRANJA, caja([2, 5], [0, 3], [-0.1, 0.1]), 0);
    expect(r).toEqual({ desdeM: 2, hastaM: 5, cotaMinM: 0, cotaMaxM: 3 });
  });

  it("la cota suma el desplazamiento vertical que se quitó al recentrar", () => {
    const r = intervaloDeCaja(FRANJA, caja([2, 5], [0, 3], [-0.1, 0.1]), 561.5);
    expect(r?.cotaMinM).toBeCloseTo(561.5, 10);
    expect(r?.cotaMaxM).toBeCloseTo(564.5, 10);
  });

  it("se recorta al largo de la franja: un muro que sale de ella solo cuenta lo que entra", () => {
    // De x 8 a x 30 en una franja de 10 m: dentro quedan 2 m, del 8 al 10.
    const r = intervaloDeCaja(FRANJA, caja([8, 30], [0, 3], [-0.1, 0.1]), 0);
    expect(r).toEqual({ desdeM: 8, hastaM: 10, cotaMinM: 0, cotaMaxM: 3 });
  });

  it("una caja entera fuera del largo de la franja no cruza", () => {
    expect(intervaloDeCaja(FRANJA, caja([12, 15], [0, 3], [-0.1, 0.1]), 0)).toBeNull();
    expect(intervaloDeCaja(FRANJA, caja([-6, -2], [0, 3], [-0.1, 0.1]), 0)).toBeNull();
  });

  it("con el eje a lo largo de z, es z quien manda: se miran las esquinas de las dos coordenadas", () => {
    // Una mutación que miraba solo una esquina en z sobrevivía mientras las pruebas usaran un eje a lo
    // largo de x, donde z no influye en `s`. Aquí sí: la caja ocupa 3 m a lo largo del eje.
    const aLoLargoDeZ = franjaDeTramo(
      tramosDelEje({
        sistema: "escena",
        verticesM: [
          [0, 0],
          [0, 10],
        ],
      })[0]!,
      2,
    );
    const r = intervaloDeCaja(aLoLargoDeZ, caja([-1, 1], [0, 3], [2, 5]), 0);
    expect(r).not.toBeNull();
    expect(r!.hastaM - r!.desdeM).toBeCloseTo(3, 10);
    expect(r!.desdeM).toBeCloseTo(2, 10);
  });

  it("la dirección importa: una caja girada se mide por sus ocho esquinas", () => {
    // Una caja grande en planta (x 0–4, z −2–2): proyectada sobre la franja ocupa de 0 a 4.
    const r = intervaloDeCaja(FRANJA, caja([0, 4], [0, 1], [-2, 2]), 0);
    expect(r?.desdeM).toBe(0);
    expect(r?.hastaM).toBe(4);
  });
});

describe("lo que cruza un punto", () => {
  const A = cruce({ desdeM: 0, hastaM: 4, categoria: "IFCWALL", cotaMinM: 0, cotaMaxM: 3 });
  const B = cruce({ desdeM: 3, hastaM: 8, categoria: "IFCSLAB", cotaMinM: 2.8, cotaMaxM: 3 });
  const C = cruce({ desdeM: 9, hastaM: 10, categoria: "IFCCOLUMN", cotaMinM: 0, cotaMaxM: 6 });

  it("solo con el PK: lo que hay a lo largo de esa vertical", () => {
    expect(crucesEn([A, B, C], 3.5).map((c) => c.categoria)).toEqual(["IFCWALL", "IFCSLAB"]);
    expect(crucesEn([A, B, C], 6)).toEqual([B]);
    expect(crucesEn([A, B, C], 8.5)).toEqual([]);
  });

  it("con la cota: lo que hay justo ahí", () => {
    // En el PK 3,5 hay un muro y una losa, pero a cota 1 solo el muro.
    expect(crucesEn([A, B, C], 3.5, 1).map((c) => c.categoria)).toEqual(["IFCWALL"]);
    expect(crucesEn([A, B, C], 3.5, 2.9).map((c) => c.categoria)).toEqual(["IFCWALL", "IFCSLAB"]);
  });

  it("los extremos cuentan como dentro", () => {
    expect(crucesEn([A, B, C], 4)).toHaveLength(2);
    expect(crucesEn([A, B, C], 9)).toEqual([C]);
    expect(crucesEn([A], 1, 3)).toEqual([A]);
  });
});

describe("las filas de la banda", () => {
  it("una por clase, con cuántos son, de más a menos", () => {
    const filas = filasDeBanda([
      cruce({ desdeM: 0, hastaM: 2, categoria: "IFCWALL" }),
      cruce({ desdeM: 5, hastaM: 6, categoria: "IFCSLAB" }),
      cruce({ desdeM: 7, hastaM: 8, categoria: "IFCWALL" }),
      cruce({ desdeM: 9, hastaM: 10, categoria: "IFCWALL" }),
    ]);
    expect(filas.map((f) => [f.categoria, f.cuantos])).toEqual([
      ["IFCWALL", 3],
      ["IFCSLAB", 1],
    ]);
  });

  it("los tramos que se tocan o se solapan se unen en uno", () => {
    const [fila] = filasDeBanda([
      cruce({ desdeM: 4, hastaM: 6 }),
      cruce({ desdeM: 0, hastaM: 4 }),
      cruce({ desdeM: 5, hastaM: 9 }),
    ]);
    // 0–4 y 4–6 se tocan; 5–9 solapa con ellos: queda un solo tramo, del 0 al 9.
    expect(fila?.tramos).toEqual([[0, 9]]);
    expect(fila?.cuantos).toBe(3);
  });

  it("los tramos separados se quedan separados", () => {
    const [fila] = filasDeBanda([cruce({ desdeM: 0, hastaM: 2 }), cruce({ desdeM: 5, hastaM: 7 })]);
    expect(fila?.tramos).toEqual([
      [0, 2],
      [5, 7],
    ]);
  });

  it("a igual cantidad, por nombre; y sin cruces, ninguna fila", () => {
    const filas = filasDeBanda([
      cruce({ desdeM: 0, hastaM: 1, categoria: "IFCSLAB" }),
      cruce({ desdeM: 2, hastaM: 3, categoria: "IFCBEAM" }),
    ]);
    expect(filas.map((f) => f.categoria)).toEqual(["IFCBEAM", "IFCSLAB"]);
    expect(filasDeBanda([])).toEqual([]);
  });

  it("no toca la lista que recibe", () => {
    const entrada = [cruce({ desdeM: 5, hastaM: 6 }), cruce({ desdeM: 0, hastaM: 1 })];
    filasDeBanda(entrada);
    expect(entrada.map((c) => c.desdeM)).toEqual([5, 0]);
  });
});

describe("el nombre de una clase", () => {
  it("las conocidas, en cristiano", () => {
    expect(nombreDeClase("IFCWALL")).toBe("Muro");
    expect(nombreDeClase("IFCWALLSTANDARDCASE")).toBe("Muro");
    expect(nombreDeClase("ifcslab")).toBe("Losa");
  });

  it("una desconocida no se inventa: sin el prefijo y con mayúscula inicial", () => {
    expect(nombreDeClase("IFCTRANSPORTELEMENT")).toBe("Transportelement");
  });
});

describe("la graduación del eje", () => {
  it("es de los pasos que se leen: 1, 2, 5, 10, 20, 50…", () => {
    expect(pasoDeGraduacion(340, 10)).toBe(50);
    expect(pasoDeGraduacion(100, 10)).toBe(10);
    expect(pasoDeGraduacion(16.8, 10)).toBe(2);
    expect(pasoDeGraduacion(7.1, 10)).toBe(1);
    expect(pasoDeGraduacion(12_000, 10)).toBe(2000);
  });

  it("nunca pone más marcas que las pedidas", () => {
    for (const largo of [3, 7.1, 16.8, 99, 340, 1234, 50_000]) {
      for (const maximo of [4, 8, 12]) {
        expect(largo / pasoDeGraduacion(largo, maximo)).toBeLessThanOrEqual(maximo + 1e-9);
      }
    }
  });

  it("sin largo no hay nada que graduar", () => {
    expect(pasoDeGraduacion(0, 10)).toBe(1);
    expect(pasoDeGraduacion(-5, 10)).toBe(1);
    expect(pasoDeGraduacion(100, 0)).toBe(1);
  });
});
