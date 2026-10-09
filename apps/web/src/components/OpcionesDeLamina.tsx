import { useCallback, useEffect, useId, useState } from "react";
import { rotuloDeEscala, sugerirHoja } from "@aerobim/bim-core";
import type { BimViewer, DrawingLayerInfo, GeneratedDrawing } from "@aerobim/viewer";

import { IconChevronDown, IconChevronUp, IconFrameAll, IconLayers } from "./icons.js";
import { capasParaPanel, fichaDeLamina } from "./ficha-de-lamina.js";
import { MedidaEnLamina } from "./MedidaEnLamina.js";

/**
 * **«Vista de la lámina»** (2026-10-09): las opciones del visor 2D, con lo que el plano generado ya
 * sabe de sí mismo.
 *
 * Antes la barra de la lámina solo dejaba ir a otra o volver, y todo lo que el generador mide —cuántos
 * trazos, cuánto tarda, qué cruza, en qué hoja cabe— se quedaba en el panel de planos, que en el visor
 * 2D ni está. Aquí se junta lo que sirve **mientras se mira**:
 *
 * - **Capas**: las mismas del DXF. Apagar las ocultas o la cuadrícula deja el dibujo que se va a
 *   exportar, no uno distinto.
 * - **Encuadre y escala**: volver a ver la lámina entera, y llevar el zoom a la escala de la hoja.
 * - **Medir** sobre la lámina, con el resultado también en milímetros de papel.
 * - **Ficha** con las cifras.
 *
 * Va abajo a la izquierda, plegable, para no tapar el dibujo.
 */
export function OpcionesDeLamina({
  viewer,
  lamina,
}: {
  readonly viewer: BimViewer | null;
  readonly lamina: GeneratedDrawing;
}) {
  const [abierto, setAbierto] = useState(() => window.innerWidth >= 1100);
  const [capas, setCapas] = useState<readonly DrawingLayerInfo[]>([]);
  const [midiendo, setMidiendo] = useState(false);
  const idPanel = useId();

  const leerCapas = useCallback(() => {
    setCapas(viewer?.drawingLayers(lamina.id) ?? []);
  }, [viewer, lamina.id]);

  // Cada lámina tiene sus capas (una transversal no lleva nube ni regla): se relee al cambiar.
  useEffect(() => {
    leerCapas();
    setMidiendo(false);
  }, [leerCapas]);

  const alternarCapa = (nombre: string, visible: boolean) => {
    if (viewer === null) return;
    void viewer.setDrawingLayerVisible(lamina.id, nombre, visible).then(leerCapas);
  };

  const sugerencia = sugerirHoja(lamina.sizeM[0], lamina.sizeM[1]);
  const ficha = fichaDeLamina({
    nombre: lamina.name,
    vista: lamina.view,
    anchoM: lamina.sizeM[0],
    altoM: lamina.sizeM[1],
    segmentos: lamina.segments,
    segmentosOcultos: lamina.hiddenSegments,
    generadoMs: lamina.elapsedMs,
    cruces: lamina.cruces?.length,
    puntosDeNube: lamina.puntosDeNube,
  });

  const boton =
    "flex items-center gap-1.5 rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:bg-surface-3 hover:text-fg disabled:text-apagado-fg disabled:hover:bg-transparent aria-pressed:border-action aria-pressed:text-fg";

  return (
    <>
      <section
        aria-label="Vista de la lámina"
        className="absolute bottom-3 left-24 z-10 max-w-[calc(100%-7rem)] rounded-lg border border-borde bg-surface/90 shadow-[var(--shadow-xl)] backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-controls={idPanel}
          title={
            abierto ? "Pliega las opciones de la lámina" : "Despliega las opciones de la lámina"
          }
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-3"
        >
          <IconLayers className="h-4 w-4 text-fg-2" />
          Vista de la lámina
          {abierto ? (
            <IconChevronDown className="ml-auto h-3.5 w-3.5 text-fg-3" />
          ) : (
            <IconChevronUp className="ml-auto h-3.5 w-3.5 text-fg-3" />
          )}
        </button>

        {abierto && (
          <div
            id={idPanel}
            className="max-h-[min(24rem,calc(100vh-14rem))] w-64 space-y-3 overflow-y-auto border-t border-borde px-3 py-2.5"
          >
            <div>
              <h3 className="mb-1 text-micro font-medium tracking-wide text-fg-3 uppercase">
                Capas
              </h3>
              {capas.length === 0 ? (
                <p className="text-nota text-fg-3">Esta lámina no tiene capas que apagar.</p>
              ) : (
                <ul className="space-y-1">
                  {capasParaPanel(capas).map((capa) => (
                    <li key={capa.name}>
                      <label
                        className="flex items-center gap-2 text-nota text-fg-2"
                        title={capa.ayuda}
                      >
                        <input
                          type="checkbox"
                          checked={capa.visible}
                          onChange={(e) => alternarCapa(capa.name, e.target.checked)}
                          className="accent-action"
                        />
                        <span className="min-w-0 flex-1 truncate">{capa.titulo}</span>
                        <span className="text-fg-3 tabular-nums">
                          {capa.segments.toLocaleString("es-CL")}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1 text-micro font-medium tracking-wide text-fg-3 uppercase">
                Encuadre y escala
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={boton}
                  onClick={() => viewer?.frameDrawing(lamina.id)}
                  title="Vuelve a ver la lámina entera, centrada"
                >
                  <IconFrameAll className="h-3.5 w-3.5" />
                  Encuadrar
                </button>
                <button
                  type="button"
                  className={boton}
                  disabled={sugerencia === null}
                  onClick={() => sugerencia !== null && viewer?.zoomToPaperScale(sugerencia.escala)}
                  title={
                    sugerencia === null
                      ? "La lámina no cabe en ninguna hoja"
                      : `Lleva el zoom a ${rotuloDeEscala(sugerencia.escala)}, la escala en que cabe en una ${sugerencia.hoja.nombre}: en pantalla, 1 m del modelo mide ${(1000 / sugerencia.escala).toLocaleString("es-CL", { maximumFractionDigits: 1 })} mm de papel`
                  }
                >
                  {sugerencia === null
                    ? "Escala de hoja"
                    : `Escala ${rotuloDeEscala(sugerencia.escala)}`}
                </button>
                <button
                  type="button"
                  className={boton}
                  aria-pressed={midiendo}
                  onClick={() => setMidiendo((m) => !m)}
                  title="Mide la distancia entre dos puntos de la lámina: clic en cada uno. Da metros del modelo y milímetros de papel. Esc sale"
                >
                  Medir
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-micro font-medium tracking-wide text-fg-3 uppercase">
                Información
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-nota">
                {ficha.map((fila) => (
                  <div key={fila.etiqueta} className="contents">
                    <dt className="text-fg-3">{fila.etiqueta}</dt>
                    <dd className="text-right text-fg tabular-nums">{fila.valor}</dd>
                  </div>
                ))}
              </dl>
              {lamina.nota !== undefined && (
                <p className="mt-1.5 text-nota text-fg-3">{lamina.nota}</p>
              )}
            </div>
          </div>
        )}
      </section>

      {midiendo && (
        <MedidaEnLamina
          viewer={viewer}
          laminaId={lamina.id}
          escala={sugerencia?.escala ?? null}
          onTerminar={() => setMidiendo(false)}
        />
      )}
    </>
  );
}
