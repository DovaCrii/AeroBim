import type { PickedItem, PlanHit, PropertyValue } from "@aerobim/viewer";
import { IconEye, IconEyeOff, IconIsolate, IconNota } from "./icons.js";

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
      <header className="flex items-start gap-2 border-b border-borde p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-wide text-accent uppercase">
            {ETIQUETA_2D[hit.kind]}
          </p>
          <p className="truncate text-sm" title={hit.text ?? hit.layer}>
            {hit.text ?? hit.layer}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Quitar la selección"
          title="Quitar la selección"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-x-clip overflow-y-auto p-3 text-xs">
        <section>
          <h3 className="mb-1 font-semibold text-fg-2">Origen</h3>
          <dl className="space-y-1">
            <Row label="Plano" value={hit.planName} />
            <Row label="Capa" value={hit.layer} />
          </dl>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-fg-2">Geometría</h3>
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

        <p className="border-t border-borde pt-2 text-nota leading-snug text-fg-3">
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
  observar = null,
  motivoSinObservar = null,
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
  /**
   * Cómo se abre una observación sobre este elemento, o `null` si no hay dónde anotarla.
   *
   * **`null` significa que el enlace no existe, no que esté deshabilitado**, y por eso no se dibuja:
   * pasa cuando el modelo se abrió del disco —no hay entregable donde colgar la observación—, cuando
   * el rol no puede abrirlas, o cuando el elemento no trae GUID válido. Un botón gris que no explica
   * por qué está gris manda a alguien a buscar el error donde no está.
   */
  readonly observar?: (() => void) | null;
  /**
   * Por qué no se puede anotar, cuando `observar` es `null`.
   *
   * **Sin esto la ficha callaba, y callar es lo que dejó a alguien buscando.** El botón no se
   * dibuja porque no hay dónde archivar la nota —eso está bien—, pero quien selecciona un elemento
   * de un IFC abierto del disco no veía ningún camino y concluía que el producto no anota. El
   * motivo lleva **la salida**, que es distinta en cada caso: abrirlo desde el expediente, pedir el
   * permiso, o que ese elemento no tiene GUID.
   */
  readonly motivoSinObservar?: string | null;
}) {
  // El panel **está siempre**, como en Revit: es un sitio fijo de la pantalla, y en cuanto se
  // selecciona algo se llena. Antes aparecía y desaparecía flotando sobre el modelo, lo que movía la
  // vista y tapaba justo la esquina que se estaba mirando.
  if (item === null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="border-b border-borde px-3 py-2">
          <h2 className="text-nota font-semibold tracking-wide text-fg-2 uppercase">Propiedades</h2>
        </header>
        <p className="p-3 text-xs leading-snug text-fg-3">
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
      <header className="flex items-start gap-2 border-b border-borde p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-wide text-accent uppercase">
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
            "rounded-sm p-1",
            visible ? "text-fg-2 hover:bg-surface-3 hover:text-fg" : "text-accent",
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
            "rounded-sm p-1",
            isolated ? "bg-action/20 text-accent" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
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
          className="rounded-sm px-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg"
          aria-label="Quitar la selección"
          title="Quitar la selección"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-x-clip overflow-y-auto p-3 text-xs">
        <section>
          <h3 className="mb-1 font-semibold text-fg-2">Identidad</h3>
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

          {/* **De ver el problema a dejarlo anotado, sin salir del modelo** (`F4.9`). El GUID que
              se muestra arriba es el ancla: queda guardado en la nota y es el que después viaja en
              el BCF que abre el mandante en Solibri.

              **Era un enlace a otra pantalla y eso era el problema**, no una molestia. Con las
              palabras del usuario: «al salir de lo que veo pierdo visión de lo que estoy
              haciendo». Ahora abre una tarjeta flotante encima del modelo. */}
          {observar !== null && (
            <button
              type="button"
              onClick={observar}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-action px-2 py-1.5 text-xs font-semibold text-sobre-accion hover:bg-action-hover"
              title="Deja una nota anclada al GUID de este elemento, sin salir del modelo"
            >
              <IconNota className="h-3.5 w-3.5" />
              Dejar una nota
            </button>
          )}

          {/* **El motivo, con la salida.** Ver `motivoSinObservar`: la alternativa era no decir
              nada, y no decir nada es lo que hace que alguien concluya que el producto no anota. */}
          {observar === null && motivoSinObservar !== null && (
            <p className="mt-2 rounded-sm border border-borde bg-surface-2 px-2 py-1.5 text-nota leading-snug text-fg-3">
              {motivoSinObservar}
            </p>
          )}
        </section>

        {item.attributes.length > 0 && (
          <section>
            <h3 className="mb-1 font-semibold text-fg-2">Atributos</h3>
            <dl className="space-y-1">
              {item.attributes.map((attribute) => (
                <PropertyRow key={attribute.name} property={attribute} />
              ))}
            </dl>
          </section>
        )}

        {item.groups.map((group, index) => (
          <section key={`${group.name}-${index}`}>
            <h3 className="mb-1 font-semibold text-fg-2">{group.name}</h3>
            <dl className="space-y-1">
              {group.properties.map((property, propertyIndex) => (
                <PropertyRow key={`${property.name}-${propertyIndex}`} property={property} />
              ))}
            </dl>
          </section>
        ))}

        {item.attributes.length === 0 && item.groups.length === 0 && (
          <p className="text-fg-3">
            El elemento no trae más información. Muchos exportadores omiten los psets — es una
            casilla en el exportador, no un problema del modelo.
          </p>
        )}

        {hayInferidas && (
          <p className="border-t border-borde pt-2 text-nota leading-snug text-fg-3">
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
      <dt className="shrink-0 text-fg-2">{label}</dt>
      <dd
        className={[
          "min-w-0 text-right break-words",
          mono ? "font-mono select-all" : "",
          muted ? "text-fg-3 italic" : "text-fg",
        ].join(" ")}
        title={explicacion}
      >
        {value}
        {unit !== null && (
          <span
            // La unidad deducida se atenúa a propósito: es una ayuda de lectura, no un dato del
            // archivo, y presentarla igual que una declarada la haría pasar por certeza.
            className={unitInferred ? "text-fg-3" : "text-fg-2"}
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
