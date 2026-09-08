import type { LoadedModel, Schedule } from "@aerobim/viewer";
import { useCallback, useEffect, useState } from "react";
import { IconTable } from "./icons.js";

/**
 * Cuadros del modelo: **una categoría, sus elementos y sus propiedades**. `F10.5`.
 *
 * Es el cuadro de carpinterías o de pilares de una oficina: todos los perfiles del modelo con su
 * peso, su longitud y su tipo, en filas, para contarlos y comprobarlos. El visor ya sabía enseñar
 * las propiedades **de un elemento** al clicarlo; esto las enseña **de todos a la vez**, que es
 * cuando se ve lo que falta — el perfil sin nombre, los diez muros sin material.
 *
 * **La lista de categorías es solo de lo que tiene geometría**, y eso se decidió midiendo: en el
 * modelo de 32 MB del usuario las tres categorías más numerosas del archivo son
 * `IFCPROPERTYSINGLEVALUE` (23.946), `IFCPROPERTYSET` (839) e `IFCSIUNIT` (10) — fontanería del
 * formato, no cosas del edificio. La razón vive en `cuadros.ts`, que es quien filtra.
 *
 * **La tabla no se dibuja aquí.** El panel mide unos 320 px y un cuadro de acero tiene veinticuatro
 * columnas: aquí van la categoría, el tamaño y qué columnas trae, y la tabla se abre sobre el
 * modelo. Es el mismo reparto que ya usa la nota flotante, y por el mismo motivo.
 */
export function CuadrosPanel({
  models,
  cargarCategorias,
  cargarCuadro,
  onVerTabla,
  onDescargar,
}: {
  readonly models: readonly LoadedModel[];
  readonly cargarCategorias: (modelId: string) => Promise<ReadonlyMap<string, number>>;
  readonly cargarCuadro: (modelId: string, categoria: string) => Promise<Schedule | null>;
  readonly onVerTabla: (cuadro: Schedule) => void;
  readonly onDescargar: (cuadro: Schedule) => void;
}) {
  /** El modelo del que se está mirando el cuadro. Con uno solo abierto, ese. */
  const [modelId, setModelId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<readonly (readonly [string, number])[]>([]);
  const [cuadro, setCuadro] = useState<Schedule | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegido = modelId ?? models[0]?.id ?? null;

  /**
   * Las categorías se piden **al abrir la sección y al cambiar de modelo**, no en cada dibujado.
   *
   * Es una consulta al modelo con su lista de geometría: barata comparada con leer propiedades,
   * pero no gratis, y sin esta dependencia se dispararía en cada tecla que se pulse en la pantalla.
   */
  useEffect(() => {
    if (elegido === null) {
      setCategorias([]);
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const encontradas = await cargarCategorias(elegido);
        if (!vivo) return;
        setCategorias(
          [...encontradas.entries()].sort(
            (una, otra) => otra[1] - una[1] || una[0].localeCompare(otra[0]),
          ),
        );
      } catch (fallo: unknown) {
        if (vivo) setError(fallo instanceof Error ? fallo.message : String(fallo));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [elegido, cargarCategorias]);

  // Al cambiar de modelo el cuadro anterior ya no vale: era de otro archivo.
  useEffect(() => setCuadro(null), [elegido]);

  const pedir = useCallback(
    async (categoria: string) => {
      if (elegido === null) return;
      setCargando(categoria);
      setError(null);
      try {
        const armado = await cargarCuadro(elegido, categoria);
        setCuadro(armado);
        // **Se abre solo al terminar.** Leer trescientos elementos tarda una fracción de segundo, y
        // si hay que pulsar otro botón después, el gesto son dos clics para una sola intención.
        if (armado !== null) onVerTabla(armado);
      } catch (fallo: unknown) {
        setError(fallo instanceof Error ? fallo.message : String(fallo));
      } finally {
        setCargando(null);
      }
    },
    [elegido, cargarCuadro, onVerTabla],
  );

  if (models.length === 0) {
    return (
      <p className="p-3 text-nota text-fg-3">
        Sin modelo abierto no hay cuadro que armar. Abre uno desde «Del registro».
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {models.length > 1 && (
        <label className="flex items-center gap-2 border-b border-borde px-3 py-2 text-nota text-fg-2">
          Modelo
          <select
            className="min-w-0 flex-1 rounded border border-borde-campo bg-surface-2 px-1.5 py-1 text-nota text-fg"
            value={elegido ?? ""}
            onChange={(evento) => setModelId(evento.target.value)}
          >
            {models.map((uno) => (
              <option key={uno.id} value={uno.id}>
                {uno.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {categorias.length === 0 ? (
          <p className="p-2 text-nota text-fg-3">
            Este modelo no trae ninguna categoría con geometría.
          </p>
        ) : (
          categorias.map(([nombre, cuantos]) => (
            <button
              key={nombre}
              type="button"
              className={`flex w-full min-h-11 items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-3 ${
                cuadro?.category === nombre ? "bg-surface-3 text-accent" : "text-fg-2"
              }`}
              onClick={() => void pedir(nombre)}
              disabled={cargando !== null}
            >
              <IconTable className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{nombre}</span>
              <span className="shrink-0 tabular-nums text-fg-3">
                {cargando === nombre ? "leyendo…" : cuantos}
              </span>
            </button>
          ))
        )}
      </div>

      {error !== null && (
        <p className="border-t border-borde px-3 py-2 text-nota text-danger">{error}</p>
      )}

      {cuadro !== null && (
        <div className="border-t border-borde p-3 text-nota text-fg-2">
          <p className="font-semibold text-fg">{cuadro.category}</p>
          <p>
            {cuadro.rows.length} de {cuadro.total} elementos · {cuadro.columns.length} columnas
            {cuadro.hiddenColumns > 0 && ` (+${cuadro.hiddenColumns} sin caber)`}
          </p>
          {/* **Cuando se corta se dice.** Un cuadro que presume de ser el total y no lo es es peor
              que no tener cuadro: alguien cuenta las filas y se lleva el número equivocado. */}
          {cuadro.truncated && (
            <p className="mt-1 text-warn">
              Se leyeron los primeros {cuadro.rows.length}: el CSV lleva esos, no los {cuadro.total}
              .
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded border border-borde px-2.5 py-1 text-nota text-fg hover:border-accent"
              onClick={() => onVerTabla(cuadro)}
            >
              Ver la tabla
            </button>
            <button
              type="button"
              className="min-h-11 rounded border border-borde px-2.5 py-1 text-nota text-fg hover:border-accent"
              onClick={() => onDescargar(cuadro)}
            >
              Descargar CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
