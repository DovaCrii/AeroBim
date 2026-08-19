/**
 * Unidades de longitud de un IFC, convertidas a metros al entrar al dominio.
 *
 * **Nunca se asume metros.** Un IFC declara su unidad en `IfcUnitAssignment`, y en la
 * práctica los modelos de arquitectura llegan en milímetros, los de obra civil en
 * metros y los de origen norteamericano en pies. Un modelo en milímetros interpretado
 * como metros no falla: sitúa un muro de 3 metros a 3 kilómetros, con toda confianza.
 *
 * Por eso todo lo que cruza hacia el dominio va en metros y lo dice en el nombre
 * (`lengthM`), y la conversión ocurre una sola vez, aquí.
 */

/** Prefijos SI que `IfcSIUnit` admite. */
export type SiPrefix =
  | "EXA"
  | "PETA"
  | "TERA"
  | "GIGA"
  | "MEGA"
  | "KILO"
  | "HECTO"
  | "DECA"
  | "DECI"
  | "CENTI"
  | "MILLI"
  | "MICRO"
  | "NANO"
  | "PICO"
  | "FEMTO"
  | "ATTO";

const SI_PREFIX_FACTORS: Record<SiPrefix, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
  PICO: 1e-12,
  FEMTO: 1e-15,
  ATTO: 1e-18,
};

/**
 * Unidades imperiales que aparecen como `IfcConversionBasedUnit`.
 *
 * Los factores son **exactos por definición** (acuerdo internacional de la yarda,
 * 1959), no aproximaciones: una pulgada es 25,4 mm por definición legal.
 */
export type ConversionLengthUnit = "INCH" | "FOOT" | "YARD" | "MILE";

const CONVERSION_FACTORS_M: Record<ConversionLengthUnit, number> = {
  INCH: 0.0254,
  FOOT: 0.3048,
  YARD: 0.9144,
  MILE: 1609.344,
};

/** La unidad de longitud declarada por el modelo. */
export type LengthUnit =
  | { readonly kind: "si"; readonly prefix: SiPrefix | null }
  | { readonly kind: "conversion"; readonly name: ConversionLengthUnit };

/** Metros, sin prefijo. */
export const METRE: LengthUnit = { kind: "si", prefix: null };

/** Milímetros — la unidad más común en modelos de arquitectura. */
export const MILLIMETRE: LengthUnit = { kind: "si", prefix: "MILLI" };

/** Cuántos metros vale una unidad de `unit`. */
export function metersPerUnit(unit: LengthUnit): number {
  if (unit.kind === "si") {
    return unit.prefix === null ? 1 : SI_PREFIX_FACTORS[unit.prefix];
  }
  return CONVERSION_FACTORS_M[unit.name];
}

/** Convierte un valor expresado en `unit` a metros. */
export function toMeters(value: number, unit: LengthUnit): number {
  return value * metersPerUnit(unit);
}

/** Convierte un valor en metros a `unit`. */
export function fromMeters(lengthM: number, unit: LengthUnit): number {
  return lengthM / metersPerUnit(unit);
}

/**
 * Interpreta el par (nombre, prefijo) que trae `IfcSIUnit` o `IfcConversionBasedUnit`.
 *
 * Devuelve `null` cuando no reconoce la unidad, **en vez de asumir metros**. Un modelo
 * con una unidad desconocida es un caso que hay que informar, no uno que se adivina:
 * adivinar aquí produce un modelo colocado con confianza en el lugar equivocado.
 */
export function parseLengthUnit(name: string, prefix?: string | null): LengthUnit | null {
  const upperName = name.trim().toUpperCase();
  const upperPrefix = prefix?.trim().toUpperCase() ?? null;

  if (upperName === "METRE" || upperName === "METER") {
    if (upperPrefix === null || upperPrefix === "") {
      return METRE;
    }
    if (upperPrefix in SI_PREFIX_FACTORS) {
      return { kind: "si", prefix: upperPrefix as SiPrefix };
    }
    return null;
  }

  const singular = upperName.endsWith("S") ? upperName.slice(0, -1) : upperName;
  if (singular in CONVERSION_FACTORS_M) {
    return { kind: "conversion", name: singular as ConversionLengthUnit };
  }

  return null;
}
