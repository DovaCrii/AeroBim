import { leerVistaCompartida, type VistaCompartida } from "@aerobim/bim-core";
import { useCallback, useEffect, useState } from "react";
import { cabecerasDeEscritura } from "../csrf.js";
import { IconViewIso, IconX } from "./icons.js";

/** Una vista compartida tal como la manda el registro, con quién la puso. */
interface VistaDelProyecto {
  readonly id: string;
  readonly nombre: string;
  readonly autor: string;
  /** `true` si la compartió quien está mirando: es lo que decide si se ofrece borrarla. */
  readonly esMia: boolean;
  readonly vista: VistaCompartida;
}

type Estado =
  | { readonly kind: "sin-proyecto" }
  | { readonly kind: "cargando" }
  | {
      readonly kind: "listo";
      readonly vistas: readonly VistaDelProyecto[];
      readonly puedeCompartir: boolean;
    }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

/**
 * Las vistas del proyecto: las que sí se le pueden pasar a otra persona.
 *
 * **Las vistas guardadas viven en el navegador y ahí se quedan.** Sobreviven a recargar la página y
 * no salen del equipo —lo dice el pie de su propia sección—, así que dos personas revisando el mismo
 * modelo no pueden mirar lo mismo. Coordinar es exactamente eso.
 *
 * **Las locales no desaparecen y esta sección no las reemplaza.** Una vista local es de trabajo
 * —«déjame esto como está mientras almuerzo»— y no cuesta nada: ni viaje al servidor ni permiso que
 * pedir. Compartir es otra cosa y es un acto explícito.
 *
 * **Se comparte lo que se está mirando, no una vista local guardada.** No es una simplificación: una
 * vista local **no guarda lo suficiente** para armar un viewpoint —le falta el «arriba» real de la
 * imagen y el alto de la vista ortogonal, que son justo los dos datos que BCF exige y que una vista
 * de trabajo no necesita—. Convertirla obligaría a inventarlos.
 */
