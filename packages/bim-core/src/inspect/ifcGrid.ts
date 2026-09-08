/**
 * Los ejes de replanteo del modelo, leídos del propio archivo IFC.
 *
 * **Por qué se leen a mano y no salen del conversor.** El conversor a Fragments trata el `IfcGrid`
 * como un producto sin geometría: aparece en el árbol y no se dibuja. Pero los ejes son la
 * referencia con la que se habla en obra —"el pilar del eje C con el 4"— y, para lo que hace este
 * visor, son además **el mejor par de puntos para calzar un plano CAD sobre el modelo**: el DXF
 * trae su capa de ejes y el IFC los suyos, y los dos apuntan al mismo sitio del edificio.
 *
 * Se lee el subconjunto que aparece en los archivos reales: un `IfcGrid` con sus ejes en U y en V,
 * cada uno con una polilínea de dos puntos. Lo que no encaje se cuenta y se informa, igual que en
 * `ifcClasses`: un eje que falta en silencio es peor que un aviso.
 */

import { metersPerUnit, parseLengthUnit } from "../units/length.js";

/** Un eje de replanteo: su letra o número, y por dónde pasa. */
export interface IfcGridAxis {
  /** Lo que dice la burbuja del eje: `A`, `B`, `1`, `2`… */
  readonly label: string;
  /** En qué dirección va: los `U` suelen ser una familia y los `V` la perpendicular. */
  readonly direction: "u" | "v" | "w";
  /** El trazado, en **metros** y en coordenadas del modelo (XY, con Z arriba). */
  readonly points: readonly (readonly [number, number])[];
}

/** Lo que trae el archivo en materia de ejes. */
export interface IfcGrids {
  readonly axes: readonly IfcGridAxis[];
  /** Cuántos ejes se declararon y no se pudieron trazar, por el motivo que sea. */
  readonly skipped: number;
}

/** Nada: el archivo no declara ejes, o no se pudo leer ninguno. */
export const NO_GRIDS: IfcGrids = { axes: [], skipped: 0 };

/**
 * Lee los ejes de replanteo de un IFC en texto.
 *
 * **No es un lector de IFC y no pretende serlo**: indexa las entidades por su identificador y sigue
 * las pocas referencias que llevan de un `IfcGrid` a sus coordenadas. Es la misma apuesta que hace
 * el conteo de clases —trabajar sobre el texto, sin esquema— y por el mismo motivo: la información
 * que hace falta es poca y bien localizada.
 *
 * Las coordenadas salen en metros, aplicando el factor de unidades del propio archivo.
 */
export function parseIfcGrids(text: string): IfcGrids {
  const entidades = indexar(text);
  const factor = factorDeLongitud(text);

  const axes: IfcGridAxis[] = [];
  let skipped = 0;

  for (const [, entidad] of entidades) {
    if (entidad.tipo !== "IFCGRID") continue;

    const campos = separar(entidad.args);
    // `IfcGrid(guid, dueño, nombre, descripción, tipo, colocación, representación, U, V, W, …)`:
    // las tres listas de ejes son los campos 7, 8 y 9.
    const familias = [
      { direction: "u" as const, lista: campos[7] },
      { direction: "v" as const, lista: campos[8] },
      { direction: "w" as const, lista: campos[9] },
    ];
    const origen = colocacionDe(entidades, campos[5]);

    for (const { direction, lista } of familias) {
      for (const referencia of referenciasDe(lista ?? "")) {
        const eje = leerEje(entidades, referencia, direction, factor, origen);
        if (eje === null) skipped++;
        else axes.push(eje);
      }
    }
  }

  return { axes, skipped };
}

/**
 * Cuántos metros mide la unidad de longitud del archivo.
 *
 * Las coordenadas de los ejes vienen en las unidades del IFC —en el modelo real del usuario, en
 * milímetros— y la escena trabaja en metros. Se lee del `IFCSIUNIT` de longitud; si el archivo no
 * lo declara o usa una unidad convertida, se dejan tal cual, que es mejor que multiplicar por un
 * factor inventado.
 */
