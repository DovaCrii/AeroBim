/**
 * Las unidades que un IFC declara para sí mismo, leídas del propio archivo.
 *
 * **Por qué se lee el texto del IFC y no el modelo convertido.** Fragments aplica el factor
 * de longitud a la geometría —por eso las dimensiones del modelo salen en metros— y **no
 * conserva `IfcUnitAssignment`**. Sin esa declaración, los valores de los psets se muestran
 * como números pelados: un `Length 8070.861` no dice si son milímetros o metros, y la
 * diferencia es de tres órdenes de magnitud. Alguien va a pedir material con ese número.
 *
 * **Acá no se convierte nada.** Se devuelve el símbolo que el modelo declara, para mostrar el
 * valor tal como lo escribió el exportador junto a su unidad. Convertirlo sería reinterpretar
 * el dato, y la regla del proyecto es fidelidad al archivo: el visor muestra lo que el IFC
 * dice, no lo que el visor supone. La conversión a SI sigue viviendo en `length.ts`, que es
 * la que usa el dominio cuando necesita calcular.
 */

/** Magnitudes cuya unidad interesa mostrar. Las derivadas (densidad, kg/m) quedan fuera. */
export type IfcUnitKind = "length" | "area" | "volume" | "angle" | "mass" | "time";

/**
 * Símbolo declarado para cada magnitud, o `null` cuando el modelo no la declara.
 *
 * `null` es información, no un hueco: significa "el archivo no lo dice", y en ese caso el
 * visor no inventa una unidad. Es habitual que un IFC declare longitud, área y volumen y
 * calle el resto.
 */
export type IfcUnits = Readonly<Record<IfcUnitKind, string | null>>;

/** Un IFC del que todavía no se leyó nada, o que no declara ninguna unidad. */
export const NO_IFC_UNITS: IfcUnits = {
  length: null,
  area: null,
  volume: null,
  angle: null,
  mass: null,
  time: null,
};

/** `IfcUnitEnum` → la magnitud que representa. Los tipos que no están no se muestran. */
const MAGNITUDES: Record<string, IfcUnitKind> = {
  LENGTHUNIT: "length",
  AREAUNIT: "area",
  VOLUMEUNIT: "volume",
  PLANEANGLEUNIT: "angle",
  MASSUNIT: "mass",
  TIMEUNIT: "time",
};

/** Nombre de `IfcSIUnitName` → símbolo. */
const SIMBOLOS_SI: Record<string, string> = {
  METRE: "m",
  SQUARE_METRE: "m²",
  CUBIC_METRE: "m³",
  RADIAN: "rad",
  STERADIAN: "sr",
  GRAM: "g",
  SECOND: "s",
  NEWTON: "N",
  PASCAL: "Pa",
  JOULE: "J",
  WATT: "W",
  DEGREE_CELSIUS: "°C",
  KELVIN: "K",
};

/** `IfcSIPrefix` → su símbolo. `MICRO` va con la letra griega, que es la correcta. */
const SIMBOLOS_PREFIJO: Record<string, string> = {
  EXA: "E",
  PETA: "P",
  TERA: "T",
  GIGA: "G",
  MEGA: "M",
  KILO: "k",
  HECTO: "h",
  DECA: "da",
  DECI: "d",
  CENTI: "c",
  MILLI: "m",
  MICRO: "µ",
  NANO: "n",
  PICO: "p",
  FEMTO: "f",
  ATTO: "a",
};

/**
 * Símbolo de las unidades que llegan como `IfcConversionBasedUnit`.
 *
 * Son las imperiales y el grado sexagesimal, que en IFC no es una unidad SI: se declara como
 * conversión sobre el radián. Un nombre que no esté en la tabla se muestra tal como viene —
 * es más honesto que dejarlo sin unidad, porque el archivo sí la declaró.
 */
