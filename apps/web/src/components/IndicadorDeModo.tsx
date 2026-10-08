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
      titulo: hayModelo ? "Modelo en 3D" : "Sin plano abierto",
      ayuda: hayModelo
        ? "Para trabajar en 2D: «Generar plano» o «Crear perfil», o abre un DXF."
        : "Abre un DXF o genera un plano desde el modelo.",
    };
  }
  return {
    dimension: "3D",
    titulo: "Modelo en 3D",
    ayuda: "Clic selecciona, doble clic acerca. Órbita gira y Desplazar mueve.",
  };
}

/**
 * Una etiqueta pequeña, bajo el selector de vista, que dice **si lo que se mira es 3D o 2D** y qué se
 * puede hacer ahí. No captura el ratón: es un rótulo, no un control.
 */
export function IndicadorDeModo({ modo }: { readonly modo: ModoDelVisor }) {
  return (
    <div
      role="status"
      aria-label={`Vista actual: ${modo.titulo}`}
      className="pointer-events-none absolute top-[5.25rem] right-3 z-10 flex max-w-[18rem] items-start gap-2 rounded-lg border border-borde bg-surface/90 px-2.5 py-1.5 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <span
        className={[
          "mt-0.5 rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums",
          // El 3D va relleno y el 2D solo con contorno: se distinguen sin depender del color.
          modo.dimension === "3D"
            ? "bg-action text-sobre-accion"
            : "border border-accent text-accent",
        ].join(" ")}
      >
        {modo.dimension}
      </span>
      <span className="min-w-0 text-xs leading-snug">
        <span className="block font-medium text-fg">{modo.titulo}</span>
        <span className="block text-fg-2">{modo.ayuda}</span>
      </span>
    </div>
  );
}
