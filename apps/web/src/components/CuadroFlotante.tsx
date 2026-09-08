import type { Schedule } from "@aerobim/viewer";
import { encabezadoDeColumna } from "@aerobim/viewer";
import { useMemo, useState } from "react";
import { IconX } from "./icons.js";

/**
 * El cuadro, sobre el modelo. `F10.5`.
 *
 * **Va flotando y no en el panel de la derecha**, y no es capricho: el panel mide unos 320 px y un
 * cuadro de perfiles de acero trae veinticuatro columnas. Ahí dentro no es una tabla, es una lista
 * de celdas cortadas. Es el mismo reparto que ya usa la nota flotante — lo ancho va encima del
 * modelo, lo estrecho al lado.
 *
 * Tres cosas que la hacen utilizable con trescientas filas:
 *
 * 1. **La cabecera se queda quieta al bajar.** Sin eso, a la fila cuarenta ya no se sabe qué columna
 *    se está leyendo y hay que subir a mirar.
 * 2. **Se puede ordenar por cualquier columna**, que es lo que se hace en un cuadro: el perfil más
 *    pesado, el más largo, los que no tienen nombre. Y **ordena por número cuando la columna es
 *    numérica**: por texto, «10» va antes que «9» y el cuadro miente.
 * 3. **Un filtro de texto sobre todas las celdas**, porque la pregunta normal es «¿dónde están los
 *    HEB»?» y no «enséñame las trescientas».
 */