const SIMBOLOS_CONVERSION: Record<string, string> = {
  DEGREE: "°",
  INCH: "in",
  FOOT: "ft",
  YARD: "yd",
  MILE: "mi",
  SQUARE_INCH: "in²",
  SQUARE_FOOT: "ft²",
  SQUARE_YARD: "yd²",
  ACRE: "ac",
  SQUARE_MILE: "mi²",
  CUBIC_INCH: "in³",
  CUBIC_FOOT: "ft³",
  CUBIC_YARD: "yd³",
  LITRE: "L",
  GALLON: "gal",
  POUND: "lb",
  OUNCE: "oz",
  TON_UK: "ton",
  TON_US: "ton",
  MINUTE: "min",
  HOUR: "h",
  DAY: "d",
};

/** Entidades de STEP que hacen falta para resolver las unidades, y ninguna más. */
const ENTIDADES_DE_INTERES = new Set([
  "IFCPROJECT",
  "IFCUNITASSIGNMENT",
  "IFCSIUNIT",
  "IFCCONVERSIONBASEDUNIT",
  "IFCCONVERSIONBASEDUNITWITHOFFSET",
]);

/** Una entidad de STEP ya troceada: `#20= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);` */
interface StepEntity {
  readonly id: number;
  readonly type: string;
  readonly args: readonly string[];
}

/**
 * Lee del texto STEP solo las entidades cuyo tipo esté en `tipos`.
 *
 * Filtrar por tipo no es una optimización cosmética: un IFC de obra tiene millones de
 * entidades y construir un mapa con todas para leer tres unidades es gastar cientos de
 * megabytes sin motivo.
 */
function leerEntidades(texto: string, tipos: ReadonlySet<string>): Map<number, StepEntity> {
  const entidades = new Map<number, StepEntity>();
  const cabecera = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g;

  let encontrado: RegExpExecArray | null;
  while ((encontrado = cabecera.exec(texto)) !== null) {
    const tipo = encontrado[2]!.toUpperCase();
    if (!tipos.has(tipo)) continue;

    const args = leerArgumentos(texto, cabecera.lastIndex - 1);
    if (args === null) continue;

    entidades.set(Number(encontrado[1]), { id: Number(encontrado[1]), type: tipo, args });
  }

  return entidades;
}

/**
 * Trocea la lista de argumentos que empieza en el paréntesis de `desde`.
 *
 * Respeta paréntesis anidados —las listas de IFC van entre paréntesis— y comillas simples,
 * donde `''` es un apóstrofo escapado. Sin esa cuenta, un nombre con paréntesis o con una
 * coma partiría los argumentos donde no corresponde.
 */
function leerArgumentos(texto: string, desde: number): readonly string[] | null {
  const args: string[] = [];
  let profundidad = 0;
  let enTexto = false;
  let inicio = desde + 1;

  for (let i = desde; i < texto.length; i += 1) {
    const caracter = texto[i]!;

    if (enTexto) {
      if (caracter !== "'") continue;
      // Dos comillas seguidas son un apóstrofo dentro del texto, no el cierre.
      if (texto[i + 1] === "'") i += 1;
      else enTexto = false;
      continue;
    }

    if (caracter === "'") {
      enTexto = true;
    } else if (caracter === "(") {
      profundidad += 1;
      if (profundidad === 1) inicio = i + 1;
    } else if (caracter === ")") {
      profundidad -= 1;
      if (profundidad === 0) {
        args.push(texto.slice(inicio, i).trim());
        return args;
      }
    } else if (caracter === "," && profundidad === 1) {
      args.push(texto.slice(inicio, i).trim());
      inicio = i + 1;
    }
  }

  // Entidad truncada: el archivo se cortó a mitad. Mejor no devolver argumentos a medias.
  return null;
}

/** Quita los puntos de un enumerado de STEP: `.LENGTHUNIT.` → `LENGTHUNIT`. */
function enumerado(arg: string | undefined): string | null {
  if (arg === undefined) return null;
  const limpio = arg.trim();
  if (!limpio.startsWith(".") || !limpio.endsWith(".") || limpio.length < 3) return null;
  return limpio.slice(1, -1).toUpperCase();
}

