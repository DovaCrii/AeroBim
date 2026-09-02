import type { StandardView } from "@aerobim/viewer";

/**
 * El cubo de vistas, arriba a la derecha del lienzo.
 *
 * **Es la brújula de cualquier CAD**: AutoCAD, Revit, BricsCAD y Navisworks tienen el mismo cubo en
 * la misma esquina, y quien viene de ahí lo busca ahí. Hace dos cosas a la vez —**decir hacia dónde
 * se está mirando** y **cambiarlo con un clic**— y por eso ocupa mucho menos que los cinco botones
 * de vista de la cinta, que es de donde salen.
 *
 * **Por qué dibujado y no una escena aparte.** Un cubo de verdad, con su propio render, cuesta una
 * escena, una cámara y un fotograma por cuadro para algo que solo tiene cuatro respuestas útiles:
 * planta, frontal, lateral e isométrica. Dibujado en SVG cuesta nada y se lee igual — y las caras
 * llevan su nombre escrito, que un cubo con texturas no siempre consigue.
 *
 * La cara activa se pinta con el color de marca: el cubo también informa, no solo manda.
 */
export function ViewCube({
  view,
  onView,
  disabled,
}: {
  /** La última vista aplicada, para resaltarla. `null` en cuanto alguien orbita a mano. */
  readonly view: StandardView | null;
  readonly onView: (view: StandardView) => void;
  readonly disabled: boolean;
}) {
  const activa = (cual: StandardView) => (view === cual ? "fill-brand/45" : "fill-fg/8");

  return (
    <div
      className={[
        "pointer-events-none absolute top-3 right-3 select-none",
        disabled ? "opacity-30" : "opacity-100",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 120 128"
        className="h-28 w-28 overflow-visible"
        role="group"
        aria-label="Cubo de vistas"
      >
        {/* Las tres caras de un cubo isométrico. Cada una es un botón: la de arriba es la planta,
            la de la izquierda el alzado frontal y la de la derecha el lateral. */}
        <g className={disabled ? "" : "pointer-events-auto cursor-pointer"}>
          <Cara
            puntos="60,8 108,34 60,60 12,34"
            clase={activa("top")}
            etiqueta="Planta"
            textoX={60}
            textoY={38}
            onClick={() => !disabled && onView("top")}
          />
          <Cara
            puntos="12,34 60,60 60,112 12,86"
            clase={activa("front")}
            etiqueta="Frontal"
            textoX={36}
            textoY={90}
            onClick={() => !disabled && onView("front")}
          />
          <Cara
            puntos="108,34 108,86 60,112 60,60"
            clase={activa("side")}
            etiqueta="Lateral"
            textoX={84}
            textoY={90}
            onClick={() => !disabled && onView("side")}
          />

          {/* La esquina superior devuelve la isométrica, que es la vista de partida. Va en la
              punta del cubo porque es donde la busca quien usa el cubo de AutoCAD. */}
          <circle
            cx={60}
            cy={8}
            r={7}
            className={[
              "stroke-fg-3/50",
              view === "iso" ? "fill-brand" : "fill-surface/80 hover:fill-fg/15",
            ].join(" ")}
            strokeWidth={1}
            onClick={() => !disabled && onView("iso")}
          >
            <title>Isométrica — la vista general</title>
          </circle>
        </g>
      </svg>
    </div>
  );
}

/** Una cara del cubo: el polígono, su nombre encima y el tooltip. */
function Cara({
  puntos,
  clase,
  etiqueta,
  textoX,
  textoY,
  onClick,
}: {
  readonly puntos: string;
  readonly clase: string;
  readonly etiqueta: string;
  readonly textoX: number;
  readonly textoY: number;
  readonly onClick: () => void;
}) {
  return (
    <g onClick={onClick} className="group">
      <polygon
        points={puntos}
        className={`${clase} stroke-fg-3/50 group-hover:fill-fg/15`}
        strokeWidth={1.2}
        strokeLinejoin="round"
      >
        <title>{etiqueta}</title>
      </polygon>
      <text
        x={textoX}
        y={textoY}
        textAnchor="middle"
        className="pointer-events-none fill-fg text-micro tracking-wide uppercase"
      >
        {etiqueta}
      </text>
    </g>
  );
}
