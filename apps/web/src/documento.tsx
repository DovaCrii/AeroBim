/**
 * El visor del documento: **`F8.6`**.
 *
 * Es la mitad que faltaba del control documental. El modelo guardaba `pagina`, `ancla_x` y
 * `ancla_y` de cada observación desde el primer día y **no había quien las dibujara**: una
 * observación sobre la página 7 de un plano se leía como una línea de texto en una lista, y
 * quien la recibía tenía que abrir el PDF aparte y buscar de qué hablaba.
 *
 * Tres cosas y ninguna más:
 *
 * 1. **Ver el PDF sin descargarlo**, con PDFium por WASM y los bytes que ya sirve la API del
 *    registro — la misma que alimenta al visor de modelos, con las mismas reglas de permiso.
 * 2. **Ver las observaciones en su sitio**, sobre la página y en el punto donde se abrieron.
 * 3. **Abrir una nueva con un clic** sobre la página, que llega al formulario de Django con el
 *    ancla ya puesta. El formulario es el que valida y el que comprueba el permiso: aquí no se
 *    guarda nada.
 *
 * **Por qué una página aparte y no una pestaña del visor de modelos.** No comparten nada de lo
 * caro: aquí no hay escena, ni Three.js, ni `web-ifc`. Comparten el build, los assets y el WASM
 * servido local, que es justo lo que no había que duplicar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { createPdfiumEngine } from "@embedpdf/engines/pdfium-direct-engine";
import type { PdfDocumentObject } from "@embedpdf/models";
import "./index.css";

/**
 * El motor, tal como lo devuelve la fábrica.
 *
 * **No se usa el `PdfEngine` de `@embedpdf/models`**, que se parece pero no es el mismo tipo:
 * en aquél `destroy` es opcional y en el que devuelve la fábrica no. Derivarlo de la propia
 * función deja de haber dos tipos que hay que mantener de acuerdo.
 */
type Motor = Awaited<ReturnType<typeof createPdfiumEngine>>;

/**
 * El WASM de PDFium, **resuelto por Vite y no escrito a mano**.
 *
 * Dos razones, y la primera es de fondo: **el valor por defecto de la librería es un CDN**
 * (`cdn.jsdelivr.net/npm/@embedpdf/pdfium@…/pdfium.wasm`). AeroBim es local-first —tiene que
 * abrir un documento en una faena sin internet— y además esta página vive detrás del login con
 * una CSP que no deja pedirle nada a otro origen: con el valor por defecto no habría un aviso,
 * habría una página en blanco. Pasarle una URL explícita no es una optimización, es obligatorio.
 *
 * Y la segunda: con `?url`, **Vite calcula la ruta**, incluido el prefijo `/static/visor/` con
 * que Django publica el build. La alternativa —componerla desde `import.meta.env.BASE_URL`— es
 * la que ya falló con el otro WASM: si la ruta no acierta, el navegador recibe el `index.html`
 * de Django y el cargador falla por dentro, sin un error visible.
 */
import rutaWasmPdfium from "@embedpdf/pdfium/pdfium.wasm?url";

/** Escalas ofrecidas. La primera no es un número: es «que quepa a lo ancho». */
const ESCALAS = [0.75, 1, 1.5, 2] as const;

/**
 * Cuántas páginas se dibujan alrededor de la que se está mirando.
 *
 * **No se dibuja el documento entero.** Una memoria de 200 páginas serían 200 imágenes en
 * memoria de vídeo a la vez, y ese es exactamente el fallo que ya se pagó una vez en este
 * repositorio con el atlas de rótulos del plano: el navegador no da un error, se cae.
 */
const PAGINAS_DE_MARGEN = 2;

interface Revision {
  readonly nombre: string;
  readonly contenido: string;
  readonly correlativo: string;
  readonly idoneidad: string;
  readonly visor: string | null;
  readonly entregable: { readonly id: string; readonly codigo: string; readonly titulo: string };
  readonly proyecto: { readonly codigo: string; readonly nombre: string };
}

