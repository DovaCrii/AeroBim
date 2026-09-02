import type { MeasureMode, Measurement, PickedItem } from "@aerobim/viewer";
import { IconEye, IconIsolate } from "./icons.js";

/**
 * La barra de estado del pie, como la de cualquier software de escritorio.
 *
 * **Por qué abajo y no flotando sobre el modelo.** Antes el aviso de medición y el del elemento
 * seleccionado se dibujaban encima del lienzo, tapando justo la zona que se estaba mirando. Un sitio
 * fijo al pie no tapa nada, siempre está en el mismo lugar, y es donde alguien que viene de Revit o
 * de BricsCAD ya mira para saber qué está haciendo la herramienta.
 *
 * Muestra tres cosas, de izquierda a derecha: **qué hace el próximo clic**, **el resultado de la
 * medición** con cada magnitud por su nombre, y **cuánto hay abierto**.
 */
export function StatusBar({
  measureMode,
  measurePoints,
  measureMissed,
  measurement,
  selected,
  modelCount,
  measurementCount,
  isolated,
  hasHidden,
  aligning,
  onUndoIsolate,
  onShowAll,
}: {
  readonly measureMode: MeasureMode | null;
  /** Puntos ya puestos en la medición en curso: dice qué falta. */
  readonly measurePoints: number;
  /**
   * `true` si el último clic al medir no encontró geometría.
   *
   * **Es la mitad que faltaba del arreglo de la medición.** Antes el visor daba por registrado
   * cualquier clic, así que uno que cayó al vacío se veía igual que uno que entró: el aviso
   * pasaba a pedir el punto siguiente y no se dibujaba nada. Ahora el clic al vacío no cuenta —y
   * hay que decirlo, o el silencio se sigue leyendo como «no funciona».
   */
  readonly measureMissed: boolean;
  readonly measurement: Measurement | null;
  readonly selected: PickedItem | null;
  readonly modelCount: number;
  readonly measurementCount: number;
  /** `true` mientras se mira algo aislado: el resto del modelo está apagado por eso. */
  readonly isolated: boolean;
  /** `true` si hay algo fuera de la vista, aislado o apagado a mano. */
  readonly hasHidden: boolean;
  /** El calce de un plano en curso: su nombre y cuántos puntos van puestos. */
  readonly aligning: { readonly planName: string; readonly placed: number } | null;
  /** Sale del último aislamiento y vuelve a lo que había antes de aislar. */
  readonly onUndoIsolate: () => void;
  /** Enciende todo, incluido lo que se había apagado a mano. */
  readonly onShowAll: () => void;
}) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-borde bg-surface px-3 text-nota">
      <span className="shrink-0 text-fg-3">
        <span className="text-fg-3">Modo:</span>{" "}
        <span className="text-fg">{ETIQUETA_MODO[measureMode ?? "select"]}</span>
      </span>

      <span
        className={
          measureMissed && measureMode !== null
            ? "min-w-0 flex-1 truncate text-warn"
            : "min-w-0 flex-1 truncate text-accent"
        }
      >
        {aligning !== null
          ? instruccionDeCalce(aligning.planName, aligning.placed)
          : measureMode !== null
            ? measureMissed
              ? "Ahí no hay geometría: el clic no contó. Apunta al modelo o a un trazo del plano."
              : instruccion(measureMode, measurePoints)
            : selected === null
              ? "Clic en un elemento para ver sus propiedades · doble clic para acercarse"
              : `${selected.category ?? "Elemento"}${
                  selected.name === null ? "" : ` · ${selected.name}`
                } — doble clic para encuadrarlo`}
      </span>

      {measurement !== null && <Resultado measurement={measurement} />}

      {hasHidden && (
        <Visibilidad isolated={isolated} onUndoIsolate={onUndoIsolate} onShowAll={onShowAll} />
      )}

      <span className="shrink-0 text-fg-3">
        {modelCount === 1 ? "1 modelo" : `${modelCount} modelos`}
        {measurementCount > 0 && ` · ${measurementCount} cotas`}
      </span>
    </footer>
  );
}

/**
 * El aviso de que no se está viendo el modelo entero, con la vuelta a un clic.
 *
 * **Está en la barra de estado y no en la cinta a propósito.** La barra se ve en las tres pestañas,
 * y aislar se hace desde la ficha del elemento o desde el árbol, que están abiertos en cualquiera de
 * ellas: con el botón solo en la pestaña Modelo, aislar desde la pestaña Vista dejaba media pantalla
 * apagada sin nada que dijera por qué ni cómo volver.
 *
 * **Las dos salidas son distintas y por eso son dos botones.** "Salir" deshace el aislamiento y
 * devuelve lo de antes —lo que se había apagado a mano sigue apagado—; "Ver todo" enciende el modelo
 * entero. Con una sola, salir de un aislamiento obligaba a rehacer a mano lo que ya estaba apagado.
 */
