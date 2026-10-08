import { useState, type ReactNode } from "react";

/** Lo que se le pide al generar un perfil. */
export interface ParametrosDePerfil {
  readonly anchoM: number;
  /** Una transversal cada tantos metros, o `null` si no se piden. */
  readonly pasoDeEstacionesM: number | null;
  readonly anchoTransversalM: number;
  /** Incluir los puntos de la nube abierta en el perfil longitudinal. */
  readonly conNube: boolean;
}

/**
 * La tarjeta de **Crear perfil**: marcar el eje con clics sobre el modelo, y pedir el perfil.
 *
 * Va encima del lienzo y no en un panel, por lo mismo que la nota y el cuadro: lo que se hace aquí
 * es clicar el modelo, y una tarjeta lateral obligaría a mirar a un lado mientras se apunta al otro.
 *
 * ## Compacta, porque tapa lo que se está marcando
 *
 * Mide unos 17 rem y sus secciones se pliegan («Eje», «Franja», «Transversales»); la ayuda larga
 * queda detrás de un `details`. **Generar** y **Quitar el último** están siempre abajo, sin
 * desplazarse. Y se puede **minimizar a una barra de una línea** («Perfil · 2 puntos · 18,9 m —
 * Generar») para seguir pinchando sobre el modelo sin que la tarjeta estorbe.
 *
 * ## Lo que se dice, y por qué
 *
 * - **Qué es el resultado.** Un perfil es la *proyección de la franja*: todo elemento que toca el
 *   ancho elegido, visto de lado. No es un corte exacto de la geometría, y quien lo imprime para una
 *   decisión de obra tiene que saberlo antes de pulsar. Con un ancho pequeño se acerca a un corte.
 * - **El largo del eje**, para que se vea si se ha marcado lo que se creía.
 */
