/**
 * `@aerobim/bim-core` — dominio puro de AeroBim.
 *
 * Sin React, sin Three.js, sin DOM: todo lo que vive aquí se prueba en Node. Si un
 * cálculo necesita el navegador para probarse, está en el paquete equivocado.
 */

export {
  compressUuidToIfcGuid,
  expandIfcGuidToUuid,
  isIfcGuid,
  parseIfcGuid,
  type CanonicalUuid,
  type IfcGuid,
} from "./identity/ifcGuid.js";

export {
  fromMeters,
  metersPerUnit,
  METRE,
  MILLIMETRE,
  parseLengthUnit,
  toMeters,
  type ConversionLengthUnit,
  type LengthUnit,
  type SiPrefix,
} from "./units/length.js";
