/**
 * Los temas de coordinación de una obra, y cómo se filtran, se buscan y se ordenan (2026-10-05).
 *
 * Es **lógica pura**, sin React ni DOM, y existe aparte por dos motivos. El primero es que la usan **dos
 * vistas de los mismos datos** —la lista del panel «Coordinación» y la tabla acoplada abajo— y cada
 * una con su copia de «qué es nuevo» o «qué es mío» acabaría discrepando de la otra. El segundo es que
 * ordenar con **los vencimientos vacíos al final** y buscar sin que las tildes estorben son reglas con
 * respuesta calculable, y se prueban mejor sin una pantalla.
 *
 * Un «tema» es lo que el registro llama observación anclada al modelo: lleva el **GUID** del elemento
 * —su identidad, nunca un `expressID`— y, si se guardó, la cámara desde la que se vio.
 */

import type { BcfCamera, VisibilidadBcf } from "@aerobim/bim-core";

/** Una observación anclada al modelo, tal como la manda el registro. */
export interface ObservacionDelModelo {
  readonly id: string;
  readonly titulo: string;
  readonly guid: string;
  readonly prioridad: string;
  readonly prioridadTexto: string;
  readonly estadoTexto: string;
  readonly responsable: string;
  readonly vence: string | null;
  readonly vencida: boolean;
  readonly camara: BcfCamera | null;
  /**
   * Qué se veía cuando se anotó, o `null` si no se guardó ninguna restricción.
   *
   * **La cámara sola no basta**: un hallazgo encontrado aislando una planta no se entiende con el
   * edificio entero encima, aunque se mire desde el mismo sitio.
   */
  readonly visibilidad: VisibilidadBcf | null;
  /**
   * `true` si la abrió una corrida de interferencias y no una persona.
   *
   * **No es un detalle de adorno**: una corrida sobre dos disciplinas reales abre decenas y las
   * mezcla con las pocas que escribió alguien. Sin poder separarlas, la nota que un revisor
   * redactó a mano se pierde entre el resultado de una máquina.
   */
  readonly esInterferencia: boolean;
  /** El otro elemento de la pareja, cuando es una interferencia. */
  readonly contra: string | null;
  /** `true` si está a nombre de quien mira. Es lo primero que se filtra en una lista larga. */
  readonly esMia: boolean;
  /**
   * `true` si apareció desde la última vez que **esta persona** miró esta obra.
   *
   * **Es la pregunta que ningún otro filtro contesta.** «Mías», «Choques» y «Notas» separan de
   * quién es y de dónde viene cada hallazgo; ninguno dice qué cambió.
   */
  readonly esNueva: boolean;
  readonly url: string;
}

/** Qué se está mirando de la lista. */
export type Filtro = "todas" | "nuevas" | "mias" | "interferencias" | "notas";

export const FILTROS: readonly { readonly cual: Filtro; readonly texto: string }[] = [
  { cual: "todas", texto: "Todas" },
  // **«Nuevas» va justo después de «Todas»**, y antes que «Mías»: al abrir la lista después de una
  // corrida, «qué cambió» es la primera pregunta, y repartir viene después de saber qué hay.
  { cual: "nuevas", texto: "Nuevas" },
  { cual: "mias", texto: "Mías" },
  { cual: "interferencias", texto: "Choques" },
  { cual: "notas", texto: "Notas" },
];

export function pasa(observacion: ObservacionDelModelo, filtro: Filtro): boolean {
  if (filtro === "nuevas") return observacion.esNueva;
  if (filtro === "mias") return observacion.esMia;
  if (filtro === "interferencias") return observacion.esInterferencia;
  if (filtro === "notas") return !observacion.esInterferencia;
  return true;
}

/** Las columnas por las que se puede ordenar la tabla. */
export type Columna = "prioridad" | "titulo" | "tipo" | "estado" | "responsable" | "vence";

export type Sentido = "asc" | "desc";

/** Texto sin tildes ni mayúsculas, para comparar y buscar. «Mías» y «mias» son la misma palabra. */
export function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Los temas que contienen **todas** las palabras buscadas, en cualquiera de sus campos de lectura.
 *
 * Se busca por palabras y no por frase: «muro conducto» encuentra «Muro cortina × Conducto de
 * extracción» aunque no estén seguidas, que es como se escribe una búsqueda a medias. Una búsqueda
 * vacía devuelve todo. El GUID entra en el texto buscable, porque es lo que alguien pega desde otra
 * herramienta para encontrar el tema de un elemento.
 */
export function buscar(
  observaciones: readonly ObservacionDelModelo[],
  texto: string,
): readonly ObservacionDelModelo[] {
  const palabras = plano(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return observaciones;
  return observaciones.filter((una) => {
    const pajar = plano(
      [
        una.titulo,
        una.responsable,
        una.estadoTexto,
        una.prioridadTexto,
        una.guid,
        una.contra ?? "",
      ].join(" "),
    );
    return palabras.every((palabra) => pajar.includes(palabra));
  });
}

/** El orden de la prioridad: lo urgente primero. Una prioridad desconocida va detrás de todas. */
const PESO_DE_PRIORIDAD: Readonly<Record<string, number>> = { alta: 0, media: 1, baja: 2 };

function comparar(a: ObservacionDelModelo, b: ObservacionDelModelo, columna: Columna): number {
  switch (columna) {
    case "prioridad":
      return (PESO_DE_PRIORIDAD[a.prioridad] ?? 9) - (PESO_DE_PRIORIDAD[b.prioridad] ?? 9);
    case "titulo":
      return a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base", numeric: true });
    case "tipo":
      return Number(a.esInterferencia) - Number(b.esInterferencia);
    case "estado":
      return a.estadoTexto.localeCompare(b.estadoTexto, "es", { sensitivity: "base" });
    case "responsable":
      return a.responsable.localeCompare(b.responsable, "es", { sensitivity: "base" });
    case "vence":
      // Las fechas llegan como `AAAA-MM-DD`, que ordena igual como texto que como fecha.
      return (a.vence ?? "").localeCompare(b.vence ?? "");
  }
}

/**
 * Ordena por una columna, **sin tocar la lista que recibe**.
 *
 * Dos reglas que no son obvias:
 * - **Sin vencimiento, siempre al final**, en los dos sentidos. Es la misma regla del servidor
 *   (`nulos_al_final`): un tema sin fecha no es el más urgente ni el menos, es el que nadie fechó, y
 *   subirlo arriba al invertir el orden esconde justo los que sí tienen plazo.
 * - **El empate se rompe por el título** para que el orden sea estable: dos filas iguales en la
 *   columna elegida no saltan de sitio al repintar.
 */
export function ordenar(
  observaciones: readonly ObservacionDelModelo[],
  columna: Columna,
  sentido: Sentido,
): ObservacionDelModelo[] {
  const signo = sentido === "asc" ? 1 : -1;
  return [...observaciones].sort((a, b) => {
    if (columna === "vence") {
      if (a.vence === null && b.vence !== null) return 1;
      if (a.vence !== null && b.vence === null) return -1;
    }
    const orden = comparar(a, b, columna) * signo;
    if (orden !== 0) return orden;
    return a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base", numeric: true });
  });
}

/** El orden con el que se abre la tabla: lo urgente y lo vencido arriba. */
export const ORDEN_INICIAL: { readonly columna: Columna; readonly sentido: Sentido } = {
  columna: "prioridad",
  sentido: "asc",
};
