/**
 * Qué unidad le corresponde a una propiedad de IFC.
 *
 * Un pset guarda pares nombre/valor y **no siempre dice de qué magnitud es el número**. Hay
 * dos fuentes, y una es mucho mejor que la otra:
 *
 * 1. **El tipo IFC del valor** (`IFCLENGTHMEASURE`, `IFCAREAMEASURE`, …). Es lo que declara el
 *    archivo y no se discute. Un `IfcQuantityLength` siempre trae su tipo.
 * 2. **El nombre de la propiedad**, cuando el tipo es un número genérico. Los psets propios de
 *    las herramientas de modelado guardan longitudes como `IFCREAL` —así llegan los
 *    `Pset_Quantities_Structural_Shape` de un perfil de acero— y ahí el nombre es lo único
 *    que queda. Es una **inferencia**, se marca como tal y la interfaz la muestra distinto:
 *    una unidad adivinada que se presenta como certeza es peor que ninguna.
 *
 * La segunda fuente es deliberadamente desconfiada. Rechaza cualquier nombre con `/` o con
 * `per`, porque eso es un cociente —`Weight/Length` es kg/m, no kg— y rechaza los nombres que
 * terminan en identificador, tipo o estado. Vale más callar que etiquetar mal.
 */

import type { IfcUnits, IfcUnitKind } from "./ifcUnits.js";

/**
 * Magnitud de una propiedad.
 *
 * `count` y `ratio` existen para poder decir "esto es un número sin unidad" y distinguirlo de
 * "no se sabe": un conteo con una unidad pegada al lado sería un error, no un dato incompleto.
 */
export type QuantityKind = IfcUnitKind | "count" | "ratio";

/** Tipos de IFC que declaran una magnitud, con la que declaran. */
const MAGNITUD_POR_TIPO: Record<string, QuantityKind> = {
  IFCLENGTHMEASURE: "length",
  IFCPOSITIVELENGTHMEASURE: "length",
  IFCNONNEGATIVELENGTHMEASURE: "length",
  IFCAREAMEASURE: "area",
  IFCPOSITIVEAREAMEASURE: "area",
  IFCVOLUMEMEASURE: "volume",
  IFCPLANEANGLEMEASURE: "angle",
  IFCPOSITIVEPLANEANGLEMEASURE: "angle",
  IFCMASSMEASURE: "mass",
  IFCTIMEMEASURE: "time",
  IFCCOUNTMEASURE: "count",
  IFCRATIOMEASURE: "ratio",
  IFCPOSITIVERATIOMEASURE: "ratio",
  IFCNORMALISEDRATIOMEASURE: "ratio",
};

/**
 * Tipos de IFC que **no** son un número con dimensión, y para los que ni se intenta inferir.
 *
 * Un `IFCINTEGER` llamado `Length` es un contador o un identificador, no ocho metros. Cortar
 * acá evita que la inferencia por nombre convierta un `Element Id` en milímetros.
 */
const TIPOS_SIN_MAGNITUD = new Set([
  "IFCBOOLEAN",
  "IFCLOGICAL",
  "IFCLABEL",
  "IFCTEXT",
  "IFCIDENTIFIER",
  "IFCINTEGER",
  "IFCDATETIME",
  "IFCDATE",
  "IFCDURATION",
]);

/** Sufijos de nombre que delatan una magnitud, del más específico al más general. */
const MAGNITUD_POR_SUFIJO: readonly (readonly [string, QuantityKind])[] = [
  ["area", "area"],
  ["volume", "volume"],
  ["length", "length"],
  ["width", "length"],
  ["height", "length"],
  ["thickness", "length"],
  ["depth", "length"],
  ["perimeter", "length"],
  ["radius", "length"],
  ["diameter", "length"],
  ["span", "length"],
  ["elevation", "length"],
  ["weight", "mass"],
  ["mass", "mass"],
  ["angle", "angle"],
  ["count", "count"],
  ["number", "count"],
  ["quantity", "count"],
];

/**
 * Sufijos que no aportan magnitud y se descartan antes de mirar el nombre.
 *
 * `Volume Gross` y `Volume Net` son volúmenes; sin quitar el calificativo, ninguno de los dos
 * lo parecería.
 */
const CALIFICATIVOS = ["gross", "net", "total", "nominal", "actual", "min", "max", "average"];

/** Sufijos que descartan la propiedad entera: no son medidas aunque el nombre confunda. */
const NO_ES_MEDIDA = ["id", "class", "type", "name", "status", "code", "ref", "reference"];

/** La magnitud que declara un tipo de IFC, o `null` si el tipo no dice nada de la magnitud. */
export function quantityKindFromIfcType(ifcType: string): QuantityKind | null {
  return MAGNITUD_POR_TIPO[ifcType.trim().toUpperCase()] ?? null;
}

