/**
 * Lógica pura de las láminas generadas: agruparlas, recorrerlas y rotular dónde se está.
 *
 * Un perfil con una transversal cada 0,1 m deja casi 200 láminas. Pintarlas una a una no sirve para
 * encontrar ninguna, así que las que salen del mismo perfil se tratan como **un grupo**. Esto vive
 * aparte de los componentes para poder probarse sin DOM.
 */

/** Lo mínimo que se necesita de una lámina para agruparla y recorrerla. */
export interface LaminaAgrupable {
  readonly id: string;
  readonly name: string;
  /** Identifica el perfil del que sale. Las láminas sueltas no lo traen. */
  readonly grupoId?: string | undefined;
}

export type EntradaDeLaminas<T extends LaminaAgrupable> =
  | { readonly tipo: "suelta"; readonly lamina: T }
  | {
      readonly tipo: "grupo";
      readonly grupoId: string;
      readonly nombre: string;
      readonly laminas: readonly T[];
    };

/**
 * Agrupa por `grupoId` conservando el orden de la primera aparición. Un grupo de una sola lámina
 * sigue siendo grupo —viene de un perfil—, y las láminas sin `grupoId` quedan sueltas.
 */
export function agruparLaminas<T extends LaminaAgrupable>(
  laminas: readonly T[],
): readonly EntradaDeLaminas<T>[] {
  const salida: EntradaDeLaminas<T>[] = [];
  const grupos = new Map<string, T[]>();
  for (const lamina of laminas) {
    if (lamina.grupoId === undefined) {
      salida.push({ tipo: "suelta", lamina });
      continue;
    }
    const existente = grupos.get(lamina.grupoId);
    if (existente !== undefined) {
      existente.push(lamina);
      continue;
    }
    const nuevo = [lamina];
    grupos.set(lamina.grupoId, nuevo);
    salida.push({ tipo: "grupo", grupoId: lamina.grupoId, nombre: "Perfil", laminas: nuevo });
  }
  return salida;
}

/** «Perfil — 193 láminas», con el singular cuando corresponde. */
export function tituloDeGrupo(nombre: string, cantidad: number): string {
  return `${nombre} — ${cantidad} ${cantidad === 1 ? "lámina" : "láminas"}`;
}

/** «12 de 193». El índice es el de la lámina (desde 0) y se rotula desde 1; vacío si no está. */
export function etiquetaDePosicion(indice: number, total: number): string {
  if (indice < 0 || indice >= total) return "";
  return `${indice + 1} de ${total}`;
}

/**
 * El id de la lámina vecina a `actual`, `delta` posiciones más allá. Con `circular` da la vuelta en los
 * extremos; sin él se queda en la última o la primera. `null` si `actual` no está o no hay láminas.
 */
export function laminaVecina(
  ids: readonly string[],
  actual: string,
  delta: number,
  circular: boolean,
): string | null {
  const indice = ids.indexOf(actual);
  if (indice < 0 || ids.length === 0) return null;
  const destino = indice + delta;
  const n = ids.length;
  const ajustado = circular ? ((destino % n) + n) % n : Math.min(Math.max(destino, 0), n - 1);
  return ids[ajustado] ?? null;
}

export type ClaseDeLamina = "longitudinal" | "transversal" | "otra";

/** A qué grupo del desplegable va una lámina, según el nombre con que la nombra el visor. */
export function claseDeLamina(nombre: string): ClaseDeLamina {
  if (nombre.startsWith("Perfil longitudinal")) return "longitudinal";
  if (nombre.startsWith("Transversal")) return "transversal";
  return "otra";
}

export const TITULO_DE_CLASE: Readonly<Record<ClaseDeLamina, string>> = {
  longitudinal: "Perfil longitudinal",
  transversal: "Transversales",
  otra: "Otras láminas",
};

/** Reparte las láminas en las clases del desplegable, sin dejar clases vacías y en orden fijo. */
export function porClase<T extends { readonly nombre: string }>(
  laminas: readonly T[],
): readonly { readonly clase: ClaseDeLamina; readonly laminas: readonly T[] }[] {
  const orden: ClaseDeLamina[] = ["longitudinal", "transversal", "otra"];
  return orden
    .map((clase) => ({ clase, laminas: laminas.filter((l) => claseDeLamina(l.nombre) === clase) }))
    .filter((g) => g.laminas.length > 0);
}
