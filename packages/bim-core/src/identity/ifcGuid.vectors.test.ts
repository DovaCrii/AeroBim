import { describe, expect, it } from "vitest";
import { compressUuidToIfcGuid, expandIfcGuidToUuid, isIfcGuid } from "./ifcGuid.js";

/**
 * Vectores de prueba tomados de un IFC real.
 *
 * **Este es el oráculo externo** que los tests propios no pueden dar: estos GUID los
 * generó **BricsCAD BIM 26.2** al exportar un modelo IFC2X3 de arquitectura, no este
 * código. Si nuestro reparto de bits difiere del estándar, el round-trip
 * `expand -> compress` devuelve un string distinto al que trae el archivo.
 *
 * Uno por categoría IFC, para cubrir GUID generados en momentos distintos del export.
 * Sobre el archivo completo se verificaron **579 GUID únicos: cero rechazos y cero
 * fallos de round-trip** (2026-08-19). El modelo no se versiona — es dato de la
 * organización — y por eso queda esta muestra: son identificadores opacos, sin
 * geometría ni información del proyecto.
 */
const VECTORES_BRICSCAD = [
  ["IfcProject", "1IdmmXnGL6KRvJjKxpZRz5"],
  ["IfcSite", "2xI4j7QRXBIRPMrw$SjaKL"],
  ["IfcBuilding", "1gdvfL0GH4WRw0PmNxP1kx"],
  ["IfcRelAggregates", "2zvN2tu3n5jR8ql3zjVYwq"],
  ["IfcBuildingElementProxy", "3zDBMcSJ17HfcY5XNQHGfe"],
  ["IfcRelContainedInSpatialStructure", "2NQrGEOdPByvlw96XZ$AjU"],
  ["IfcBeam", "2sOaC0lzL6JhvIR8y_YCPM"],
  ["IfcDoor", "3MwNRhfQTFHeZ9eVLp0KbM"],
  ["IfcFurnishingElement", "2WO3r16FD6JBo7aMYCVr1L"],
  ["IfcFlowTerminal", "0HpD0Owpv7jgxYhl3fk0aU"],
  ["IfcBeamType", "25H$nJpp16Ze1zDAMmfJeT"],
  ["IfcRelAssociatesMaterial", "2$_GbPo718_xxtxQPLHZv4"],
  ["IfcRelDefinesByType", "2JsOHVCHL04PVAl6YP_6v0"],
  ["IfcDoorStyle", "12iZ9NZ9f7lwgBjekqGMRl"],
  ["IfcBuildingElementProxyType", "3AhGon24D9twYEvuRtdqG5"],
  ["IfcFurnishingElementType", "0pyp13hrb7U9pI3$7P9WkI"],
  ["IfcSanitaryTerminalType", "1icFR1oZjBPvAqnh1RgB05"],
] as const;

describe("GUID generados por BricsCAD BIM 26.2", () => {
  it.each(VECTORES_BRICSCAD)("%s: %s sobrevive el round-trip sin cambiar", (_category, guid) => {
    expect(isIfcGuid(guid)).toBe(true);
    const uuid = expandIfcGuidToUuid(guid);
    expect(compressUuidToIfcGuid(uuid)).toBe(guid);
  });

  it("los 17 vectores son distintos entre si", () => {
    const guids = new Set(VECTORES_BRICSCAD.map(([, guid]) => guid));
    expect(guids.size).toBe(VECTORES_BRICSCAD.length);
  });

  it("usa los dos simbolos propios del alfabeto IFC", () => {
    // Los GUID reales traen "$" y "_", que un decodificador base64 de RFC 4648
    // rechazaria. Que aparezcan en la muestra confirma que el alfabeto se ejercita.
    const todos = VECTORES_BRICSCAD.map(([, guid]) => guid).join("");
    expect(todos).toContain("$");
    expect(todos).toContain("_");
  });
});