function factorDeLongitud(text: string): number {
  const declaracion =
    /IFCSIUNIT\s*\(\s*[^,]*,\s*\.LENGTHUNIT\.\s*,\s*([^,]*),\s*\.([A-Z_]+)\.\s*\)/i.exec(text);
  if (declaracion === null) return 1;

  const prefijo = (declaracion[1] ?? "").replace(/[.$\s]/g, "");
  const unidad = parseLengthUnit(declaracion[2] ?? "", prefijo === "" ? null : prefijo);
  return unidad === null ? 1 : metersPerUnit(unidad);
}

/** Una entidad del archivo, tal cual: su tipo y el texto de sus argumentos. */
interface Entidad {
  readonly tipo: string;
  readonly args: string;
}

/**
 * Indexa el archivo por identificador.
 *
 * Una sola pasada con una expresión regular sobre el texto. En un IFC de veinte megas son unos
 * cientos de miles de entradas y unas decenas de milisegundos: es lo mismo que ya cuesta contar las
 * clases, y evita tener que arrastrar un lector de STEP completo al dominio.
 */
function indexar(text: string): ReadonlyMap<number, Entidad> {
  const entidades = new Map<number, Entidad>();
  const expresion = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/g;

  let encontrado: RegExpExecArray | null;
  while ((encontrado = expresion.exec(text)) !== null) {
    entidades.set(Number(encontrado[1]), {
      tipo: encontrado[2]!.toUpperCase(),
      args: encontrado[3]!,
    });
  }
  return entidades;
}

/**
 * Parte los argumentos de una entidad por sus comas de primer nivel.
 *
 * Las comas de dentro de una lista o de un texto no separan campos: `(#10,#11)` es **un** campo, y
 * partir por todas las comas descoloca el resto de la fila.
 */
function separar(args: string): readonly string[] {
  const campos: string[] = [];
  let actual = "";
  let profundidad = 0;
  let enTexto = false;

  for (const caracter of args) {
    if (caracter === "'") enTexto = !enTexto;
    if (!enTexto) {
      if (caracter === "(") profundidad++;
      if (caracter === ")") profundidad--;
      if (caracter === "," && profundidad === 0) {
        campos.push(actual.trim());
        actual = "";
        continue;
      }
    }
    actual += caracter;
  }
  campos.push(actual.trim());
  return campos;
}

