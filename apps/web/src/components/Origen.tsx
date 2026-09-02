import { rutasDeVuelta, type RegistryOrigin } from "@aerobim/bim-core";

/**
 * De dónde vino lo que está abierto, y cómo volver.
 *
 * **Es lo que saca al visor de ser un callejón sin salida.** Se entraba desde el expediente de una
 * revisión y la única salida era el botón de atrás del navegador — que descarta el modelo cargado:
 * veinte megas y medio minuto de conversión por querer mirar la lista de entregables.
 *
 * La asimetría era llamativa: el visor de PDF tenía tres enlaces de vuelta al registro y el de
 * modelos ninguno.
 *
 * **No se dibuja nada si el modelo se abrió del disco.** No es que el enlace esté deshabilitado:
 * es que no vino de ninguna parte y no hay a dónde volver. Un archivo arrastrado no tiene obra.
 */
export function Origen({ origen }: { readonly origen: RegistryOrigin | null }) {
  const vueltas = rutasDeVuelta(origen);
  if (vueltas.length === 0) return null;

  // **Solo el correlativo, no el nombre completo.** Antes se ponía «716-LCD-ES-M-001 rev. A1» al
  // lado del enlace que ya dice «716-LCD-ES-M-001»: el código salía dos veces en la misma línea, y
  // en una barra estrecha eso es la mitad del espacio gastado en repetirse.
  const revision = origen?.revisionCorrelativo ?? "";

  return (
    <nav
      aria-label="De dónde viene lo que está abierto"
      className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2"
    >
      {vueltas.map((vuelta, indice) => (
        <span key={vuelta.href} className="flex min-w-0 items-center gap-1.5">
          {/* El separador dice que hay jerarquía: la obra contiene al entregable. */}
          {indice > 0 && <span aria-hidden="true">/</span>}
          <a
            href={vuelta.href}
            className="truncate underline decoration-fg-3 hover:text-fg hover:decoration-fg"
            title={vuelta.etiqueta}
          >
            {vuelta.etiqueta}
          </a>
        </span>
      ))}
      {/* La revisión **no es un enlace**: no tiene pantalla propia, y llevarla al expediente sería
          un segundo enlace al mismo sitio en la misma línea — una promesa que no se cumple. */}
      {revision !== "" && <span className="shrink-0 text-fg-3">· rev. {revision}</span>}
    </nav>
  );
}
