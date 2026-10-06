import type { MeasureMode } from "@aerobim/viewer";

import { IconCursor, IconDistance, IconNota } from "./icons.js";
import { BotonFlotante, PanelFlotante } from "./PanelFlotante.js";

/**
 * La barra vertical de herramientas del 3D (`F15.3`): **seleccionar, medir y anotar**, a la izquierda del
 * lienzo, solo con el icono. Es la disposición de iTwin Design Review —una columna fina junto al modelo—
 * para los tres gestos que se alternan sin parar al revisar.
 *
 * **No hace nada que la cinta no hiciera**: cada botón llama al mismo mandato que su botón de la cinta
 * (`onMeasureMode`, `setNotaAbierta`), y el que está activo es el que la cinta dice. Es un atajo al lado
 * del modelo para quien trabaja con la cinta plegada, no un segundo sistema de herramientas: por eso son
 * tres y no veinte. «Seleccionar» es el modo de reposo —medir y seleccionar no se mezclan— y es el que se
 * activa al salir de medir.
 */
export function HerramientasDelVisor({
  modoDeMedicion,
  puedeAnotar,
  izquierda,
  onSeleccionar,
  onMedir,
  onAnotar,
}: {
  /** El modo de medición activo, o `null` si se está seleccionando. */
  readonly modoDeMedicion: MeasureMode | null;
  /** Hay un elemento (o punto) sobre el que se pueda anotar ahora mismo. */
  readonly puedeAnotar: boolean;
  /** Para correrse a la derecha de la ficha cuando esta flota sobre el lienzo. */
  readonly izquierda: string;
  readonly onSeleccionar: () => void;
  readonly onMedir: () => void;
  readonly onAnotar: () => void;
}) {
  return (
    <PanelFlotante posicion="izquierda-arriba" etiqueta="Herramientas" izquierda={izquierda}>
      <BotonFlotante
        compacto
        icono={<IconCursor />}
        nombre="Seleccionar"
        ayuda="Elige elementos del modelo con un clic"
        activo={modoDeMedicion === null}
        onClick={onSeleccionar}
      />
      <BotonFlotante
        compacto
        icono={<IconDistance />}
        nombre="Medir"
        ayuda="Mide una distancia entre dos puntos del modelo. Más modos en la pestaña Medición"
        activo={modoDeMedicion !== null}
        onClick={onMedir}
      />
      <BotonFlotante
        compacto
        icono={<IconNota />}
        nombre="Anotar"
        ayuda={
          puedeAnotar
            ? "Deja una observación sobre lo seleccionado"
            : "Selecciona un elemento del registro primero"
        }
        desactivado={!puedeAnotar}
        onClick={onAnotar}
      />
    </PanelFlotante>
  );
}
