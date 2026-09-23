/**
 * Archivar la lámina del plano **sin volver al portal**. `G.4`.
 *
 * ## La vuelta que esto quita
 *
 * Generar la planta, descargar el PDF, volver al portal, buscar el entregable, abrir el formulario
 * de subir, elegir el archivo del disco. Seis pasos para mover un archivo que el servidor acaba de
 * fabricar — y en medio, con el modelo y el plano fuera de la vista.
 *
 * ## Y por qué hay que elegir dónde
 *
 * El visor sabe de qué revisión vino, pero **una planta generada del modelo no es una revisión de
 * ese modelo**: es otro documento, normalmente de otra disciplina. Publicarla sobre su origen sería
 * el destino equivocado con toda la comodidad del mundo, que es la peor combinación. Así que se
 * elige, y la lista sale del servidor —solo los entregables de esta obra en los que esta persona
 * puede escribir—.
 *
 * ## Lo que no manda
 *
 * **Ningún archivo.** Manda la misma geometría que ya manda el botón del PDF y el servidor compone
 * el papel con el membrete de la casa. Los bytes que se archivan los escribe el servidor.
 */

import { useEffect, useState } from "react";

import { cabecerasDeEscritura, motivoDe403 } from "../csrf.js";

/** Un entregable donde se puede publicar, como lo manda `DondePublicarAPI`. */
interface Destino {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly disciplina: string;
}

/** Lo que devuelve el servidor al archivar. */
export interface Publicada {
  readonly correlativo: string;
  readonly nombre: string;
  readonly entregable: string;
}

type Estado =
  | { readonly kind: "cargando" }
  | { readonly kind: "eligiendo" }
  | { readonly kind: "enviando" }
  | { readonly kind: "publicada"; readonly que: Publicada }
  | { readonly kind: "error"; readonly mensaje: string };

/**
 * Los códigos de idoneidad que se ofrecen, y **no son los nueve**.
 *
 * Una lámina recién generada del modelo es material de trabajo: sale `S3` —apta para revisión y
 * comentario— o `S0` si es un borrador. Ofrecer `A` desde aquí sería dejar publicar como aprobado
 * para construcción con dos clics y sin que nadie la haya mirado; eso se sube de grado en su
 * pantalla, con su formulario, que es donde está el control.
 */
const IDONEIDADES = [
  { valor: "S3", texto: "S3 · Apto para revisión y comentario" },
  { valor: "S0", texto: "S0 · Borrador, trabajo en curso" },
] as const;

