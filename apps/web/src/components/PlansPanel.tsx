import type { LoadedPlan, PlanTransform } from "@aerobim/viewer";
import { useState } from "react";
import { IconEye, IconEyeOff, IconFrameAll, IconX } from "./icons.js";

/**
 * Los planos 2D cargados, con sus capas y su ajuste sobre el modelo.
 *
 * **Un plano no llega calzado y no hay forma de que llegue calzado.** El CAD y el IFC casi nunca
 * comparten origen, el dibujo suele venir en otras unidades de las que declara, y a veces está
 * girado respecto al modelo. Por eso el panel no esconde la colocación: la escala, la cota, el
 * desplazamiento, el giro y el reflejo están a la vista y se corrigen mirando la pantalla, que es
 * como se hace en cualquier CAD cuando se referencia un dibujo externo.
 *
 * Las capas se encienden una por una porque es lo que convierte el plano en una herramienta de
 * comparación: dejar solo `0-MUROS` y ver si cae sobre los muros del modelo.
 */
export function PlansPanel({
  plans,
  hiddenPlans,
  hiddenLayers,
  onTogglePlan,
  onToggleLayer,
  onTransform,
  onFrame,
  onClose,
}: {
  readonly plans: readonly LoadedPlan[];
  /** Planos apagados enteros, por identificador. */
  readonly hiddenPlans: ReadonlySet<string>;
  /** Capas apagadas, como `plano:capa`. */
  readonly hiddenLayers: ReadonlySet<string>;
  readonly onTogglePlan: (id: string, visible: boolean) => void;
  readonly onToggleLayer: (id: string, layer: string, visible: boolean) => void;
  readonly onTransform: (id: string, cambios: Partial<PlanTransform>) => void;
  readonly onFrame: (id: string) => void;
  readonly onClose: (id: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <p className="p-3 text-xs leading-snug text-white/35">
        Ninguno. Arrastra un <span className="text-white/60">DXF</span> para ponerlo bajo el modelo
        y comparar el plano con lo modelado.
      </p>
    );
  }

  return (
    <ul className="p-1">
      {plans.map((plan) => (
        <PlanoEnLista
          key={plan.id}
          plan={plan}
          visible={!hiddenPlans.has(plan.id)}
          hiddenLayers={hiddenLayers}
          onTogglePlan={onTogglePlan}
          onToggleLayer={onToggleLayer}
          onTransform={onTransform}
          onFrame={onFrame}
          onClose={onClose}
        />
      ))}
    </ul>
  );
}

