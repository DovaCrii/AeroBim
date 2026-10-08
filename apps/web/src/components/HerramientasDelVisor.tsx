import type { MeasureMode } from "@aerobim/viewer";

import {
  IconCursor,
  IconDistance,
  IconNota,
  IconPerfil,
  IconPlanoSalida,
  IconSectionHorizontal,
} from "./icons.js";
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
  conCortes,
  trazandoPerfil,
  hayModelo,
  onSeleccionar,
  onMedir,
  onAnotar,
  onCortar,
  onGenerarPlano,
  onCrearPerfil,
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
  /** Los cortes son del 3D: en el espacio de planos no se ofrecen. */
  readonly conCortes: boolean;
  /** Se está marcando el eje de un perfil. */
  readonly trazandoPerfil: boolean;
  /** Hay un modelo del que sacar un corte, un plano o un perfil. */
  readonly hayModelo: boolean;
  readonly onCortar: () => void;
  readonly onGenerarPlano: () => void;
  readonly onCrearPerfil: () => void;
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
      {/* **Sacar de lo que se mira: cortes, planos y perfiles** (2026-10-08). Estaban solo en la cinta,
          en la pestaña «Modelo» o «Documentar», y «no encuentro cómo generar los cortes y los planos».
          Son los mismos mandatos que los de la cinta, a un clic del modelo y en los dos espacios. */}
      <span aria-hidden="true" className="my-0.5 h-px w-full bg-borde" />
      {conCortes && (
        <BotonFlotante
          compacto
          icono={<IconSectionHorizontal />}
          nombre="Cortar"
          ayuda={
            hayModelo
              ? "Corte horizontal del modelo. Más cortes y «Quitar» en la pestaña Modelo"
              : "Abre un modelo primero"
          }
          desactivado={!hayModelo}
          onClick={onCortar}
        />
      )}
      <BotonFlotante
        compacto
        icono={<IconPlanoSalida />}
        nombre="Plano"
        ayuda={
          hayModelo
            ? "Genera el plano en planta de lo que está encendido y lo abre en 2D"
            : "Abre un modelo primero"
        }
        desactivado={!hayModelo}
        onClick={onGenerarPlano}
      />
      <BotonFlotante
        compacto
        icono={<IconPerfil />}
        nombre="Perfil"
        ayuda={
          hayModelo
            ? "Marca un eje con clics y saca el perfil a lo largo de él, con su PK"
            : "Abre un modelo primero"
        }
        activo={trazandoPerfil}
        desactivado={!hayModelo}
        onClick={onCrearPerfil}
      />
    </PanelFlotante>
  );
}