/** Los identificadores que hay en un campo, en orden. */
function referenciasDe(campo: string): readonly number[] {
  return [...campo.matchAll(/#(\d+)/g)].map((encontrado) => Number(encontrado[1]));
}

/** El primer identificador de un campo, o `null` si no hay ninguno. */
function referenciaDe(campo: string | undefined): number | null {
  return campo === undefined ? null : (referenciasDe(campo)[0] ?? null);
}

/** Los números que hay en un campo, en orden. */
function numerosDe(campo: string): readonly number[] {
  return [...campo.matchAll(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g)]
    .map((encontrado) => Number(encontrado[0]))
    .filter((numero) => Number.isFinite(numero));
}

/** Dónde está puesta la rejilla: desplazamiento y giro, acumulando la cadena de colocaciones. */
interface Colocacion {
  readonly x: number;
  readonly y: number;
  /** Giro alrededor de la vertical, en radianes. */
  readonly giro: number;
}

const SIN_COLOCACION: Colocacion = { x: 0, y: 0, giro: 0 };

/**
 * Resuelve un `IfcLocalPlacement` hasta el origen del proyecto.
 *
 * **Solo desplazamiento y giro en planta**, que es lo que tiene una rejilla: sube por la cadena de
 * colocaciones relativas sumando. Una rejilla inclinada respecto al suelo no existe en la práctica,
 * y resolver el caso general exigiría matrices completas para nada.
 */
function colocacionDe(
  entidades: ReadonlyMap<number, Entidad>,
  campo: string | undefined,
  profundidad = 0,
): Colocacion {
  const id = referenciaDe(campo);
  if (id === null || profundidad > 10) return SIN_COLOCACION;

  const entidad = entidades.get(id);
  if (entidad === undefined || entidad.tipo !== "IFCLOCALPLACEMENT") return SIN_COLOCACION;

  const campos = separar(entidad.args);
  const padre = colocacionDe(entidades, campos[0], profundidad + 1);

  const ejes = entidades.get(referenciaDe(campos[1]) ?? -1);
  if (ejes === undefined || !ejes.tipo.startsWith("IFCAXIS2PLACEMENT")) return padre;

  const camposEjes = separar(ejes.args);
  const punto = entidades.get(referenciaDe(camposEjes[0]) ?? -1);
  const coordenadas = punto === undefined ? [] : numerosDe(punto.args);

  // La dirección de referencia es el campo 2 en 3D y el 1 en 2D; sin ella, sin giro.
  const direccion = entidades.get(referenciaDe(camposEjes[2] ?? camposEjes[1]) ?? -1);
  const componentes = direccion === undefined ? [] : numerosDe(direccion.args);
  const giro = componentes.length >= 2 ? Math.atan2(componentes[1] ?? 0, componentes[0] ?? 1) : 0;

  const local = { x: coordenadas[0] ?? 0, y: coordenadas[1] ?? 0 };
  const cos = Math.cos(padre.giro);
  const sen = Math.sin(padre.giro);

  return {
    x: padre.x + local.x * cos - local.y * sen,
    y: padre.y + local.x * sen + local.y * cos,
    giro: padre.giro + giro,
  };
}

/** Lee un `IfcGridAxis` y devuelve su trazado ya en metros y en coordenadas del modelo. */
function leerEje(
  entidades: ReadonlyMap<number, Entidad>,
  id: number,
  direction: "u" | "v" | "w",
  factor: number,
  origen: Colocacion,
): IfcGridAxis | null {
  const entidad = entidades.get(id);
  if (entidad === undefined || entidad.tipo !== "IFCGRIDAXIS") return null;

  const campos = separar(entidad.args);
  const label = (campos[0] ?? "").replace(/'/g, "").trim();
  const curva = referenciaDe(campos[1]);
  if (curva === null) return null;

  const locales = puntosDeCurva(entidades, curva);
  if (locales.length < 2) return null;

  const cos = Math.cos(origen.giro);
  const sen = Math.sin(origen.giro);
  const points = locales.map(
    ([x, y]) =>
      [(origen.x + x * cos - y * sen) * factor, (origen.y + x * sen + y * cos) * factor] as const,
  );

  return { label: label === "" ? "?" : label, direction, points };
}

/**
 * Los puntos de la curva de un eje, en unidades del archivo.
 *
 * Se leen las dos formas que aparecen en los archivos reales: la polilínea indexada de IFC4 —que
 * guarda las coordenadas en una lista aparte— y la polilínea clásica de puntos cartesianos. Una
 * `IfcLine` se deja fuera a propósito: es una recta infinita con dirección y magnitud, y dibujarla
 * exigiría inventar hasta dónde llega.
 */
function puntosDeCurva(
  entidades: ReadonlyMap<number, Entidad>,
  id: number,
): readonly (readonly [number, number])[] {
  const entidad = entidades.get(id);
  if (entidad === undefined) return [];

  const campos = separar(entidad.args);

  if (entidad.tipo === "IFCINDEXEDPOLYCURVE") {
    const lista = entidades.get(referenciaDe(campos[0]) ?? -1);
    if (lista === undefined || !lista.tipo.startsWith("IFCCARTESIANPOINTLIST")) return [];

    const dimension = lista.tipo.endsWith("3D") ? 3 : 2;
    const numeros = numerosDe(lista.args);
    const puntos: (readonly [number, number])[] = [];
    for (let i = 0; i + 1 < numeros.length; i += dimension) {
      puntos.push([numeros[i]!, numeros[i + 1]!]);
    }
    return puntos;
  }

  if (entidad.tipo === "IFCPOLYLINE") {
    const puntos: (readonly [number, number])[] = [];
    for (const referencia of referenciasDe(campos[0] ?? "")) {
      const punto = entidades.get(referencia);
      if (punto === undefined || punto.tipo !== "IFCCARTESIANPOINT") continue;

      const coordenadas = numerosDe(punto.args);
      if (coordenadas.length >= 2) puntos.push([coordenadas[0]!, coordenadas[1]!]);
    }
    return puntos;
  }

  return [];
}
