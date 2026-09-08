/**
 * Qué se estaba viendo cuando se abrió la observación: `F4.7`.
 *
 * **Es la mitad del punto de vista que faltaba.** `F4.1` cerró la cámara —desde dónde se miraba— y
 * el BCF salía diciendo `DefaultVisibility="true"` con las excepciones vacías, o sea **el modelo
 * entero a la vista**. Cuando el hallazgo se encontró aislando una planta o apagando la disciplina
 * de arquitectura, eso no es un detalle que falte: es una afirmación falsa. Quien abre el archivo
 * en Solibri ve el edificio completo y el problema tapado por lo que precisamente se había apagado.
 *
 * ## Los dos lados de `Visibility`, y por qué hay que elegir
 *
 * BCF no guarda "lo que se ve": guarda un **valor por defecto y sus excepciones**.
 *
 * | `DefaultVisibility` | Qué significa                                              |
 * | ------------------- | --------------------------------------------------------- |
 * | `true`              | Se ve todo **menos** los componentes de `Exceptions`       |
 * | `false`             | No se ve nada **salvo** los componentes de `Exceptions`    |
 *
 * Los dos pueden describir la misma pantalla, y lo que cambia es **cuántos componentes hay que
 * escribir**. Apagando tres vigas de un modelo de veinte mil elementos, el lado `true` escribe tres
 * líneas y el lado `false` escribiría 19 997. Aislando una planta es al revés. Así que la regla es
 * escribir **el lado corto**, que además de producir un archivo manejable es lo que hace que el
 * viewpoint diga lo mismo con menos.
 *
 * ## Y hay un tope, porque un viewpoint enorme no lo abre nadie
 *
 * Con los dos lados por encima del tope no se escribe visibilidad: se vuelve al comportamiento de
 * antes —el modelo entero— y **eso es honesto**, porque un viewpoint que ningún visor termina de
 * leer no informa de nada. El caso solo aparece con medio modelo apagado a mano, que es raro; el
 * aislamiento, que es lo frecuente, deja el lado corto en unas decenas.
 *
 * El GUID de IFC es la identidad —regla de `AGENTS.md`— y por eso lo que sale de aquí son GUID y
 * nunca `localId`: los identificadores del motor cambian entre versiones del modelo y entre
 * herramientas, y un viewpoint que apunte a ellos queda huérfano en la siguiente exportación.
 */

import { isIfcGuid } from "../identity/ifcGuid.js";

/** La visibilidad de un viewpoint de BCF, con sus dos campos y nada más. */
export interface VisibilidadBcf {
  /** `DefaultVisibility`: `true` se ve todo menos las excepciones; `false`, al revés. */
  readonly porDefecto: boolean;
  /** Los GUID de las excepciones, sin repetidos y en orden estable. */
  readonly excepciones: readonly string[];
}

/** De qué lado se escriben las excepciones. */
export type LadoDeVisibilidad = "ocultos" | "visibles";

/**
 * Cuántas excepciones se aceptan en un viewpoint.
 *
 * **No es un límite del formato**: BCF no pone ninguno. Es el punto a partir del cual el archivo
 * deja de ser útil — cinco mil `<Component>` ya son más de cien kilobytes de XML por observación, y
 * un BCF con treinta temas así empieza a pesar más que el modelo del que habla.
 *
 * Cubre de sobra lo que se hace en la práctica: aislar deja el lado corto en unas decenas, y apagar
 * una disciplina de un modelo federado, en unos miles. Lo que deja fuera es medio modelo apagado a
 * mano, que es raro y para el que callarse es mejor que escribir un archivo que nadie abre.
 *
 * **El mismo número está en `services/api/apps/documents/visibilidad.py`**, que es quien lo hace
 * cumplir de verdad: lo que llega al servidor lo escribe cualquiera.
 */
export const MAXIMO_EXCEPCIONES = 5_000;

/**
 * Qué lado sale más corto, o `null` si no hay nada que decir o no cabe.
 *
 * Recibe **cuentas y no listas** a propósito: resolver un GUID por elemento cuesta una consulta al
 * modelo, y con esto quien llama resuelve **solo el lado que va a escribir**. En un modelo grande
 * con tres elementos apagados, la diferencia es tres búsquedas contra veinte mil.
 *
 * Devuelve `null` en dos casos, y ninguno es un error:
 *
 * 1. **No hay nada oculto**: no hay ninguna restricción que afirmar.
 * 2. **Los dos lados pasan del tope**: ver el docstring del módulo.
 */
export function ladoDeVisibilidad(ocultos: number, visibles: number): LadoDeVisibilidad | null {
  if (!Number.isFinite(ocultos) || !Number.isFinite(visibles)) return null;
  if (ocultos <= 0) return null;

  // Empatados se elige `ocultos`, que deja `DefaultVisibility="true"` — el valor que ya escribía el
  // exportador y el que cualquier lector interpreta sin sorpresas.
  const lado: LadoDeVisibilidad = ocultos <= visibles ? "ocultos" : "visibles";
  const cuantos = lado === "ocultos" ? ocultos : visibles;
  return cuantos > MAXIMO_EXCEPCIONES ? null : lado;
}

/**
 * La visibilidad lista para el viewpoint, o `null` si lo que llegó no sirve.
 *
 * **Filtra los GUID que no lo son y quita los repetidos.** Lo primero porque un elemento sin GUID
 * válido no se puede nombrar en un BCF —el atributo `IfcGuid` tiene una forma, y escribir cualquier
 * cosa produce un archivo que el otro extremo ignora o rechaza—; lo segundo porque dos modelos
 * abiertos pueden traer el mismo elemento y la lista se duplicaría sin decir nada nuevo.
 *
 * Devuelve `null` cuando no queda ninguna excepción utilizable: con el lado `ocultos` eso significa
 * que no hay nada que ocultar, y con el lado `visibles` significaría **un viewpoint que apaga el
 * modelo entero**, que es lo peor que se puede escribir — se prefiere no decir nada.
 */
export function visibilidadBcf(
  lado: LadoDeVisibilidad,
  guids: readonly (string | null | undefined)[],
): VisibilidadBcf | null {
  const limpios: string[] = [];
  const vistos = new Set<string>();
  for (const guid of guids) {
    if (typeof guid !== "string" || !isIfcGuid(guid) || vistos.has(guid)) continue;
    vistos.add(guid);
    limpios.push(guid);
  }

  if (limpios.length === 0 || limpios.length > MAXIMO_EXCEPCIONES) return null;
  return { porDefecto: lado === "ocultos", excepciones: limpios };
}

/**
 * `true` si este GUID se ve, según la visibilidad guardada.
 *
 * Es la lectura del mismo dato en el otro sentido, y la necesita el visor para **volver a dejar la
 * pantalla como estaba** al abrir la observación. Vive acá y no en el visor porque la regla —qué
 * significa cada lado de `DefaultVisibility`— es la misma que se usó para escribirlo, y tenerla dos
 * veces es la forma segura de que las dos se separen.
 */
export function seVe(visibilidad: VisibilidadBcf, guid: string): boolean {
  const esExcepcion = visibilidad.excepciones.includes(guid);
  return esExcepcion ? !visibilidad.porDefecto : visibilidad.porDefecto;
}
