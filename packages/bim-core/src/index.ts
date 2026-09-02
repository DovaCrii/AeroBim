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
  AA_NO_TEXTO,
  AA_TEXTO,
  contrastRatio,
  parseHex,
  pasaAA,
  relativeLuminance,
  type Hex,
  type Rgb,
} from "./color/contraste.js";

export {
  angleAtDeg,
  distanceM,
  distancePartsM,
  closedPerimeterM,
  perimeterM,
  perpendicularToPlane,
  polygonAreaM2,
  segmentIntersection,
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

export { NO_GRIDS, parseIfcGrids, type IfcGridAxis, type IfcGrids } from "./inspect/ifcGrid.js";

export {
  countIfcEntities,
  emptyElementClasses,
  isElementClass,
  missingElementClasses,
  type MissingClass,
} from "./inspect/ifcClasses.js";

export {
  aciColor,
  aciColorHex,
  parseDxf,
  suggestMetresPerUnit,
  type DxfBounds,
  type DxfColor,
  type DxfDeclaredUnits,
  type DxfDrawing,
  type DxfHatch,
  type DxfLayer,
  type DxfPolyline,
  type DxfText,
} from "./plans/dxf.js";

export { hatchAngles, hatchLines, type PlanLoop, type PlanPoint } from "./plans/hatch.js";

export {
  nombreDeLoAbierto,
  rutasDeVuelta,
  tituloPropuesto,
  urlDeNuevaObservacion,
  type ObservableElement,
  type RegistryOrigin,
  type Vuelta,
} from "./registro/observar.js";

export {
  camaraBcfDesdeEscena,
  escenaAIfc,
  ifcAEscena,
  type BcfCamera,
  type BcfCameraKind,
  type SceneCameraState,
} from "./registro/viewpoint.js";

export { MUESTRAS, pareceEnBlanco, RANGO_MINIMO } from "./registro/instantanea.js";

export {
  lineasDesdeMediciones,
  MAXIMO_LINEAS,
  type ClaseDeMedida,
  type LineaIfc,
  type MedicionDibujada,
} from "./registro/marcado.js";

export {
  ladoDeVisibilidad,
  MAXIMO_EXCEPCIONES,
  seVe,
  visibilidadBcf,
  type LadoDeVisibilidad,
  type VisibilidadBcf,
} from "./registro/visibilidad.js";

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
  corteAEscena,
  corteAIfc,
  leerVistaCompartida,
  MAXIMO_CORTES,
  NOMBRE_MAXIMO,
  type CorteIfc,
  type VistaCompartida,
} from "./views/vistaCompartida.js";

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