interface Observacion {
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
}

/** Qué revisión hay que abrir. Se comprueba la forma antes de pedirla. */
function revisionPedida(): string | null {
  const pedida = new URLSearchParams(globalThis.location?.search ?? "").get("revision");
  return pedida !== null && /^[0-9a-f-]{36}$/i.test(pedida) ? pedida : null;
}

async function json<T>(url: string): Promise<T> {
  const respuesta = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!respuesta.ok) {
    throw new Error(
      respuesta.status === 403
        ? "Tu rol no puede abrir este documento."
        : respuesta.status === 404
          ? "Ese documento no existe o no está disponible."
          : `El registro respondió ${respuesta.status}.`,
    );
  }
  return (await respuesta.json()) as T;
}

/**
 * Una página dibujada, con sus marcas encima y su clic.
 *
 * **Se dibuja sola y solo cuando toca.** Cada página pide su imagen a PDFium cuando entra en el
 * margen de la que se está mirando, y suelta la anterior: sin esto, abrir una memoria larga
 * consume la memoria de vídeo entera.
 */
function Pagina({
  engine,
  doc,
  indice,
  escala,
  visible,
  observaciones,
  onClic,
}: {
  engine: Motor;
  doc: PdfDocumentObject;
  indice: number;
  escala: number;
  visible: boolean;
  observaciones: readonly Observacion[];
  onClic: ((pagina: number, x: number, y: number) => void) | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const pagina = doc.pages[indice];

  useEffect(() => {
    if (!visible || pagina === undefined) return;

    let vivo = true;
    let anterior: string | null = null;
    void (async () => {
      const blob = await engine
        .renderPage(doc, pagina, { scaleFactor: escala, dpr: globalThis.devicePixelRatio || 1 })
        .toPromise();
      if (!vivo) return;
      anterior = URL.createObjectURL(blob);
      setUrl(anterior);
    })();

    return () => {
      vivo = false;
      // **Se revoca la URL al soltar la página.** Sin esto cada `blob:` queda retenido por el
      // documento hasta recargar, y recorrer un PDF largo dos veces basta para agotar la memoria.
      if (anterior !== null) URL.revokeObjectURL(anterior);
    };
  }, [engine, doc, pagina, escala, visible]);

  // El alto se reserva **antes** de tener la imagen, con el tamaño que declara el PDF: así la
  // barra de desplazamiento no salta cada vez que entra una página nueva.
  const alto = pagina === undefined ? 0 : Math.round(pagina.size.height * escala);
  const ancho = pagina === undefined ? 0 : Math.round(pagina.size.width * escala);

  const clic = (evento: React.MouseEvent<HTMLDivElement>) => {
    if (onClic === null) return;
    const caja = evento.currentTarget.getBoundingClientRect();
    // Se guarda la **fracción de la página**, no el píxel: el PDF se dibuja a la escala que
    // quepa y a la densidad de cada pantalla, así que un píxel de hoy apunta a otro sitio mañana.
    onClic(
      indice + 1,
      (evento.clientX - caja.left) / caja.width,
      (evento.clientY - caja.top) / caja.height,
    );
  };

  return (
    <div className="mx-auto mb-6" style={{ width: ancho }}>
      <div
        className="relative bg-white shadow-lg"
        style={{ width: ancho, height: alto, cursor: onClic === null ? "default" : "crosshair" }}
        onClick={clic}
      >
        {url !== null ? (
          <img src={url} alt="" width={ancho} height={alto} className="block" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            página {indice + 1}
          </div>
        )}

        {observaciones.map((observacion) => (
          <a
            key={observacion.id}
            href={observacion.url}
            title={`${observacion.titulo} · ${observacion.estadoTexto} · ${observacion.responsable}`}
            // El clic en la marca **no debe abrir una observación nueva**: se detiene aquí.
            onClick={(evento) => evento.stopPropagation()}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-[11px] font-bold text-white shadow"
            style={{
              left: `${observacion.x * 100}%`,
              top: `${observacion.y * 100}%`,
              width: 22,
              height: 22,
              lineHeight: "18px",
              textAlign: "center",
              // Cerrada en verde, el resto en el violeta de la marca. Es la única distinción que
              // hace falta en el plano: lo demás está en la ficha, a un clic.
              backgroundColor: observacion.estado === "cerrada" ? "#2f9e44" : "#9b5de5",
            }}
          >
            !
          </a>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-slate-500">{indice + 1}</p>
    </div>
  );
}

function Documento() {
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string>("abriendo el documento…");
  const [revision, setRevision] = useState<Revision | null>(null);
  const [doc, setDoc] = useState<PdfDocumentObject | null>(null);
  const [observaciones, setObservaciones] = useState<readonly Observacion[]>([]);
  const [puedeObservar, setPuedeObservar] = useState(false);
  const [escala, setEscala] = useState<number>(1);
  const [pagina, setPagina] = useState(1);
  const engine = useRef<Motor | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const revisionId = useMemo(() => revisionPedida(), []);

  useEffect(() => {
    if (revisionId === null) {
      setError("La dirección no dice qué documento abrir.");
      return;
    }

    let vivo = true;
    void (async () => {
      try {
        setAviso("leyendo el registro…");
        const datos = await json<Revision>(`/api/revisiones/${revisionId}/`);
        if (!vivo) return;
        setRevision(datos);

        // **Se comprueba antes de dibujar.** Pasarle un IFC a PDFium produce un error suyo, en
        // inglés y sobre un formato: es peor que decirlo aquí con el nombre del archivo.
        if (datos.visor !== "documento") {
          setError(`«${datos.nombre}» no es un documento que esta pantalla sepa abrir.`);
          return;
        }

        setAviso("descargando…");
        const archivo = await fetch(datos.contenido, { credentials: "same-origin" });
        if (!archivo.ok) throw new Error(`No se pudo leer el archivo (${archivo.status}).`);
        const bytes = await archivo.arrayBuffer();
        if (!vivo) return;

        setAviso("preparando el lector…");
        // `fontFallback: null` **no es un detalle**: con el respaldo activado PDFium pide fuentes
        // a otro origen cuando el PDF no las trae incrustadas, y esta página vive detrás del
        // login con una CSP que no lo permite. El resultado no sería un aviso, sería una página
        // en blanco.
        const motor = await createPdfiumEngine(rutaWasmPdfium, { fontFallback: null });
        if (!vivo) {
          void motor.destroy();
          return;
        }
        engine.current = motor;

        setAviso("abriendo el PDF…");
        const abierto = await motor
          .openDocumentBuffer({ id: revisionId, content: bytes })
          .toPromise();
        if (!vivo) return;
        setDoc(abierto);

        const marcas = await json<{
          observaciones: Observacion[];
          puedeObservar: boolean;
        }>(`/api/revisiones/${revisionId}/observaciones/`);
        if (!vivo) return;
        setObservaciones(marcas.observaciones);
        setPuedeObservar(marcas.puedeObservar);
      } catch (fallo: unknown) {
        if (vivo) setError(fallo instanceof Error ? fallo.message : String(fallo));
      }
    })();

    return () => {
      vivo = false;
      const motor = engine.current;
      engine.current = null;
      if (motor !== null) void motor.destroy();
    };
  }, [revisionId]);

  /** Qué página se está mirando, para decidir cuáles dibujar. */
  const alDesplazar = useCallback(() => {
    const caja = scroller.current;
    if (caja === null || doc === null) return;
    const fraccion = caja.scrollTop / Math.max(1, caja.scrollHeight - caja.clientHeight);
    setPagina(Math.min(doc.pageCount, Math.max(1, Math.round(fraccion * (doc.pageCount - 1)) + 1)));
  }, [doc]);

  /**
   * Un clic sobre la página lleva al formulario de Django con el ancla puesta.
   *
   * **No se guarda nada desde aquí.** El formulario ya comprueba el permiso, el rango de la
   * coordenada y que las tres partes del ancla vengan juntas; duplicar esa validación en el
   * navegador sería tener dos reglas que se separan en el primer cambio.
   */
  const abrirObservacion = useCallback(
    (numero: number, x: number, y: number) => {
      if (revision === null || revisionId === null) return;
      const consulta = new URLSearchParams({
        revision: revisionId,
        pagina: String(numero),
        x: x.toFixed(4),
        y: y.toFixed(4),
      });
      globalThis.location.href = `/documentos/entregables/${revision.entregable.id}/observar/?${consulta}`;
    },
    [revision, revisionId],
  );

  const porPagina = useMemo(() => {
    const mapa = new Map<number, Observacion[]>();
    for (const observacion of observaciones) {
      const lista = mapa.get(observacion.pagina);
      if (lista === undefined) mapa.set(observacion.pagina, [observacion]);
      else lista.push(observacion);
    }
    return mapa;
  }, [observaciones]);

  if (error !== null) {
    return (
      <div className="mx-auto max-w-2xl p-12">
        <h1 className="text-xl font-semibold">No se pudo abrir</h1>
        <p className="mt-3 text-slate-300">{error}</p>
        <p className="mt-6">
          <a className="text-brand underline" href="/documentos/entregables/">
            Volver a los entregables
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2 text-sm">
        <a href="/documentos/entregables/" className="font-semibold text-brand">
          AeroBim
        </a>
        {revision !== null && (
          <>
            <span className="font-medium">
              {revision.entregable.codigo} rev. {revision.correlativo}
            </span>
            <span className="text-slate-400">{revision.entregable.titulo}</span>
            <a
              className="text-slate-300 underline"
              href={`/documentos/entregables/${revision.entregable.id}/`}
            >
              expediente
            </a>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          {doc !== null && (
            <span className="text-slate-400">
              {pagina} / {doc.pageCount}
            </span>
          )}
          <select
            value={escala}
            onChange={(evento) => setEscala(Number(evento.target.value))}
            className="rounded bg-white/10 px-2 py-1"
            aria-label="escala"
          >
            {ESCALAS.map((uno) => (
              <option key={uno} value={uno}>
                {Math.round(uno * 100)} %
              </option>
            ))}
          </select>
        </span>
      </header>

      {/*
        El aviso de lo que se puede hacer va aquí y no flotando sobre la página: es la misma
        regla que el visor de modelos —nada flota sobre lo que se está mirando— y quien viene de
        un CAD ya mira arriba y abajo.
      */}
      <p className="border-b border-white/10 bg-white/5 px-4 py-1 text-xs text-slate-400">
        {doc === null
          ? aviso
          : puedeObservar
            ? `${observaciones.length} observaciones sobre el documento · clic en la página para abrir una nueva`
            : `${observaciones.length} observaciones sobre el documento`}
      </p>

      <div ref={scroller} onScroll={alDesplazar} className="flex-1 overflow-auto bg-slate-800 p-6">
        {doc !== null &&
          engine.current !== null &&
          doc.pages.map((_p, indice) => (
            <Pagina
              key={indice}
              engine={engine.current as Motor}
              doc={doc}
              indice={indice}
              escala={escala}
              visible={Math.abs(indice + 1 - pagina) <= PAGINAS_DE_MARGEN}
              observaciones={porPagina.get(indice + 1) ?? []}
              onClic={puedeObservar ? abrirObservacion : null}
            />
          ))}
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("No se encontro el elemento #root");
}

createRoot(container).render(
  <StrictMode>
    <Documento />
  </StrictMode>,
);
