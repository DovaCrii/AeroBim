/**
 * Texto y cuentas del progreso al abrir una revisión del registro.
 *
 * **Lógica pura, sin DOM**: la descarga de un IFC de 34 MB por una VM lenta tardaba más de dos
 * minutos y la pantalla decía solo «convirtiendo…». Aquí está lo que hace falta para decir qué
 * pasa —cuánto se bajó, a qué ritmo, cuánto lleva cada etapa— y para saber cuándo una descarga
 * dejó de avanzar.
 */

/** Cuánto sin recibir un solo byte antes de dar la descarga por atascada. */
export const LIMITE_SIN_AVANCE_MS = 60_000;

/** `12,3 MB` (coma decimal, como el resto de la interfaz en español). */
export function formatoMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const texto = mb >= 100 ? mb.toFixed(0) : mb.toFixed(1);
  return `${texto.replace(".", ",")} MB`;
}

/** Solo la cifra, para «12,3 de 34,1 MB». */
function cifraMb(bytes: number): string {
  return formatoMb(bytes).replace(" MB", "");
}

/** `0,8 MB/s`; `null` si aún no hay base para medirla. */
export function formatoVelocidad(bytes: number, ms: number): string | null {
  if (ms < 500 || bytes <= 0) return null;
  const bytesPorSegundo = bytes / (ms / 1000);
  const mb = bytesPorSegundo / (1024 * 1024);
  if (mb < 0.1) return `${Math.round(bytesPorSegundo / 1024)} KB/s`;
  return `${mb.toFixed(1).replace(".", ",")} MB/s`;
}

/** `41 s`, `2 min 5 s`. Redondea a segundos enteros. */
export function formatoDuracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto === 0 ? `${min} min` : `${min} min ${resto} s`;
}

/** Segundos que faltan al ritmo medio, o `null` si no se puede estimar. */
export function segundosRestantes(
  recibidos: number,
  total: number | null,
  ms: number,
): number | null {
  if (total === null || recibidos <= 0 || ms < 1000 || recibidos > total) return null;
  const bytesPorSegundo = recibidos / (ms / 1000);
  return Math.ceil((total - recibidos) / bytesPorSegundo);
}

/**
 * El total de bytes con el que comparar lo recibido.
 *
 * **Con `Content-Encoding` el `Content-Length` es el comprimido** y el cuerpo que se lee ya viene
 * descomprimido: usarlo daba un «120 %». Entonces vale el tamaño que el registro declara del
 * archivo. Si lo recibido lo supera, ningún total es creíble y no se muestra porcentaje.
 */
export function totalCreible(
  contentLength: number | null,
  tamanoDeclarado: number | null,
  comprimido: boolean,
  recibidos: number,
): number | null {
  const candidato = comprimido ? tamanoDeclarado : (contentLength ?? tamanoDeclarado);
  if (candidato === null || candidato <= 0 || recibidos > candidato) return null;
  return candidato;
}

export interface EstadoDeDescarga {
  readonly recibidos: number;
  readonly total: number | null;
  /** Milisegundos desde que empezó la descarga. */
  readonly transcurridoMs: number;
  /** Milisegundos desde el último byte recibido. */
  readonly sinAvanceMs: number;
}

/** «Descargando 12,3 de 34,1 MB · 0,8 MB/s · quedan ~27 s». */
export function textoDeDescarga(e: EstadoDeDescarga): string {
  const partes: string[] = [
    e.total === null
      ? `Descargando ${formatoMb(e.recibidos)}`
      : `Descargando ${cifraMb(e.recibidos)} de ${formatoMb(e.total)}`,
  ];
  const velocidad = formatoVelocidad(e.recibidos, e.transcurridoMs);
  if (velocidad !== null) partes.push(velocidad);
  const resta = segundosRestantes(e.recibidos, e.total, e.transcurridoMs);
  if (resta !== null) partes.push(`quedan ~${formatoDuracion(resta * 1000)}`);
  if (e.sinAvanceMs >= 10_000) partes.push(`sin avance hace ${formatoDuracion(e.sinAvanceMs)}`);
  return partes.join(" · ");
}

/** Fracción 0..1 de la descarga, o `null` si no hay total. */
export function fraccionDeDescarga(recibidos: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.min(1, recibidos / total);
}

/** «Convirtiendo la geometría… 23 s». */
export function textoDeEtapa(etapa: string, desdeMs: number | null, ahoraMs: number): string {
  return desdeMs === null ? `${etapa}…` : `${etapa}… ${formatoDuracion(ahoraMs - desdeMs)}`;
}

/** Lo que se anota en la tarjeta del modelo al terminar. */
export interface InfoDeCarga {
  readonly origen: "red" | "cache";
  readonly descargaMs: number | null;
  readonly bytes: number | null;
  /** `null` si no se pudo leer la cabecera (no hubo descarga). */
  readonly comprimido: boolean | null;
}

/** «descarga 41 s · conversión 23 s · 34,1 MB (comprimido: sí)» o «desde la caché local · …». */
export function resumenDeCarga(info: InfoDeCarga, conversionMs: number): string {
  if (info.origen === "cache") {
    return `desde la caché local · carga ${formatoDuracion(conversionMs)}`;
  }
  const partes: string[] = [];
  if (info.descargaMs !== null) partes.push(`descarga ${formatoDuracion(info.descargaMs)}`);
  partes.push(`conversión ${formatoDuracion(conversionMs)}`);
  if (info.bytes !== null) {
    const zip = info.comprimido === null ? "" : ` (comprimido: ${info.comprimido ? "sí" : "no"})`;
    partes.push(`${formatoMb(info.bytes)}${zip}`);
  }
  return partes.join(" · ");
}

