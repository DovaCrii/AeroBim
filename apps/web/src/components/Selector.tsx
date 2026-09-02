import { useEffect, useState } from "react";

/** Un modelo o plano que se puede abrir, tal como lo describe el registro. */
interface Abrible {
  readonly id: string;
  readonly correlativo: string;
  readonly idoneidad: string;
  readonly nombre: string;
  readonly entregable: { readonly codigo: string; readonly titulo: string };
}

/** Las revisiones de una obra. La respuesta viene agrupada así desde el servidor. */
interface GrupoDeObra {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly revisiones: readonly Abrible[];
}

type Estado =
  | { readonly kind: "cargando" }
  | {
      readonly kind: "listo";
      readonly proyectos: readonly GrupoDeObra[];
      readonly recortados: number;
    }
  | { readonly kind: "sin-permiso" }
  | { readonly kind: "error"; readonly mensaje: string };

/**
 * Qué hay en el registro que este usuario pueda abrir, para abrirlo desde acá.
 *
 * **Existe para que el visor no dependa de que alguien llegue con un enlace.** La API que lo
 * alimenta estaba escrita desde `F8.8` y **nadie la consumía**: el selector que su propia
 * documentación describía no se había cableado nunca, así que la única forma de abrir una revisión
 * era entrar desde su expediente.
 *
 * **Viene agrupado por obra y no en una lista plana.** En una oficina con seis obras abiertas, una
 * lista plana obliga a leer el código del proyecto en cada fila para saber de cuál es; y el tope
 * de doscientas de antes cortaba en silencio, que se lee como que el modelo no está subido.
 */
export function Selector({
  onAbrir,
  deshabilitado,
}: {
  readonly onAbrir: (revisionId: string) => void;
  /** `true` mientras el visor está cargando algo: abrir dos modelos a la vez los cruza. */
  readonly deshabilitado: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ kind: "cargando" });

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const respuesta = await fetch("/api/revisiones/abribles/", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (cancelado) return;

        // **Un 403 no es un error del visor**: es que este rol no puede leer revisiones. Se dice
        // así y no como «falló algo», que manda a buscar el problema donde no está.
        if (respuesta.status === 403) return setEstado({ kind: "sin-permiso" });
        if (!respuesta.ok) {
          return setEstado({
            kind: "error",
            mensaje: `El registro respondió ${respuesta.status}.`,
          });
        }

        const datos = (await respuesta.json()) as {
          proyectos?: readonly GrupoDeObra[];
          recortados?: number;
        };
        if (cancelado) return;
        setEstado({
          kind: "listo",
          proyectos: datos.proyectos ?? [],
          recortados: datos.recortados ?? 0,
        });
      } catch (error: unknown) {
        if (!cancelado) {
          setEstado({ kind: "error", mensaje: error instanceof Error ? error.message : "" });
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (estado.kind === "cargando") {
    return <p className="p-3 text-xs text-fg-3">Buscando qué se puede abrir…</p>;
  }

  if (estado.kind === "sin-permiso") {
    return (
      <p className="p-3 text-xs leading-snug text-fg-3">
        Tu rol no puede listar revisiones del registro. Puedes abrir un archivo del disco con
        «Abrir».
      </p>
    );
  }

  if (estado.kind === "error") {
    return <p className="p-3 text-xs leading-snug text-fg-3">{estado.mensaje}</p>;
  }

  if (estado.proyectos.length === 0) {
    return (
      <p className="p-3 text-xs leading-snug text-fg-3">
        No hay ningún modelo ni plano publicado que puedas abrir. Un IFC o un DXF subido como
        revisión aparece acá.
      </p>
    );
  }

  return (
    <div className="min-h-0 overflow-x-clip overflow-y-auto p-2 text-xs">
      {estado.proyectos.map((obra) => (
        <section key={obra.id} className="mb-3">
          <p className="px-1 pb-1 text-micro font-semibold tracking-wide text-fg-3 uppercase">
            {obra.codigo}
            <span className="ml-1.5 font-normal normal-case">{obra.nombre}</span>
          </p>
          <ul>
            {obra.revisiones.map((revision) => (
              <li key={revision.id}>
                {/* Es un botón y no un enlace: abrir una revisión **no cambia de página**, carga
                    el modelo en esta escena. Un enlace prometería una navegación que no ocurre. */}
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => onAbrir(revision.id)}
                  className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
                  title={revision.nombre}
                >
                  <span className="block truncate">
                    {revision.entregable.codigo}
                    <span className="ml-1.5 text-fg-3">rev. {revision.correlativo}</span>
                  </span>
                  <span className="block truncate text-fg-3">
                    {revision.entregable.titulo} · {revision.idoneidad}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* **El recorte se dice.** Callado, alguien concluye que su modelo no está subido. */}
      {estado.recortados > 0 && (
        <p className="px-1 pt-1 text-nota leading-snug text-fg-3">
          {estado.recortados} revisiones más no caben en esta lista.{" "}
          <a href="/proyectos/" className="underline">
            Ábrelas desde su obra
          </a>
          .
        </p>
      )}
    </div>
  );
}
