import type { PickedItem, PlanHit, PropertyValue } from "@aerobim/viewer";
import { IconEye, IconEyeOff, IconIsolate } from "./icons.js";

/**
 * La ficha de un elemento 2D del plano.
 *
 * **Un trazo del CAD no es un elemento BIM y no se le pueden pedir los mismos datos**: no tiene
 * GUID ni psets, tiene capa, plano de origen, largo y dónde está. Mezclarlo con la ficha del modelo
 * obligaría a llenar de "—" media pantalla; separarlo deja claro qué se está mirando.
 */
/** Cómo se llama en la ficha lo que se tocó del plano. */
const ETIQUETA_2D: Record<"line" | "fill" | "text", string> = {
  line: "Trazo 2D",
  fill: "Relleno 2D",
  text: "Rótulo 2D",
};

export function Plan2DCard({
  hit,
  onClose,
}: {
  readonly hit: PlanHit;
  readonly onClose: () => void;
}) {
  const [x, y, z] = hit.point;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-2 border-b border-white/10 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-wide text-brand uppercase">
            {ETIQUETA_2D[hit.kind]}
          </p>
          <p className="truncate text-sm" title={hit.text ?? hit.layer}>
            {hit.text ?? hit.layer}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Quitar la selección"
          title="Quitar la selección"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <section>
          <h3 className="mb-1 font-semibold text-white/70">Origen</h3>
          <dl className="space-y-1">
            <Row label="Plano" value={hit.planName} />
            <Row label="Capa" value={hit.layer} />
          </dl>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-white/70">Geometría</h3>
          <dl className="space-y-1">
            {hit.text !== null && <Row label="Texto" value={hit.text} />}
            <Row
              label="Largo del tramo"
              value={
                hit.segmentLengthM === null
                  ? hit.kind === "line"
                    ? "—"
                    : "no aplica"
                  : `${hit.segmentLengthM.toFixed(3)} m`
              }
              mono={hit.segmentLengthM !== null}
              muted={hit.segmentLengthM === null}
            />
            {/* El punto va en coordenadas de la escena, que son las mismas del modelo: es lo que
                permite comparar dónde cae el trazo del plano y dónde el elemento modelado. */}
            <Row label="X" value={`${x.toFixed(3)} m`} mono />
            <Row label="Altura" value={`${y.toFixed(3)} m`} mono />
            <Row label="Z" value={`${z.toFixed(3)} m`} mono />
          </dl>
        </section>

        <p className="border-t border-white/10 pt-2 text-[11px] leading-snug text-white/35">
          Un plano CAD no trae más datos que estos: lo que sabe del elemento es su capa y su
          geometría. Lo demás —tipo, material, cantidades— vive en el modelo IFC.
        </p>
      </div>
    </div>
  );
}

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
  visible,
  isolated,
  onClose,
  onToggleVisible,
  onIsolate,
  onUndoIsolate,
}: {
  /** El elemento seleccionado, o `null` cuando no hay ninguno. */
  readonly item: PickedItem | null;
  /** `false` cuando el elemento seleccionado está apagado. */
  readonly visible: boolean;
  /** `true` mientras se mira algo aislado: el botón de aislar pasa a ser el de salir. */
  readonly isolated: boolean;
  readonly onClose: () => void;
  readonly onToggleVisible: (visible: boolean) => void;
  readonly onIsolate: () => void;
  /** Sale del aislamiento y devuelve el modelo a como estaba antes de aislar. */
  readonly onUndoIsolate: () => void;
}) {
  // El panel **está siempre**, como en Revit: es un sitio fijo de la pantalla, y en cuanto se
  // selecciona algo se llena. Antes aparecía y desaparecía flotando sobre el modelo, lo que movía la
  // vista y tapaba justo la esquina que se estaba mirando.
  if (item === null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="border-b border-white/10 px-3 py-2">
          <h2 className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
            Propiedades
          </h2>
        </header>
        <p className="p-3 text-xs leading-snug text-white/35">
          Selecciona un elemento del modelo para ver su categoría, su GUID y sus propiedades, cada
          número con la unidad que declara el archivo.
        </p>
      </div>
    );
  }

  const hayInferidas = [...item.attributes, ...item.groups.flatMap((g) => g.properties)].some(
    (propiedad) => propiedad.unitInferred,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-2 border-b border-white/10 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-wide text-brand uppercase">
            {item.category ?? "Elemento"}
          </p>
          <p className="truncate text-sm" title={item.name ?? undefined}>
            {item.name ?? "Sin nombre"}
          </p>
        </div>
        {/* Apagar y aislar **el elemento seleccionado**, que es donde uno los busca: en su ficha.
            Antes solo se podía ocultar un grupo entero desde el árbol, y llegar a un elemento
            concreto por ahí era imposible en una categoría de cientos. */}
        <button
          type="button"
          onClick={() => onToggleVisible(!visible)}
          className={[
            "rounded p-1",
            visible ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-brand",
          ].join(" ")}
          aria-label={visible ? "Apagar este elemento" : "Encender este elemento"}
          title={visible ? "Apagar este elemento" : "Encender este elemento"}
          aria-pressed={!visible}
        >
          {visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
        </button>

        {/* El mismo botón entra y sale del aislamiento, que es donde uno lo busca: se aísla desde
            acá, así que acá tiene que estar la vuelta. Y salir **no es** "Ver todo": devuelve el
            modelo a como estaba antes de aislar, con lo que se había apagado a mano todavía
            apagado. */}
        <button
          type="button"
          onClick={isolated ? onUndoIsolate : onIsolate}
          className={[
            "rounded p-1",
            isolated
              ? "bg-brand/15 text-brand"
              : "text-white/50 hover:bg-white/10 hover:text-white",
          ].join(" ")}
          aria-label={isolated ? "Salir del aislamiento" : "Aislar este elemento"}
          aria-pressed={isolated}
          title={
            isolated
              ? "Salir del aislamiento: vuelve a como estaba el modelo antes de aislar"
              : "Aislar: deja solo este elemento a la vista"
          }
        >
          <IconIsolate className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Quitar la selección"
          title="Quitar la selección"
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
    </div>
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
      // El tipo con que el archivo declara el valor va en el tooltip: es lo que explica por qué un
      // número lleva unidad o no la lleva. Un `IFCREAL` no dice de qué magnitud es; un `IFCLABEL`
      // es texto aunque parezca un número.
      ifcType={property.ifcType}
    />
  );
}

function Row({
  label,
  value,
  unit = null,
  unitInferred = false,
  ifcType = null,
  mono = false,
  muted = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | null;
  readonly unitInferred?: boolean;
  readonly ifcType?: string | null;
  readonly mono?: boolean;
  readonly muted?: boolean;
}) {
  const conUnidad = unit === null ? value : `${value} ${unit}`;
  const explicacion =
    ifcType === null
      ? conUnidad
      : `${conUnidad}\nel archivo lo declara como ${ifcType}` +
        (unit === null ? ", que no dice de qué magnitud es" : "");

  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd
        className={[
          "min-w-0 text-right break-words",
          mono ? "font-mono select-all" : "",
          muted ? "text-white/40 italic" : "text-white/90",
        ].join(" ")}
        title={explicacion}
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