/** Quita las comillas de un texto de STEP: `'INCH'` → `INCH`. */
function textoDeStep(arg: string | undefined): string | null {
  if (arg === undefined) return null;
  const limpio = arg.trim();
  if (!limpio.startsWith("'") || !limpio.endsWith("'") || limpio.length < 2) return null;
  return limpio.slice(1, -1).replaceAll("''", "'");
}

/** Referencias `#12` de una lista de argumentos, en orden. */
function referencias(arg: string | undefined): readonly number[] {
  if (arg === undefined) return [];
  return [...arg.matchAll(/#(\d+)/g)].map((encontrado) => Number(encontrado[1]));
}

/** Magnitud y símbolo de una entidad de unidad, o `null` si no es una que se muestre. */
function unidadDe(entidad: StepEntity): { kind: IfcUnitKind; symbol: string } | null {
  const magnitud = MAGNITUDES[enumerado(entidad.args[1]) ?? ""];
  if (magnitud === undefined) return null;

  if (entidad.type === "IFCSIUNIT") {
    const nombre = enumerado(entidad.args[3]);
    const base = nombre === null ? undefined : SIMBOLOS_SI[nombre];
    if (base === undefined) return null;

    const prefijo = enumerado(entidad.args[2]);
    // El prefijo se antepone tal cual: en IFC un `MILLI` sobre `SQUARE_METRE` significa
    // milímetro cuadrado, y "mm²" es como se escribe.
    const simbolo = prefijo === null ? base : `${SIMBOLOS_PREFIJO[prefijo] ?? ""}${base}`;
    return { kind: magnitud, symbol: simbolo };
  }

  // `IfcConversionBasedUnit`: el nombre viene como texto y es la fuente del símbolo.
  const nombre = textoDeStep(entidad.args[2]);
  if (nombre === null || nombre === "") return null;
  return { kind: magnitud, symbol: SIMBOLOS_CONVERSION[nombre.toUpperCase()] ?? nombre };
}

/**
 * Las unidades que declara un IFC, leídas de su `IfcUnitAssignment`.
 *
 * Se prefiere la asignación **a la que apunta `IfcProject`**, que es la que manda según el
 * estándar, y solo si no se encuentra se toma la primera del archivo. La diferencia aparece en
 * modelos federados por una herramienta que dejó asignaciones huérfanas de otro proyecto.
 *
 * Las magnitudes que el archivo no declara quedan en `null`: no se asume metros. Un IFC en
 * milímetros interpretado como metros no falla, sitúa un muro de 3 m a 3 km con toda
 * confianza — la misma razón por la que existe `length.ts`.
 */
export function parseIfcUnits(ifcText: string): IfcUnits {
  const entidades = leerEntidades(ifcText, ENTIDADES_DE_INTERES);

  const asignaciones = [...entidades.values()].filter((e) => e.type === "IFCUNITASSIGNMENT");
  if (asignaciones.length === 0) return NO_IFC_UNITS;

  const elegida = asignacionDelProyecto(entidades) ?? asignaciones[0]!;

  const simbolos: Record<IfcUnitKind, string | null> = { ...NO_IFC_UNITS };
  for (const id of referencias(elegida.args[0])) {
    const referida = entidades.get(id);
    if (referida === undefined) continue;

    const unidad = unidadDe(referida);
    // La primera declaración de cada magnitud gana. Un archivo que declara dos veces la
    // longitud ya está mal formado, y quedarse con la primera es determinista.
    if (unidad !== null && simbolos[unidad.kind] === null) simbolos[unidad.kind] = unidad.symbol;
  }

  return simbolos;
}

/** La asignación de unidades a la que apunta `IfcProject`, que es la que manda. */
function asignacionDelProyecto(entidades: Map<number, StepEntity>): StepEntity | null {
  for (const entidad of entidades.values()) {
    if (entidad.type !== "IFCPROJECT") continue;

    // `UnitsInContext` es el último argumento de `IfcProject`, en IFC2X3 y en IFC4.
    const ultimo = entidad.args[entidad.args.length - 1];
    const [id] = referencias(ultimo);
    if (id === undefined) continue;

    const referida = entidades.get(id);
    if (referida?.type === "IFCUNITASSIGNMENT") return referida;
  }

  return null;
}