function Visibilidad({
  isolated,
  onUndoIsolate,
  onShowAll,
}: {
  readonly isolated: boolean;
  readonly onUndoIsolate: () => void;
  readonly onShowAll: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="flex items-center gap-1 text-accent">
        <IconIsolate className="h-3.5 w-3.5" />
        {isolated ? "Vista aislada" : "Hay elementos ocultos"}
      </span>

      {isolated && (
        <button
          type="button"
          onClick={onUndoIsolate}
          className="rounded-sm border border-accent/40 px-1.5 py-0.5 text-accent hover:bg-accent/15"
          title="Sale del aislamiento y vuelve a como estaba el modelo antes de aislar"
        >
          Salir del aislamiento
        </button>
      )}

      <button
        type="button"
        onClick={onShowAll}
        className="flex items-center gap-1 rounded-sm border border-borde px-1.5 py-0.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
        title="Enciende todo el modelo, incluido lo que se apagó a mano"
      >
        <IconEye className="h-3.5 w-3.5" />
        Ver todo
      </button>
    </span>
  );
}

const ETIQUETA_MODO: Record<MeasureMode | "select", string> = {
  select: "Seleccionar",
  distance: "Medir distancia",
  angle: "Medir ángulo",
  area: "Medir área",
  perpendicular: "Medir perpendicular",
};

/**
 * El resultado de la medición, cada magnitud con su nombre.
 *
 * **Las tres distancias van separadas.** Entre dos puntos de una rampa, la directa, la de planta y el
 * desnivel son tres números distintos, y en obra se usa uno u otro según para qué: la horizontal para
 * replantear, el desnivel para una cota. Un solo número obliga a adivinar cuál se está leyendo.
 */
function Resultado({ measurement }: { readonly measurement: Measurement }) {
  if (measurement.mode === "distance") {
    return (
      <span className="flex shrink-0 items-center gap-3">
        <Magnitud etiqueta="Directa" valor={`${measurement.distanceM.toFixed(3)} m`} destacada />
        <Magnitud etiqueta="En planta" valor={`${measurement.horizontalM.toFixed(3)} m`} />
        <Magnitud etiqueta="Desnivel" valor={`${measurement.verticalM.toFixed(3)} m`} />
      </span>
    );
  }

  if (measurement.mode === "angle") {
    return (
      <span className="shrink-0">
        <Magnitud etiqueta="Ángulo" valor={`${measurement.angleDeg.toFixed(1)}°`} destacada />
      </span>
    );
  }

  if (measurement.mode === "perpendicular") {
    return (
      <span className="shrink-0">
        <Magnitud
          etiqueta="Perpendicular"
          valor={`${measurement.distanceM.toFixed(3)} m`}
          destacada
        />
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-3">
      <Magnitud etiqueta="Área" valor={`${measurement.areaM2.toFixed(2)} m²`} destacada />
      <Magnitud etiqueta="Perímetro" valor={`${measurement.perimeterM.toFixed(2)} m`} />
      <Magnitud etiqueta="Vértices" valor={String(measurement.vertices)} />
    </span>
  );
}

/** Una magnitud con su nombre delante, para que no haya que deducir qué es cada número. */
function Magnitud({
  etiqueta,
  valor,
  destacada = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly destacada?: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-fg-3">{etiqueta}:</span>{" "}
      <span className={destacada ? "font-mono text-accent" : "font-mono text-fg"}>{valor}</span>
    </span>
  );
}

/**
 * Qué falta para completar la medida.
 *
 * Cuenta los puntos ya puestos: un texto que no cambia después de cada clic no deja saber si el clic
 * entró, y eso es exactamente lo que hacía pensar que la medición no funcionaba.
 */
/**
 * Qué hay que señalar en cada paso del calce.
 *
 * Los cuatro clics van alternos y **no se distinguen solos**: sin este aviso, nadie sabe si el
 * siguiente clic va sobre el plano o sobre el modelo, y un punto puesto en el sitio equivocado
 * calza el plano en cualquier parte.
 */
function instruccionDeCalce(planName: string, puestos: number): string {
  const pasos = [
    `Calzando ${planName}: clic en un punto reconocible **del plano**`,
    "Ahora el mismo punto **en el modelo**",
    "Segundo punto **del plano**, lo más lejos posible del primero",
    "Y su equivalente **en el modelo**: con este se calza",
  ];
  return `${pasos[puestos] ?? pasos[0]!} · Esc para salir`.replace(/\*\*/g, "");
}

function instruccion(mode: MeasureMode, points: number): string {
  if (mode === "distance") {
    return points === 0 ? "Clic en el primer punto" : "Clic en el segundo punto";
  }
  if (mode === "perpendicular") {
    return points === 0
      ? "Clic en la cara de referencia"
      : "Clic en el punto: se mide en ángulo recto a esa cara";
  }
  if (mode === "angle") {
    if (points === 0) return "Clic en el primer punto";
    if (points === 1) return "Clic en el vértice del ángulo";
    return "Clic en el tercer punto";
  }
  if (points < 3) return `Contorno del área: ${points} de 3 puntos mínimos`;
  return `Contorno del área: ${points} puntos — Enter o doble clic para cerrarlo`;
}
