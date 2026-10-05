import { useCallback, useEffect, useState } from "react";
import type { ObservacionDelModelo } from "./temas.js";

/** Lo que se sabe de los temas de una obra: cargando, listos, o por qué no hay. */
export type EstadoDeTemas =
  | { readonly kind: "sin-proyecto" }
  | { readonly kind: "cargando" }
  | {
      readonly kind: "listo";
      readonly observaciones: readonly ObservacionDelModelo[];
      readonly puedeDescartar: boolean;
    }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

/**
 * Pide los temas de una obra **una sola vez**, para quien los necesite (2026-10-05).
 *
 * Antes los pedía el panel «Coordinación» al desplegarse, y los reportaba hacia arriba. Con la tabla
 * acoplada abajo eso se rompió: la tabla salía **vacía** mientras el panel estuviera plegado, que es
 * como arranca —las secciones del navegador empiezan plegadas—. Dos vistas de los mismos datos no
 * pueden depender de que una de ellas esté a la vista; los pide quien las reparte, y las dos leen
 * el mismo estado, que además evita dos peticiones a la misma consulta —dos listas que pueden
 * discrepar por medio segundo—.
 *
 * Se piden **por obra y no por revisión**: un hallazgo sobre una viga de la estructura importa mirando
 * el modelo de arquitectura, que es de lo que trata coordinar.
 *
 * `recargar` cambia para volver a pedir la lista: al guardar una nota, por ejemplo.
 */
export function useTemasDeLaObra(
  proyectoId: string | null,
  recargar: number,
): {
  readonly estado: EstadoDeTemas;
  /** Saca un tema de la lista sin volver a pedirla: lo que se descarta se va al instante. */
  readonly quitar: (id: string) => void;
} {
  const [estado, setEstado] = useState<EstadoDeTemas>({ kind: "sin-proyecto" });

  useEffect(() => {
    if (proyectoId === null) {
      setEstado({ kind: "sin-proyecto" });
      return;
    }

    let cancelado = false;
    setEstado({ kind: "cargando" });

    void (async () => {
      try {
        const respuesta = await fetch(`/api/proyectos/${proyectoId}/observaciones-modelo/`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (cancelado) return;

        // Un 403 es que este rol no puede leer observaciones, no que algo falló: decirlo como
        // error manda a buscar el problema donde no está.
        if (respuesta.status === 403) return setEstado({ kind: "sin-permiso" });
        if (!respuesta.ok) {
          return setEstado({
            kind: "error",
            mensaje: `El registro respondió ${respuesta.status}.`,
          });
        }

        const datos = (await respuesta.json()) as {
          observaciones?: readonly ObservacionDelModelo[];
          puedeDescartar?: boolean;
        };
        if (!cancelado) {
          setEstado({
            kind: "listo",
            observaciones: datos.observaciones ?? [],
            puedeDescartar: datos.puedeDescartar === true,
          });
        }
      } catch (error: unknown) {
        if (!cancelado) {
          setEstado({ kind: "error", mensaje: error instanceof Error ? error.message : "" });
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [proyectoId, recargar]);

  const quitar = useCallback((id: string) => {
    setEstado((actual) =>
      actual.kind === "listo"
        ? { ...actual, observaciones: actual.observaciones.filter((una) => una.id !== id) }
        : actual,
    );
  }, []);

  return { estado, quitar };
}
