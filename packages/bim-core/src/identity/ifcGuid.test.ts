import { describe, expect, it } from "vitest";
import { compressUuidToIfcGuid, expandIfcGuidToUuid, isIfcGuid, parseIfcGuid } from "./ifcGuid.js";

describe("compressUuidToIfcGuid", () => {
  it("produce 22 caracteres", () => {
    const guid = compressUuidToIfcGuid("0e2b1e0a-1234-4567-89ab-cdef01234567");
    expect(guid).toHaveLength(22);
  });

  it("codifica el UUID nulo como 22 ceros", () => {
    // Todos los bytes en cero: cada grupo vale 0, y el digito 0 del alfabeto es "0".
    // Verificable a mano sin depender de la implementacion.
    expect(compressUuidToIfcGuid("00000000-0000-0000-0000-000000000000")).toBe("0".repeat(22));
  });

  it("codifica el UUID de bytes maximos segun el reparto de bits del estandar", () => {
    // Primer byte 0xFF = 255 = 3*64 + 63 -> "3" y "$" (indices 3 y 63 del alfabeto).
    // Cada grupo de 3 bytes es 0xFFFFFF = 63*(64^3 + 64^2 + 64 + 1) -> "$$$$".
    // Este caso es el que delata un reparto de bits mal implementado.
    expect(compressUuidToIfcGuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(
      `3$${"$$$$".repeat(5)}`,
    );
  });

  it("acepta el UUID con y sin guiones, y en mayusculas", () => {
    const conGuiones = compressUuidToIfcGuid("0e2b1e0a-1234-4567-89ab-cdef01234567");
    const sinGuiones = compressUuidToIfcGuid("0e2b1e0a1234456789abcdef01234567");
    const mayusculas = compressUuidToIfcGuid("0E2B1E0A-1234-4567-89AB-CDEF01234567");
    expect(sinGuiones).toBe(conGuiones);
    expect(mayusculas).toBe(conGuiones);
  });

  it("rechaza un UUID de largo incorrecto", () => {
    expect(() => compressUuidToIfcGuid("0e2b1e0a-1234-4567-89ab")).toThrow(/UUID invalido/);
  });

  it("rechaza un UUID con caracteres no hexadecimales", () => {
    expect(() => compressUuidToIfcGuid("zzzzzzzz-1234-4567-89ab-cdef01234567")).toThrow(
      /UUID invalido/,
    );
  });
});

describe("expandIfcGuidToUuid", () => {
  it("invierte la compresion", () => {
    const uuid = "0e2b1e0a-1234-4567-89ab-cdef01234567";
    expect(expandIfcGuidToUuid(compressUuidToIfcGuid(uuid))).toBe(uuid);
  });

  it("devuelve el UUID en minusculas con guiones en las posiciones canonicas", () => {
    const uuid = expandIfcGuidToUuid(compressUuidToIfcGuid("0E2B1E0A-1234-4567-89AB-CDEF01234567"));
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("rechaza un largo distinto de 22", () => {
    expect(() => expandIfcGuidToUuid("0123456789")).toThrow(/22 caracteres/);
  });

  it("rechaza un primer grupo que no cabe en un byte", () => {
    // "$$" = 63*64 + 63 = 4095, muy por encima de los 255 que admite el primer byte.
    // Un string asi tiene el largo correcto y usa el alfabeto correcto, pero no puede
    // provenir de un UUID: es exactamente el caso que un chequeo de largo deja pasar.
    expect(() => expandIfcGuidToUuid(`$$${"0".repeat(20)}`)).toThrow(/desborda un byte/);
  });

  it("rechaza un caracter fuera del alfabeto IFC", () => {
    // "-" no pertenece al alfabeto: los ultimos dos simbolos son "_" y "$".
    expect(() => expandIfcGuidToUuid(`0-${"0".repeat(20)}`)).toThrow(/fuera del alfabeto/);
  });
});

describe("round-trip sobre muchos UUID", () => {
  it("mantiene la identidad para 512 UUID generados", () => {
    for (let i = 0; i < 512; i += 1) {
      const uuid = crypto.randomUUID();
      const guid = compressUuidToIfcGuid(uuid);
      expect(guid).toHaveLength(22);
      expect(expandIfcGuidToUuid(guid)).toBe(uuid);
    }
  });

  it("no colisiona: 4096 UUID distintos dan 4096 GUID distintos", () => {
    // Es una biyeccion de 128 bits a 128 bits; una colision significaria que se estan
    // perdiendo bits en el camino, que es el sintoma de un grupo mal dimensionado.
    const guids = new Set<string>();
    for (let i = 0; i < 4096; i += 1) {
      guids.add(compressUuidToIfcGuid(crypto.randomUUID()));
    }
    expect(guids.size).toBe(4096);
  });
});

describe("isIfcGuid", () => {
  it("acepta un GUID producido por la compresion", () => {
    expect(isIfcGuid(compressUuidToIfcGuid(crypto.randomUUID()))).toBe(true);
  });

  it("rechaza largo incorrecto, alfabeto ajeno y primer grupo desbordado", () => {
    expect(isIfcGuid("0".repeat(21))).toBe(false);
    expect(isIfcGuid("0".repeat(23))).toBe(false);
    expect(isIfcGuid(`0-${"0".repeat(20)}`)).toBe(false);
    expect(isIfcGuid(`$$${"0".repeat(20)}`)).toBe(false);
  });

  it("acepta los dos simbolos propios del alfabeto IFC", () => {
    // "_" y "$" son validos y son justo los que un base64 de RFC 4648 rechazaria.
    expect(isIfcGuid(`00${"_$_$".repeat(5)}`)).toBe(true);
  });
});

describe("parseIfcGuid", () => {
  it("devuelve el mismo string cuando es valido", () => {
    const guid = compressUuidToIfcGuid(crypto.randomUUID());
    expect(parseIfcGuid(guid)).toBe(guid);
  });

  it("lanza cuando no lo es", () => {
    expect(() => parseIfcGuid("no-es-un-guid")).toThrow(/no es un GUID de IFC valido/);
  });
});
