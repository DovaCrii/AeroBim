/**
 * Buscar un elemento del modelo por lo que se sabe de él (`F15.6`): una parte de su nombre, su clase IFC o
 * su GUID. Es lo que se hace con el buscador de Synchro: escribir «viga eje C», «IFCWALL» o un GUID pegado
 * de un correo, y llegar al elemento sin recorrer el árbol.
 *
 * Es dominio puro —texto contra texto— para poder comprobarlo sin un modelo abierto. Qué se compara con qué
 * es lo que se puede hacer mal: un buscador que no encuentra «Pilar» porque el IFC dice «PILAR», o que no
 * entiende «á», es un buscador que la gente deja de usar.
 */

/** Lo que se sabe de un elemento y es buscable. El GUID es su identidad; el resto, para encontrarlo. */
export interface ElementoBuscable {
  readonly nombre: string | null;
  /** La clase IFC, como viene: `IFCWALL`, `IFCBEAM`… */
  readonly categoria: string;
  readonly guid: string | null;
}

/**
 * El texto sin mayúsculas, sin acentos y con los espacios colapsados: la forma en que se compara.
 * «Pilár  Central» y «pilar central» son lo mismo para quien busca.
 */
export function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Una consulta ya partida en términos. Vacía si no hay nada que buscar. */
export function terminosDe(consulta: string): readonly string[] {
  const limpia = normalizarParaBuscar(consulta);
  return limpia === "" ? [] : limpia.split(" ");
}

/**
 * Cuánto coincide un elemento con una consulta: `0` si no coincide, y más cuanto más claro es el acierto.
 *
 * **Todos los términos tienen que aparecer** —«viga eje» no encuentra una columna del eje C—, cada uno en
 * el nombre, la clase o el GUID. El orden de la puntuación es el de la intención de quien busca:
 *
 * 1. **El GUID exacto**, que es una identidad y no deja dudas.
 * 2. El nombre que **empieza** por lo escrito.
 * 3. El nombre que lo **contiene**.
 * 4. La clase que lo contiene (`wall` encuentra los `IFCWALL`).
 *
 * Sin términos no coincide nada: una caja vacía no debe devolver todo el modelo.
 */
export function puntajeDeElemento(terminos: readonly string[], elemento: ElementoBuscable): number {
  if (terminos.length === 0) return 0;

  const nombre = normalizarParaBuscar(elemento.nombre ?? "");
  const categoria = normalizarParaBuscar(elemento.categoria);
  const guid = normalizarParaBuscar(elemento.guid ?? "");

  let total = 0;
  for (const termino of terminos) {
    if (guid !== "" && guid === termino) total += 100;
    else if (nombre.startsWith(termino)) total += 50;
    else if (nombre.includes(termino)) total += 30;
    else if (categoria.includes(termino)) total += 10;
    // Un GUID pegado a medias: se acepta si es un trozo de verdad (6 o más), no tres letras sueltas.
    else if (termino.length >= 6 && guid.includes(termino)) total += 20;
    else return 0;
  }
  return total;
}

/**
 * Los elementos que coinciden, de más a menos claro y, a igual puntaje, por nombre. `max` corta la lista:
 * quien teclea «a» no quiere diez mil filas, quiere ver que tiene que escribir más.
 */
export function buscarElementos<T extends ElementoBuscable>(
  consulta: string,
  elementos: readonly T[],
  max = 200,
): { readonly resultados: readonly T[]; readonly total: number } {
  const terminos = terminosDe(consulta);
  const puntuados: { e: T; p: number }[] = [];
  for (const e of elementos) {
    const p = puntajeDeElemento(terminos, e);
    if (p > 0) puntuados.push({ e, p });
  }
  puntuados.sort((a, b) => b.p - a.p || (a.e.nombre ?? "").localeCompare(b.e.nombre ?? "", "es"));
  return { resultados: puntuados.slice(0, max).map((x) => x.e), total: puntuados.length };
}
