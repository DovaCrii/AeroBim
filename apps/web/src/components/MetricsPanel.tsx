import type { LoadedModel, LoadMetrics } from "@aerobim/viewer";

/**
 * Panel de medición para `F0.4` y `F0.5`: qué costó abrir cada modelo.
 *
 * No es un adorno de la prueba de concepto — es el entregable. El plan exige una cifra
 * medida sobre un IFC real antes de construir encima, y esta es la pantalla que la da.
 */
export function MetricsPanel({ models }: { readonly models: readonly LoadedModel[] }) {
  return (
    <aside className="absolute top-4 right-4 w-80 space-y-3 rounded-lg border border-white/10 bg-ink/90 p-3 backdrop-blur">
      <h2 className="text-xs font-semibold tracking-wide text-white/70 uppercase">
        Modelos abiertos
      </h2>

      {models.map((loaded, index) => (
        <article
          // Fragments usa el nombre del archivo como identificador, asi que abrir dos
          // veces el mismo modelo repetiria la clave. El indice la desambigua.
          key={`${loaded.id}-${index}`}
          className="space-y-1.5 border-t border-white/10 pt-2 first:border-0"
        >
          <p className="truncate text-sm font-medium" title={loaded.name}>
            {loaded.name}
          </p>
          <dl className="space-y-1 text-xs">
            <Row label="Tamaño del IFC" value={formatBytes(loaded.metrics.ifcBytes)} />
            <Row
              label="Fragments"
              value={`${formatBytes(loaded.metrics.fragBytes)} · ${formatRatio(loaded.metrics)}`}
            />
            <Row label="Conversión" value={formatMs(loaded.metrics.convertMs)} />
            <Row label="Hasta verlo" value={formatMs(loaded.metrics.displayMs)} />
            <Row label="Categorías IFC" value={String(loaded.metrics.categoryCount)} />
            <Row
              label="Elementos con geometría"
              value={loaded.metrics.itemsWithGeometry.toLocaleString("es-CL")}
            />
            <Row label="Dimensiones" value={formatSize(loaded.metrics.sizeM)} />
          </dl>
        </article>
      ))}
    </aside>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right font-mono text-white/90">{value}</dd>
    </div>
  );
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
