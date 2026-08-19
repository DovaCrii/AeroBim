import { describe, expect, it } from "vitest";
import type { IfcUnits } from "./ifcUnits.js";
import { quantityKindFromName, resolveUnitSymbol } from "./quantity.js";

/** Lo que declara un IFC de arquitectura típico: geometría en mm, cantidades en metros. */
const UNIDADES: IfcUnits = {
  length: "mm",
  area: "m²",
  volume: "m³",
  angle: "°",
  mass: "kg",
  time: "s",
};

/** Un modelo que solo declara la longitud, que es el caso más común. */
const SOLO_LONGITUD: IfcUnits = {
  length: "mm",
  area: null,
  volume: null,
  angle: null,
  mass: null,
  time: null,
};

describe("resolveUnitSymbol — el tipo IFC manda", () => {
  it("toma la unidad del tipo declarado, sin marcarla como inferida", () => {
    expect(resolveUnitSymbol({ ifcType: "IFCLENGTHMEASURE", name: "Length", units: UNIDADES })) //
      .toEqual({ symbol: "mm", inferred: false });
  });

  it("no pone unidad a un conteo ni a una razón, aunque el nombre suene a medida", () => {
    expect(
      resolveUnitSymbol({ ifcType: "IFCCOUNTMEASURE", name: "Length", units: UNIDADES }),
    ).toBeNull();
    expect(
      resolveUnitSymbol({ ifcType: "IFCRATIOMEASURE", name: "Area", units: UNIDADES }),
    ).toBeNull();
  });

  it("no intenta inferir sobre un tipo sin dimensión: un IFCINTEGER llamado Length no es mm", () => {
    expect(
      resolveUnitSymbol({ ifcType: "IFCINTEGER", name: "Length", units: UNIDADES }),
    ).toBeNull();
    expect(resolveUnitSymbol({ ifcType: "IFCLABEL", name: "Height", units: UNIDADES })).toBeNull();
  });

  it("cae al kilo cuando el archivo no declara la masa, y lo marca como deducido", () => {
    // Es el caso real de un perfil de acero: el exportador declara longitud, área y volumen, y el
    // `Weight` llega sin unidad aunque esté en kilos. IFC dice que sin declaración manda la base
    // del SI, así que se muestra "kg" — atenuado, porque el archivo no lo dijo.
    expect(
      resolveUnitSymbol({ ifcType: "IFCMASSMEASURE", name: "Weight", units: SOLO_LONGITUD }),
    ).toEqual({ symbol: "kg", inferred: true });
  });

  it("no rellena longitud, área ni volumen con la base del SI", () => {
    // Acá sí sería peligroso: un modelo en milímetros sin declarar unidad se mostraría en metros.
    const sinNada: IfcUnits = {
      length: null,
      area: null,
      volume: null,
      angle: null,
      mass: null,
      time: null,
    };
    expect(
      resolveUnitSymbol({ ifcType: "IFCLENGTHMEASURE", name: "Length", units: sinNada }),
    ).toBeNull();
    expect(
      resolveUnitSymbol({ ifcType: "IFCVOLUMEMEASURE", name: "Volume", units: sinNada }),
    ).toBeNull();
  });
});

describe("resolveUnitSymbol — el nombre como respaldo", () => {
  it("infiere por el nombre cuando el valor llega como número genérico, y lo marca", () => {
    // Es el caso real de `Pset_Quantities_Structural_Shape`: un perfil de acero guarda su
    // largo como IFCREAL, y sin esto el panel muestra `8070.861` sin decir de qué.
    expect(resolveUnitSymbol({ ifcType: "IFCREAL", name: "Length", units: UNIDADES })).toEqual({
      symbol: "mm",
      inferred: true,
    });
  });

  it("infiere igual cuando el tipo no viene", () => {
    expect(resolveUnitSymbol({ name: "Volume", units: UNIDADES })).toEqual({
      symbol: "m³",
      inferred: true,
    });
  });

  it("no infiere sobre un cociente: Weight/Length es kg/m, no kg", () => {
    expect(resolveUnitSymbol({ ifcType: "IFCREAL", name: "Weight/Length", units: UNIDADES })) //
      .toBeNull();
    expect(
      resolveUnitSymbol({ ifcType: "IFCREAL", name: "Density/Spec. Weight", units: UNIDADES }),
    ).toBeNull();
  });
});

describe("quantityKindFromName", () => {
  it("reconoce las medidas de un perfil estructural", () => {
    expect(quantityKindFromName("Length")).toBe("length");
    expect(quantityKindFromName("Width")).toBe("length");
    expect(quantityKindFromName("Height")).toBe("length");
    expect(quantityKindFromName("Surface Area")).toBe("area");
    expect(quantityKindFromName("Volume")).toBe("volume");
    expect(quantityKindFromName("Weight")).toBe("mass");
  });

  it("atraviesa los calificativos: Volume Gross y Volume Net siguen siendo volumen", () => {
    expect(quantityKindFromName("Volume Gross")).toBe("volume");
    expect(quantityKindFromName("Volume Net")).toBe("volume");
    expect(quantityKindFromName("Weight Net")).toBe("mass");
    expect(quantityKindFromName("NetSideArea")).toBe("area");
  });

  it("descarta lo que no es una medida aunque el nombre se parezca", () => {
    expect(quantityKindFromName("Element Id")).toBeNull();
    expect(quantityKindFromName("Shape Class")).toBeNull();
    expect(quantityKindFromName("ProfileType")).toBeNull();
    expect(quantityKindFromName("MaterialName")).toBeNull();
    expect(quantityKindFromName("Process Status")).toBeNull();
  });

  it("marca los conteos como conteo, que es distinto de no saber", () => {
    expect(quantityKindFromName("Total Count")).toBe("count");
  });

  it("no adivina sobre un nombre que no dice nada", () => {
    expect(quantityKindFromName("LoadBearing")).toBeNull();
    expect(quantityKindFromName("FireRating")).toBeNull();
    expect(quantityKindFromName("")).toBeNull();
  });
});
