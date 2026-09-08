import { useState } from "react";

import type { MedicionDeDesviacion } from "@aerobim/viewer";

/**
 * Calzar la nube con el modelo, y medir lo que se aparta: `F12.2`.
 *
 * ## Es el objetivo de salida de la Fase 2, y no tenía pantalla
 *
 * La aritmética está hecha y probada —el calce recupera un giro conocido de 22,5° con residuo cero,
 * y la desviación mide los 50 mm que se le ponen— **y solo se alcanzaba desde `diag.html`**. Esto es
 * lo que la convierte en algo que alguien puede usar en una obra.
 *
 * ## Dos caminos para calzar, y el automático es el bueno cuando existe
 *
 * Si el IFC trae su emplazamiento, calzar es **una resta**: sin señalar un punto, sin residuo y sin
 * depender del pulso de nadie. La mayoría de los IFC de obra no lo traen, así que el manual sigue
 * siendo el camino corriente — pero ofrecer primero el automático y decir cuándo no se puede es lo
 * que evita que alguien señale seis puntos a mano sin saber que sobraban.
 *
 * ## Y la desviación se mide por elemento, a propósito
 *
 * No es una limitación: quince millones de puntos contra decenas de miles de triángulos no acaba
 * nunca. Acotando a un elemento son un instante **y el resultado se puede atribuir a ese elemento**,
 * que es lo que hace falta para abrir una observación sobre él.
 */
