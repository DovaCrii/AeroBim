import type { PickedItem, PropertyValue } from "@aerobim/viewer";

/**
 * Lo que trae el elemento seleccionado.
 *
 * Es la mitad del valor de un visor: sin esto se ve una forma, con esto se consulta el
 * modelo. Muestra la categoría, el GUID —la identidad estable, la que viaja en un BCF— y
 * los bloques de propiedades que llegan por relaciones: tipo, material y psets.
 *
 * **Cada número va con su unidad.** Antes salían pelados, y un `Length 8070.861` no dice si son
 * milímetros, metros o pies: son tres órdenes de magnitud de diferencia y alguien iba a pedir
 * material con ese número. La unidad sale del propio archivo — ver `ifcUnits.ts` en `bim-core`.
 */
export function PropertiesPanel({
  item,
  onClose,
}: {
  readonly item: PickedItem;
  readonly onClose: () => void;
}) {
  const hayInferidas = [...item.attributes, ...item.groups.flatMap((g) => g.properties)].some(
    (propiedad) => propiedad.unitInferred,
  );

  return (
    <aside className="absolute top-4 left-4 flex max-h-[calc(100%-2rem)] w-80 flex-col rounded-lg border border-white/10 bg-ink/90 backdrop-blur">
      <header className="flex items-start gap-2 border-b border-white/10 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-wide text-brand uppercase">
            {item.category ?? "Elemento"}
          </p>
          <p className="truncate text-sm" title={item.name ?? undefined}>
            {item.name ?? "Sin nombre"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar propiedades"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <section>
          <h3 className="mb-1 font-semibold text-white/70">Identidad</h3>
          <dl className="space-y-1">
            {/* El GUID va en monoespaciada y seleccionable: es lo que alguien copia para
                rastrear un elemento entre herramientas. */}
            <Row
              label="GUID"
              value={item.guid ?? "sin GUID válido"}
              mono
              muted={item.guid === null}
            />
            <Row label="Modelo" value={item.modelId} />
          </dl>
        </section>

        {item.attributes.length > 0 && (
          <section>
            <h3 className="mb-1 font-semibold text-white/70">Atributos</h3>
            <dl className="space-y-1">
              {item.attributes.map((attribute) => (
                <PropertyRow key={attribute.name} property={attribute} />
              ))}
            </dl>
          </section>
        )}

        {item.groups.map((group, index) => (
          <section key={`${group.name}-${index}`}>
            <h3 className="mb-1 font-semibold text-white/70">{group.name}</h3>
            <dl className="space-y-1">
              {group.properties.map((property, propertyIndex) => (
                <PropertyRow key={`${property.name}-${propertyIndex}`} property={property} />
              ))}
            </dl>
          </section>
        ))}

        {item.attributes.length === 0 && item.groups.length === 0 && (
          <p className="text-white/40">
            El elemento no trae más información. Muchos exportadores omiten los psets — es una
            casilla en el exportador, no un problema del modelo.
          </p>
        )}

        {hayInferidas && (
          <p className="border-t border-white/10 pt-2 text-[11px] leading-snug text-white/35">
            Las unidades atenuadas se deducen del nombre de la propiedad: el archivo declara el
            número sin decir de qué magnitud es.
          </p>
        )}
      </div>
    </aside>
  );
}

/** Una propiedad con su unidad, cuando le corresponde alguna. */
function PropertyRow({ property }: { readonly property: PropertyValue }) {
  return (
    <Row
      label={property.name}
      value={property.value}
      unit={property.unit}
      unitInferred={property.unitInferred}
    />
  );
}

function Row({
  label,
  value,
  unit = null,
  unitInferred = false,
  mono = false,
  muted = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | null;
  readonly unitInferred?: boolean;
  readonly mono?: boolean;
  readonly muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd
        className={[
          "min-w-0 text-right break-words",
          mono ? "font-mono select-all" : "",
          muted ? "text-white/40 italic" : "text-white/90",
        ].join(" ")}
        title={unit === null ? value : `${value} ${unit}`}
      >
        {value}
        {unit !== null && (
          <span
            // La unidad deducida se atenúa a propósito: es una ayuda de lectura, no un dato del
            // archivo, y presentarla igual que una declarada la haría pasar por certeza.
            className={unitInferred ? "text-white/35" : "text-white/55"}
            title={
              unitInferred
                ? "Unidad deducida del nombre de la propiedad"
                : "Unidad declarada por el modelo"
            }
          >
            {` ${unit}`}
          </span>
        )}
      </dd>
    </div>
  );
}
