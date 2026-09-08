import { rutasDeVuelta, type RegistryOrigin } from "@aerobim/bim-core";

/**
 * De dónde vino lo que está abierto, y cómo volver. `F12.8`.
 *
 * **Es lo que saca al visor de ser un callejón sin salida.** Se entraba desde el expediente de una
 * revisión y la única salida era el botón de atrás del navegador — que descarta el modelo cargado:
 * veinte megas y medio minuto de conversión por querer mirar la lista de entregables.
 *
 * La asimetría era llamativa: el visor de PDF tenía tres enlaces de vuelta al registro y el de
 * modelos ninguno.
 *
 * ## Y desde el 2026-09-08 es **la misma miga que el portal**, no otra parecida
 *
 * Ésta es la costura: el sitio exacto por el que se cruza del expediente al modelo, y el único
 * elemento que existe **a los dos lados**. Se leían como dos programas por cuatro detalles, y
 * ninguno era una decisión — eran dos personas escribiendo lo mismo dos veces:
 *
 * | Lo que hacía el visor                  | Lo que hace el portal (`.migas` de `app.css`) |
 * | -------------------------------------- | --------------------------------------------- |
 * | Separador `/`                          | Separador `›`                                 |
 * | Enlaces en gris con subrayado gris     | Enlaces en el violeta de acción               |
 * | La revisión, gris y sin papel          | La pantalla actual, `aria-current` y en negrita |
 * | `aria-label` «De dónde viene lo que…»  | `aria-label` «Dónde estás»                    |
 *
 * El que manda es el portal, porque llegó primero y porque su versión es la convención: una miga
 * termina en **dónde estás**, y eso es lo que le faltaba a ésta — la revisión estaba escrita como
 * una nota al margen cuando es el nombre de lo que se está mirando.
 *
 * **Lo que no se copia: la primera miga.** En el portal la lista empieza en «Portal»; aquí la marca
 * está pegada a la izquierda y ya lleva ahí, así que un «Portal» al lado serían dos enlaces al
 * mismo sitio en la misma línea. Es la misma razón por la que la revisión no es un enlace.
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
    <nav aria-label="Dónde estás" className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
      {vueltas.map((vuelta, indice) => (
        <span key={vuelta.href} className="flex min-w-0 items-center gap-1.5">
          {/* El separador dice que hay jerarquía: la obra contiene al entregable. */}
          {indice > 0 && <Separador />}
          <a
            href={vuelta.href}
            className="truncate text-accent underline hover:text-accent-hover"
            title={vuelta.etiqueta}
          >
            {vuelta.etiqueta}
          </a>
        </span>
      ))}
      {/* **La revisión es dónde estás, y por eso no es un enlace.** No tiene pantalla propia:
          llevarla al expediente sería un segundo enlace al mismo sitio en la misma línea. Lo que
          sí es, y antes no decía, es la última miga — con `aria-current="page"`, que es lo que un
          lector de pantalla necesita para anunciar el final del camino. */}
      {revision !== "" && (
        <>
          <Separador />
          <span aria-current="page" className="shrink-0 font-semibold text-fg">
            rev. {revision}
          </span>
        </>
      )}
    </nav>
  );
}

/** El separador de las migas, el mismo carácter que usa el portal. */
function Separador() {
  return (
    <span aria-hidden="true" className="shrink-0 text-fg-3">
      ›
    </span>
  );
}
