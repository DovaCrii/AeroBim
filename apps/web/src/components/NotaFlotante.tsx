import { camaraBcfDesdeEscena, type SceneCameraState } from "@aerobim/bim-core";
import type { PickedItem } from "@aerobim/viewer";
import { useEffect, useRef, useState } from "react";
import { cabecerasDeEscritura } from "../csrf.js";

/** Lo que la tarjeta devuelve al guardar, para poder decirlo y refrescar la lista. */
export interface NotaGuardada {
  readonly id: string;
  readonly titulo: string;
  readonly url: string;
  readonly responsable: string;
  readonly esMia: boolean;
}

type Envio =
  | { readonly kind: "escribiendo" }
  | { readonly kind: "enviando" }
  | { readonly kind: "guardada"; readonly nota: NotaGuardada }
  | { readonly kind: "error"; readonly mensaje: string };

const PRIORIDADES = [
  { valor: "alta", texto: "Alta" },
  { valor: "media", texto: "Media" },
  { valor: "baja", texto: "Baja" },
] as const;

/**
 * Dejar una nota sobre el elemento **sin salir del modelo**.
 *
 * **El formulario de página completa era el problema, no una molestia.** Pulsar «Observar» abría
 * otra pantalla, y con las palabras del usuario: «al salir de lo que veo pierdo visión de lo que
 * estoy haciendo». Se anota mirando, y si hay que dejar de mirar para escribir, se anota peor o no
 * se anota.
 *
 * Así que es **una tarjeta flotante y se puede mover**: se arrastra por su cabecera para dejar a la
 * vista justo lo que se está describiendo. Es lo que el usuario pidió con esas palabras — «una
 * tarjeta dentro del visor o algo más móvil».
 *
 * **Lo mínimo para no perder el hallazgo, y el reparto después.** Título y prioridad; el
 * responsable y la fecha se dejan para la pantalla de observaciones. Sin responsable la nota queda
 * a nombre de quien la escribe, que **es cierto** —es suya mientras nadie la tome— y no una
 * asignación inventada.
 */
