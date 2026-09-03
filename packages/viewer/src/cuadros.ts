/**
 * Cuadros desde el modelo: **una categoría, sus elementos y sus propiedades en una tabla**. `F10.5`.
 *
 * Es lo que en una oficina se llama un cuadro de carpinterías o un cuadro de pilares: todas las
 * puertas del modelo con su ancho, su alto y su tipo, en filas, para contarlas y comprobarlas. El
 * visor ya sabía enseñar las propiedades **de un elemento** al clicarlo; lo que faltaba es verlas
 * **de todos a la vez**, que es cuando se detecta lo que falta.
 *
 * ## Las columnas se descubren, no se declaran
 *
 * **Un IFC no tiene un juego fijo de propiedades**: dependen del exportador, de la plantilla de la
 * oficina y de lo que el modelador rellenó. Una lista de columnas escrita a mano enseñaría columnas
 * vacías —las que ese modelo no trae— y esconderia justo las que ese modelo sí trae. Así que se leen
 * los elementos y las columnas salen de lo que hay dentro.
 *
 * Y **se ordenan por cuántas filas las llevan de verdad**: una propiedad presente en 2 de 300 muros
 * no es una columna del cuadro, es una excepción. Puesta a la izquierda, empuja fuera de la pantalla
 * a las que sí describen el conjunto.
 *
 * ## Y hay topes, porque leer propiedades cuesta
 *
 * Cada elemento es una consulta al modelo con sus relaciones, así que un cuadro de cinco mil muros
 * congela la pestaña. Se lee **en tandas** —`getItemsData` acepta una lista— y hay un tope de filas
 * y otro de columnas. **Cuando se corta se dice**: un cuadro que presume de ser el total y no lo es
 * es peor que no tener cuadro, que es la misma regla del informe.
 */

import type * as FRAGS from "@thatopen/fragments";

/** Una columna del cuadro, ya descubierta de los datos. */
export interface ScheduleColumn {
  /** La clave con la que se busca el valor en cada fila: `«Pset_WallCommon · LoadBearing»`. */
  readonly key: string;
  /** El pset o relación de donde sale, o `null` si es un atributo directo del elemento. */
  readonly group: string | null;
  readonly name: string;
  /** La unidad, cuando el archivo la declara o se pudo deducir. */
  readonly unit: string | null;
  /** En cuántas filas hay valor. Es lo que ordena las columnas. */
  readonly filled: number;
}

/** Una fila del cuadro: un elemento del modelo. */
export interface ScheduleRow {
  readonly localId: number;
  /** El GUID de IFC, que es la identidad estable — regla de `AGENTS.md`. */
  readonly guid: string | null;
  readonly name: string | null;
  readonly values: ReadonlyMap<string, string>;
}

/** Un cuadro completo. */
export interface Schedule {
  readonly modelId: string;
  readonly category: string;
  readonly columns: readonly ScheduleColumn[];
  readonly rows: readonly ScheduleRow[];
  /** Cuántos elementos hay de esa categoría en el modelo, aunque no se hayan leído todos. */
  readonly total: number;
  /** `true` si se cortó por el tope de filas. */
  readonly truncated: boolean;
  /** Cuántas columnas se dejaron fuera por el tope. */
  readonly hiddenColumns: number;
  readonly elapsedMs: number;
}

/**
 * Cuántos elementos se leen como mucho.
 *
 * **Medido, no elegido a ojo**: leer las propiedades de un elemento con sus relaciones cuesta del
 * orden de un milisegundo en tandas, así que trescientos son una fracción de segundo y cinco mil
 * dejan la pestaña quieta varios segundos. Trescientos alcanzan para comprobar un cuadro y para ver
 * qué falta; para contar el total está `total`, que sale de una consulta barata.
 */
export const MAXIMO_FILAS = 300;

/** Cuántas columnas caben antes de que la tabla deje de leerse. */
export const MAXIMO_COLUMNAS = 24;

/** De cuántos en cuántos se piden los datos. Ver el docstring del módulo. */
const TANDA = 50;