/** Mensaje de una descarga que dejó de avanzar. */
export function mensajeDeAtasco(recibidos: number, total: number | null): string {
  const llevaba =
    total === null ? formatoMb(recibidos) : `${cifraMb(recibidos)} de ${formatoMb(total)}`;
  return (
    `La descarga no avanza desde hace ${LIMITE_SIN_AVANCE_MS / 1000} s (llevaba ${llevaba}). ` +
    "Comprueba tu conexión con el servidor y vuelve a abrir la revisión. Si se repite, " +
    "avisa a quien administra la VM: puede que falte comprimir las respuestas o que el " +
    "servidor esté saturado."
  );
}

export class DescargaAtascada extends Error {
  constructor(
    readonly recibidos: number,
    readonly total: number | null,
  ) {
    super(mensajeDeAtasco(recibidos, total));
    this.name = "DescargaAtascada";
  }
}

export class DescargaCancelada extends Error {
  constructor() {
    super("Descarga cancelada.");
    this.name = "DescargaCancelada";
  }
}

export class DescargaHttp extends Error {
  constructor(readonly estado: number) {
    super(`No se pudo leer el archivo (${estado}).`);
    this.name = "DescargaHttp";
  }
}

export interface ResultadoDeDescarga {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly total: number | null;
  readonly comprimido: boolean;
  readonly ms: number;
}

export interface OpcionesDeDescarga {
  readonly controlador: AbortController;
  readonly tamanoDeclarado?: number | null;
  readonly limiteSinAvanceMs?: number;
  readonly onProgreso?: (e: EstadoDeDescarga) => void;
  readonly fetchFn?: typeof fetch;
}

/**
 * Descarga una URL leyendo el cuerpo por trozos, avisando del avance y **abandonando** si no llega
 * ningún byte en `limiteSinAvanceMs` (también mientras se espera la respuesta). Cancelar el
 * `controlador` aborta la petición.
 */
export async function descargarConProgreso(
  url: string,
  opciones: OpcionesDeDescarga,
): Promise<ResultadoDeDescarga> {
  const { controlador, onProgreso } = opciones;
  const limite = opciones.limiteSinAvanceMs ?? LIMITE_SIN_AVANCE_MS;
  const fetchFn = opciones.fetchFn ?? fetch;
  const inicio = Date.now();
  let ultimoAvance = inicio;
  let recibidos = 0;
  let total: number | null = opciones.tamanoDeclarado ?? null;
  let atascada = false;
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const vigilante = setTimeout(
    function revisar() {
      // Se rearma solo hasta que pasa el límite.
      const sin = Date.now() - ultimoAvance;
      if (sin >= limite) {
        atascada = true;
        controlador.abort();
        void lector?.cancel().catch(() => {});
        return;
      }
      timer = setTimeout(revisar, Math.min(1000, limite - sin));
    },
    Math.min(1000, limite),
  );
  let timer: ReturnType<typeof setTimeout> = vigilante;

  const emitir = () =>
    onProgreso?.({
      recibidos,
      total,
      transcurridoMs: Date.now() - inicio,
      sinAvanceMs: Date.now() - ultimoAvance,
    });

  try {
    emitir();
    const respuesta = await fetchFn(url, {
      credentials: "same-origin",
      signal: controlador.signal,
    });
    if (!respuesta.ok) throw new DescargaHttp(respuesta.status);
    const codificacion = respuesta.headers.get("Content-Encoding");
    const comprimido =
      codificacion !== null && codificacion.trim() !== "" && codificacion !== "identity";
    const largo = Number(respuesta.headers.get("Content-Length"));
    total = totalCreible(
      Number.isFinite(largo) && largo > 0 ? largo : null,
      opciones.tamanoDeclarado ?? null,
      comprimido,
      0,
    );
    ultimoAvance = Date.now();
    emitir();

    const trozos: Uint8Array[] = [];
    if (respuesta.body === null) {
      const todo = new Uint8Array(await respuesta.arrayBuffer());
      trozos.push(todo);
      recibidos = todo.byteLength;
    } else {
      lector = respuesta.body.getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (atascada) break;
        if (done) break;
        trozos.push(value);
        recibidos += value.byteLength;
        ultimoAvance = Date.now();
        if (total !== null && recibidos > total) total = null;
        emitir();
      }
    }
    if (atascada) throw new DescargaAtascada(recibidos, total);

    const bytes = new Uint8Array(recibidos);
    let pos = 0;
    for (const t of trozos) {
      bytes.set(t, pos);
      pos += t.byteLength;
    }
    return { bytes, total, comprimido, ms: Date.now() - inicio };
  } catch (error: unknown) {
    if (error instanceof DescargaAtascada || error instanceof DescargaHttp) throw error;
    if (atascada) throw new DescargaAtascada(recibidos, total);
    if (controlador.signal.aborted) throw new DescargaCancelada();
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(vigilante);
  }
}
