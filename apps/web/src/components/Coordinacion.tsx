import type { BcfCamera } from "@aerobim/bim-core";
import { useCallback, useEffect, useState } from "react";

/** Una observación anclada al modelo, tal como la manda el registro. */
export interface ObservacionDelModelo {
  readonly id: string;
  readonly titulo: string;
  readonly guid: string;
  readonly prioridad: string;
  readonly prioridadTexto: string;
  readonly estadoTexto: string;
  readonly responsable: string;
  readonly vence: string | null;
  readonly vencida: boolean;
  readonly camara: BcfCamera | null;
  readonly url: string;
}

type Estado =
  | { readonly kind: "sin-proyecto" }
  | { readonly kind: "cargando" }
  | { readonly kind: "listo"; readonly observaciones: readonly ObservacionDelModelo[] }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

/** Cuán fuerte se pinta cada prioridad. **El texto va siempre**; el color es refuerzo. */
const TONO: Record<string, string> = {
  alta: "text-rose-300",
  media: "text-white/70",
  baja: "text-white/45",
};

/**
 * Las observaciones del modelo, y el clic que lleva al problema.
 *
 * **Es la mitad que faltaba del ciclo de coordinación.** La observación se creaba desde el visor
 * —desde la ficha de un elemento, con su GUID y su cámara— y para **verla** había que salir a otra
 * pantalla: quien coordinaba tenía el hallazgo en un sitio y el modelo en otro.
 *
 * Un clic hace las dos cosas que hacen falta: **pone la cámara donde estaba quien lo encontró y
 * selecciona el elemento**. Es lo que Solibri hace bien y lo que convierte una lista en una
 * herramienta de coordinación.
 *
 * Se piden **por proyecto y no por revisión**: un hallazgo sobre una viga de la estructura importa
 * mirando el modelo de arquitectura, que es de lo que trata coordinar.
 */
export function Coordinacion({
  proyectoId,
  onAbrir,
  recargar,
}: {
  /** La obra de la que está abierto el modelo, o `null` si vino de un archivo del disco. */
  readonly proyectoId: string | null;
  /** Lleva la cámara y selecciona. Devuelve `false` si el GUID no está en ningún modelo abierto. */
  readonly onAbrir: (observacion: ObservacionDelModelo) => Promise<boolean>;
  /** Cambia para volver a pedir la lista: al crear una observación, por ejemplo. */
  readonly recargar?: number;
}) {
  const [estado, setEstado] = useState<Estado>({ kind: "sin-proyecto" });
  /** El GUID que no se encontró, para poder decirlo junto a su fila y no en un aviso suelto. */
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);

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
        };
        if (!cancelado) {
          setEstado({ kind: "listo", observaciones: datos.observaciones ?? [] });
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

  const abrir = useCallback(
    async (observacion: ObservacionDelModelo) => {
      const encontrada = await onAbrir(observacion);
      // **Se dice cuál no se encontró, no «no se encontró».** Con quince filas, un aviso suelto
      // obliga a adivinar de cuál habla.
      setNoEncontrada(encontrada ? null : observacion.id);
    },
    [onAbrir],
  );

  if (estado.kind === "sin-proyecto") {
    return (
      <p className="p-3 text-xs leading-snug text-white/35">
        Abre un modelo del registro y acá aparecen las observaciones de su obra ancladas a
        elementos.
      </p>
    );
  }

  if (estado.kind === "cargando") {
    return <p className="p-3 text-xs text-white/35">Buscando observaciones…</p>;
  }

  if (estado.kind === "sin-permiso") {
    return (
      <p className="p-3 text-xs leading-snug text-white/35">
        Tu rol no puede ver las observaciones de esta obra.
      </p>
    );
  }

  if (estado.kind === "error") {
    return <p className="p-3 text-xs leading-snug text-white/40">{estado.mensaje}</p>;
  }

  if (estado.observaciones.length === 0) {
    return (
      <p className="p-3 text-xs leading-snug text-white/35">
        Ninguna observación abierta anclada a un elemento. Las que están sobre un documento se ven
        en su propia pantalla.
      </p>
    );
  }

  return (
    <ul className="min-h-0 overflow-y-auto p-2 text-xs">
      {estado.observaciones.map((observacion) => (
        <li key={observacion.id} className="mb-1">
          <button
            type="button"
            onClick={() => void abrir(observacion)}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-white/10"
            title={`${observacion.titulo} · ${observacion.guid}`}
          >
            <span className="flex items-baseline gap-1.5">
              {/* La prioridad con texto y no solo con color: uno de cada doce hombres no
                  distingue rojo de verde. */}
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase ${TONO[observacion.prioridad] ?? "text-white/60"}`}
              >
                {observacion.prioridadTexto}
              </span>
              <span className="truncate">{observacion.titulo}</span>
            </span>
            <span className="mt-0.5 block truncate text-white/40">
              {observacion.responsable}
              {observacion.vence !== null && ` · vence ${observacion.vence}`}
              {observacion.vencida && " · ⚠ vencida"}
              {observacion.camara === null && " · sin cámara guardada"}
            </span>
          </button>

          {noEncontrada === observacion.id && (
            <p className="px-2 pb-1 text-[11px] leading-snug text-amber-200/80">
              Ese elemento no está en ningún modelo abierto. Suele ser de otra disciplina: abre su
              modelo y vuelve a intentarlo.
            </p>
          )}

          {/* El enlace a su pantalla, que es donde se comenta y se cierra. Va aparte del botón
              porque son dos cosas distintas: mirar el problema y responderlo. */}
          <a
            href={observacion.url}
            target="_blank"
            rel="noopener"
            className="ml-2 text-[11px] text-white/35 underline hover:text-white/70"
          >
            abrir su ficha
          </a>
        </li>
      ))}
    </ul>
  );
}
