import { useState } from "react";

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

  const anchoM = leer(ancho);
  const pasoM = paso.trim() === "" ? null : leer(paso);
  const anchoTransversalM = leer(anchoTransversal);
  const valido =
    vertices.length >= 2 &&
    anchoM !== null &&
    anchoM > 0 &&
    (pasoM === null || pasoM > 0) &&
    anchoTransversalM !== null &&
    anchoTransversalM > 0;

  return (
    <div
      role="dialog"
      aria-label="Crear un perfil"
      className="absolute top-3 left-3 z-20 w-72 rounded-lg border border-borde bg-surface/95 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
        <span className="min-w-0 flex-1 text-xs font-semibold">Crear perfil</span>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cancelar el perfil"
        >
          ×
        </button>
      </header>

      <div className="space-y-2 p-3 text-xs">
        <p className="leading-snug text-fg-2">
          {vertices.length === 0
            ? "Clic en el modelo para marcar el primer punto del eje."
            : vertices.length === 1
              ? "Un punto marcado. Clic en el siguiente: el eje puede tener tantos vértices como curvas."
              : `${vertices.length} puntos · ${largoM.toFixed(1)} m de eje. Sigue marcando, o genera el perfil.`}
        </p>

        <label className="block">
          <span className="text-fg-2">Ancho de la franja (m)</span>
          <input
            value={ancho}
            onChange={(evento) => setAncho(evento.target.value)}
            inputMode="decimal"
            className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-1"
          />
        </label>

        <label className="block">
          <span className="text-fg-2">Una transversal cada (m), opcional</span>
          <input
            value={paso}
            onChange={(evento) => setPaso(evento.target.value)}
            inputMode="decimal"
            placeholder="sin transversales"
            className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-1"
          />
        </label>

        {paso.trim() !== "" && (
          <label className="block">
            <span className="text-fg-2">Ancho de cada transversal (m)</span>
            <input
              value={anchoTransversal}
              onChange={(evento) => setAnchoTransversal(evento.target.value)}
              inputMode="decimal"
              className="mt-0.5 w-full rounded-sm border border-borde bg-shell px-2 py-1"
            />
          </label>
        )}

        {hayNube && (
          <div className="space-y-1">
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
                La nube no está calzada con el modelo: no se superpondrá. Calza primero en «Calce y
                desviación».
              </p>
            )}
            {conNube && (
              <p className="text-nota leading-snug text-fg-3">
                Son puntos, no una línea de terreno. Con muchos, se dibuja una muestra y la ficha lo
                dice.
              </p>
            )}
          </div>
        )}

        {/* Lo que es el resultado, dicho antes de pulsar. */}
        <p className="rounded-sm border border-borde bg-surface-2 px-2 py-1.5 text-nota leading-snug text-fg-3">
          El perfil dibuja los elementos <b className="text-fg-2">encendidos</b> que tocan la
          franja, vistos de lado: no es un corte exacto. Un ancho pequeño se le acerca.
        </p>

        {generando !== null && <p className="truncate text-nota text-accent">{generando}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={!valido || generando !== null}
            onClick={() =>
              onGenerar({
                anchoM: anchoM!,
                pasoDeEstacionesM: pasoM,
                anchoTransversalM: anchoTransversalM!,
                conNube: hayNube && conNube,
              })
            }
            className="rounded-sm bg-action px-2 py-1 font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
            title={
              vertices.length < 2
                ? "Marca al menos dos puntos"
                : "Proyecta la franja y arma el perfil en «Planos generados»"
            }
          >
            Generar el perfil
          </button>
          <button
            type="button"
            disabled={vertices.length === 0 || generando !== null}
            onClick={onDeshacer}
            className="rounded-sm bg-surface-2 px-2 py-1 hover:bg-surface-3 disabled:text-apagado-fg"
          >
            Quitar el último
          </button>
        </div>
      </div>
    </div>
  );
}

/** Un número escrito a mano, con coma o punto. `null` si no es un número. */
function leer(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}
