import { useCallback, useRef } from "react";

/**
 * El tirador que se arrastra para cambiar el tamaño de un panel o de una sección.
 *
 * **Por qué existe.** Un panel de ancho fijo obliga a elegir entre ver el árbol completo o ver el
 * modelo grande, y la elección buena cambia cada diez minutos: revisando capas de un plano hace
 * falta panel, midiendo hace falta lienzo. Cualquier CAD deja mover esas divisiones y aquí también.
 *
 * **Va con eventos de puntero y captura**, no con `mousemove` sobre la ventana: con la captura, el
 * arrastre sigue funcionando aunque el cursor pase por encima del lienzo 3D —que se come los
 * eventos— o salga de la ventana, que era justo donde el tirador se quedaba pegado.
 *
 * El movimiento llega como **incremento**, no como posición absoluta: quien lo usa sabe de qué
 * tamaño parte y cuáles son sus límites, y así el mismo tirador sirve para anchos y para altos.
 */
export function Resizer({
  orientacion,
  onArrastrar,
  ayuda,
}: {
  /** `vertical` mueve un borde izquierdo o derecho; `horizontal`, uno de arriba o abajo. */
  readonly orientacion: "vertical" | "horizontal";
  /** Cuántos píxeles se movió desde el último aviso. */
  readonly onArrastrar: (delta: number) => void;
  readonly ayuda: string;
}) {
  const anterior = useRef<number | null>(null);

  const alMover = useCallback(
    (evento: React.PointerEvent<HTMLDivElement>) => {
      if (anterior.current === null) return;
      const actual = orientacion === "vertical" ? evento.clientX : evento.clientY;
      onArrastrar(actual - anterior.current);
      anterior.current = actual;
    },
    [orientacion, onArrastrar],
  );

  return (
    <div
      role="separator"
      aria-orientation={orientacion}
      title={ayuda}
      onPointerDown={(evento) => {
        evento.preventDefault();
        anterior.current = orientacion === "vertical" ? evento.clientX : evento.clientY;
        evento.currentTarget.setPointerCapture(evento.pointerId);
      }}
      onPointerMove={alMover}
      onPointerUp={(evento) => {
        anterior.current = null;
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }}
      className={[
        // La zona sensible es más ancha que la línea que se ve: tres píxeles de línea no se
        // agarran con el ratón, y al que le cuesta agarrarla concluye que no se puede mover.
        "shrink-0 bg-surface-2 transition-colors duration-[--duracion-corta] ease-[--ease-ab] hover:bg-action/50 active:bg-action-press",
        orientacion === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      ].join(" ")}
    />
  );
}
