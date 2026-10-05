import { useMemo, useState } from "react";
import {
  FILTROS,
  ORDEN_INICIAL,
  buscar,
  ordenar,
  pasa,
  type Columna,
  type Filtro,
  type ObservacionDelModelo,
  type Sentido,
} from "../temas.js";
import type { EstadoDeTemas } from "../useTemasDeLaObra.js";
import { IconX } from "./icons.js";

/**
 * La tabla de temas de coordinación, **acoplada abajo** (2026-10-05).
 *
 * Es la idea que se tomó de la tabla BCF de That Open Platform, y se toma como idea: coordinar es
 * **recorrer muchos temas y compararlos** —quién, para cuándo, qué tan urgente— mientras se mira el
 * modelo, y una lista estrecha en el panel de la derecha no deja comparar: enseña una tarjeta por tema
 * y no una columna por dato. Una tabla sí, y con el modelo encima.
 *
 * **Es otra vista de los mismos datos, no otra fuente.** Recibe la lista que ya cargó el panel
 * «Coordinación», así que no hay una segunda petición que pueda discrepar medio segundo, y filtrar,
 * buscar y ordenar usan la lógica pura de `temas.ts`. Descartar un tema —que es irreversible— **se
 * queda en el panel**, donde se pide el motivo: aquí se mira y se abre.
 *
 * Un clic en una fila hace lo mismo que en el panel: **pone la cámara donde estaba quien lo
 * encontró y selecciona el elemento**. Y la fila del elemento que está seleccionado ahora se resalta:
 * en una tabla de treinta filas, saber cuál es la tuya es media pregunta.
 */