export function VistasCompartidas({
  proyectoId,
  onCapturar,
  onAplicar,
}: {
  /** La obra de la que está abierto el modelo, o `null` si vino de un archivo del disco. */
  readonly proyectoId: string | null;
  /** La vista de ahora mismo, en la forma que viaja. `null` si la cámara no se puede expresar. */
  readonly onCapturar: (nombre: string) => Promise<VistaCompartida | null>;
  /** Deja la pantalla como la tenía quien la compartió. */
  readonly onAplicar: (vista: VistaCompartida) => Promise<void>;
}) {
  const [estado, setEstado] = useState<Estado>({ kind: "sin-proyecto" });
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Lo que falló al compartir, dicho junto al formulario y no en un aviso suelto. */
  const [fallo, setFallo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (proyectoId === null) return setEstado({ kind: "sin-proyecto" });
    setEstado({ kind: "cargando" });

    try {
      const respuesta = await fetch(`/api/proyectos/${proyectoId}/vistas/`, {
        credentials: "same-origin",
      });
      if (respuesta.status === 403) return setEstado({ kind: "sin-permiso" });
      if (!respuesta.ok) {
        return setEstado({ kind: "error", mensaje: `El registro respondió ${respuesta.status}.` });
      }

      const datos = (await respuesta.json()) as {
        puedeCompartir: boolean;
        vistas: readonly Record<string, unknown>[];
      };

      // **Lo que llega se lee con desconfianza**, igual que el almacenamiento del navegador: una
      // vista guardada hace meses puede venir de una versión anterior del formato, y aplicar media
      // vista deja la pantalla en un sitio que nadie eligió. Lo ilegible se descarta y lo demás se
      // conserva, que es lo que hace `parseSavedViews` con las locales.
      const vistas: VistaDelProyecto[] = [];
      for (const cruda of datos.vistas) {
        const vista = leerVistaCompartida(cruda);
        if (vista === null) continue;
        vistas.push({
          id: String(cruda.id),
          nombre: vista.nombre,
          autor: String(cruda.autor ?? ""),
          esMia: cruda.esMia === true,
          vista,
        });
      }

      setEstado({ kind: "listo", vistas, puedeCompartir: datos.puedeCompartir });
    } catch (error: unknown) {
      setEstado({
        kind: "error",
        mensaje: error instanceof Error ? error.message : "No se pudo consultar.",
      });
    }
  }, [proyectoId]);

  useEffect(() => void cargar(), [cargar]);

  async function compartir() {
    const limpio = nombre.trim();
    if (limpio === "") return;
    setEnviando(true);
    setFallo(null);

    try {
      const vista = await onCapturar(limpio);
      if (vista === null) {
        return setFallo("Esta cámara no se puede compartir. Mueve la vista y vuelve a intentarlo.");
      }

      const respuesta = await fetch(`/api/proyectos/${proyectoId}/vistas/`, {
        method: "POST",
        credentials: "same-origin",
        headers: cabecerasDeEscritura(),
        body: JSON.stringify({
          nombre: vista.nombre,
          camara: JSON.stringify(vista.camara),
          visibilidad: vista.visibilidad === null ? null : JSON.stringify(vista.visibilidad),
          cortes: JSON.stringify(vista.cortes),
        }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
        return setFallo(cuerpo.error ?? `El registro respondió ${respuesta.status}.`);
      }

      setNombre("");
      await cargar();
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : "No se pudo compartir.");
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(id: string) {
    await fetch(`/api/vistas/${id}/`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: cabecerasDeEscritura(),
    });
    await cargar();
  }

  if (estado.kind === "sin-proyecto") {
    return (
      <p className="p-3 text-nota leading-snug text-fg-3">
        Este modelo se abrió de un archivo del disco. Las vistas se comparten dentro de una obra del
        registro.
      </p>
    );
  }

  if (estado.kind === "cargando") {
    return <p className="p-3 text-xs text-fg-3">Consultando…</p>;
  }

  if (estado.kind === "sin-permiso") {
    return <p className="p-3 text-nota text-fg-3">Tu rol no puede ver las vistas del proyecto.</p>;
  }

  if (estado.kind === "error") {
    return <p className="p-3 text-nota text-warn">{estado.mensaje}</p>;
  }

  return (
    <div className="p-1.5">
      {estado.puedeCompartir && (
        <form
          className="flex gap-1"
          onSubmit={(evento) => {
            evento.preventDefault();
            void compartir();
          }}
        >
          <input
            type="text"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            placeholder="Nombre de la vista"
            maxLength={120}
            className="min-w-0 flex-1 rounded border border-borde bg-surface-3 px-2 py-1 text-xs text-fg placeholder:text-fg-3"
          />
          <button
            type="submit"
            disabled={enviando || nombre.trim() === ""}
            title="Comparte lo que estás mirando ahora: la cámara, lo apagado y los cortes"
            className="shrink-0 rounded bg-action px-2 py-1 text-xs font-medium text-fg hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
          >
            {enviando ? "…" : "Compartir"}
          </button>
        </form>
      )}

      {fallo !== null && <p className="px-1 pt-1.5 text-nota text-danger">{fallo}</p>}

      {estado.vistas.length === 0 ? (
        <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
          Ninguna todavía. Una vista compartida la ve todo el proyecto: la cámara, lo apagado y los
          cortes, anclados al modelo por GUID.
        </p>
      ) : (
        <ul className="pt-1.5">
          {estado.vistas.map((fila) => (
            <li
              key={fila.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
            >
              <span className="shrink-0 text-fg-3">
                <IconViewIso className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => void onAplicar(fila.vista)}
                className="min-w-0 flex-1 truncate text-left text-xs text-fg-2 hover:text-fg"
                title={`Ir a "${fila.nombre}" — compartida por ${fila.autor}`}
              >
                {fila.nombre}
                <span className="text-fg-3"> · {fila.autor}</span>
              </button>
              {/* Solo quien la compartió la quita: es lo que impide que alguien borre la vista que
                  otro dejó preparada para una reunión. Lo contesta el servidor, no la interfaz. */}
              {fila.esMia && (
                <button
                  type="button"
                  onClick={() => void borrar(fila.id)}
                  className="shrink-0 text-fg-3 opacity-0 group-hover:opacity-100 hover:text-danger"
                  title="Quitarla del proyecto"
                  aria-label="Quitarla del proyecto"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
        Se comparte lo que estás mirando ahora. Las de arriba siguen siendo tuyas y de este
        navegador.
      </p>
    </div>
  );
}