function PlanoEnLista({
  plan,
  visible,
  hiddenLayers,
  onTogglePlan,
  onToggleLayer,
  onTransform,
  onFrame,
  onClose,
}: {
  readonly plan: LoadedPlan;
  readonly visible: boolean;
  readonly hiddenLayers: ReadonlySet<string>;
  readonly onTogglePlan: (id: string, visible: boolean) => void;
  readonly onToggleLayer: (id: string, layer: string, visible: boolean) => void;
  readonly onTransform: (id: string, cambios: Partial<PlanTransform>) => void;
  readonly onFrame: (id: string) => void;
  readonly onClose: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const t = plan.transform;
  const sinDibujar = Object.entries(plan.skipped);

  return (
    <li className="mb-1 rounded-md border border-white/10">
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          onClick={() => onTogglePlan(plan.id, !visible)}
          className={visible ? "text-brand" : "text-white/30 hover:text-white/60"}
          title={visible ? "Apagar este plano" : "Encender este plano"}
          aria-label={visible ? "Apagar este plano" : "Encender este plano"}
          aria-pressed={visible}
        >
          {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="min-w-0 flex-1 truncate text-left text-xs text-white/85 hover:text-white"
          title={`${plan.name} — ${plan.sizeM[0].toFixed(1)} × ${plan.sizeM[1].toFixed(1)} m · ${plan.vertexCount.toLocaleString("es-CL")} puntos`}
        >
          {plan.name}
        </button>

        <button
          type="button"
          onClick={() => onFrame(plan.id)}
          className="shrink-0 text-white/40 hover:text-white"
          title="Encuadrar el plano, en planta"
          aria-label="Encuadrar el plano"
        >
          <IconFrameAll className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onClose(plan.id)}
          className="shrink-0 text-white/30 hover:text-red-400"
          title="Cerrar este plano"
          aria-label="Cerrar este plano"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>

      {abierto && (
        <div className="space-y-2 border-t border-white/10 px-2 py-2">
          {/* La unidad va primero porque es la que descoloca todo lo demás: con el factor mal, el
              plano no calza por más que se lo desplace. El motivo de la elección se muestra tal
              cual — es una decisión discutible y quien mira el plano puede corregirla. */}
          <div>
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-[11px] text-white/45">Unidad</label>
              <select
                value={String(t.metresPerUnit)}
                onChange={(e) => onTransform(plan.id, { metresPerUnit: Number(e.target.value) })}
                className="min-w-0 flex-1 rounded border border-white/15 bg-black/20 px-1.5 py-0.5 text-[11px] text-white/85"
              >
                <option value="0.001">milímetros</option>
                <option value="0.01">centímetros</option>
                <option value="1">metros</option>
                <option value="0.3048">pies</option>
                <option value="0.0254">pulgadas</option>
              </select>
            </div>
            <p className="pt-1 text-[10px] leading-snug text-white/30">{plan.units.reason}</p>
          </div>

          <Numero
            etiqueta="Cota"
            valor={t.elevationM}
            paso={0.1}
            sufijo="m"
            ayuda="A qué altura se dibuja el plano"
            onChange={(v) => onTransform(plan.id, { elevationM: v })}
          />
          <Numero
            etiqueta="Este (X)"
            valor={t.offsetXM}
            paso={0.5}
            sufijo="m"
            ayuda="Desplaza el plano en el eje X de la escena"
            onChange={(v) => onTransform(plan.id, { offsetXM: v })}
          />
          <Numero
            etiqueta="Norte (Z)"
            valor={t.offsetZM}
            paso={0.5}
            sufijo="m"
            ayuda="Desplaza el plano en el eje Z de la escena"
            onChange={(v) => onTransform(plan.id, { offsetZM: v })}
          />
          <Numero
            etiqueta="Giro"
            valor={t.rotationDeg}
            paso={0.5}
            sufijo="°"
            ayuda="Gira el plano alrededor de su centro"
            onChange={(v) => onTransform(plan.id, { rotationDeg: v })}
          />

          <label className="flex items-center gap-2 text-[11px] text-white/60">
            <input
              type="checkbox"
              checked={t.mirrored}
              onChange={(e) => onTransform(plan.id, { mirrored: e.target.checked })}
              className="accent-brand"
            />
            {/* Un plano espejado no se arregla girándolo, y pasa: hay exportaciones desde vistas
                reflejadas. Sin esta casilla el ajuste entra en un bucle sin salida. */}
            Reflejar (si el plano sale en espejo)
          </label>

          <div>
            <p className="pb-1 text-[10px] tracking-wide text-white/35 uppercase">
              Capas ({plan.layers.length})
            </p>
            <ul>
              {plan.layers.map((capa) => {
                const encendida = !hiddenLayers.has(`${plan.id}:${capa.name}`);
                return (
                  <li key={capa.name} className="flex items-center gap-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => onToggleLayer(plan.id, capa.name, !encendida)}
                      className={encendida ? "text-brand" : "text-white/25 hover:text-white/50"}
                      title={encendida ? "Apagar la capa" : "Encender la capa"}
                      aria-label={encendida ? "Apagar la capa" : "Encender la capa"}
                      aria-pressed={encendida}
                    >
                      {encendida ? (
                        <IconEye className="h-3.5 w-3.5" />
                      ) : (
                        <IconEyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: colorDeCapa(capa.colorIndex) }}
                      aria-hidden="true"
                    />
                    <span
                      className={[
                        "min-w-0 flex-1 truncate text-[11px]",
                        encendida ? "text-white/80" : "text-white/30",
                      ].join(" ")}
                      title={`${capa.name} — ${capa.count} trazos`}
                    >
                      {capa.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-white/25">
                      {capa.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {sinDibujar.length > 0 && (
            <p className="border-t border-white/10 pt-1.5 text-[10px] leading-snug text-white/30">
              Sin dibujar:{" "}
              {sinDibujar.map(([tipo, n]) => `${tipo.toLowerCase()} (${n})`).join(", ")}. Son
              textos, rellenos y cotas del CAD: el plano se dibuja con su geometría de líneas.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Un número con su nombre y su unidad, del ancho de una fila del panel. */
function Numero({
  etiqueta,
  valor,
  paso,
  sufijo,
  ayuda,
  onChange,
}: {
  readonly etiqueta: string;
  readonly valor: number;
  readonly paso: number;
  readonly sufijo: string;
  readonly ayuda: string;
  readonly onChange: (valor: number) => void;
}) {
  return (
    <div className="flex items-center gap-2" title={ayuda}>
      <label className="w-16 shrink-0 text-[11px] text-white/45">{etiqueta}</label>
      <input
        type="number"
        value={Number.isFinite(valor) ? Number(valor.toFixed(3)) : 0}
        step={paso}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="min-w-0 flex-1 rounded border border-white/15 bg-black/20 px-1.5 py-0.5 font-mono text-[11px] text-white/85"
      />
      <span className="w-3 shrink-0 text-[10px] text-white/30">{sufijo}</span>
    </div>
  );
}

/**
 * El mismo color con el que se dibuja la capa en la escena.
 *
 * Está duplicado a propósito y en pocas líneas: el visor no expone su tabla, y una muestra de color
 * que no coincida con lo dibujado es peor que no tener muestra.
 */
function colorDeCapa(colorIndex: number | null): string {
  const ACI: Record<number, string> = {
    1: "#ff5555",
    2: "#ffe066",
    3: "#8ce99a",
    4: "#66d9e8",
    5: "#74a8ff",
    6: "#f783ac",
    7: "#d0d0d8",
    8: "#9090a0",
    9: "#c0c0cc",
  };
  if (colorIndex === null) return ACI[7]!;
  return ACI[colorIndex] ?? `hsl(${((colorIndex * 47) % 360).toFixed(0)} 55% 68%)`;
}