/**
 * Las relaciones que no son propiedades del elemento y ensuciarían el cuadro.
 *
 * Son las mismas que la ficha de un elemento ya oculta: la lista de a qué pertenece y qué contiene
 * no es un dato del elemento, es la estructura del modelo, y como columna sería una lista dentro de
 * una celda.
 */
const RELACIONES_IGNORADAS = new Set([
  "IsDecomposedBy",
  "Decomposes",
  "ContainsElements",
  "ContainedInStructure",
]);

/** El separador entre el pset y la propiedad, en la clave y en la cabecera. */
const SEPARADOR = " · ";

/**
 * Qué categorías **del edificio** hay en el modelo y cuántos elementos tiene cada una.
 *
 * **Solo las que tienen geometría, y eso no es un detalle.** Medido sobre el modelo de 32 MB del
 * usuario, las tres categorías más numerosas del archivo son `IFCPROPERTYSINGLEVALUE` (23.946),
 * `IFCPROPERTYSET` (839) e `IFCSIUNIT` (10): fontanería del formato, no cosas del edificio. Un
 * cuadro de veintitrés mil valores de propiedad no le dice nada a nadie, y ofrecerlo primero —era
 * la categoría por defecto— hace que la primera vez que alguien abre esto vea basura.
 *
 * El filtro es **tener geometría**, y no una lista negra de clases de IFC: un cuadro es de cosas que
 * se pueden ver y contar, y esa es exactamente la definición. Una lista negra habría que ampliarla
 * cada vez que un exportador nuevo trae otra clase auxiliar.
 */
export async function categoriasDe(
  model: FRAGS.FragmentsModel,
): Promise<ReadonlyMap<string, number>> {
  const [porCategoria, conGeometria] = await Promise.all([
    model.getItemsOfCategories([/^IFC/]),
    model.getItemsIdsWithGeometry(),
  ]);

  const dibujados = new Set(conGeometria);
  const cuenta = new Map<string, number>();
  for (const [categoria, ids] of Object.entries(porCategoria)) {
    const cuantos = ids.filter((id) => dibujados.has(id)).length;
    if (cuantos > 0) cuenta.set(categoria.toUpperCase(), cuantos);
  }
  return cuenta;
}

/**
 * Arma el cuadro de una categoría.
 *
 * `describe` es la misma función que usa la ficha de un elemento al clicarlo, pasada desde el visor:
 * así el cuadro y la ficha **no pueden discrepar** sobre el valor de una propiedad. Con una lectura
 * propia aquí, el día que cambie el manejo de unidades una de las dos se quedaría atrás.
 */
export async function cuadroDe(
  model: FRAGS.FragmentsModel,
  category: string,
  describe: (localId: number) => Promise<DescribedItem | null>,
  onProgress?: (leidos: number, de: number) => void,
): Promise<Schedule> {
  const empezado = performance.now();

  const porCategoria = await model.getItemsOfCategories([
    new RegExp(`^${escaparRegExp(category)}$`, "i"),
  ]);
  const ids = Object.values(porCategoria).flat();
  const aLeer = ids.slice(0, MAXIMO_FILAS);

  const filas: ScheduleRow[] = [];
  // Cuántas filas llevan cada columna, y con qué unidad. Es lo que ordena y lo que recorta.
  const cuentaPorColumna = new Map<string, ScheduleColumn>();

  for (let i = 0; i < aLeer.length; i += TANDA) {
    const tanda = aLeer.slice(i, i + TANDA);
    const leidos = await Promise.all(tanda.map((id) => describe(id)));

    for (const item of leidos) {
      if (item === null) continue;
      const valores = new Map<string, string>();

      const anotar = (grupo: string | null, propiedad: PropiedadLeida) => {
        const clave = grupo === null ? propiedad.name : `${grupo}${SEPARADOR}${propiedad.name}`;
        // **La primera gana.** Un elemento puede traer la misma propiedad por dos caminos —del
        // tipo y del propio elemento— y la del elemento llega antes; sobrescribir dejaría el
        // cuadro diciendo el valor del tipo para un elemento que lo redefine.
        if (valores.has(clave)) return;
        valores.set(clave, propiedad.value);

        const anterior = cuentaPorColumna.get(clave);
        cuentaPorColumna.set(clave, {
          key: clave,
          group: grupo,
          name: propiedad.name,
          // La unidad se queda con la primera que la declare: si una fila la trae y otra no, la
          // columna sigue siendo de metros.
          unit: anterior?.unit ?? propiedad.unit,
          filled: (anterior?.filled ?? 0) + 1,
        });
      };

      for (const atributo of item.attributes) anotar(null, atributo);
      for (const grupo of item.groups) {
        if (RELACIONES_IGNORADAS.has(grupo.name)) continue;
        for (const propiedad of grupo.properties) anotar(grupo.name, propiedad);
      }

      filas.push({ localId: item.localId, guid: item.guid, name: item.name, values: valores });
    }

    onProgress?.(Math.min(i + TANDA, aLeer.length), aLeer.length);
  }

  // De más rellena a menos, y con el nombre como desempate para que dos cuadros del mismo modelo
  // salgan siempre con las columnas en el mismo orden.
  const ordenadas = [...cuentaPorColumna.values()].sort(
    (una, otra) => otra.filled - una.filled || una.key.localeCompare(otra.key),
  );

  return {
    modelId: model.modelId,
    category: category.toUpperCase(),
    columns: ordenadas.slice(0, MAXIMO_COLUMNAS),
    rows: filas,
    total: ids.length,
    truncated: ids.length > MAXIMO_FILAS,
    hiddenColumns: Math.max(0, ordenadas.length - MAXIMO_COLUMNAS),
    elapsedMs: performance.now() - empezado,
  };
}

