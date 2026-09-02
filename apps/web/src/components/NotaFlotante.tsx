import {
  camaraBcfDesdeEscena,
  type LineaIfc,
  type SceneCameraState,
  type VisibilidadBcf,
} from "@aerobim/bim-core";
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
  visibilidadDeAhora,
  fotoDeAhora,
  marcadoDeAhora,
  onCerrar,
  onGuardada,
}: {
  /** El elemento sobre el que se anota. Su GUID es el ancla. */
  readonly item: PickedItem;
  readonly revisionId: string;
  /** La cámara de este instante. Se lee al abrir la tarjeta, no al seleccionar. */
  readonly camaraDeAhora: () => SceneCameraState | null;
  /**
   * Qué se está viendo ahora mismo, en GUID y en la forma de un viewpoint. `F4.7`.
   *
   * Se lee igual que la cámara —al guardar, no al seleccionar—, y por el mismo motivo: entre elegir
   * el elemento y escribir la nota uno apaga lo que estorba, y eso es parte de lo que hay que
   * contar.
   */
  readonly visibilidadDeAhora: () => Promise<VisibilidadBcf | null>;
  /**
   * La foto del lienzo, como PNG en un `data:`. `null` si no hay nada dibujado que enseñar.
   *
   * **Es lo que hace que el BCF se entienda sin abrir el modelo**: todo visor del mercado dibuja la
   * lista de temas con su miniatura al lado.
   */
  readonly fotoDeAhora: () => string | null;
  /**
   * Lo que se señaló: las cotas visibles como segmentos del viewpoint. `F4.5`.
   *
   * **Es lo que convierte «choca con el ducto» en un hallazgo comprobable**: la cota de 4 cm que lo
   * demuestra viaja con la nota, en tres dimensiones y sobre el modelo del otro.
   */
  readonly marcadoDeAhora: () => readonly LineaIfc[];
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
    // **Y qué se estaba viendo**, que es la otra mitad del punto de vista. Sin esto, una nota
    // tomada aislando una planta sale en el BCF con el edificio entero y el problema tapado por lo
    // que precisamente se había apagado.
    const visibilidad = await visibilidadDeAhora();
    // **La tarjeta no sale en la foto, y eso es lo que la hace utilizable.** Se captura el lienzo
    // del visor y esta tarjeta es HTML por encima: la imagen que llega al BCF es el modelo limpio,
    // sin el formulario tapando media pantalla. Por eso no hay que cerrarla para tomarla.
    const foto = fotoDeAhora();
    /*
     * **Y qué se señalaba.** Las cotas que están a la vista son el marcado del viewpoint: BCF lo
     * guarda como segmentos en coordenadas del modelo, y medir es justamente poner puntos ahí.
     * Solo las visibles — una cota apagada es una que quien anota decidió no mostrar.
     */
    const marcado = marcadoDeAhora();

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
          visibilidad: visibilidad === null ? null : JSON.stringify(visibilidad),
          instantanea: foto,
          marcado: marcado.length === 0 ? null : JSON.stringify(marcado),
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
      className="absolute z-20 w-80 rounded-lg border border-borde bg-surface/95 shadow-xl backdrop-blur-sm"
    >
      <header
        onPointerDown={(evento) => {
          arrastre.current = {
            x: evento.clientX - posicion.x,
            y: evento.clientY - posicion.y,
          };
        }}
        className="flex cursor-move items-center gap-2 border-b border-borde px-3 py-2"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          Nota sobre el elemento
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cerrar sin guardar"
        >
          ×
        </button>
      </header>

      {envio.kind === "guardada" ? (
        <div className="space-y-2 p-3 text-xs">
          <p className="font-semibold text-ok">Nota guardada.</p>
          {/* **Se dice a nombre de quién quedó**, que es lo que falta por hacer: repartirla. Sin
              esto, una nota sin dueño parece asignada y nadie la recoge. */}
          <p className="leading-snug text-fg-2">
            {envio.nota.esMia
              ? `Quedó a tu nombre (${envio.nota.responsable}). Repártela desde la pantalla de observaciones cuando toque.`
              : `Asignada a ${envio.nota.responsable}.`}
          </p>
          <div className="flex gap-2">
            <a
              href={envio.nota.url}
              target="_blank"
              rel="noopener"
              className="rounded-sm bg-surface-2 px-2 py-1 hover:bg-surface-3"
            >
              Ver su ficha
            </a>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-sm bg-action px-2 py-1 font-medium hover:bg-action-hover"
            >
              Seguir revisando
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-3 text-xs">
          {/* El ancla, dicha en la propia tarjeta: es lo que hace que la nota sirva fuera de acá,
              y lo que Solibri selecciona al abrir el BCF. */}
          <p className="truncate text-nota text-fg-3" title={item.guid ?? undefined}>
            {item.guid === null ? (
              <span className="text-warn">
                Este elemento no trae GUID: la nota queda sobre la revisión, sin señalarlo.
              </span>
            ) : (
              <>Anclada a {item.guid}</>
            )}
          </p>

          <label className="block">
            <span className="text-fg-2">Qué pasa</span>
            <input
              ref={campoTitulo}
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              maxLength={250}
              className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-1"
            />
          </label>

          <label className="block">
            <span className="text-fg-2">Detalle (opcional)</span>
            <textarea
              value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)}
              rows={3}
              className="mt-0.5 w-full resize-y rounded-sm border border-borde bg-shell px-2 py-1"
            />
          </label>

          <div className="flex items-center gap-2">
            <span className="text-fg-2">Prioridad</span>
            {/* Tres botones y no un desplegable: son tres opciones y se elige en un clic. */}
            {PRIORIDADES.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setPrioridad(opcion.valor)}
                className={[
                  "rounded-sm px-2 py-0.5",
                  prioridad === opcion.valor
                    ? "bg-action font-medium"
                    : "bg-surface-2 hover:bg-surface-3",
                ].join(" ")}
              >
                {opcion.texto}
              </button>
            ))}
          </div>

          {envio.kind === "error" && <p className="leading-snug text-danger">{envio.mensaje}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={envio.kind === "enviando" || titulo.trim() === ""}
              className="rounded-sm bg-action px-3 py-1 font-medium hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {envio.kind === "enviando" ? "Guardando…" : "Guardar nota"}
            </button>
            <span className="text-nota text-fg-3">
              El responsable y la fecha se reparten después.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
