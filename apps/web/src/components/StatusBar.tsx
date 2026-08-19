import type { MeasureMode, Measurement, PickedItem } from "@aerobim/viewer";

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
  measurement,
  selected,
  modelCount,
  measurementCount,
}: {
  readonly measureMode: MeasureMode | null;
  /** Puntos ya puestos en la medición en curso: dice qué falta. */
  readonly measurePoints: number;
  readonly measurement: Measurement | null;
  readonly selected: PickedItem | null;
  readonly modelCount: number;
  readonly measurementCount: number;
}) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-white/10 bg-ink/60 px-3 text-[11px]">
      <span className="shrink-0 text-white/45">
        <span className="text-white/30">Modo:</span>{" "}
        <span className="text-white/80">{ETIQUETA_MODO[measureMode ?? "select"]}</span>
      </span>

      <span className="min-w-0 flex-1 truncate text-brand">
        {measureMode !== null
          ? instruccion(measureMode, measurePoints)
          : selected === null
            ? "Clic en un elemento para ver sus propiedades · doble clic para acercarse"
            : `${selected.category ?? "Elemento"}${
                selected.name === null ? "" : ` · ${selected.name}`
              } — doble clic para encuadrarlo`}
      </span>

      {measurement !== null && <Resultado measurement={measurement} />}

      <span className="shrink-0 text-white/30">
        {modelCount === 1 ? "1 modelo" : `${modelCount} modelos`}
        {measurementCount > 0 && ` · ${measurementCount} cotas`}
      </span>
    </footer>
  );
}

const ETIQUETA_MODO: Record<MeasureMode | "select", string> = {
  select: "Seleccionar",
  distance: "Medir distancia",
  angle: "Medir ángulo",
  area: "Medir área",
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
      <span className="text-white/30">{etiqueta}:</span>{" "}
      <span className={destacada ? "font-mono text-brand" : "font-mono text-white/80"}>
        {valor}
      </span>
    </span>
  );
}

/**
 * Qué falta para completar la medida.
 *
 * Cuenta los puntos ya puestos: un texto que no cambia después de cada clic no deja saber si el clic
 * entró, y eso es exactamente lo que hacía pensar que la medición no funcionaba.
 */
function instruccion(mode: MeasureMode, points: number): string {
  if (mode === "distance") {
    return points === 0 ? "Clic en el primer punto" : "Clic en el segundo punto";
  }
  if (mode === "angle") {
    if (points === 0) return "Clic en el primer punto";
    if (points === 1) return "Clic en el vértice del ángulo";
    return "Clic en el tercer punto";
  }
  if (points < 3) return `Contorno del área: ${points} de 3 puntos mínimos`;
  return `Contorno del área: ${points} puntos — Enter o doble clic para cerrarlo`;
}
