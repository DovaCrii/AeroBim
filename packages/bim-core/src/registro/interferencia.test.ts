import { describe, expect, it } from "vitest";
import { compressUuidToIfcGuid } from "../identity/ifcGuid.js";
import {
  esLaMismaInterferencia,
  identidadDeInterferencia,
  tituloDeInterferencia,
} from "./interferencia.js";

/** GUID de IFC de verdad, generados desde un UUID: el validador rechaza cualquier otra cosa. */
function guid(n: number): string {
  return compressUuidToIfcGuid(`00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`);
}

const MURO = guid(1);
const PILAR = guid(2);

describe("identidadDeInterferencia", () => {
  it("el orden de la pareja no cambia la identidad", () => {
    // **Es la razón de que exista.** Comparar arquitectura contra estructura y estructura contra
    // arquitectura da el mismo conflicto con los elementos al revés: si el orden contara,
    // aparecería dos veces y la lista mentiría sobre cuántos hay.
    expect(identidadDeInterferencia({ guidA: MURO, guidB: PILAR })).toBe(
      identidadDeInterferencia({ guidA: PILAR, guidB: MURO }),
    );
  });

  it("es estable entre corridas, porque no depende de la geometría", () => {
    // El punto de choque cambia con la malla, con la tolerancia y con la versión de la librería.
    // La identidad no lo mira: son los dos GUID y nada más.
    const primera = identidadDeInterferencia({ guidA: MURO, guidB: PILAR });
    const segunda = identidadDeInterferencia({ guidA: MURO, guidB: PILAR });
    expect(primera).toBe(segunda);
    expect(primera).toContain("·");
  });

  it("un elemento consigo mismo no es una interferencia", () => {
    // No es un fallo de la detección: es un modelo que trae el mismo elemento dos veces.
    expect(identidadDeInterferencia({ guidA: MURO, guidB: MURO })).toBeNull();
  });

  it("sin GUID válido no hay identidad", () => {
    // Un elemento sin identidad no se puede volver a encontrar en la corrida siguiente, así que
    // tampoco se puede descartar: sería un falso positivo que vuelve siempre.
    expect(identidadDeInterferencia({ guidA: "no-es-un-guid", guidB: PILAR })).toBeNull();
    expect(identidadDeInterferencia({ guidA: MURO, guidB: "" })).toBeNull();
  });
});

describe("esLaMismaInterferencia", () => {
  it("reconoce la pareja al revés", () => {
    expect(
      esLaMismaInterferencia({ guidA: MURO, guidB: PILAR }, { guidA: PILAR, guidB: MURO }),
    ).toBe(true);
  });

  it("y distingue dos conflictos distintos", () => {
    expect(
      esLaMismaInterferencia({ guidA: MURO, guidB: PILAR }, { guidA: MURO, guidB: guid(3) }),
    ).toBe(false);
  });

  it("dos parejas sin identidad no son «la misma»", () => {
    // Devolver `true` porque las dos son `null` haría que todos los conflictos sin GUID se
    // colapsaran en uno, y con ellos los elementos que no tienen nada que ver.
    expect(esLaMismaInterferencia({ guidA: "x", guidB: "y" }, { guidA: "z", guidB: "w" })).toBe(
      false,
    );
  });
});

describe("tituloDeInterferencia", () => {
  it("dice qué choca con qué, sin abrir nada", () => {
    // Treinta conflictos llamados todos «Interferencia detectada» no se pueden repartir.
    expect(
      tituloDeInterferencia(
        { clase: "IfcWall", nombre: "Muro eje C" },
        { clase: "IfcMember", nombre: "Perfil P-14" },
      ),
    ).toBe("Muro eje C × Perfil P-14");
  });

  it("cae en la clase IFC cuando el elemento no trae nombre", () => {
    // Un modelo exportado sin nombres es corriente, y «IfcMember» dice bastante más que nada.
    expect(
      tituloDeInterferencia({ clase: "IfcWall", nombre: "" }, { clase: "IfcMember", nombre: "  " }),
    ).toBe("IfcWall × IfcMember");
  });

  it("recorta un nombre kilométrico en vez de dejar el título sin tope", () => {
    const largo = tituloDeInterferencia(
      { clase: "IfcWall", nombre: "x".repeat(400) },
      { clase: "IfcMember", nombre: "y".repeat(400) },
    );
    expect(largo).toHaveLength(250);
  });
});
