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
  angleAtDeg,
  distanceM,
  distancePartsM,
  perimeterM,
  perpendicularToPlane,
  polygonAreaM2,
  type DistanceParts,
  type PerpendicularFoot,
  type Point3,
} from "./measure/geometry.js";

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

export { NO_IFC_UNITS, parseIfcUnits, type IfcUnitKind, type IfcUnits } from "./units/ifcUnits.js";

export {
  countIfcEntities,
  emptyElementClasses,
  isElementClass,
  missingElementClasses,
  type MissingClass,
} from "./inspect/ifcClasses.js";

export {
  parseDxf,
  suggestMetresPerUnit,
  type DxfBounds,
  type DxfDeclaredUnits,
  type DxfDrawing,
  type DxfHatch,
  type DxfLayer,
  type DxfPolyline,
  type DxfText,
} from "./plans/dxf.js";

export {
  parseSavedViews,
  readSavedView,
  type SavedCamera,
  type SavedSection,
  type SavedView,
  type ViewNavigation,
  type ViewProjection,
} from "./views/savedView.js";

export {
  isDimensionlessIfcType,
  isTextIfcType,
  looksNumeric,
  quantityKindFromIfcType,
  quantityKindFromName,
  resolveUnitSymbol,
  unitSymbolFor,
  type QuantityKind,
  type ResolvedUnit,
} from "./units/quantity.js";
