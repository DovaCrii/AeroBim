/**
 * Lo que decide el hilo de una observación en el visor, sin pantalla (`F15.4`): cuánto hace que se
 * escribió cada mensaje y qué se le dice a quien acaba de contestar sobre el aviso por correo.
 */

import { normalizarParaBuscar } from "@aerobim/bim-core";

import { fechaCorta } from "./observaciones-panel.js";

/** Un mensaje del hilo, tal como lo manda `HiloDeObservacionAPI`. */
export interface MensajeDelHilo {
  readonly id: string;
  readonly autor: string;
  readonly texto: string;
  /** ISO 8601. */
  readonly creada: string;
  /** `true` si lo escribió quien mira: sale a la derecha. */
  readonly esMio: boolean;
  /** Dirección de la imagen adjunta, o `null`. */
  readonly imagen: string | null;
}

export interface HiloCargado {
  readonly estado: string;
  readonly estadoTexto: string;
  readonly puedeComentar: boolean;
  /** A quién se puede mencionar con @: gente de la obra, sin quien mira. Vacío si no puede contestar. */
  readonly mencionables: readonly Mencionable[];
  readonly comentarios: readonly MensajeDelHilo[];
}

/**
 * «hace 4 h»: cuánto hace que se escribió un mensaje. `ahoraMs` entra por parámetro porque una función
 * que lee el reloj no se puede probar. Pasado un mes, la fecha corta: «hace 41 d» no se lee.
 */
export function haceCuanto(isoCreada: string, ahoraMs: number): string {
  const creadaMs = Date.parse(isoCreada);
  if (Number.isNaN(creadaMs)) return "";
  const minutos = Math.floor(Math.max(0, ahoraMs - creadaMs) / 60_000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} d`;
  return fechaCorta(isoCreada.slice(0, 10));
}

/**
 * Qué se le dice a quien acaba de contestar sobre el aviso, o `null` si no hay nada que decir.
 *
 * Los casos son distintos y la diferencia importa, porque quien escribe necesita saber si el otro se
 * enteró: `null` del servidor es que el aviso **falló** (el mensaje sí se guardó); `[]` que **no había a
 * quién avisar**; con nombres, que salió. Hay dos avisos —el del hilo, para el autor y el responsable, y el
 * de las menciones— y **solo se dice «no había a quién» si ninguno de los dos salió**: afirmarlo habiendo
 * avisado a un mencionado sería falso.
 */
export function avisoDeRespuesta(
  avisados: readonly string[] | null,
  avisadosPorMencion?: readonly string[] | null,
): string | null {
  if (avisadosPorMencion === null) {
    return "Tu respuesta se guardó, pero no se pudo avisar por correo a quien mencionaste.";
  }
  if (avisados === null)
    return "Tu respuesta se guardó, pero no se pudo enviar el aviso por correo.";
  if (avisados.length > 0 || (avisadosPorMencion?.length ?? 0) > 0) return null;
  return "Tu respuesta se guardó. No había a quién avisar por correo.";
}

/** Alguien a quien se puede mencionar. El `id` es lo que viaja; el nombre es lo que se escribe. */
export interface Mencionable {
  readonly id: number;
  readonly nombre: string;
}

/** La mención que se está escribiendo, justo antes del cursor. */
export interface MencionEnCurso {
  /** Dónde está la `@`, en el texto. */
  readonly inicio: number;
  /** Lo escrito después de la `@`, hasta el cursor. */
  readonly termino: string;
}

/**
 * ¿Se está escribiendo una mención? `@Mar` justo antes del cursor lo dice; `@Mar y` ya no (hay un espacio
 * de por medio: la mención acabó o nunca lo fue), y tampoco `correo@dominio`, donde la `@` no empieza una
 * palabra. Devuelve `null` si no.
 */
export function mencionEnCurso(texto: string, cursor: number): MencionEnCurso | null {
  const encontrada = /(^|\s)@([^\s@]*)$/.exec(texto.slice(0, cursor));
  if (encontrada === null) return null;
  return { inicio: encontrada.index + (encontrada[1] ?? "").length, termino: encontrada[2] ?? "" };
}

/**
 * A quién ofrecer mientras se escribe: los que **empiezan** por lo escrito primero y los que lo
 * **contienen** después, sin mayúsculas ni acentos. Con la `@` sola salen los primeros: es lo que
 * se espera al abrir la lista.
 */
export function sugerencias(
  gente: readonly Mencionable[],
  termino: string,
  max = 5,
): readonly Mencionable[] {
  const buscado = normalizarParaBuscar(termino);
  const empiezan: Mencionable[] = [];
  const contienen: Mencionable[] = [];
  for (const persona of gente) {
    const nombre = normalizarParaBuscar(persona.nombre);
    if (buscado === "" || nombre.startsWith(buscado)) empiezan.push(persona);
    else if (nombre.includes(buscado)) contienen.push(persona);
  }
  return [...empiezan, ...contienen].slice(0, max);
}

/** El texto con la mención ya elegida: reemplaza lo escrito desde la `@` hasta el cursor. */
export function insertarMencion(
  texto: string,
  cursor: number,
  enCurso: MencionEnCurso,
  nombre: string,
): { readonly texto: string; readonly cursor: number } {
  const insertado = `@${nombre} `;
  return {
    texto: texto.slice(0, enCurso.inicio) + insertado + texto.slice(cursor),
    cursor: enCurso.inicio + insertado.length,
  };
}

/**
 * Los ids de quienes **siguen mencionados** en el texto: elegir a alguien y luego borrar su `@nombre` lo
 * quita, y no se avisa a quien ya no está en el mensaje.
 */
export function idsMencionados(
  texto: string,
  elegidos: ReadonlyMap<number, string>,
): readonly number[] {
  return [...elegidos].filter(([, nombre]) => texto.includes(`@${nombre}`)).map(([id]) => id);
}

/** Un trozo de un mensaje: texto corriente o una mención. */
export interface TrozoDeMensaje {
  readonly texto: string;
  readonly mencion: boolean;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parte un mensaje para resaltar las menciones de la gente conocida. Sin nombres, todo es texto. */
export function partirPorMenciones(
  texto: string,
  nombres: readonly string[],
): readonly TrozoDeMensaje[] {
  if (nombres.length === 0) return [{ texto, mencion: false }];
  // Los largos primero: «Ana Soto» antes que «Ana», o la corta se come a la larga.
  const patron = new RegExp(
    `(@(?:${[...nombres]
      .sort((a, b) => b.length - a.length)
      .map(escapar)
      .join("|")}))`,
  );
  // `split` con un grupo de captura intercala las coincidencias: **las posiciones impares son menciones**.
  return texto
    .split(patron)
    .map((trozo, i) => ({ texto: trozo, mencion: i % 2 === 1 }))
    .filter((trozo) => trozo.texto !== "");
}
