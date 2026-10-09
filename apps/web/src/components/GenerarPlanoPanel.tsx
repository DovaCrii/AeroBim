import type { AlcanceDePlano, DrawingView } from "@aerobim/viewer";
import { useEffect, useId, useRef, useState } from "react";

import {
  VISTAS_DE_PLANO,
  avisoDeEntrada,
  describirEntrada,
  nombrePorDefecto,
  type EntradaDePlano,
} from "./generar-plano.js";

/** Lo que se le pide al generar un plano. */
export interface ParametrosDePlano {
  readonly vista: DrawingView;
  readonly alcance: AlcanceDePlano;
  readonly nombre: string;
}

/**
 * El diálogo **«Generar plano»**: qué vista, qué entra y cómo se llama, con el recuento delante.
 *
 * Antes «Generar plano» proyectaba todo lo encendido sin decir qué ni cuánto, y se abría el 2D: el
 * resultado era una sorpresa y, con un modelo grande, una espera sin explicación. Ahora **se dice antes**
 * («412 elementos de 2 modelos») y se avisa cuando no hay nada o es mucho.
 *
 * Flota junto a la barra vertical, como la tarjeta del perfil, y no tapa el modelo entero: es compacto y
 * el lienzo sigue a la vista. «Lo aislado» y «lo apagado por disciplina» ya son **lo encendido**: el
 * visor proyecta lo que está a la vista, así que no hay una tercera opción que lo repita.
 */
