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
  /**
   * El relleno de una cara, y **el paso por encima no le quita el color de estado**.
   *
   * Antes el `hover` era un `fill` suelto que ganaba a todo, así que **pasar por la cara activa la
   * dejaba gris**: el cubo perdía la única cosa que informa —cuál es la vista puesta— justo mientras
   * se apuntaba a ella. Lo dijo el usuario: «no siempre responde bien al color de donde se elige».
   *
   * Ahora el estado manda y el `hover` **aclara sobre él**: la activa se pone más viva, las demás
   * pasan de casi invisibles a visibles. Un estado que desaparece al mirarlo no es un estado.
   */
  const relleno = (cual: StandardView) =>
    view === cual ? "fill-brand/45 group-hover:fill-brand/70" : "fill-fg/8 group-hover:fill-fg/20";

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
            clase={relleno("top")}
            etiqueta="Planta"
            textoX={60}
            textoY={40}
            onClick={() => !disabled && onView("top")}
          />
          <Cara
            puntos="12,34 60,60 60,112 12,86"
            clase={relleno("front")}
            etiqueta="Frontal"
            textoX={36}
            textoY={92}
            // **El texto se tumba sobre la cara**, y no es adorno: puesto en horizontal, «Frontal»
            // mide casi lo que la cara —quedaban dos píxeles hasta «Lateral» y se leían como una
            // sola palabra—. Siguiendo la inclinación de la cara sobra sitio, y además es como se
            // ve un cubo de vistas en cualquier CAD.
            inclinacion={26.57}
            onClick={() => !disabled && onView("front")}
          />
          <Cara
            puntos="108,34 108,86 60,112 60,60"
            clase={relleno("side")}
            etiqueta="Lateral"
            textoX={84}
            textoY={92}
            inclinacion={-26.57}
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
  inclinacion = 0,
  onClick,
}: {
  readonly puntos: string;
  readonly clase: string;
  readonly etiqueta: string;
  readonly textoX: number;
  readonly textoY: number;
  /** Grados que se tumba el texto para seguir la cara. Cero deja el texto horizontal. */
  readonly inclinacion?: number;
  readonly onClick: () => void;
}) {
  return (
    <g onClick={onClick} className="group">
      <polygon
        points={puntos}
        // **El resaltado del paso por encima va en el trazo, no en el relleno.** El relleno lleva
        // el estado —qué vista está puesta— y pisarlo lo borraba justo al apuntar.
        className={`${clase} stroke-fg-3/50 group-hover:stroke-accent`}
        strokeWidth={1.2}
        strokeLinejoin="round"
      >
        <title>{etiqueta}</title>
      </polygon>
      <text
        // `translate` y luego `skewY`: el orden importa, porque `skewY` deforma alrededor del
        // origen y aplicarlo antes mandaría el texto lejos de la cara.
        transform={`translate(${textoX} ${textoY}) skewY(${inclinacion})`}
        textAnchor="middle"
        // **El tamaño va en unidades del dibujo y no en la escala tipográfica de la aplicación.**
        //
        // Con `text-micro` —11 px— «FRONTAL» medía 46 px sobre una cara de 45: el texto era **más
        // ancho que su cara**, y dejaba dos píxeles hasta «LATERAL», que se leían como una sola
        // palabra. Tumbarlo no lo arregla: `skewY` desplaza en vertical y no estrecha nada.
        //
        // A 9 unidades del `viewBox` cabe con margen. Y va aquí y no en una clase porque esto es un
        // dibujo: la escala de texto de la interfaz manda en la interfaz, no dentro de un icono.
        fontSize={9}
        className="pointer-events-none fill-fg tracking-wide uppercase"
      >
        {etiqueta}
      </text>
    </g>
  );
}