export function TablaDeTemas({
  estado,
  proyectoId,
  guidSeleccionado,
  onAbrir,
  onCerrar,
}: {
  /** Los temas de la obra, **cargados una sola vez arriba** y compartidos con el panel «Coordinación». */
  readonly estado: EstadoDeTemas;
  readonly proyectoId: string;
  /** El GUID del elemento seleccionado ahora, para resaltar su fila. */
  readonly guidSeleccionado: string | null;
  /** Lleva la cámara y selecciona. Devuelve `false` si el GUID no está en ningún modelo abierto. */
  readonly onAbrir: (observacion: ObservacionDelModelo) => Promise<boolean>;
  readonly onCerrar: () => void;
}) {
  const observaciones = estado.kind === "listo" ? estado.observaciones : SIN_TEMAS;
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<{ columna: Columna; sentido: Sentido }>(ORDEN_INICIAL);
  /** El tema cuyo elemento no se encontró, para decirlo en su fila y no en un aviso suelto. */
  const [noEncontrada, setNoEncontrada] = useState<string | null>(null);

  const filas = useMemo(
    () =>
      ordenar(
        buscar(
          observaciones.filter((una) => pasa(una, filtro)),
          texto,
        ),
        orden.columna,
        orden.sentido,
      ),
    [observaciones, filtro, texto, orden],
  );

  const cambiarOrden = (columna: Columna) =>
    setOrden((actual) =>
      actual.columna === columna
        ? { columna, sentido: actual.sentido === "asc" ? "desc" : "asc" }
        : { columna, sentido: "asc" },
    );

  async function abrir(observacion: ObservacionDelModelo) {
    const encontrada = await onAbrir(observacion);
    setNoEncontrada(encontrada ? null : observacion.id);
  }

  const filtrando = filtro !== "todas" || texto.trim() !== "";

  return (
    <section
      aria-label="Temas de coordinación"
      className="flex h-56 shrink-0 flex-col border-t border-borde bg-surface"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde px-2 py-1">
        <h2 className="text-xs font-semibold">
          Temas <span className="font-normal text-fg-3 tabular-nums">{observaciones.length}</span>
        </h2>

        <input
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Buscar por título, persona o GUID"
          aria-label="Buscar en los temas"
          className="w-60 min-w-0 rounded-sm border border-borde bg-surface-3 px-2 py-0.5 text-nota text-fg placeholder:text-fg-3"
        />

        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar los temas">
          {FILTROS.map(({ cual, texto: nombre }) => {
            const total = observaciones.filter((una) => pasa(una, cual)).length;
            const vacio = total === 0 && cual !== "todas";
            return (
              <button
                key={cual}
                type="button"
                onClick={() => setFiltro(cual)}
                aria-pressed={filtro === cual}
                disabled={vacio}
                className={[
                  "rounded-sm px-1.5 py-0.5 text-nota transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
                  filtro === cual
                    ? "bg-action/30 text-fg"
                    : vacio
                      ? "text-apagado-fg"
                      : "text-fg-3 hover:bg-surface-3 hover:text-fg-2",
                ].join(" ")}
              >
                {nombre} <span className="tabular-nums">{total}</span>
              </button>
            );
          })}
        </div>

        <span className="ml-auto flex items-center gap-2">
          {/* La descarga es de **toda la obra**, no de lo filtrado: un BCF es el intercambio con quien
              no usa AeroBim, y mandarle solo lo que uno tenía a la vista sería mandarle una parte sin
              decirlo. El servidor decide si este rol puede. */}
          <a
            href={`/documentos/proyectos/${proyectoId}/observaciones.bcf`}
            download
            title="Descarga todas las observaciones de la obra en BCF 2.1, para abrirlas en Solibri o Navisworks"
            className="rounded-sm px-1.5 py-0.5 text-nota text-fg-2 underline hover:bg-surface-3 hover:text-fg"
          >
            Descargar BCF
          </a>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la tabla de temas"
            title="Cerrar la tabla de temas"
            className="rounded-sm p-1 text-fg-3 hover:bg-surface-3 hover:text-fg"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </span>
      </header>

      {estado.kind === "cargando" ? (
        <p className="p-3 text-xs text-fg-3">Buscando temas…</p>
      ) : estado.kind === "sin-permiso" ? (
        <p className="p-3 text-xs leading-snug text-fg-3">
          Tu rol no puede ver las observaciones de esta obra.
        </p>
      ) : estado.kind === "error" ? (
        <p className="p-3 text-xs leading-snug text-fg-3">{estado.mensaje}</p>
      ) : observaciones.length === 0 ? (
        <p className="p-3 text-xs leading-snug text-fg-3">
          Ninguna nota todavía sobre un elemento de esta obra. Haz clic en un elemento del modelo y
          usa <strong className="text-fg-2">Dejar una nota</strong> en su ficha.
        </p>
      ) : filas.length === 0 ? (
        <p className="p-3 text-xs leading-snug text-fg-3">
          Ningún tema con este filtro o esta búsqueda.{" "}
          {filtrando && (
            <button
              type="button"
              onClick={() => {
                setFiltro("todas");
                setTexto("");
              }}
              className="text-fg-2 underline hover:text-fg"
            >
              Quitar el filtro
            </button>
          )}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-nota">
            <colgroup>
              <col className="w-20" />
              <col />
              <col className="w-20" />
              <col className="w-32" />
              <col className="w-40" />
              <col className="w-36" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr>
                <Cabecera
                  columna="prioridad"
                  nombre="Prioridad"
                  orden={orden}
                  onOrdenar={cambiarOrden}
                />
                <Cabecera columna="titulo" nombre="Título" orden={orden} onOrdenar={cambiarOrden} />
                <Cabecera columna="tipo" nombre="Tipo" orden={orden} onOrdenar={cambiarOrden} />
                <Cabecera columna="estado" nombre="Estado" orden={orden} onOrdenar={cambiarOrden} />
                <Cabecera
                  columna="responsable"
                  nombre="Responsable"
                  orden={orden}
                  onOrdenar={cambiarOrden}
                />
                <Cabecera columna="vence" nombre="Vence" orden={orden} onOrdenar={cambiarOrden} />
              </tr>
            </thead>
            <tbody>
              {filas.map((una) => {
                const seleccionada = guidSeleccionado !== null && una.guid === guidSeleccionado;
                return (
                  <tr
                    key={una.id}
                    onClick={() => void abrir(una)}
                    aria-selected={seleccionada}
                    className={[
                      "cursor-pointer border-b border-borde/60 transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
                      seleccionada ? "bg-action/20" : "hover:bg-surface-3",
                      una.esNueva
                        ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-accent"
                        : "",
                    ].join(" ")}
                  >
                    {/* La prioridad con texto y no solo con color: uno de cada doce hombres no
                        distingue rojo de verde. */}
                    <td
                      className={`px-2 py-1 font-semibold uppercase ${PRIORIDAD_TONO[una.prioridad] ?? "text-fg-2"}`}
                    >
                      {una.prioridadTexto}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={(evento) => {
                          evento.stopPropagation();
                          void abrir(una);
                        }}
                        title={`${una.titulo} · ${una.guid}`}
                        className="block w-full truncate text-left text-xs text-fg"
                      >
                        {una.esNueva && <span className="text-accent">nueva · </span>}
                        {una.titulo}
                      </button>
                      {noEncontrada === una.id && (
                        <span className="block text-warn" role="status">
                          Ese elemento no está en ningún modelo abierto. Suele ser de otra
                          disciplina: abre su modelo y vuelve a intentarlo.
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-fg-2">
                      {una.esInterferencia ? (
                        <span className="rounded-xs bg-warn/20 px-1 text-fg">choque</span>
                      ) : (
                        "nota"
                      )}
                    </td>
                    <td className="truncate px-2 py-1 text-fg-2">{una.estadoTexto}</td>
                    <td className="truncate px-2 py-1 text-fg-2">
                      {una.responsable}
                      {una.esMia && <span className="text-fg-3"> · tuya</span>}
                    </td>
                    <td className="truncate px-2 py-1 text-fg-2 tabular-nums">
                      {una.vence ?? <span className="text-fg-3">sin fecha</span>}
                      {una.vencida && <span className="text-danger"> · ⚠ vencida</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const SIN_TEMAS: readonly ObservacionDelModelo[] = [];

/** Cuán fuerte se pinta cada prioridad. **El texto va siempre**; el color es refuerzo. */
const PRIORIDAD_TONO: Record<string, string> = {
  alta: "text-danger",
  media: "text-fg-2",
  baja: "text-fg-3",
};

function Cabecera({
  columna,
  nombre,
  orden,
  onOrdenar,
}: {
  readonly columna: Columna;
  readonly nombre: string;
  readonly orden: { readonly columna: Columna; readonly sentido: Sentido };
  readonly onOrdenar: (columna: Columna) => void;
}) {
  const activa = orden.columna === columna;
  return (
    <th
      scope="col"
      aria-sort={activa ? (orden.sentido === "asc" ? "ascending" : "descending") : "none"}
      className="border-b border-borde px-2 py-1 text-left font-normal"
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        title={`Ordenar por ${nombre.toLowerCase()}`}
        className={[
          "flex items-center gap-1 text-micro tracking-wide uppercase",
          activa ? "text-fg" : "text-fg-3 hover:text-fg-2",
        ].join(" ")}
      >
        {nombre}
        {/* La flecha dice el sentido solo en la columna activa: en las demás sería ruido. */}
        {activa && <span aria-hidden>{orden.sentido === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