export function CalcePanel({
  hayNube,
  hayModelo,
  elementoSeleccionado,
  calce,
  medicion,
  pares,
  paso,
  residuo,
  giroIndeterminado,
  onCalzarAuto,
  onSenalar,
  onParar,
  onQuitarPar,
  onAplicarPares,
  onMedir,
  onObservar,
}: {
  readonly hayNube: boolean;
  readonly hayModelo: boolean;
  /** El nombre del elemento seleccionado, o `null` si no hay ninguno con GUID. */
  readonly elementoSeleccionado: string | null;
  /** Qué pasó en el último intento de calce: el traslado aplicado, o por qué no se pudo. */
  readonly calce: string | null;
  readonly medicion: MedicionDeDesviacion | null;
  /** Cuántos pares se han señalado. */
  readonly pares: number;
  /** Qué se espera del siguiente clic. */
  readonly paso: "apagado" | "modelo" | "nube";
  /** El residuo de los pares señalados, o `null` con menos de tres. */
  readonly residuo: { medio: number; maximo: number; peor: number | null } | null;
  /** `true` si los puntos están casi en línea y el giro no queda determinado. */
  readonly giroIndeterminado: boolean;
  readonly onCalzarAuto: () => void;
  readonly onSenalar: () => void;
  readonly onParar: () => void;
  readonly onQuitarPar: () => void;
  readonly onAplicarPares: () => void;
  readonly onMedir: (toleranciaM: number) => void;
  readonly onObservar: () => void;
}) {
  // La tolerancia **la pone quien coordina**: cinco centímetros pueden ser tolerancia en una
  // excavación y un problema grave en un pilar. El programa no opina sobre la obra.
  const [toleranciaMm, setToleranciaMm] = useState(20);

  if (!hayNube) {
    return (
      <p className="p-3 text-xs text-fg-3">
        Abre un levantamiento para poder calzarlo con el modelo y medir la desviación.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* --- Calzar --- */}
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-fg-2">Calzar con el modelo</p>
        <button
          type="button"
          onClick={onCalzarAuto}
          disabled={!hayModelo}
          className="min-h-9 rounded-sm bg-action px-3 text-xs font-medium text-sobre-accion hover:bg-action-hover disabled:bg-surface-2 disabled:text-apagado-fg"
        >
          Calzar automáticamente
        </button>
        {!hayModelo && (
          <p className="text-fg-3">Hace falta un modelo abierto contra el que calzar.</p>
        )}
        {calce !== null && <p className="text-fg-2">{calce}</p>}
        <p className="text-fg-3">
          Solo funciona si el IFC trae su emplazamiento. Si no lo trae, se señalan pares de puntos.
        </p>

        <hr className="border-borde" />

        {/* --- El calce a mano, que es el camino corriente --- */}
        <p className="font-semibold text-fg-2">Señalar pares de puntos</p>

        {paso === "apagado" ? (
          <button
            type="button"
            onClick={onSenalar}
            disabled={!hayModelo}
            className="min-h-9 rounded-sm bg-surface-2 px-3 text-xs text-fg hover:bg-surface-3 disabled:text-apagado-fg"
          >
            {pares === 0 ? "Empezar a señalar" : `Seguir señalando (${pares} pares)`}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {/* **Se dice qué se espera del siguiente clic.** Sin esto el gesto es adivinar: se
                pincha en el modelo, se pincha en la nube, y nadie sabe cuál estaba pendiente. */}
            <p className="rounded-sm bg-action/25 px-2 py-1.5 text-fg">
              {paso === "modelo"
                ? `Pincha el punto en el MODELO${pares > 0 ? ` · par ${pares + 1}` : ""}`
                : "Ahora el MISMO punto en la NUBE"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onQuitarPar}
                disabled={pares === 0}
                className="min-h-8 flex-1 rounded-sm bg-surface-2 text-xs text-fg-2 hover:bg-surface-3 disabled:text-apagado-fg"
              >
                Quitar el último
              </button>
              <button
                type="button"
                onClick={onParar}
                className="min-h-8 flex-1 rounded-sm bg-surface-2 text-xs text-fg-2 hover:bg-surface-3"
              >
                Parar
              </button>
            </div>
          </div>
        )}

        {pares > 0 && pares < 3 && (
          // **Con menos de tres no se puede calcular nada**, y decirlo es mejor que dejar el botón
          // apagado sin motivo: dos puntos dan infinitas orientaciones posibles.
          <p className="text-fg-3">
            {pares} {pares === 1 ? "par" : "pares"} · hacen falta 3 para poder calzar.
          </p>
        )}

        {residuo !== null && (
          <div className="flex flex-col gap-2">
            <p className="text-fg-2">
              {pares} pares · residuo medio{" "}
              <strong className="text-fg">{(residuo.medio * 1000).toFixed(0)} mm</strong>, máximo{" "}
              <strong className="text-fg">{(residuo.maximo * 1000).toFixed(0)} mm</strong>
            </p>
            {residuo.peor !== null && (
              // **Cuál es el par que peor calza**, que es lo que hay que quitar. Sin esto, un
              // residuo alto obliga a borrarlos todos y empezar de cero.
              <p className="text-warn">
                El par {residuo.peor + 1} es el que más se desvía:{" "}
                {(residuo.maximo * 1000).toFixed(0)} mm.
              </p>
            )}
            {giroIndeterminado && (
              <p className="text-warn">
                Los puntos están casi en línea, así que el giro no queda determinado. Señala uno
                fuera de esa línea.
              </p>
            )}
            <button
              type="button"
              onClick={onAplicarPares}
              className="min-h-9 rounded-sm bg-action px-3 text-xs font-medium text-sobre-accion hover:bg-action-hover"
            >
              Calzar con estos pares
            </button>
          </div>
        )}
      </div>

      <hr className="border-borde" />

      {/* --- Medir --- */}
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-fg-2">Lo construido contra lo modelado</p>

        <label className="flex flex-col gap-1">
          <span className="text-fg-3">Tolerancia · {toleranciaMm} mm</span>
          <input
            type="range"
            min={2}
            max={100}
            step={1}
            value={toleranciaMm}
            onChange={(e) => setToleranciaMm(Number(e.target.value))}
            className="w-full accent-[var(--color-action)]"
          />
        </label>

        <button
          type="button"
          onClick={() => onMedir(toleranciaMm / 1000)}
          disabled={elementoSeleccionado === null}
          className="min-h-9 rounded-sm bg-surface-2 px-3 text-xs text-fg hover:bg-surface-3 disabled:text-apagado-fg"
        >
          {elementoSeleccionado === null
            ? "Selecciona un elemento del modelo"
            : `Medir ${elementoSeleccionado}`}
        </button>

        {medicion !== null && <Informe medicion={medicion} onObservar={onObservar} />}
      </div>
    </div>
  );
}

