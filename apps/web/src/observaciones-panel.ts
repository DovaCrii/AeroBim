/**
 * Lo que decide el panel «Observaciones» del visor de documentos, sin pantalla (`F15.1`).
 *
 * Es la parte que se puede equivocar —qué número lleva cada marca, qué entra en cada filtro, qué dice el
 * plazo— y por eso está aparte y con pruebas: el componente solo la pinta.
 */

export interface ObservacionDeDocumento {
  readonly id: string;
  readonly titulo: string;
  readonly estado: string;
  readonly estadoTexto: string;
  readonly prioridad: string;
  readonly responsable: string;
  readonly pagina: number;
  readonly x: number;
  readonly y: number;
  readonly url: string;
  /** Cuándo se abrió, ISO 8601. */
  readonly creada: string;
  /** El plazo, `AAAA-MM-DD`, o `null`. */
  readonly vence: string | null;
  /** Si el plazo ya pasó y sigue sin cerrarse: la regla es del servidor, aquí no se recalcula. */
  readonly vencida: boolean;
  /** Mensajes en su hilo. */
  readonly comentarios: number;
  /** La forma de la marca, o `null` si es un punto (`F15.2`). */
  readonly forma: FormaDeMarca | null;
  /** La esquina opuesta (rectángulo, nube) o a lo que apunta la flecha (llamada), en fracciones. */
  readonly x2: number | null;
  readonly y2: number | null;
}

export type FormaDeMarca = "rectangulo" | "nube" | "llamada";

/** Las herramientas de marcado: el punto de siempre y las tres formas. */
export type HerramientaDeMarca = "punto" | FormaDeMarca;

export const HERRAMIENTAS: readonly {
  readonly id: HerramientaDeMarca;
  readonly texto: string;
  readonly ayuda: string;
}[] = [
  { id: "punto", texto: "Punto", ayuda: "Clic en la página para marcar un punto" },
  { id: "rectangulo", texto: "Rectángulo", ayuda: "Arrastra para marcar una zona" },
  { id: "nube", texto: "Nube", ayuda: "Arrastra para rodear con una nube de revisión" },
  { id: "llamada", texto: "Llamada", ayuda: "Arrastra desde la nota hasta lo que señala" },
];

export type FiltroDeObservaciones = "todas" | "abiertas" | "vencidas" | "cerradas";

export const FILTROS: readonly { readonly id: FiltroDeObservaciones; readonly texto: string }[] = [
  { id: "todas", texto: "Todas" },
  { id: "abiertas", texto: "Abiertas" },
  { id: "vencidas", texto: "Vencidas" },
  { id: "cerradas", texto: "Cerradas" },
];

const ESTADOS_CERRADOS: ReadonlySet<string> = new Set(["cerrada", "descartada"]);

/** Una observación cerrada o descartada ya no pide nada a nadie. */
export function estaCerrada(observacion: Pick<ObservacionDeDocumento, "estado">): boolean {
  return ESTADOS_CERRADOS.has(observacion.estado);
}

/**
 * El número de cada observación: **por orden en el documento** (página y, dentro de ella, de arriba abajo
 * y de izquierda a derecha), empezando en 1. El mismo número sale en la marca de la página y en la lista:
 * es lo que permite decir «mira la 3» por teléfono.
 *
 * Se numera **antes de filtrar**: con el filtro «Vencidas» la marca sigue siendo la 7, no la 1.
 */
export function numerar(
  observaciones: readonly ObservacionDeDocumento[],
): ReadonlyMap<string, number> {
  const orden = [...observaciones].sort(
    (a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
  return new Map(orden.map((observacion, i) => [observacion.id, i + 1]));
}

export function filtrar(
  observaciones: readonly ObservacionDeDocumento[],
  filtro: FiltroDeObservaciones,
): readonly ObservacionDeDocumento[] {
  switch (filtro) {
    case "todas":
      return observaciones;
    case "abiertas":
      return observaciones.filter((o) => !estaCerrada(o));
    case "vencidas":
      return observaciones.filter((o) => o.vencida);
    case "cerradas":
      return observaciones.filter(estaCerrada);
  }
}

/** Cuántas hay en cada filtro, para rotularlos: un filtro sin su cuenta obliga a pulsarlo para saberlo. */
export function cuentas(
  observaciones: readonly ObservacionDeDocumento[],
): Readonly<Record<FiltroDeObservaciones, number>> {
  return {
    todas: observaciones.length,
    abiertas: filtrar(observaciones, "abiertas").length,
    vencidas: filtrar(observaciones, "vencidas").length,
    cerradas: filtrar(observaciones, "cerradas").length,
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-10-12` → `12 oct 2026`. Sin pasar por `Date`: una fecha sin hora no tiene zona que la mueva. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m === null) return iso;
  const mes = MESES[Number(m[2]) - 1];
  return mes === undefined ? iso : `${Number(m[3])} ${mes} ${m[1]}`;
}

/** Los días enteros entre dos fechas `AAAA-MM-DD` (`hasta − desde`), contados en días de calendario. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(
    Number(desde.slice(0, 4)),
    Number(desde.slice(5, 7)) - 1,
    Number(desde.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(hasta.slice(0, 4)),
    Number(hasta.slice(5, 7)) - 1,
    Number(hasta.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Lo que dice el plazo de una observación, o `null` si no tiene.
 * `hoy` entra por parámetro: una función que lee el reloj no se puede probar.
 */
export function textoDePlazo(
  observacion: Pick<ObservacionDeDocumento, "vence" | "vencida">,
  hoy: string,
): string | null {
  if (observacion.vence === null) return null;
  const fecha = `vence ${fechaCorta(observacion.vence)}`;
  if (!observacion.vencida) return fecha;
  const dias = diasEntre(observacion.vence, hoy);
  return dias > 0 ? `${fecha} · ${dias} ${dias === 1 ? "día" : "días"} de atraso` : fecha;
}