export function CuadroFlotante({
  cuadro,
  onCerrar,
  onDescargar,
  onIrAlElemento,
}: {
  readonly cuadro: Schedule;
  readonly onCerrar: () => void;
  readonly onDescargar: () => void;
  /** Lleva el visor al elemento de esa fila. Es lo que hace del cuadro algo más que una tabla. */
  readonly onIrAlElemento: (localId: number) => void;
}) {
  const [orden, setOrden] = useState<{ clave: string; descendente: boolean } | null>(null);
  const [buscado, setBuscado] = useState("");

  const filas = useMemo(() => {
    const texto = buscado.trim().toLowerCase();
    const filtradas =
      texto === ""
        ? [...cuadro.rows]
        : cuadro.rows.filter(
            (fila) =>
              (fila.name ?? "").toLowerCase().includes(texto) ||
              [...fila.values.values()].some((valor) => valor.toLowerCase().includes(texto)),
          );

    if (orden === null) return filtradas;

    // **Numérico cuando las dos celdas son números.** Un cuadro de pesos ordenado por texto pone
    // «1.020» antes de «980», y entonces el número que se buscaba —el más pesado— no está arriba.
    const clave = orden.clave;
    filtradas.sort((una, otra) => {
      const a = clave === "__nombre" ? (una.name ?? "") : (una.values.get(clave) ?? "");
      const b = clave === "__nombre" ? (otra.name ?? "") : (otra.values.get(clave) ?? "");
      // **La celda vacía va al final en los dos sentidos**, y no es un detalle: vacío significa
      // «este elemento no trae esa propiedad», y esos son justo los que se buscan al ordenar por
      // ella. Con el orden natural se colaban entre los valores pequeños y había que bajar a
      // buscarlos. Es la misma decisión que las fechas sin vencimiento en el registro.
      if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1;

      const na = numeroDe(a);
      const nb = numeroDe(b);
      const cmp =
        na !== null && nb !== null ? na - nb : a.localeCompare(b, "es", { numeric: true });
      return orden.descendente ? -cmp : cmp;
    });
    return filtradas;
  }, [cuadro.rows, orden, buscado]);

  const alternar = (clave: string) =>
    setOrden((actual) =>
      actual?.clave === clave
        ? { clave, descendente: !actual.descendente }
        : { clave, descendente: false },
    );

  return (
    <div className="pointer-events-auto absolute inset-x-4 top-4 bottom-4 z-20 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-borde bg-surface shadow-[var(--shadow-xl)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-borde px-3 py-2">
        <span className="text-sm font-semibold text-fg">{cuadro.category}</span>
        <span className="text-nota text-fg-3">
          {filas.length === cuadro.rows.length
            ? `${cuadro.rows.length} de ${cuadro.total}`
            : `${filas.length} de ${cuadro.rows.length} leídas`}
          {cuadro.truncated && " · cortado por el tope"}
        </span>
        <input
          type="text"
          value={buscado}
          onChange={(evento) => setBuscado(evento.target.value)}
          placeholder="Buscar en el cuadro"
          className="ml-auto w-52 rounded border border-borde-campo bg-surface-2 px-2 py-1 text-nota text-fg placeholder:text-fg-3"
        />
        <button
          type="button"
          className="min-h-11 rounded border border-borde px-2.5 py-1 text-nota text-fg hover:border-accent"
          onClick={onDescargar}
        >
          CSV
        </button>
        <button
          type="button"
          aria-label="Cerrar el cuadro"
          className="rounded p-1 text-fg-2 hover:bg-surface-3 hover:text-fg"
          onClick={onCerrar}
        >
          <IconX className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-nota">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <Th
                clave="__nombre"
                texto="Nombre"
                orden={orden}
                onAlternar={alternar}
                ayuda="El nombre del elemento, o el de su tipo cuando no tiene propio"
              />
              {cuadro.columns.map((columna) => (
                <Th
                  key={columna.key}
                  clave={columna.key}
                  texto={encabezadoDeColumna(columna)}
                  orden={orden}
                  onAlternar={alternar}
                  ayuda={`${columna.filled} de ${cuadro.rows.length} elementos la traen`}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.localId} className="border-t border-borde hover:bg-surface-3">
                <td className="px-2 py-1 whitespace-nowrap">
                  {/* **El nombre lleva al elemento**, que es lo que convierte el cuadro en una
                      herramienta de revisión: se ve el perfil raro en la tabla y se va a mirarlo. */}
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => onIrAlElemento(fila.localId)}
                  >
                    {fila.name ?? `#${fila.localId}`}
                  </button>
                </td>
                {cuadro.columns.map((columna) => (
                  <td key={columna.key} className="px-2 py-1 whitespace-nowrap text-fg-2">
                    {fila.values.get(columna.key) ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="p-4 text-nota text-fg-3">Ninguna fila contiene «{buscado}».</p>
        )}
      </div>
    </div>
  );
}

/** Una cabecera que ordena, con su flecha en la que manda. */
function Th({
  clave,
  texto,
  orden,
  onAlternar,
  ayuda,
}: {
  readonly clave: string;
  readonly texto: string;
  readonly orden: { clave: string; descendente: boolean } | null;
  readonly onAlternar: (clave: string) => void;
  readonly ayuda: string;
}) {
  const activa = orden?.clave === clave;
  return (
    <th
      scope="col"
      title={ayuda}
      aria-sort={activa ? (orden.descendente ? "descending" : "ascending") : undefined}
      className="border-b border-borde px-2 py-1.5 text-left font-semibold whitespace-nowrap"
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 ${activa ? "text-accent" : "text-fg-2 hover:text-fg"}`}
        onClick={() => onAlternar(clave)}
      >
        {texto}
        {activa && <span aria-hidden="true">{orden.descendente ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

/**
 * El número de una celda, o `null` si no es un número.
 *
 * **El punto no se puede dar por separador de miles**, y suponerlo fue un error de verdad: la
 * primera versión hacía `replaceAll(".", "")` para limpiar los miles, y con eso «98.1597» —el peso
 * de un perfil, con punto decimal— se convertía en 981597 y «9.14577» en 914577. Ordenar por peso
 * daba 98,16 · 9,15 · 91,07, o sea el orden de texto disfrazado de numérico. Lo destapó ordenar la
 * columna «Weight (kg)» en pantalla y mirar los cinco primeros.
 *
 * La regla no adivina: **si hay una coma, la coma es el decimal** y los puntos son miles —«1.020,5»
 * es lo que escribe una configuración castellana—; **si no hay coma, el punto es el decimal**, que
 * es lo que traen los valores del IFC. Las dos convenciones se distinguen por lo que hay en la
 * cadena, no por lo que se espera que haya.
 *
 * La unidad pegada no estorba: se corta en el primer carácter que no sea del número.
 */
function numeroDe(valor: string): number | null {
  const texto = valor.trim();
  const limpio = texto.includes(",") ? texto.replaceAll(".", "").replace(",", ".") : texto;
  const encontrado = /^-?\d+(\.\d+)?/.exec(limpio);
  if (encontrado === null) return null;
  const numero = Number(encontrado[0]);
  return Number.isFinite(numero) ? numero : null;
}
