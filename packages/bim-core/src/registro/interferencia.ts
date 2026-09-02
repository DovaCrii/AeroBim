/**
 * La identidad de una interferencia, que es lo que permite volver a correr la detección: `F5.5`.
 *
 * **Es la pieza que decide si la herramienta se usa o se abandona**, y el plan lo dice con esas
 * palabras: una detección cruda sobre dos disciplinas reales devuelve cientos de conflictos, la
 * mayoría irrelevantes. Si cada corrida vuelve a mostrar los mismos falsos positivos ya
 * descartados, nadie abre la herramienta una segunda vez.
 *
 * Para poder decir «este ya lo vi» hace falta que **el mismo conflicto tenga el mismo nombre en dos
 * corridas distintas**, y ahí está el problema real:
 *
 * - **El punto de choque no sirve como identidad.** `ifcclash` devuelve las coordenadas del
 *   contacto, y cambian con la malla, con la tolerancia y con la versión de la librería. Dos
 *   corridas seguidas sobre el mismo archivo pueden dar puntos distintos para el mismo cruce.
 * - **El orden de la pareja tampoco.** Comparar arquitectura contra estructura y estructura contra
 *   arquitectura da el mismo conflicto con los dos elementos al revés. Si el orden contara, la
 *   misma interferencia tendría dos identidades y aparecería dos veces.
 *
 * Lo que queda es **la pareja de GUID sin orden**, y encaja con la regla de la casa: el GUID de IFC
 * es la identidad, siempre — no un índice, no un `expressID`, no una posición.
 *
 * **Y por eso una interferencia se archiva como una observación más.** Con la pareja como identidad,
 * descartar una es dejar su observación en `descartada`, y la corrida siguiente la reconoce y no la
 * vuelve a abrir. `F5.5` sale de `F4.2` sin escribir una tabla nueva.
 */

import { isIfcGuid } from "../identity/ifcGuid.js";

/** Los dos elementos que se cruzan, tal como los devuelve la detección. */
export interface ParDeElementos {
  readonly guidA: string;
  readonly guidB: string;
}

/**
 * La identidad de una interferencia: los dos GUID ordenados y unidos por `·`.
 *
 * Se ordenan **alfabéticamente y no por disciplina**: la disciplina es del modelo y puede cambiar
 * de nombre, mientras que el orden de dos cadenas es el mismo hoy y en un año.
 *
 * Devuelve `null` cuando la pareja no sirve como identidad, y son dos casos que hay que distinguir
 * de un fallo: un GUID que no lo es —un elemento sin identidad no se puede volver a encontrar— y
 * **un elemento consigo mismo**, que no es una interferencia sino un modelo que trae el mismo
 * elemento dos veces.
 */
export function identidadDeInterferencia(par: ParDeElementos): string | null {
  const { guidA, guidB } = par;
  if (!isIfcGuid(guidA) || !isIfcGuid(guidB)) return null;
  if (guidA === guidB) return null;

  return guidA < guidB ? `${guidA}·${guidB}` : `${guidB}·${guidA}`;
}

/** `true` si las dos parejas son la misma interferencia, en cualquier orden. */
export function esLaMismaInterferencia(uno: ParDeElementos, otro: ParDeElementos): boolean {
  const a = identidadDeInterferencia(uno);
  const b = identidadDeInterferencia(otro);
  return a !== null && a === b;
}

/** Lo que se sabe de un elemento para poder nombrarlo en el título de una observación. */
export interface ElementoEnConflicto {
  readonly clase: string;
  readonly nombre: string;
}

/** Tope del título que acepta el registro. Más allá, el servidor lo recorta. */
const TITULO_MAXIMO = 250;

/**
 * El título de la observación que nace de una interferencia.
 *
 * **Tiene que decir qué choca con qué sin abrir nada**, porque una lista de treinta conflictos que
 * todos se llaman «Interferencia detectada» no se puede repartir ni priorizar. Se usa el nombre del
 * elemento cuando lo trae y su clase IFC cuando no: un modelo exportado sin nombres es corriente, y
 * «IfcMember» dice bastante más que nada.
 */
export function tituloDeInterferencia(a: ElementoEnConflicto, b: ElementoEnConflicto): string {
  const nombrar = (e: ElementoEnConflicto) => {
    const limpio = e.nombre.trim();
    return limpio !== "" ? limpio : e.clase.trim() || "Elemento";
  };
  return `${nombrar(a)} × ${nombrar(b)}`.slice(0, TITULO_MAXIMO);
}