export function GenerarPlanoPanel({
  vistaInicial,
  haySeleccion,
  nombreDeSeleccion,
  referencia,
  contar,
  generando,
  onGenerar,
  onCancelar,
}: {
  readonly vistaInicial: DrawingView;
  /** Hay un elemento seleccionado, así que «solo la selección» tiene sentido. */
  readonly haySeleccion: boolean;
  /** Cómo se llama el elemento seleccionado, para decirlo; o `null`. */
  readonly nombreDeSeleccion: string | null;
  /** El nombre del modelo abierto si es uno solo, para el nombre por defecto. */
  readonly referencia: string | null;
  /** Cuenta lo que entraría con ese alcance, sin proyectar. */
  readonly contar: (alcance: AlcanceDePlano) => Promise<EntradaDePlano>;
  /** El aviso de avance mientras se proyecta, o `null`. */
  readonly generando: string | null;
  readonly onGenerar: (parametros: ParametrosDePlano) => void;
  readonly onCancelar: () => void;
}) {
  const [vista, setVista] = useState<DrawingView>(vistaInicial);
  const [alcance, setAlcance] = useState<AlcanceDePlano>("visible");
  const [entrada, setEntrada] = useState<EntradaDePlano | null>(null);
  const [nombreEscrito, setNombreEscrito] = useState<string | null>(null);
  const idNombre = useId();
  // Un `contar` nuevo en cada render no debe repetir el recuento: se llama por la identidad del alcance.
  const contarRef = useRef(contar);
  contarRef.current = contar;

  // «Solo la selección» deja de valer si se suelta el elemento mientras el diálogo está abierto.
  const alcanceVigente: AlcanceDePlano =
    alcance === "seleccion" && !haySeleccion ? "visible" : alcance;

  useEffect(() => {
    let vigente = true;
    setEntrada(null);
    void contarRef.current(alcanceVigente).then((cuenta) => {
      if (vigente) setEntrada(cuenta);
    });
    return () => {
      vigente = false;
    };
  }, [alcanceVigente]);

  const nombreAuto = nombrePorDefecto(
    vista,
    alcanceVigente === "seleccion" ? (nombreDeSeleccion ?? referencia) : referencia,
    entrada ?? { elementos: 0, modelos: 0 },
  );
  const nombre = nombreEscrito ?? nombreAuto;
  const aviso = entrada === null ? null : avisoDeEntrada(entrada, alcanceVigente);
  const puedeGenerar =
    generando === null && entrada !== null && entrada.elementos > 0 && nombre.trim() !== "";

  const opcion = (valor: AlcanceDePlano, titulo: string, ayuda: string, activa: boolean) => (
    <label
      className={[
        "flex cursor-pointer items-start gap-2 rounded-sm border px-2 py-1",
        alcanceVigente === valor ? "border-accent bg-accent/10" : "border-borde hover:bg-surface-3",
        activa ? "" : "cursor-not-allowed opacity-60",
      ].join(" ")}
    >
      <input
        type="radio"
        name="alcance-del-plano"
        checked={alcanceVigente === valor}
        disabled={!activa}
        onChange={() => setAlcance(valor)}
        className="mt-0.5 accent-action"
      />
      <span className="min-w-0">
        <span className="block font-medium text-fg">{titulo}</span>
        <span className="block text-nota leading-snug text-fg-3">{ayuda}</span>
      </span>
    </label>
  );

  return (
    <div
      role="dialog"
      aria-label="Generar plano"
      className="absolute top-16 left-[4.5rem] z-20 flex max-h-[calc(100%-9rem)] w-[19rem] flex-col rounded-lg border border-borde bg-surface/95 shadow-[var(--shadow-xl)] backdrop-blur-sm"
    >
      <header className="flex items-center gap-1 border-b border-borde px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">Generar plano</span>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Cerrar sin generar"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-1.5 text-xs">
        <fieldset>
          <legend className="pb-1 font-medium text-fg-2">Vista</legend>
          <div className="grid gap-1">
            {VISTAS_DE_PLANO.map((una) => (
              <label
                key={una.vista}
                className={[
                  "flex cursor-pointer items-start gap-2 rounded-sm border px-2 py-1",
                  vista === una.vista
                    ? "border-accent bg-accent/10"
                    : "border-borde hover:bg-surface-3",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="vista-del-plano"
                  checked={vista === una.vista}
                  onChange={() => setVista(una.vista)}
                  className="mt-0.5 accent-action"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{una.nombre}</span>
                  <span className="block text-nota leading-snug text-fg-3">{una.frase}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="pb-1 font-medium text-fg-2">Qué entra</legend>
          <div className="grid gap-1">
            {opcion(
              "visible",
              "Todo lo encendido",
              "Lo que ves ahora. Lo aislado y lo apagado por disciplina o por espacio ya queda fuera.",
              true,
            )}
            {opcion(
              "seleccion",
              "Solo la selección",
              haySeleccion
                ? `Solo ${nombreDeSeleccion ?? "el elemento seleccionado"}.`
                : "Selecciona un elemento del modelo para poder elegir esto.",
              haySeleccion,
            )}
          </div>
        </fieldset>

        <div>
          <label htmlFor={idNombre} className="block pb-0.5 font-medium text-fg-2">
            Nombre
          </label>
          <input
            id={idNombre}
            value={nombre}
            onChange={(evento) => setNombreEscrito(evento.target.value)}
            maxLength={120}
            className="w-full rounded-sm border border-borde bg-shell px-2 py-0.5"
          />
        </div>

        <p className="text-nota leading-snug text-fg-3">
          Es la proyección de las aristas, no un corte: las líneas son las de cada elemento entero.
        </p>
      </div>

      {/* El recuento queda **fuera de lo que se desplaza**: es lo que hay que ver antes de pulsar «Generar». */}
      <div className="space-y-1 border-t border-borde px-2 py-1.5 text-xs">
        <p className="leading-snug text-fg" aria-live="polite">
          {entrada === null ? (
            "Contando lo que entra…"
          ) : (
            <>
              Entra: <strong>{describirEntrada(entrada)}</strong>
            </>
          )}
        </p>
        {generando !== null && (
          <p className="text-nota leading-snug text-accent" aria-live="polite">
            {generando}
          </p>
        )}
        {aviso !== null && (
          <p
            role="alert"
            className={[
              "rounded-sm border px-2 py-1 text-nota leading-snug",
              aviso.nivel === "vacio" ? "border-danger/50 text-danger" : "border-warn/50 text-warn",
            ].join(" ")}
          >
            {aviso.texto}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-1.5 border-t border-borde px-2 py-1.5">
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm border border-borde px-2 py-1 text-fg-2 hover:bg-surface-3 hover:text-fg"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!puedeGenerar}
          onClick={() => onGenerar({ vista, alcance: alcanceVigente, nombre: nombre.trim() })}
          className="rounded-sm bg-action px-3 py-1 font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
          title={
            entrada !== null && entrada.elementos === 0
              ? "No hay nada que proyectar"
              : "Proyecta las aristas y abre la lámina en el visor 2D"
          }
        >
          Generar
        </button>
      </footer>
    </div>
  );
}