export function PerfilFlotante({
  vertices,
  largoM,
  hayNube,
  hayModelo,
  nubeCalzada,
  generando,
  onDeshacer,
  onCancelar,
  onGenerar,
}: {
  readonly vertices: readonly (readonly [number, number])[];
  /** Lo que mide el eje marcado hasta ahora, en metros. */
  readonly largoM: number;
  /** Hay una nube abierta. */
  readonly hayNube: boolean;
  /** Hay algún modelo IFC abierto. */
  readonly hayModelo: boolean;
  /** La nube está calzada con el modelo. */
  readonly nubeCalzada: boolean;
  /** El aviso de avance mientras se proyecta, o `null` si no se está generando. */
  readonly generando: string | null;
  readonly onDeshacer: () => void;
  readonly onCancelar: () => void;
  readonly onGenerar: (parametros: ParametrosDePerfil) => void;
}) {
  // Los campos son texto mientras se escribe: un número a medio teclear («0.») no es un número, y
  // convertirlo en cada pulsación borraba lo que la persona estaba escribiendo.
  const [ancho, setAncho] = useState("1");
  const [paso, setPaso] = useState("");
  const [anchoTransversal, setAnchoTransversal] = useState("40");
  const [conNube, setConNube] = useState(true);
  const [minimizado, setMinimizado] = useState(false);

  const anchoM = leer(ancho);
  const pasoM = paso.trim() === "" ? null : leer(paso);
  const anchoTransversalM = leer(anchoTransversal);
  const anchoValido = anchoM !== null && anchoM > 0;
  const pasoValido = pasoM === null || pasoM > 0;
  const transversalValida = anchoTransversalM !== null && anchoTransversalM > 0;
  // La misma validación de siempre: la tarjeta cambió de forma, no de reglas.
  const validoParaGenerar = vertices.length >= 2 && anchoValido && pasoValido && transversalValida;

  const generar = () =>
    onGenerar({
      anchoM: anchoM!,
      pasoDeEstacionesM: pasoM,
      anchoTransversalM: anchoTransversalM!,
      conNube: hayNube && conNube,
    });
  const puedeGenerar = validoParaGenerar && generando === null;
  const motivo =
    vertices.length < 2
      ? "Marca al menos dos puntos"
      : !validoParaGenerar
        ? "Revisa los valores marcados con «!»"
        : "Proyecta la franja y arma el perfil en «Planos generados»";

  const resumen =
    vertices.length === 0
      ? "sin puntos"
      : `${vertices.length} ${vertices.length === 1 ? "punto" : "puntos"}${
          vertices.length >= 2 ? ` · ${textoMetros(largoM)}` : ""
        }`;

  if (minimizado) {
    return (
      <div
        role="dialog"
        aria-label="Crear un perfil (minimizado)"
        className="absolute top-16 left-[4.5rem] z-20 flex max-w-[calc(100%-5.5rem)] items-center gap-1.5 rounded-lg border border-borde bg-surface/95 px-2 py-1 text-xs shadow-[var(--shadow-xl)] backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => setMinimizado(false)}
          className="rounded-sm px-1 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Abrir la tarjeta del perfil"
          title="Abrir la tarjeta"
        >
          ▸
        </button>
        <span className="min-w-0 truncate" aria-live="polite">
          {generando ?? `Perfil · ${resumen}`}
        </span>
        <span aria-hidden="true">—</span>
        <button
          type="button"
          disabled={!puedeGenerar}
          onClick={generar}
          title={motivo}
          className="rounded-sm bg-action px-2 py-0.5 font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
        >
          Generar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cancelar el perfil"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Crear un perfil"
      className="absolute top-16 left-[4.5rem] z-20 flex max-h-[calc(100%-9rem)] w-[17rem] flex-col rounded-lg border border-borde bg-surface/95 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <header className="flex items-center gap-1 border-b border-borde px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          Crear perfil <span className="font-normal text-fg-2">· {resumen}</span>
        </span>
        <button
          type="button"
          onClick={() => setMinimizado(true)}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Minimizar la tarjeta del perfil"
          title="Minimizar: seguir marcando sobre el modelo"
        >
          –
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cancelar el perfil"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1.5 text-xs">
        <Seccion titulo="Eje" abierta>
          <p className="leading-snug text-fg-2" aria-live="polite">
            {vertices.length === 0
              ? "Clic en el modelo para marcar el primer punto."
              : vertices.length === 1
                ? "Un punto marcado. Clic en el siguiente."
                : `${vertices.length} puntos · ${textoMetros(largoM)} de eje. Sigue marcando, o genera.`}
          </p>
        </Seccion>

        <Seccion titulo="Franja" abierta aviso={!anchoValido}>
          <label className="block">
            <span className="text-fg-2">Ancho de la franja (m)</span>
            <input
              value={ancho}
              onChange={(evento) => setAncho(evento.target.value)}
              inputMode="decimal"
              aria-invalid={!anchoValido}
              className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-0.5"
            />
          </label>

          {hayNube && (
            <div className="space-y-1 pt-1">
              <label className="flex items-center gap-2 text-fg-2">
                <input
                  type="checkbox"
                  checked={conNube}
                  onChange={(evento) => setConNube(evento.target.checked)}
                  className="accent-action"
                />
                Incluir los puntos de la nube
              </label>
              {conNube && hayModelo && !nubeCalzada && (
                <p className="text-nota leading-snug text-warn">
                  La nube no está calzada con el modelo: no se superpondrá. Calza primero en «Calce
                  y desviación».
                </p>
              )}
              {conNube && (
                <p className="text-nota leading-snug text-fg-3">
                  Son puntos, no una línea de terreno. Con muchos, se dibuja una muestra y la ficha
                  lo dice.
                </p>
              )}
            </div>
          )}
        </Seccion>

        <Seccion
          titulo="Transversales"
          aviso={!pasoValido || (pasoM !== null && !transversalValida)}
        >
          <label className="block">
            <span className="text-fg-2">Una transversal cada (m), opcional</span>
            <input
              value={paso}
              onChange={(evento) => setPaso(evento.target.value)}
              inputMode="decimal"
              placeholder="sin transversales"
              aria-invalid={!pasoValido}
              className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-0.5"
            />
          </label>

          {paso.trim() !== "" && (
            <label className="mt-1 block">
              <span className="text-fg-2">Ancho de cada transversal (m)</span>
              <input
                value={anchoTransversal}
                onChange={(evento) => setAnchoTransversal(evento.target.value)}
                inputMode="decimal"
                aria-invalid={!transversalValida}
                className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-0.5"
              />
            </label>
          )}
        </Seccion>

        {/* Lo que es el resultado: dicho antes de pulsar, pero fuera del camino. */}
        <details className="rounded-sm border border-borde bg-surface-2 px-2 py-1">
          <summary className="cursor-pointer text-nota text-fg-2">ⓘ Qué es este perfil</summary>
          <p className="pt-1 text-nota leading-snug text-fg-3">
            El perfil dibuja los elementos <b className="text-fg-2">encendidos</b> que tocan la
            franja, vistos de lado: no es un corte exacto. Un ancho pequeño se le acerca.
          </p>
        </details>
      </div>

      <footer className="space-y-1 border-t border-borde px-2 py-1.5">
        {generando !== null && <p className="truncate text-nota text-accent">{generando}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!puedeGenerar}
            onClick={generar}
            className="rounded-sm bg-action px-2 py-1 text-xs font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
            title={motivo}
          >
            Generar
          </button>
          <button
            type="button"
            disabled={vertices.length === 0 || generando !== null}
            onClick={onDeshacer}
            className="rounded-sm bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 disabled:text-apagado-fg"
          >
            Quitar el último
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Una sección plegable. Con `aviso`, su título lleva un «!»: hay un valor por revisar dentro. */
function Seccion({
  titulo,
  abierta = false,
  aviso = false,
  children,
}: {
  readonly titulo: string;
  readonly abierta?: boolean;
  readonly aviso?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details open={abierta} className="rounded-sm border border-borde bg-surface-2/40">
      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-fg">
        {titulo}
        {aviso && (
          <span className="ml-1 font-semibold text-warn" title="Hay un valor por revisar">
            !
          </span>
        )}
      </summary>
      <div className="px-2 pt-0.5 pb-1.5">{children}</div>
    </details>
  );
}

/** «18,9 m», con la coma decimal con que se lee en la interfaz. */
function textoMetros(metros: number): string {
  return `${metros.toFixed(1).replace(".", ",")} m`;
}

/** Un número escrito a mano, con coma o punto. `null` si no es un número. */
function leer(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}