/** `true` si el tipo IFC deja claro que el valor no es una medida con unidad. */
export function isDimensionlessIfcType(ifcType: string): boolean {
  return TIPOS_SIN_MAGNITUD.has(ifcType.trim().toUpperCase());
}

/**
 * La magnitud que sugiere el **nombre** de una propiedad, o `null` si no la sugiere ninguna.
 *
 * Es la fuente de segunda clase, y se comporta como tal: ante la duda devuelve `null`.
 */
export function quantityKindFromName(name: string): QuantityKind | null {
  const crudo = name.trim().toLowerCase();

  // Un cociente lleva una unidad compuesta que no se puede armar desde acá: `Weight/Length` es
  // kg/m y `Density/Spec. Weight` es kg/m³. Etiquetarlos "kg" sería inventar.
  if (crudo.includes("/") || /\bper\b/.test(crudo)) return null;

  let normalizado = crudo.replaceAll(/[^a-z]/g, "");
  if (normalizado === "") return null;

  for (const sufijo of NO_ES_MEDIDA) {
    if (normalizado.endsWith(sufijo)) return null;
  }

  // Los calificativos se quitan en cadena: `NetVolumeGross` no existe, pero `VolumeNet` sí.
  let seguir = true;
  while (seguir) {
    seguir = false;
    for (const calificativo of CALIFICATIVOS) {
      if (!normalizado.endsWith(calificativo)) continue;
      const sinCalificativo = normalizado.slice(0, -calificativo.length);
      if (sinCalificativo === "") continue;
      normalizado = sinCalificativo;
      seguir = true;
    }
  }

  for (const [sufijo, magnitud] of MAGNITUD_POR_SUFIJO) {
    if (normalizado.endsWith(sufijo)) return magnitud;
  }

  return null;
}

/**
 * Unidades base del SI para las magnitudes que un IFC casi nunca declara.
 *
 * **No es adivinar: es lo que dice el estándar.** IFC define que una magnitud sin unidad declarada
 * se expresa en la unidad base del SI. Los exportadores declaran longitud, área y volumen y callan
 * el resto, así que un `Weight` de un perfil de acero llega sin unidad aunque esté en kilos.
 *
 * **Longitud, área y volumen quedan deliberadamente fuera.** Ahí sí sería peligroso: un modelo en
 * milímetros que no declare su unidad se mostraría en metros, y eso es el error de tres órdenes de
 * magnitud que este proyecto se cuida de no cometer. Si el archivo no lo dice, no se dice.
 */
const BASE_SI: Partial<Record<QuantityKind, string>> = {
  mass: "kg",
  time: "s",
};

/** `true` si el símbolo de esa magnitud viene del archivo y no de la base del SI. */
function loDeclaraElArchivo(kind: QuantityKind, units: IfcUnits): boolean {
  if (kind === "count" || kind === "ratio") return false;
  return units[kind] !== null;
}

/** El símbolo que corresponde a una magnitud, o `null` si no se puede saber. */
export function unitSymbolFor(kind: QuantityKind, units: IfcUnits): string | null {
  // Un conteo y una razón no llevan unidad: no es que falte, es que no existe.
  if (kind === "count" || kind === "ratio") return null;
  return units[kind] ?? BASE_SI[kind] ?? null;
}

/** El símbolo de una propiedad, y de dónde salió. */
export interface ResolvedUnit {
  readonly symbol: string;
  /**
   * `true` cuando el símbolo se deduce del nombre porque el archivo no declara el tipo.
   *
   * La interfaz lo muestra atenuado: es una ayuda para leer, no un dato del modelo.
   */
  readonly inferred: boolean;
}

/**
 * El símbolo que le corresponde a una propiedad, o `null` si no corresponde ninguno.
 *
 * `null` cubre tres casos distintos que para quien mira son el mismo —no aparece unidad— y que
 * conviene no confundir al depurar: el valor no es una medida, el nombre no permite deducir la
 * magnitud, o el modelo no declaró esa unidad.
 */
export function resolveUnitSymbol({
  ifcType,
  name,
  units,
}: {
  readonly ifcType?: string | null | undefined;
  readonly name: string;
  readonly units: IfcUnits;
}): ResolvedUnit | null {
  if (ifcType !== null && ifcType !== undefined && ifcType !== "") {
    const declarada = quantityKindFromIfcType(ifcType);
    if (declarada !== null) {
      const simbolo = unitSymbolFor(declarada, units);
      if (simbolo === null) return null;
      // Un símbolo que sale de la base del SI y no del archivo se marca como deducido: el estándar
      // lo respalda, pero el archivo no lo dijo, y esa diferencia se muestra.
      return { symbol: simbolo, inferred: !loDeclaraElArchivo(declarada, units) };
    }
    if (isDimensionlessIfcType(ifcType)) return null;
  }

  const deducida = quantityKindFromName(name);
  if (deducida === null) return null;

  const simbolo = unitSymbolFor(deducida, units);
  return simbolo === null ? null : { symbol: simbolo, inferred: true };
}
