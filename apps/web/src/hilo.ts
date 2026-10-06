/**
 * Lo que decide el hilo de una observación en el visor, sin pantalla (`F15.4`): cuánto hace que se
 * escribió cada mensaje y qué se le dice a quien acaba de contestar sobre el aviso por correo.
 */

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
 * Los tres casos son distintos y la diferencia importa: `null` del servidor es que el aviso **falló**
 * (el mensaje sí se guardó), `[]` que **no había a quién avisar**, y con nombres que salió. Quien escribe
 * necesita saber si el otro se enteró.
 */
export function avisoDeRespuesta(avisados: readonly string[] | null): string | null {
  if (avisados === null)
    return "Tu respuesta se guardó, pero no se pudo enviar el aviso por correo.";
  if (avisados.length === 0) return "Tu respuesta se guardó. No había a quién avisar por correo.";
  return null;
}
