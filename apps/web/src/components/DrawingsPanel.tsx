import type { GeneratedDrawing } from "@aerobim/viewer";
import { useState } from "react";

import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
  IconX,
} from "./icons.js";
import { agruparLaminas, tituloDeGrupo } from "./laminas.js";

/**
 * Los planos generados **desde el modelo**, con su exportación.
 *
 * Es la otra mitad de la Fase 7: la de entrada trae el CAD que ya existe, esta saca del modelo un
 * dibujo que alguien pueda imprimir o seguir trabajando en su CAD. Por eso lo que manda en la ficha
 * es **el botón de exportar**: el plano se genera para salir del visor.
 */
export function DrawingsPanel({
  drawings,
  hidden,
  generating,
  onGenerate,
  onCancel,
  onToggle,
  onToggleHidden,
  onToggleMany,
  onCloseMany,
  laminaEnVisor,
  onVerEnVisor2D,
  onExport,
  onLaminaPdf,
  onPublicar,
  onVerEje,
  onAddTable,
  cuadroCargado,
  onAddDimensions,
  cotasDisponibles,
  anotado,
  onAddCallouts,
  hallazgosDisponibles,
  llamadasPuestas,
  onClose,
}: {
  readonly drawings: readonly GeneratedDrawing[];
  /** Planos apagados en la vista 3D, por identificador. */
  readonly hidden: ReadonlySet<string>;
  /** El aviso de avance mientras se proyecta, o `null` si no se está generando. */
  readonly generating: string | null;
  readonly onGenerate: (view: "plan" | "front" | "side") => void;
  /** Deja de esperar la proyección: la aplicación vuelve, el trabajo de fondo se abandona. */
  readonly onCancel: () => void;
  readonly onToggle: (id: string, visible: boolean) => void;
  readonly onToggleHidden: (id: string, visible: boolean) => void;
  /** Superpone o quita del modelo 3D varias láminas de una vez (un grupo entero). */
  readonly onToggleMany: (ids: readonly string[], visible: boolean) => void;
  /** Elimina varias láminas de una vez (un grupo entero). */
  readonly onCloseMany: (ids: readonly string[]) => void;
  /** La lámina que se está viendo ahora en el visor 2D, o `null` si no hay ninguna. */
  readonly laminaEnVisor: string | null;
  /** Abre la lámina **sola** en el visor 2D: sin el modelo debajo. */
  readonly onVerEnVisor2D: (id: string) => void;
  readonly onExport: (id: string) => void;
  /** Descarga la lámina en PDF, dibujada por el servidor. `F7.5`. */
  readonly onLaminaPdf: (id: string) => void;
  /**
   * Archiva la lámina como revisión de un entregable de la obra. `G.4`.
   *
   * **Opcional, y por eso no hay botón cuando falta**: un modelo abierto del disco no tiene obra, y
   * por tanto no tiene registro donde archivar. Enseñar el botón y explicarlo al pulsarlo sería
   * ofrecer una puerta que no lleva a ningún sitio; es la misma regla que el portal aplica a los
   * módulos que un rol no puede abrir.
   */
  readonly onPublicar?: (id: string) => void;
  /** Vuelve de un perfil a su eje en el modelo: lo encuadra y lo dibuja. */
  readonly onVerEje: (id: string) => void;
  /** Lleva las cotas medidas sobre el modelo a esa lámina. `F7.3`. */
  readonly onAddDimensions: (id: string) => void;
  /** Cuántas mediciones de distancia hay encendidas hoy. */
  readonly cotasDisponibles: number;
  /** Qué anotaciones lleva puestas cada lámina, por identificador. `F7.3`. */
  readonly anotado: Readonly<
    Record<string, { cotas: number; angulos: number; pendientes: number }>
  >;
  /** Señala en esa lámina los hallazgos del modelo. `F7.3`. */
  readonly onAddCallouts: (id: string) => void;
  /** Cuántos hallazgos del modelo hay cargados hoy. */
  readonly hallazgosDisponibles: number;
  /** Cuántas llamadas lleva puestas cada lámina. */
  readonly llamadasPuestas: Readonly<Record<string, number>>;
  /** Pone el cuadro cargado dentro de esa lámina. `F10.4`. */
  readonly onAddTable: (id: string) => void;
  /** La categoría del cuadro que hay cargado, o `null` si no hay ninguno. */
  readonly cuadroCargado: string | null;
  readonly onClose: (id: string) => void;
}) {
  // Las láminas que salen del mismo perfil se pliegan en un grupo: con una transversal cada 0,1 m
  // son casi 200, y una lista de tarjetas no deja encontrar ninguna.
  const entradas = agruparLaminas(drawings);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  /** El grupo o la lámina cuya eliminación espera confirmación, en la misma fila. */
  const [confirmando, setConfirmando] = useState<string | null>(null);
  /** La lámina de un grupo cuya ficha completa está desplegada. */
  const [conFicha, setConFicha] = useState<string | null>(null);
  const alternarGrupo = (grupoId: string) =>
    setAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(grupoId)) siguiente.delete(grupoId);
      else siguiente.add(grupoId);
      return siguiente;
    });

  const tarjeta = (plano: GeneratedDrawing) => {
    const visible = !hidden.has(plano.id);
    // Un perfil está **desarrollado** sobre el papel: su horizontal es el PK y su vertical la
    // cota. Las mediciones y los hallazgos son puntos 3D, y llevarlos a esa lámina los
    // pondría en un sitio que no es el suyo — por eso no se ofrecen aquí.
    const esPerfil = plano.view === "profile";
    return (
      <li key={plano.id} className="mb-1 rounded-md border border-borde px-1.5 py-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggle(plano.id, !visible)}
            className={visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
            title={
              visible
                ? "Quita este plano de encima del modelo 3D"
                : "Superpone este plano al modelo 3D. Para verlo solo, usa «Ver en el visor 2D»"
            }
            aria-label={visible ? "Quitar de encima del modelo" : "Superponer al modelo"}
            aria-pressed={visible}
          >
            {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
          </button>

          <span className="min-w-0 flex-1 truncate text-xs text-fg">{plano.name}</span>

          <button
            type="button"
            onClick={() => onClose(plano.id)}
            className="shrink-0 text-fg-3 hover:text-danger"
            title="Cerrar este plano"
            aria-label="Cerrar este plano"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* **El botón principal de la ficha**: un plano o un perfil se mira solo. El ojo de
                  arriba lo superpone al modelo, que sirve para ubicarlo y para nada más. */}
        <button
          type="button"
          onClick={() => onVerEnVisor2D(plano.id)}
          disabled={laminaEnVisor === plano.id}
          className={[
            "mt-1 w-full rounded-sm px-2 py-1 text-nota font-medium",
            laminaEnVisor === plano.id
              ? "border border-accent text-accent"
              : "bg-action text-sobre-accion hover:bg-action-hover",
          ].join(" ")}
          title="Abre esta lámina sola, en planta y ortográfica, sin el modelo debajo"
        >
          {laminaEnVisor === plano.id ? "Viéndola en el visor 2D" : "Ver en el visor 2D"}
        </button>

        <p className="pt-0.5 text-nota text-fg-3">
          {plano.sizeM[0].toFixed(1)} × {plano.sizeM[1].toFixed(1)} m ·{" "}
          {plano.segments.toLocaleString("es-CL")} trazos · {(plano.elapsedMs / 1000).toFixed(1)} s
          en generarse
        </p>
        {plano.puntosDeNube !== undefined && (
          <p className="pt-0.5 text-nota text-fg-3">
            {plano.puntosDeNube.toLocaleString("es-CL")} puntos de la nube, en la capa AB-NUBE
          </p>
        )}
        {plano.nota !== undefined && (
          <p className="mt-1 rounded-sm border border-borde bg-surface-2 px-2 py-1 text-nota leading-snug text-fg-2">
            {plano.nota}
          </p>
        )}

        <label className="flex items-center gap-2 pt-1 text-nota text-fg-2">
          <input
            type="checkbox"
            onChange={(e) => onToggleHidden(plano.id, e.target.checked)}
            className="accent-action"
          />
          {/* En un plano de arquitectura las aristas ocultas son la mitad del ruido: se
                    generan igual y se encienden solo cuando se quieren. */}
          Mostrar las {plano.hiddenSegments.toLocaleString("es-CL")} aristas ocultas
        </label>

        {/* **Las cotas medidas sobre el modelo, dentro de la lámina.** `F7.3`. Es el flujo que
                  una oficina hace de verdad: se mide con el ajuste a vértice, se genera la planta, y
                  las cotas van dentro. Acotar encima del dibujo sería medir dos veces la misma cosa
                  y arriesgarse a dos números distintos. */}
        {esPerfil && plano.eje !== undefined && (
          <button
            type="button"
            onClick={() => onVerEje(plano.id)}
            className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
            title="Encuadra en el modelo el eje del que sale este perfil y lo dibuja encima"
          >
            Ver el eje en el modelo
          </button>
        )}

        {!esPerfil && cotasDisponibles > 0 && (
          <button
            type="button"
            onClick={() => onAddDimensions(plano.id)}
            className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
            title="Lleva a esta lámina las cotas, los ángulos y las pendientes de lo que has medido"
          >
            Anotar con{" "}
            {cotasDisponibles === 1 ? "la medición" : `las ${cotasDisponibles} mediciones`}
          </button>
        )}

        {/* **Se dice qué entró de cada cosa, no «hecho».** Puede ser menos que lo medido: lo
                  que se proyecta a un punto no es una cota —una medición vertical en una planta— y
                  lo que está a nivel no tiene pendiente que anotar. Un «hecho» dejaría a alguien
                  buscando en el DXF una cota que no está. */}
        {anotado[plano.id] !== undefined && (
          <p className="pt-0.5 text-nota text-fg-3">
            {anotado[plano.id]!.cotas +
              anotado[plano.id]!.angulos +
              anotado[plano.id]!.pendientes ===
            0
              ? "No entró ninguna anotación: lo medido se proyecta a un punto en esta vista."
              : [
                  `${anotado[plano.id]!.cotas} cotas`,
                  `${anotado[plano.id]!.angulos} ángulos`,
                  `${anotado[plano.id]!.pendientes} pendientes`,
                ].join(" · ") + ". Salen en el DXF."}
          </p>
        )}

        {/* **Las llamadas son lo que conecta el plano con la coordinación.** `F7.3`: un plano
                  que dice «aquí falta la cota del vano V-03» es un plano con el que se va a obra;
                  sin ellas, el plano y la lista de hallazgos son dos papeles que hay que cruzar a
                  mano. Solo aparece con hallazgos del modelo cargados. */}
        {!esPerfil && hallazgosDisponibles > 0 && (
          <button
            type="button"
            onClick={() => onAddCallouts(plano.id)}
            className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
            title="Señala en la lámina los hallazgos cuyo elemento esté dibujado"
          >
            Señalar{" "}
            {hallazgosDisponibles === 1 ? "el hallazgo" : `los ${hallazgosDisponibles} hallazgos`}
          </button>
        )}

        {/* Y cuántos entraron: es normal que sean menos, porque la planta proyecta lo que
                  estaba encendido y un hallazgo de la estructura no cabe en un plano de
                  arquitectura. */}
        {llamadasPuestas[plano.id] !== undefined && (
          <p className="pt-0.5 text-nota text-fg-3">
            {llamadasPuestas[plano.id] === 0
              ? "Ningún hallazgo tiene su elemento dibujado en esta vista."
              : `${llamadasPuestas[plano.id]} señalados en la lámina.`}
          </p>
        )}

        {/* **El cuadro se pone antes de exportar, no después.** `F10.4`: la tabla va dentro
                  de la lámina, así que tiene que estar puesta cuando se serializa. El botón solo
                  aparece con un cuadro cargado —si no, no hay nada que poner— y dice cuál es: poner
                  «el cuadro» sin saber de qué categoría es una lámina que hay que volver a hacer. */}
        {cuadroCargado !== null && (
          <button
            type="button"
            onClick={() => onAddTable(plano.id)}
            className="mt-1 w-full rounded-sm border border-borde px-2 py-1 text-nota text-fg-2 hover:border-accent hover:text-fg"
            title="Dibuja el cuadro debajo del plano, dentro de la misma lámina"
          >
            Poner el cuadro de {cuadroCargado}
          </button>
        )}

        <button
          type="button"
          onClick={() => onExport(plano.id)}
          className="mt-1 w-full rounded-sm border border-accent/40 px-2 py-1 text-nota text-accent hover:bg-accent/15"
          title="Descarga el plano en DXF, en milímetros y colocado en una hoja A3"
        >
          Exportar a DXF (A3)
        </button>

        {/* **Y el PDF, que es la otra salida.** `F7.5`: un DXF se abre en un CAD y un PDF se
                  manda por correo, se firma y se cuelga. Lo dibuja el servidor, que es donde vive el
                  membrete de la casa. */}
        <button
          type="button"
          onClick={() => onLaminaPdf(plano.id)}
          className="mt-1 w-full rounded-sm border border-accent/40 px-2 py-1 text-nota text-accent hover:bg-accent/15"
          title="Descarga la lámina en PDF, en Carta y con el membrete de la casa"
        >
          Exportar a PDF (Carta)
        </button>

        {/* **Y archivarlo, que es lo que no se podía.** `G.4`: hasta ahora había que
                  descargar el PDF, volver al portal, buscar el entregable y subirlo del disco —seis
                  pasos para mover un archivo que el servidor acababa de fabricar—.

                  Solo sale con obra: sin ella no hay registro donde archivar, igual que el PDF no
                  tiene membrete que sellar. */}
        {onPublicar !== undefined && (
          <button
            type="button"
            onClick={() => onPublicar(plano.id)}
            className="mt-1 w-full rounded-sm bg-action px-2 py-1 text-nota font-medium text-sobre-accion hover:bg-action-hover"
            title="Archiva la lámina como una revisión de un entregable de esta obra"
          >
            Archivar en el registro
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="p-1.5">
      {/* **Tres vistas y ninguna configuración de entrada.** Lo que entra en el plano es lo que
          está encendido en el modelo, que es la decisión que ya se toma para mirar: pedirla otra
          vez en un diálogo sería preguntar dos veces lo mismo. */}
      <div className="flex gap-1">
        {(
          [
            ["plan", "Planta"],
            ["front", "Frontal"],
            ["side", "Lateral"],
          ] as const
        ).map(([vista, nombre]) => (
          <button
            key={vista}
            type="button"
            onClick={() => onGenerate(vista)}
            disabled={generating !== null}
            className="flex-1 rounded-sm bg-action px-2 py-1 text-nota font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
            title={`Proyecta lo que está a la vista y arma el plano de ${nombre.toLowerCase()}`}
          >
            {nombre}
          </button>
        ))}
      </div>

      {generating !== null && (
        // **Con salida.** Proyectar un modelo grande tarda, y si el aviso se queda quieto no hay
        // forma de saber si va lento o si se colgó: el botón devuelve la aplicación sin esperar.
        <div className="flex items-center gap-2 px-1 pt-2">
          <p className="min-w-0 flex-1 truncate text-nota text-accent">{generating}</p>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-sm border border-borde px-1.5 py-0.5 text-nota text-fg-2 hover:bg-surface-3 hover:text-fg"
            title="Deja de esperar la proyección y devuelve la aplicación"
          >
            Dejar de esperar
          </button>
        </div>
      )}

      {drawings.length === 0 && generating === null && (
        <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
          Ninguno. Un plano se saca proyectando las aristas de lo que está encendido: apaga lo que
          no quieras que salga y elige la vista.
        </p>
      )}

      <ul className="pt-1.5">
        {entradas.map((entrada) => {
          if (entrada.tipo === "suelta") return tarjeta(entrada.lamina);
          const { grupoId, laminas } = entrada;
          const ids = laminas.map((una) => una.id);
          const abierto = abiertos.has(grupoId);
          const todasVisibles = ids.every((id) => !hidden.has(id));
          const titulo = tituloDeGrupo(entrada.nombre, laminas.length);
          return (
            <li key={grupoId} className="mb-1 rounded-md border border-borde">
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => alternarGrupo(grupoId)}
                  aria-expanded={abierto}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium text-fg"
                  title={abierto ? "Pliega la lista de láminas" : "Despliega la lista de láminas"}
                >
                  {abierto ? (
                    <IconChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <IconChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{titulo}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMany(ids, !todasVisibles)}
                  className={todasVisibles ? "text-accent" : "text-fg-3 hover:text-fg-2"}
                  aria-pressed={todasVisibles}
                  aria-label={
                    todasVisibles
                      ? "Quitar todo el perfil de encima del modelo"
                      : "Superponer todo el perfil al modelo"
                  }
                  title={
                    todasVisibles
                      ? "Quita las láminas de este perfil de encima del modelo 3D"
                      : "Superpone las láminas de este perfil al modelo 3D"
                  }
                >
                  {todasVisibles ? (
                    <IconEye className="h-4 w-4" />
                  ) : (
                    <IconEyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(confirmando === grupoId ? null : grupoId)}
                  className="shrink-0 text-fg-3 hover:text-danger"
                  aria-label={`Eliminar ${titulo}`}
                  title="Elimina todas las láminas de este perfil"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>

              {confirmando === grupoId && (
                <div
                  role="alert"
                  className="mx-1.5 mb-1 flex flex-wrap items-center gap-1.5 rounded-sm border border-danger/50 px-2 py-1 text-nota text-fg-2"
                >
                  <span className="min-w-0 flex-1">
                    ¿Eliminar las {laminas.length} láminas de este perfil? No se puede deshacer.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmando(null);
                      onCloseMany(ids);
                    }}
                    className="rounded-sm bg-danger px-2 py-0.5 text-nota font-medium text-white"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="rounded-sm border border-borde px-2 py-0.5 text-nota text-fg-2 hover:bg-surface-3"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {abierto && (
                <ul className="max-h-72 overflow-y-auto border-t border-borde px-1 py-0.5">
                  {laminas.map((plano) => {
                    const visible = !hidden.has(plano.id);
                    const enVisor = laminaEnVisor === plano.id;
                    return (
                      <li key={plano.id} className="[content-visibility:auto]">
                        <div className="flex items-center gap-1.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => onToggle(plano.id, !visible)}
                            className={visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
                            aria-pressed={visible}
                            aria-label={
                              visible
                                ? `Quitar ${plano.name} de encima del modelo`
                                : `Superponer ${plano.name} al modelo`
                            }
                          >
                            {visible ? (
                              <IconEye className="h-3.5 w-3.5" />
                            ) : (
                              <IconEyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onVerEnVisor2D(plano.id)}
                            aria-current={enVisor ? "true" : undefined}
                            className={[
                              "min-w-0 flex-1 truncate rounded-sm px-1 text-left text-nota hover:bg-surface-3",
                              enVisor ? "font-medium text-accent" : "text-fg-2",
                            ].join(" ")}
                            title="Abre esta lámina en el visor 2D"
                          >
                            {plano.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConFicha(conFicha === plano.id ? null : plano.id)}
                            aria-expanded={conFicha === plano.id}
                            className="shrink-0 text-fg-3 hover:text-fg-2"
                            aria-label={`Ficha y exportación de ${plano.name}`}
                            title="Ficha, anotaciones y exportación de esta lámina"
                          >
                            {conFicha === plano.id ? (
                              <IconChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <IconChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onClose(plano.id)}
                            className="shrink-0 text-fg-3 hover:text-danger"
                            aria-label={`Eliminar ${plano.name}`}
                            title="Elimina esta lámina"
                          >
                            <IconX className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {conFicha === plano.id && <ul>{tarjeta(plano)}</ul>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
