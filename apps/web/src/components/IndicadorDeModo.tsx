import type { Espacio } from "../espacios.js";

/** Lo que el indicador dice del visor: en qué dimensión está y qué se puede hacer ahí. */
export type ModoDelVisor = {
  readonly dimension: "3D" | "2D";
  readonly titulo: string;
  readonly ayuda: string;
};

/**
 * Decide qué dice el indicador. Es una función aparte para poder probarla sin pintar nada.
 *
 * El mismo visor sirve para el modelo y para los planos, y desde fuera se parecen: la captura que
 * motivó esto (2026-10-08) era el espacio «Planos y perfiles» **mostrando el modelo en 3D**, y nada
 * en pantalla decía que eso era 3D ni cómo pasar a 2D.
 */
export function modoDelVisor({
  espacio,
  modo2D,
  laminaAbierta,
  comparando,
  hayModelo,
}: {
  readonly espacio: Espacio;
  readonly modo2D: boolean;
  readonly laminaAbierta: boolean;
  readonly comparando: boolean;
  readonly hayModelo: boolean;
}): ModoDelVisor {
  // **Sin nada abierto no hay nada que seleccionar ni que girar**: decir «clic selecciona» sobre un
  // lienzo vacío era un rótulo que no describía lo que se veía (2026-10-08).
  if (!hayModelo && !laminaAbierta && !modo2D) {
    return {
      dimension: espacio === "planos" ? "2D" : "3D",
      titulo: "Nada abierto",
      ayuda: "Abre un IFC, un plano DXF o una nube de puntos, o arrástralo al lienzo.",
    };
  }
  if (laminaAbierta) {
    return {
      dimension: "2D",
      titulo: "Lámina 2D",
      ayuda: "Rueda para acercar y arrastra para mover. «Salir» vuelve al modelo en 3D.",
    };
  }
  if (modo2D) {
    return {
      dimension: "2D",
      titulo: "Plano 2D",
      ayuda: "El plano solo, en planta. Mide y anota sobre él; «Modo 2D» recupera el modelo.",
    };
  }
  if (comparando) {
    return {
      dimension: "2D",
      titulo: "Plano y modelo",
      ayuda: "El plano sobre el modelo en alambre, en planta. «Comparar» devuelve la vista.",
    };
  }
  if (espacio === "planos") {
    return {
      dimension: "3D",
      titulo: "Modelo en 3D",
      ayuda: "Para trabajar en 2D: «Generar plano» o «Crear perfil», o abre un DXF.",
    };
  }
  return {
    dimension: "3D",
    titulo: "Modelo en 3D",
    ayuda: "Clic selecciona, doble clic acerca. Órbita gira y Desplazar mueve.",
  };
}

/**
 * Una ficha pequeña en la **esquina de abajo a la derecha** del lienzo que dice si lo que se mira es 3D
 * o 2D. Lo que se puede hacer ahí va en su ayuda (al pasar el ratón).
 *
 * Estaba bajo el selector de vista, con el texto entero siempre a la vista, y quedaba encima de la
 * escena y de lo que se iba a pinchar (2026-10-08). Abajo a la derecha no tapa ninguna herramienta, y
 * reducida a la etiqueta sigue diciendo en qué modo se está.
 */
export function IndicadorDeModo({ modo }: { readonly modo: ModoDelVisor }) {
  return (
    <div
      role="status"
      aria-label={`Vista actual: ${modo.titulo}. ${modo.ayuda}`}
      title={modo.ayuda}
      className="absolute right-3 bottom-3 z-10 flex cursor-help items-center gap-1.5 rounded-lg border border-borde bg-surface/90 px-2 py-1 text-xs shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <span
        className={[
          "rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums",
          // El 3D va relleno y el 2D solo con contorno: se distinguen sin depender del color.
          modo.dimension === "3D"
            ? "bg-action text-sobre-accion"
            : "border border-accent text-accent",
        ].join(" ")}
      >
        {modo.dimension}
      </span>
      <span className="font-medium text-fg">{modo.titulo}</span>
    </div>
  );
}