export function NotaFlotante({
  item,
  revisionId,
  camaraDeAhora,
  onCerrar,
  onGuardada,
}: {
  /** El elemento sobre el que se anota. Su GUID es el ancla. */
  readonly item: PickedItem;
  readonly revisionId: string;
  /** La cámara de este instante. Se lee al abrir la tarjeta, no al seleccionar. */
  readonly camaraDeAhora: () => SceneCameraState | null;
  readonly onCerrar: () => void;
  readonly onGuardada: (nota: NotaGuardada) => void;
}) {
  const [titulo, setTitulo] = useState(
    [item.category, item.name].filter(Boolean).join(" · ").slice(0, 250),
  );
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<string>("media");
  const [envio, setEnvio] = useState<Envio>({ kind: "escribiendo" });
  /** Dónde está la tarjeta. Se arrastra por la cabecera. */
  const [posicion, setPosicion] = useState({ x: 24, y: 72 });
  const arrastre = useRef<{ x: number; y: number } | null>(null);
  const campoTitulo = useRef<HTMLInputElement>(null);

  // El foco entra en el título: la tarjeta se abre para escribir, y pedir un clic más para empezar
  // es la clase de roce que hace que la nota no se escriba.
  useEffect(() => campoTitulo.current?.select(), []);

  // **`Escape` cierra.** Es lo que se pulsa por reflejo, y sin esto la única salida es apuntar a
  // la × — con el modelo detrás pidiendo atención.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  useEffect(() => {
    if (arrastre.current === null) return undefined;
    const alMover = (evento: PointerEvent) => {
      const desde = arrastre.current;
      if (desde === null) return;
      setPosicion({ x: evento.clientX - desde.x, y: evento.clientY - desde.y });
    };
    const alSoltar = () => {
      arrastre.current = null;
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    return () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
    };
  });

  async function guardar() {
    if (titulo.trim() === "") return;
    setEnvio({ kind: "enviando" });

    // **La cámara se lee al guardar, no al seleccionar.** Entre elegir el elemento y escribir la
    // nota uno gira para verlo mejor, y el punto de vista que hay que guardar es el de ahora.
    const escena = camaraDeAhora();
    const camara = escena === null ? null : camaraBcfDesdeEscena(escena);

    try {
      const respuesta = await fetch(`/api/revisiones/${revisionId}/observaciones/`, {
        method: "POST",
        credentials: "same-origin",
        headers: cabecerasDeEscritura(),
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          prioridad,
          guid: item.guid ?? "",
          camara: camara === null ? null : JSON.stringify(camara),
        }),
      });

      if (respuesta.status === 403) {
        return setEnvio({
          kind: "error",
          mensaje: "Tu sesión caducó o tu rol no puede abrir observaciones. Vuelve a entrar.",
        });
      }
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
        return setEnvio({
          kind: "error",
          mensaje: cuerpo.error ?? `El registro respondió ${respuesta.status}.`,
        });
      }

      const nota = (await respuesta.json()) as NotaGuardada;
      setEnvio({ kind: "guardada", nota });
      onGuardada(nota);
    } catch (error: unknown) {
      setEnvio({
        kind: "error",
        mensaje: error instanceof Error ? error.message : "No se pudo guardar.",
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Dejar una nota sobre este elemento"
      style={{ left: posicion.x, top: posicion.y }}
      className="absolute z-20 w-80 rounded-lg border border-white/15 bg-ink/95 shadow-2xl backdrop-blur-sm"
    >
      <header
        onPointerDown={(evento) => {
          arrastre.current = {
            x: evento.clientX - posicion.x,
            y: evento.clientY - posicion.y,
          };
        }}
        className="flex cursor-move items-center gap-2 border-b border-white/10 px-3 py-2"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          Nota sobre el elemento
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar sin guardar"
        >
          ×
        </button>
      </header>

      {envio.kind === "guardada" ? (
        <div className="space-y-2 p-3 text-xs">
          <p className="font-semibold text-emerald-300">Nota guardada.</p>
          {/* **Se dice a nombre de quién quedó**, que es lo que falta por hacer: repartirla. Sin
              esto, una nota sin dueño parece asignada y nadie la recoge. */}
          <p className="leading-snug text-white/60">
            {envio.nota.esMia
              ? `Quedó a tu nombre (${envio.nota.responsable}). Repártela desde la pantalla de observaciones cuando toque.`
              : `Asignada a ${envio.nota.responsable}.`}
          </p>
          <div className="flex gap-2">
            <a
              href={envio.nota.url}
              target="_blank"
              rel="noopener"
              className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            >
              Ver su ficha
            </a>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded bg-brand px-2 py-1 font-medium hover:opacity-90"
            >
              Seguir revisando
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-3 text-xs">
          {/* El ancla, dicha en la propia tarjeta: es lo que hace que la nota sirva fuera de acá,
              y lo que Solibri selecciona al abrir el BCF. */}
          <p className="truncate text-nota text-white/45" title={item.guid ?? undefined}>
            {item.guid === null ? (
              <span className="text-amber-200/80">
                Este elemento no trae GUID: la nota queda sobre la revisión, sin señalarlo.
              </span>
            ) : (
              <>Anclada a {item.guid}</>
            )}
          </p>

          <label className="block">
            <span className="text-white/55">Qué pasa</span>
            <input
              ref={campoTitulo}
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              maxLength={250}
              className="mt-0.5 w-full rounded border border-white/15 bg-shell px-2 py-1"
            />
          </label>

          <label className="block">
            <span className="text-white/55">Detalle (opcional)</span>
            <textarea
              value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)}
              rows={3}
              className="mt-0.5 w-full resize-y rounded border border-white/15 bg-shell px-2 py-1"
            />
          </label>

          <div className="flex items-center gap-2">
            <span className="text-white/55">Prioridad</span>
            {/* Tres botones y no un desplegable: son tres opciones y se elige en un clic. */}
            {PRIORIDADES.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setPrioridad(opcion.valor)}
                className={[
                  "rounded px-2 py-0.5",
                  prioridad === opcion.valor
                    ? "bg-brand font-medium"
                    : "bg-white/10 hover:bg-white/20",
                ].join(" ")}
              >
                {opcion.texto}
              </button>
            ))}
          </div>

          {envio.kind === "error" && <p className="leading-snug text-rose-300">{envio.mensaje}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={envio.kind === "enviando" || titulo.trim() === ""}
              className="rounded bg-brand px-3 py-1 font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {envio.kind === "enviando" ? "Guardando…" : "Guardar nota"}
            </button>
            <span className="text-nota text-white/35">
              El responsable y la fecha se reparten después.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