export function PublicarLamina({
  proyectoId,
  hoja,
  onCerrar,
}: {
  readonly proyectoId: string;
  /** La hoja de `Viewer.sheetOf`, tal cual. Se manda entera y el servidor la dibuja. */
  readonly hoja: { readonly nombre: string; readonly recortada: boolean };
  readonly onCerrar: () => void;
}) {
  const [destinos, setDestinos] = useState<readonly Destino[]>([]);
  const [entregableId, setEntregableId] = useState("");
  const [correlativo, setCorrelativo] = useState("");
  const [idoneidad, setIdoneidad] = useState<string>(IDONEIDADES[0].valor);
  const [estado, setEstado] = useState<Estado>({ kind: "cargando" });

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const respuesta = await fetch(`/api/proyectos/${proyectoId}/donde-publicar/`, {
          credentials: "same-origin",
        });
        if (!vigente) return;
        if (respuesta.status === 403) {
          // **El caso normal, no un fallo.** Quien revisa puede mirar el modelo y no publicar en el
          // registro; decirlo así evita que parezca que el botón está roto.
          setEstado({
            kind: "error",
            mensaje:
              "Tu rol puede generar el plano pero no archivarlo en el registro. Descárgalo y " +
              "pásaselo a quien lleva el expediente, o pide el permiso de subir revisiones.",
          });
          return;
        }
        if (!respuesta.ok) {
          setEstado({ kind: "error", mensaje: `El registro respondió ${respuesta.status}.` });
          return;
        }
        const datos = (await respuesta.json()) as { entregables: readonly Destino[] };
        if (!vigente) return;
        setDestinos(datos.entregables);
        setEntregableId(datos.entregables[0]?.id ?? "");
        setEstado({ kind: "eligiendo" });
      } catch {
        if (vigente) setEstado({ kind: "error", mensaje: "No se pudo hablar con el registro." });
      }
    })();
    // Se marca la petición como vencida al desmontar: cerrar el cuadro mientras carga dejaría un
    // `setEstado` sobre un componente que ya no está.
    return () => {
      vigente = false;
    };
  }, [proyectoId]);

  const enviar = async () => {
    setEstado({ kind: "enviando" });
    try {
      const respuesta = await fetch(`/api/entregables/${entregableId}/publicar-lamina/`, {
        method: "POST",
        credentials: "same-origin",
        headers: cabecerasDeEscritura(),
        body: JSON.stringify({ hoja, correlativo, idoneidad }),
      });
      if (respuesta.status === 403) {
        setEstado({
          kind: "error",
          mensaje: motivoDe403(await respuesta.json().catch(() => ({}))),
        });
        return;
      }
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        error?: string;
        correlativo?: string;
        nombre?: string;
        entregable?: string;
      };
      if (!respuesta.ok) {
        setEstado({
          kind: "error",
          mensaje: cuerpo.error ?? `El registro respondió ${respuesta.status}.`,
        });
        return;
      }
      setEstado({
        kind: "publicada",
        que: {
          correlativo: cuerpo.correlativo ?? correlativo,
          nombre: cuerpo.nombre ?? "",
          entregable: cuerpo.entregable ?? "",
        },
      });
    } catch {
      setEstado({ kind: "error", mensaje: "No se pudo hablar con el registro." });
    }
  };

  const listo = entregableId !== "" && correlativo.trim() !== "" && estado.kind === "eligiendo";

  return (
    <div
      role="dialog"
      aria-label="Archivar el plano en el registro"
      className="absolute left-1/2 top-24 z-20 w-96 -translate-x-1/2 rounded-lg border border-borde bg-surface/95 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          Archivar «{hoja.nombre}» en el registro
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cerrar sin archivar"
        >
          ×
        </button>
      </header>

      {estado.kind === "publicada" ? (
        <div className="space-y-2 p-3 text-xs">
          <p className="font-semibold text-ok">Archivado.</p>
          <p className="leading-snug text-fg-2">
            Quedó como revisión {estado.que.correlativo} de {estado.que.entregable}, y pasa a ser la
            vigente. Se descarga como «{estado.que.nombre}».
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-sm bg-action px-2 py-1 font-medium text-sobre-accion hover:bg-action-hover"
          >
            Seguir dibujando
          </button>
        </div>
      ) : (
        <div className="space-y-2 p-3 text-xs">
          {/* **El aviso del recorte va antes de archivar y no después**, al contrario que en la
              descarga: un PDF recortado en el disco se vuelve a generar, y uno recortado en el
              registro ya lo descargó alguien. */}
          {hoja.recortada && (
            <p className="leading-snug text-warn">
              Este plano no cabía entero y se recortó. Apaga capas que no necesites y vuelve a
              generarlo antes de archivarlo.
            </p>
          )}

          <label className="block">
            <span className="text-nota text-fg-3">Entregable</span>
            <select
              value={entregableId}
              onChange={(evento) => setEntregableId(evento.target.value)}
              disabled={estado.kind !== "eligiendo"}
              className="mt-0.5 w-full rounded-sm border border-borde-campo bg-surface-3 px-1.5 py-1"
            >
              {destinos.length === 0 && <option value="">—</option>}
              {destinos.map((uno) => (
                <option key={uno.id} value={uno.id}>
                  {uno.disciplina} · {uno.codigo} — {uno.titulo}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-nota text-fg-3">Correlativo</span>
            <input
              value={correlativo}
              onChange={(evento) => setCorrelativo(evento.target.value)}
              disabled={estado.kind !== "eligiendo"}
              placeholder="P01"
              maxLength={20}
              className="mt-0.5 w-full rounded-sm border border-borde-campo bg-surface-3 px-1.5 py-1"
            />
            {/* **No se propone uno.** El correlativo lo impone cada mandante —es la misma decisión
                que ya está escrita en el modelo— y adivinar «la siguiente letra» archivaría con un
                código que no es el de la obra. */}
            <span className="mt-0.5 block text-nota text-fg-3">
              El que use la obra. No puede repetirse dentro del mismo entregable.
            </span>
          </label>

          <label className="block">
            <span className="text-nota text-fg-3">Idoneidad</span>
            <select
              value={idoneidad}
              onChange={(evento) => setIdoneidad(evento.target.value)}
              disabled={estado.kind !== "eligiendo"}
              className="mt-0.5 w-full rounded-sm border border-borde-campo bg-surface-3 px-1.5 py-1"
            >
              {IDONEIDADES.map((uno) => (
                <option key={uno.valor} value={uno.valor}>
                  {uno.texto}
                </option>
              ))}
            </select>
          </label>

          {estado.kind === "error" && <p className="leading-snug text-danger">{estado.mensaje}</p>}
          {estado.kind === "eligiendo" && destinos.length === 0 && (
            <p className="leading-snug text-fg-2">
              Esta obra no tiene ningún entregable donde archivar. Créalo en el registro y vuelve.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!listo}
              className="rounded-sm bg-action px-2 py-1 font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
            >
              {estado.kind === "enviando" ? "Archivando…" : "Archivar"}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-sm bg-surface-2 px-2 py-1 hover:bg-surface-3"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