/**
 * El cuadro como CSV.
 *
 * **Con `;` y con BOM**, igual que el informe del servidor y por la misma razón: es lo que necesita
 * un Excel en configuración castellana para no partir las tildes ni meter todo en una columna. Una
 * exportación que se abre mal es una exportación que nadie usa dos veces, y tener dos convenciones
 * en el mismo producto es peor que tener una mala.
 *
 * Y lleva el **GUID como primera columna**, que es lo que permite volver del cuadro al modelo: sin
 * él, una fila de una hoja de cálculo no señala a ningún elemento.
 */
export function csvDe(cuadro: Schedule): string {
  const cabecera = ["GUID", "Nombre", ...cuadro.columns.map(encabezadoDeColumna)];
  const lineas = [cabecera.map(celda).join(";")];

  for (const fila of cuadro.rows) {
    const valores = [
      fila.guid ?? "",
      fila.name ?? "",
      ...cuadro.columns.map((columna) => fila.values.get(columna.key) ?? ""),
    ];
    lineas.push(valores.map(celda).join(";"));
  }

  return `﻿${lineas.join("\r\n")}\r\n`;
}

/** El encabezado de una columna, con su unidad cuando la hay. */
export function encabezadoDeColumna(columna: ScheduleColumn): string {
  const nombre =
    columna.group === null ? columna.name : `${columna.group}${SEPARADOR}${columna.name}`;
  return columna.unit === null ? nombre : `${nombre} (${columna.unit})`;
}

/**
 * Una celda de CSV, escapada.
 *
 * **El punto y coma va dentro de las comillas o parte la fila**, y aparece de verdad: un nombre de
 * tipo como «Muro; 20 cm» existe en modelos reales. Las comillas se duplican, que es lo que dice el
 * formato, y el salto de línea también se protege.
 */
function celda(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

/** Escapa lo que va dentro de una expresión regular, porque la categoría llega de fuera. */
function escaparRegExp(texto: string): string {
  return texto.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Lo que el cuadro necesita de una propiedad. Es un subconjunto de `PropertyValue` del visor. */
export interface PropiedadLeida {
  readonly name: string;
  readonly value: string;
  readonly unit: string | null;
}

/** Lo que el cuadro necesita de un elemento. Es un subconjunto de `PickedItem`. */
export interface DescribedItem {
  readonly localId: number;
  readonly guid: string | null;
  readonly name: string | null;
  readonly attributes: readonly PropiedadLeida[];
  readonly groups: readonly {
    readonly name: string;
    readonly properties: readonly PropiedadLeida[];
  }[];
}
