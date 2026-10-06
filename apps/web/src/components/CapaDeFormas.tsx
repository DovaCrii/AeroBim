/**
 * Las formas de las marcas sobre una página: rectángulo, nube de revisión y llamada con flecha (`F15.2`).
 *
 * Es una capa SVG del tamaño de la página dibujada, **que no captura el puntero**: el clic sobre una marca
 * lo recibe su botón numerado y el arrastre para trazar una nueva lo recibe la página. Las coordenadas
 * guardadas son fracciones de la hoja y aquí se multiplican por el tamaño en píxeles.
 */

import { puntaDeFlecha, trazoDeNube } from "../marcas-geometria.js";
import type { FormaDeMarca, ObservacionDeDocumento } from "../observaciones-panel.js";

/** Lo que se está trazando ahora mismo, antes de soltar el ratón. */
export interface Borrador {
  readonly forma: FormaDeMarca;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Cerrada en verde, el resto en violeta: los mismos fondos oscuros que los números de las marcas. */
function colorDe(estado: string): string {
  return estado === "cerrada" ? "#1f7a35" : "#7c3aed";
}

function Forma({
  forma,
  x1,
  y1,
  x2,
  y2,
  ancho,
  alto,
  color,
  grueso,
  punteada = false,
}: {
  forma: FormaDeMarca;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ancho: number;
  alto: number;
  color: string;
  grueso: boolean;
  punteada?: boolean;
}) {
  const px = { x1: x1 * ancho, y1: y1 * alto, x2: x2 * ancho, y2: y2 * alto };
  const trazo = {
    stroke: color,
    strokeWidth: grueso ? 3 : 2,
    fill: "none",
    strokeDasharray: punteada ? "6 4" : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (forma === "rectangulo") {
    return (
      <rect
        x={Math.min(px.x1, px.x2)}
        y={Math.min(px.y1, px.y2)}
        width={Math.abs(px.x2 - px.x1)}
        height={Math.abs(px.y2 - px.y1)}
        {...trazo}
      />
    );
  }
  if (forma === "nube") {
    return <path d={trazoDeNube(px, 7)} strokeLinejoin="round" {...trazo} />;
  }
  // Llamada: del lugar de la nota (x1, y1) hasta lo que señala (x2, y2), con punta de flecha.
  const punta = puntaDeFlecha(px.x1, px.y1, px.x2, px.y2, 12);
  return (
    <g>
      <line x1={px.x1} y1={px.y1} x2={px.x2} y2={px.y2} {...trazo} />
      {punta.length === 3 && (
        <polygon
          points={punta.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={color}
          stroke={color}
        />
      )}
    </g>
  );
}

export function CapaDeFormas({
  ancho,
  alto,
  observaciones,
  elegida,
  borrador,
}: {
  ancho: number;
  alto: number;
  observaciones: readonly ObservacionDeDocumento[];
  elegida: string | null;
  borrador: Borrador | null;
}) {
  return (
    <svg
      aria-hidden="true"
      width={ancho}
      height={alto}
      className="pointer-events-none absolute inset-0"
    >
      {observaciones.map((o) =>
        o.forma === null || o.x2 === null || o.y2 === null ? null : (
          <Forma
            key={o.id}
            forma={o.forma}
            x1={o.x}
            y1={o.y}
            x2={o.x2}
            y2={o.y2}
            ancho={ancho}
            alto={alto}
            color={colorDe(o.estado)}
            grueso={o.id === elegida}
          />
        ),
      )}
      {borrador !== null && (
        <Forma {...borrador} ancho={ancho} alto={alto} color="#7c3aed" grueso punteada />
      )}
    </svg>
  );
}
