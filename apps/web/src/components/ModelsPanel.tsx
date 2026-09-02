import type { IfcUnits, LoadedModel, LoadMetrics, MissingClass } from "@aerobim/viewer";
import { useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconX,
} from "./icons.js";

/**
 * Los modelos abiertos: ordenarlos, encenderlos y apagarlos.
 *
 * **Es la mitad que faltaba de `F1.5`.** Cargar dos modelos ya funcionaba, pero coordinar
 * consiste en apagar la arquitectura para mirar la estructura y volver: sin eso, dos modelos
 * abiertos son dos modelos encima del otro. El modelo apagado **sigue cargado**, así que
 * encenderlo otra vez es inmediato y no cuesta otra conversión.
 *
 * Las métricas de carga —lo que costó abrir cada uno, que es el entregable de `F0.4` y `F0.5`—
 * quedan plegadas. Estaban siempre a la vista y ocupaban media pantalla con datos que solo se
 * consultan cuando uno se pregunta por qué tardó.
 */
export function ModelsPanel({
  models,
  hidden,
  onToggleVisible,
  onMove,
  onClose,
}: {
  /** Los modelos en el orden en que se muestran. Ver {@link onMove}. */
  readonly models: readonly LoadedModel[];
  /** Identificadores de los modelos apagados. */
  readonly hidden: ReadonlySet<string>;
  readonly onToggleVisible: (modelId: string, visible: boolean) => void;
  /**
   * Mueve un modelo en la lista.
   *
   * Cambia **el orden de las listas** —este panel y el árbol— y no el orden de dibujado, que en
   * Fragments lo decide la profundidad. Con varias disciplinas abiertas, poner la propia arriba
   * es lo que hace la lista manejable.
   */
  readonly onMove: (index: number, direction: -1 | 1) => void;
  /**
   * Cierra un modelo y libera su memoria.
   *
   * Es más que apagarlo: para volver a verlo hay que abrir el archivo otra vez y pagar la
   * conversión. Por eso el botón aparece solo al pasar por encima de la fila.
   */
  readonly onClose: (modelId: string) => void;
}) {
  return (
    // Vivía flotando sobre el modelo, arriba a la derecha, y tapaba justo la esquina que uno
    // quiere ver. Ahora es una sección del navegador del proyecto, que pone el título y el plegado.
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto p-1.5">
        {models.map((loaded, index) => (
          <ModelRow
            key={`${loaded.id}-${index}`}
            loaded={loaded}
            visible={!hidden.has(loaded.id)}
            first={index === 0}
            last={index === models.length - 1}
            onToggleVisible={onToggleVisible}
            onMove={(direction) => onMove(index, direction)}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}

function ModelRow({
  loaded,
  visible,
  first,
  last,
  onToggleVisible,
  onMove,
  onClose,
}: {
  readonly loaded: LoadedModel;
  readonly visible: boolean;
  readonly first: boolean;
  readonly last: boolean;
  readonly onToggleVisible: (modelId: string, visible: boolean) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onClose: (modelId: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  // Cuántos elementos declara el archivo y no llegaron. Es la cifra que hay que ver de entrada.
  const sinCargar = loaded.metrics.missingClasses.reduce((suma, clase) => suma + clase.count, 0);

  return (
    <article className="group rounded-md hover:bg-surface-2">
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          onClick={() => onToggleVisible(loaded.id, !visible)}
          className={visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
          title={visible ? "Apagar este modelo" : "Encender este modelo"}
          aria-label={visible ? "Apagar este modelo" : "Encender este modelo"}
          aria-pressed={visible}
        >
          {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => setAbierto((actual) => !actual)}
          className={[
            "min-w-0 flex-1 truncate py-0.5 text-left text-sm",
            visible ? "text-fg" : "text-fg-3 line-through",
          ].join(" ")}
          title={`${loaded.name} — clic para ver lo que costó abrirlo`}
          aria-expanded={abierto}
        >
          {loaded.name}
        </button>

        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={first}
          className="shrink-0 text-fg-3 hover:text-fg disabled:invisible"
          title="Subir en la lista"
          aria-label="Subir en la lista"
        >
          <IconArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={last}
          className="shrink-0 text-fg-3 hover:text-fg disabled:invisible"
          title="Bajar en la lista"
          aria-label="Bajar en la lista"
        >
          <IconArrowDown className="h-3.5 w-3.5" />
        </button>

        {/* El aviso de geometría que falta se ve **sin desplegar la fila**: era lo más importante
            del panel y estaba escondido tras un clic que nadie tenía por qué dar. */}
        {sinCargar > 0 && (
          <span
            className="shrink-0 rounded-sm bg-warn/20 px-1 text-micro text-warn tabular-nums"
            title={`${sinCargar} elementos que el archivo declara y no se cargaron. Despliega la fila para ver de qué clases.`}
          >
            ⚠ {sinCargar}
          </span>
        )}

        <span className="shrink-0 text-fg-3" aria-hidden="true">
          {abierto ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        <button
          type="button"
          onClick={() => onClose(loaded.id)}
          // **Está siempre a la vista, y antes solo aparecía al pasar el ratón.** La intención era
          // buena —cerrar cuesta volver a convertir el archivo— pero la herramienta era la
          // equivocada: esconderlo no lo hace menos pulsable por accidente, lo hace **imposible**
          // con el teclado y en una pantalla táctil, donde no existe «pasar por encima». Que no
          // llame la atención se consigue con el color más apagado que todavía se lee.
          className="shrink-0 text-fg-3 hover:text-danger"
          title={`Cerrar ${loaded.name} y liberar su memoria`}
          aria-label={`Cerrar ${loaded.name}`}
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>

      {abierto && (
        <dl className="space-y-1 px-2 pb-2 text-xs">
          <Row label="Unidades" value={formatUnits(loaded.units)} />
          <Row label="Tamaño del IFC" value={formatBytes(loaded.metrics.ifcBytes)} />
          <Row
            label="Fragments"
            value={`${formatBytes(loaded.metrics.fragBytes)} · ${formatRatio(loaded.metrics)}`}
          />
          <Row
            label="Conversión"
            value={`${formatMs(loaded.metrics.convertMs)} · ${
              loaded.metrics.convertedIn === "worker" ? "en worker" : "hilo principal"
            }`}
          />
          <Row label="Hasta verlo" value={formatMs(loaded.metrics.displayMs)} />
          <Row label="Categorías IFC" value={String(loaded.metrics.categoryCount)} />
          <Row
            label="Elementos con geometría"
            value={loaded.metrics.itemsWithGeometry.toLocaleString("es-CL")}
          />
          <Row label="Dimensiones" value={formatSize(loaded.metrics.sizeM)} />
        </dl>
      )}

      {abierto && loaded.metrics.missingClasses.length > 0 && (
        <FaltaGeometria
          titulo="Elementos del archivo que no se cargaron"
          explicacion="El archivo los declara y no están ni en el árbol. O su clase no está entre las que procesa el conversor, o su geometría no se pudo construir — comprobado: cuando no puede, descarta el elemento entero."
          clases={loaded.metrics.missingClasses}
        />
      )}

      {abierto && loaded.metrics.emptyClasses.length > 0 && (
        <FaltaGeometria
          titulo="Elementos cargados sin dibujar"
          explicacion="Existen en el árbol y traen sus propiedades, pero no se dibujan. Es el caso raro: lo normal es que el conversor los descarte del todo."
          clases={loaded.metrics.emptyClasses}
        />
      )}
    </article>
  );
}

/**
 * Aviso de geometría que no está en pantalla, en sus dos formas.
 *
 * **Es el aviso más importante de este panel.** Un visor que abre un modelo sin fallar y muestra la
 * mitad es peor que uno que falla: nadie sospecha del que no se queja. Y los dos casos —la clase que
 * el conversor no procesa y el elemento cuya malla no se pudo generar— se ven igual en pantalla pero
 * se arreglan de forma distinta, así que se informan por separado.
 */
function FaltaGeometria({
  titulo,
  explicacion,
  clases,
}: {
  readonly titulo: string;
  readonly explicacion: string;
  readonly clases: readonly MissingClass[];
}) {
  const total = clases.reduce((suma, clase) => suma + clase.count, 0);

  return (
    <section className="mx-2 mb-2 rounded-md border border-warn/40 bg-warn/10 p-2">
      <h4 className="text-nota font-semibold text-warn">
        {titulo}: {total.toLocaleString("es-CL")}
      </h4>
      <p className="mt-0.5 mb-1 text-nota leading-snug text-fg-3">{explicacion}</p>
      <ul className="space-y-0.5 text-nota">
        {clases.slice(0, 8).map((clase) => (
          <li key={clase.ifcClass} className="flex justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-fg-2">{clase.ifcClass}</span>
            {/* Las tres cifras cuentan historias distintas: cargados en cero es una clase que el
                conversor no procesa; a medias es una clase que sí procesa y en la que algunos
                elementos fallaron, que es el caso difícil de ver. */}
            <span
              className="shrink-0 tabular-nums text-fg-3"
              title={`${clase.loaded} de ${clase.inFile} cargados`}
            >
              {clase.loaded > 0 ? `${clase.count} de ${clase.inFile}` : clase.count}
            </span>
          </li>
        ))}
      </ul>
      {clases.length > 8 && (
        <p className="mt-1 text-nota text-fg-3">y {clases.length - 8} clases más</p>
      )}
    </section>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-fg-2">{label}</dt>
      <dd className="text-right font-mono text-fg">{value}</dd>
    </div>
  );
}

/**
 * Las unidades que declara el archivo.
 *
 * Se muestran porque explican los números de la ficha de propiedades: un `Length 8070.861`
 * cobra sentido en cuanto se sabe que el modelo está en milímetros. Si el IFC no declara
 * ninguna, se dice — no se rellena con metros.
 */
function formatUnits(units: IfcUnits): string {
  const partes = [units.length, units.area, units.volume].filter((simbolo) => simbolo !== null);
  return partes.length === 0 ? "sin declarar" : partes.join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Cuánto más chico quedó el Fragments que el IFC: el argumento de `F0.5`, a la vista. */
function formatRatio({ ifcBytes, fragBytes }: LoadMetrics): string {
  if (fragBytes <= 0) return "sin dato";
  return `${(ifcBytes / fragBytes).toFixed(1)}× menos`;
}

/** Dimensiones en metros. `null` cuando no se pudo determinar: no se inventa un valor. */
function formatSize(sizeM: readonly [number, number, number] | null): string {
  if (sizeM === null) return "sin determinar";
  return sizeM.map((value) => value.toFixed(1)).join(" × ") + " m";
}
