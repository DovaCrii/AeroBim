import { useEffect, useReducer, useRef, useState } from "react";
import { medirEnLamina, rotuloDeEscala, type PuntoDeLamina } from "@aerobim/bim-core";
import type { BimViewer } from "@aerobim/viewer";

/** Un clic que se mueve más que esto es un arrastre de la cámara, no un punto. */
const UMBRAL_DE_ARRASTRE_PX = 4;

function coma(n: number, decimales: number): string {
  return n.toFixed(decimales).replace(".", ",");
}

/**
 * **Medir sobre la lámina** (2026-10-09): la distancia entre dos puntos del visor 2D, en metros del
 * modelo y en milímetros de **papel** a la escala de la hoja.
 *
 * La medida del visor 3D lanza el rayo contra el modelo, y una lámina no es modelo: son líneas sobre
 * un plano. Aquí el rayo se corta con el plano del dibujo (`pointOnDrawing`), que es lo que ya usa el
 * perfil para decir «PK y cota». Los dos puntos se guardan **en coordenadas de papel**, no de
 * pantalla, y se vuelven a proyectar en cada fotograma: así la medida sigue pegada al dibujo al
 * acercar o desplazar.
 *
 * Es de **dos clics**: el primero fija el origen, el segundo cierra, y el siguiente empieza otra.
 * `Esc` sale. Un clic que se arrastra es la cámara y no cuenta.
 */
export function MedidaEnLamina({
  viewer,
  laminaId,
  escala,
  onTerminar,
}: {
  readonly viewer: BimViewer | null;
  readonly laminaId: string;
  /** El denominador de la escala de la hoja, o `null` si no hay. */
  readonly escala: number | null;
  readonly onTerminar: () => void;
}) {
  const [puntos, setPuntos] = useState<readonly PuntoDeLamina[]>([]);
  const [cursor, setCursor] = useState<PuntoDeLamina | null>(null);
  const [, repintar] = useReducer((n: number) => n + 1, 0);
  const raiz = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (viewer === null) return;
    let abajo: { x: number; y: number } | null = null;

    const esLienzo = (destino: EventTarget | null) => destino instanceof HTMLCanvasElement;

    const alBajar = (e: PointerEvent) => {
      abajo = esLienzo(e.target) && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const alSubir = (e: PointerEvent) => {
      const inicio = abajo;
      abajo = null;
      if (inicio === null || !esLienzo(e.target)) return;
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_DE_ARRASTRE_PX) return;
      const punto = viewer.pointOnDrawing(e.clientX, e.clientY, laminaId);
      if (punto === null) return;
      setPuntos((actuales) => (actuales.length === 1 ? [actuales[0]!, punto] : [punto]));
      setCursor(null);
    };
    const alMover = (e: PointerEvent) => {
      if (!esLienzo(e.target)) return;
      setCursor(viewer.pointOnDrawing(e.clientX, e.clientY, laminaId));
    };
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTerminar();
    };

    window.addEventListener("pointerdown", alBajar);
    window.addEventListener("pointerup", alSubir);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("keydown", alPulsar);
    return () => {
      window.removeEventListener("pointerdown", alBajar);
      window.removeEventListener("pointerup", alSubir);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("keydown", alPulsar);
    };
  }, [viewer, laminaId, onTerminar]);

  // Las posiciones de pantalla cambian con la cámara aunque los puntos no: se repinta cada fotograma
  // mientras haya algo dibujado.
  const hayAlgo = puntos.length > 0;
  useEffect(() => {
    if (!hayAlgo) return;
    let id = requestAnimationFrame(function paso() {
      repintar();
      id = requestAnimationFrame(paso);
    });
    return () => cancelAnimationFrame(id);
  }, [hayAlgo]);

  const caja = raiz.current?.getBoundingClientRect();
  const aPantalla = (p: PuntoDeLamina) => {
    const c = viewer?.drawingPointToClient(laminaId, p.pkM, p.cotaM);
    return c === null || c === undefined || caja === undefined
      ? null
      : { x: c.x - caja.left, y: c.y - caja.top };
  };

  const a = puntos[0] ?? null;
  const b = puntos.length === 2 ? puntos[1]! : puntos.length === 1 ? cursor : null;
  const pa = a === null ? null : aPantalla(a);
  const pb = b === null ? null : aPantalla(b);
  const medida = a !== null && b !== null ? medirEnLamina(a, b, escala) : null;
  const cerrada = puntos.length === 2;

  const texto =
    medida === null
      ? "Clic en el primer punto"
      : `${coma(medida.distanciaM, 2)} m` +
        (medida.enPapelMm === null || escala === null
          ? ""
          : ` · ${coma(medida.enPapelMm, 1)} mm en la hoja a ${rotuloDeEscala(escala)}`);

  return (
    <>
      <svg
        ref={raiz}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      >
        {pa !== null && pb !== null && (
          <line
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke="var(--color-brand)"
            strokeWidth={cerrada ? 2 : 1.5}
            strokeDasharray={cerrada ? undefined : "5 4"}
          />
        )}
        {[pa, cerrada ? pb : null].map(
          (p, i) =>
            p !== null && (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--color-brand)" stroke="white" />
            ),
        )}
      </svg>

      {/* El resultado va en un rótulo propio, legible y fuera del dibujo, y se anuncia a quien lee pantalla. */}
      <div
        role="status"
        aria-live="polite"
        className="absolute top-14 left-1/2 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-borde bg-surface/95 px-3 py-1.5 text-xs text-fg shadow-[var(--shadow-xl)]"
      >
        <span className="font-medium">Medir</span>
        {" · "}
        {texto}
        {medida !== null && cerrada && (
          <span className="text-fg-3">
            {" "}
            (Δ horizontal {coma(Math.abs(medida.dHorizontalM), 2)} m, Δ vertical{" "}
            {coma(Math.abs(medida.dVerticalM), 2)} m)
          </span>
        )}
        <span className="text-fg-3"> · Esc para salir</span>
      </div>
    </>
  );
}
