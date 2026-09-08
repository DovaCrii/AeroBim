import { describe, expect, it } from "vitest";
import { compressUuidToIfcGuid } from "../identity/ifcGuid.js";
import {
  ladoDeVisibilidad,
  MAXIMO_EXCEPCIONES,
  seVe,
  visibilidadBcf,
  type VisibilidadBcf,
} from "./visibilidad.js";

/** GUID de IFC de verdad, generados desde un UUID: el validador rechaza cualquier otra cosa. */
function guid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return compressUuidToIfcGuid(`00000000-0000-4000-8000-${hex}`);
}

const UNO = guid(1);
const DOS = guid(2);
const TRES = guid(3);

describe("ladoDeVisibilidad", () => {
  it("con tres elementos apagados de veinte mil escribe los tres, no los 19.997", () => {
    // Es la razón entera de que esta función exista: los dos lados describen la misma pantalla y
    // uno de ellos ocupa cuatro órdenes de magnitud más.
    expect(ladoDeVisibilidad(3, 19_997)).toBe("ocultos");
  });

  it("aislando una planta escribe la planta, que es el lado corto", () => {
    // Aislar deja casi todo apagado: acá lo que hay que enumerar es lo que se ve.
    expect(ladoDeVisibilidad(19_950, 50)).toBe("visibles");
  });

  it("sin nada oculto no afirma nada", () => {
    // No es lo mismo «se ve todo» que «no tengo nada que decir de la visibilidad», y este es el
    // segundo caso: quien exporta no escribe ninguna restricción.
    expect(ladoDeVisibilidad(0, 500)).toBeNull();
  });

  it("empatados elige el lado que deja DefaultVisibility en verdadero", () => {
    // Es el valor que ya escribía el exportador y el que cualquier lector interpreta sin sorpresas.
    expect(ladoDeVisibilidad(10, 10)).toBe("ocultos");
  });

  it("con los dos lados por encima del tope prefiere callarse", () => {
    // Medio modelo apagado a mano. Un viewpoint de un megabyte que ningún visor termina de leer no
    // informa de nada, así que se vuelve al modelo entero.
    const pasado = MAXIMO_EXCEPCIONES + 1;
    expect(ladoDeVisibilidad(pasado, pasado)).toBeNull();
  });

  it("justo en el tope todavía escribe", () => {
    expect(ladoDeVisibilidad(MAXIMO_EXCEPCIONES, MAXIMO_EXCEPCIONES + 5)).toBe("ocultos");
  });

  it("no se cree un número que no es un número", () => {
    expect(ladoDeVisibilidad(Number.NaN, 10)).toBeNull();
    expect(ladoDeVisibilidad(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("visibilidadBcf", () => {
  it("el lado de los ocultos deja DefaultVisibility en verdadero", () => {
    expect(visibilidadBcf("ocultos", [UNO, DOS])).toEqual({
      porDefecto: true,
      excepciones: [UNO, DOS],
    });
  });

  it("el lado de los visibles lo deja en falso: se ve solo lo enumerado", () => {
    expect(visibilidadBcf("visibles", [UNO])).toEqual({ porDefecto: false, excepciones: [UNO] });
  });

  it("descarta lo que no es un GUID de IFC", () => {
    // Un elemento sin GUID no se puede nombrar en un BCF: el atributo tiene una forma, y escribir
    // cualquier cosa produce un archivo que el otro extremo ignora o rechaza.
    expect(visibilidadBcf("ocultos", [UNO, null, undefined, "", "no-es-un-guid", DOS])).toEqual({
      porDefecto: true,
      excepciones: [UNO, DOS],
    });
  });

  it("quita los repetidos y conserva el orden", () => {
    // Dos modelos abiertos pueden traer el mismo elemento, y la lista se duplicaría sin decir nada.
    expect(visibilidadBcf("ocultos", [DOS, UNO, DOS, TRES, UNO])?.excepciones).toEqual([
      DOS,
      UNO,
      TRES,
    ]);
  });

  it("sin ninguna excepción utilizable no devuelve nada", () => {
    expect(visibilidadBcf("ocultos", ["basura", null])).toBeNull();
  });

  it("y por el lado de los visibles eso mismo habría apagado el modelo entero", () => {
    // `DefaultVisibility="false"` con las excepciones vacías es el peor viewpoint posible: se abre
    // en negro. Antes que escribirlo, no se escribe nada.
    expect(visibilidadBcf("visibles", [])).toBeNull();
  });
});

describe("seVe", () => {
  const ocultandoUno: VisibilidadBcf = { porDefecto: true, excepciones: [UNO] };
  const aislandoUno: VisibilidadBcf = { porDefecto: false, excepciones: [UNO] };

  it("lee los dos lados como los escribió visibilidadBcf", () => {
    // Es la vuelta del viaje: con esto el visor deja la pantalla como estaba quien anotó.
    expect(seVe(ocultandoUno, UNO)).toBe(false);
    expect(seVe(ocultandoUno, DOS)).toBe(true);
    expect(seVe(aislandoUno, UNO)).toBe(true);
    expect(seVe(aislandoUno, DOS)).toBe(false);
  });
});
