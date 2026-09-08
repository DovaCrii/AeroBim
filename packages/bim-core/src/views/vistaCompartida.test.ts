import { describe, expect, it } from "vitest";
import {
  corteAEscena,
  corteAIfc,
  leerVistaCompartida,
  MAXIMO_CORTES,
  type VistaCompartida,
} from "./vistaCompartida.js";

const CAMARA = {
  tipo: "perspectiva" as const,
  punto: [10, -10, 10] as const,
  direccion: [-0.57735, 0.57735, -0.57735] as const,
  arriba: [-0.408248, 0.408248, 0.816497] as const,
  campoVisual: 60,
};

/** Lo mínimo que el servidor puede devolver y que sigue siendo una vista. */
const BUENA = {
  nombre: "Encuentro del eje C",
  camara: CAMARA,
  visibilidad: { porDefecto: true, excepciones: ["2x9ibDgrvAu8y4Yd$Ug4Qu"] },
  cortes: [{ normal: [0, 0, 1], origen: [0, 0, 3.2] }],
};

describe("corteAIfc", () => {
  it("lleva el plano al sistema del modelo, normal incluida", () => {
    // Es el error clásico de convertir sistemas: tratar el punto y olvidar el vector, y los cortes
    // salen girados noventa grados. `escenaAIfc` es lineal, así que vale para los dos.
    const llevado = corteAIfc({ normal: [0, 1, 0], origin: [1, 2, 3] });
    // El «arriba» de la escena es la cota del IFC: un corte horizontal sigue siendo horizontal.
    expect(llevado.normal[2]).toBe(1);
    expect(llevado.origen).toEqual([1, -3, 2]);
  });

  it("es la inversa exacta de corteAEscena", () => {
    const corte = { normal: [0, 1, 0] as const, origin: [1.5, -2, 30] as const };
    expect(corteAEscena(corteAIfc(corte))).toEqual(corte);
  });
});

describe("leerVistaCompartida", () => {
  it("lee entera la que escribe el visor", () => {
    expect(leerVistaCompartida(BUENA)).toEqual(BUENA satisfies unknown as VistaCompartida);
  });

  it("sin nombre no es una vista", () => {
    // El nombre es lo único con lo que otra persona la reconoce en una lista.
    expect(leerVistaCompartida({ ...BUENA, nombre: "   " })).toBeNull();
  });

  it("sin cámara tampoco", () => {
    // Es lo que define «desde dónde»: sin ella no hay nada que aplicar.
    expect(leerVistaCompartida({ ...BUENA, camara: undefined })).toBeNull();
  });

  it("una ortogonal sin alto de vista se rechaza", () => {
    // La posición dice desde dónde se mira y nada dice cuánto se ve: la vista compartida
    // encuadraría otra cosa que la de quien la guardó.
    const orto = { tipo: "ortogonal", punto: [0, 0, 40], direccion: [0, 0, -1], arriba: [0, 1, 0] };
    expect(leerVistaCompartida({ ...BUENA, camara: orto })).toBeNull();
    expect(leerVistaCompartida({ ...BUENA, camara: { ...orto, escala: 25 } })).not.toBeNull();
  });

  it("sin cortes sigue siendo una vista", () => {
    // Tolerante con lo accesorio: una vista sin cortes es una vista sin cortes, no una corrupta.
    expect(leerVistaCompartida({ ...BUENA, cortes: undefined })?.cortes).toEqual([]);
  });

  it("una visibilidad vacía se lee como «sin restricción», no como modelo apagado", () => {
    // `porDefecto: false` con la lista vacía apagaría todo. Ver `visibilidad.ts`.
    const vista = leerVistaCompartida({
      ...BUENA,
      visibilidad: { porDefecto: false, excepciones: [] },
    });
    expect(vista?.visibilidad).toBeNull();
  });

  it("descarta los cortes que no son planos y conserva los demás", () => {
    const vista = leerVistaCompartida({
      ...BUENA,
      cortes: [{ normal: [0, 0, 1], origen: [0, 0, 1] }, { normal: "x" }, null],
    });
    expect(vista?.cortes).toHaveLength(1);
  });

  it("no acepta una lista de cortes inventada", () => {
    // El visor pone tres ejes; una lista larga es un dato escrito a mano.
    const muchos = Array.from({ length: MAXIMO_CORTES + 5 }, () => ({
      normal: [0, 0, 1],
      origen: [0, 0, 1],
    }));
    expect(leerVistaCompartida({ ...BUENA, cortes: muchos })?.cortes).toHaveLength(MAXIMO_CORTES);
  });

  it("recorta un nombre kilométrico en vez de tirar la vista", () => {
    const vista = leerVistaCompartida({ ...BUENA, nombre: "x".repeat(500) });
    expect(vista?.nombre).toHaveLength(120);
  });
});