/**
 * El informe de una medición.
 *
 * **Seis cifras y no una, porque una sola miente.** El sesgo es el que distingue «la obra está
 * corrida 3 cm» de «la obra está mal rematada»: con la distancia a secas los dos casos se ven
 * idénticos, y son problemas distintos con soluciones distintas.
 */
function Informe({
  medicion,
  onObservar,
}: {
  readonly medicion: MedicionDeDesviacion;
  readonly onObservar: () => void;
}) {
  const { resumen } = medicion;

  if (resumen.puntos === 0) {
    // **«No medí nada» no es «cero desviación»**, y confundirlos daría por buena una zona que
    // nadie miró.
    return (
      <p className="text-warn">
        No hay puntos del levantamiento en la zona de ese elemento. Puede que la nube no lo cubra, o
        que todavía no esté calzada.
      </p>
    );
  }

  const mm = (m: number) => `${(m * 1000).toFixed(0)} mm`;
  const fuera = (resumen.fuera / resumen.puntos) * 100;

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Cifra nombre="Media" valor={mm(resumen.media)} />
        <Cifra nombre="Mediana" valor={mm(resumen.mediana)} />
        <Cifra nombre="Máxima" valor={mm(resumen.maxima)} destacada />
        <Cifra nombre="Percentil 95" valor={mm(resumen.p95)} />
        <Cifra
          nombre="Sesgo"
          valor={`${resumen.sesgo >= 0 ? "+" : ""}${mm(resumen.sesgo)}`}
          destacada
        />
        <Cifra nombre="Fuera" valor={`${fuera.toFixed(0)} %`} />
      </dl>

      <p className="text-fg-3">
        {resumen.puntos.toLocaleString("es-CL")} puntos medidos contra {medicion.triangulos}{" "}
        triángulos
        {medicion.puntosFuera > 0 && ` · ${medicion.puntosFuera} sin medir por el tope`}
      </p>

      {!resumen.signoFiable && resumen.fuera > 0 && (
        // Todo lo que se sale cae del mismo lado: eso es lo que produce un modelo con las caras
        // invertidas o una nube mal calzada. El sesgo informa del error, no de la obra.
        <p className="text-warn">
          Todo lo que se sale cae del mismo lado. El signo puede ser del calce o de las normales del
          modelo, no de la obra.
        </p>
      )}

      <p className="text-fg-3">
        {resumen.sesgo > 0
          ? "Sesgo positivo: lo construido está por fuera de lo modelado."
          : "Sesgo negativo: lo construido está por dentro de lo modelado."}
      </p>

      {/* **La vuelta al ciclo del producto.** Medir sin poder anotar deja el hallazgo en la cabeza
          de quien miró; el registro es donde vive el trabajo. */}
      <button
        type="button"
        onClick={onObservar}
        className="min-h-9 rounded-sm bg-surface-2 px-3 text-xs text-accent hover:bg-surface-3 hover:text-fg"
      >
        Abrir una observación con esta desviación
      </button>
    </div>
  );
}

function Cifra({
  nombre,
  valor,
  destacada = false,
}: {
  readonly nombre: string;
  readonly valor: string;
  readonly destacada?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-fg-3">{nombre}</dt>
      <dd className={destacada ? "font-semibold text-fg" : "text-fg-2"}>{valor}</dd>
    </div>
  );
}
