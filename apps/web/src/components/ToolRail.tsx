import type {
  DistanceMode,
  DrawnMeasurement,
  MeasureMode,
  NavigationMode,
  Projection,
  RenderStyle,
  SectionAxis,
  SnapMode,
  StandardView,
} from "@aerobim/viewer";
import {
  IconAngle,
  IconAppearance,
  IconArea,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCursor,
  IconDistance,
  IconEdge,
  IconEye,
  IconEyeOff,
  IconFirstPerson,
  IconFrameAll,
  IconFrameSelection,
  IconGhost,
  IconLayers,
  IconMeasure,
  IconNavigate,
  IconOrbit,
  IconOrthographic,
  IconPan,
  IconPerspective,
  IconProjection,
  IconSectionHorizontal,
  IconSectionLongitudinal,
  IconSections,
  IconSectionTransversal,
  IconSnapFree,
  IconSnapVertex,
  IconSolid,
  IconTrash,
  IconTree,
  IconX,
  IconViewFront,
  IconViewIso,
  IconViews,
  IconViewSide,
  IconViewTop,
} from "./icons.js";

/**
 * Qué muestra el panel lateral. `null` es el panel cerrado, con el lienzo entero para el modelo.
 *
 * **Los dos primeros son contenido y el resto herramientas**, y comparten sitio a propósito: un
 * solo panel abierto a la vez es lo que deja el máximo de pantalla al modelo, que es lo que
 * alguien vino a mirar.
 */
export type PanelId =
  | "structure"
  | "models"
  | "views"
  | "projection"
  | "navigation"
  | "appearance"
  | "sections"
  | "measure";

/** Título de cada panel, para su cabecera y para el nombre en la columna. */
export const TITULOS: Record<PanelId, string> = {
  structure: "Estructura",
  models: "Modelos",
  views: "Vistas",
  projection: "Proyección",
  navigation: "Navegación",
  appearance: "Aspecto",
  sections: "Cortes",
  measure: "Medir",
};

/**
 * Columna fija de herramientas, al modo de los visores de escritorio.
 *
 * **Reemplaza a la barra de abajo, que no se entendía**: tenía catorce botones en una fila, dos
 * llamados "Planta" —uno era navegación y el otro un corte— y ningún icono. Lo que cambia:
 *
 * - **Un icono por familia**, y cada uno abre su panel en el costado. La ambigüedad desaparece
 *   porque las opciones van escritas: "Desplazar en planta" está en Navegación y "Corte
 *   horizontal" en Cortes.
 * - **La columna se puede ampliar** para ver el nombre de cada familia sin pasar el ratón por
 *   encima. Un icono solo es rápido para quien ya conoce la herramienta; el nombre al lado es lo
 *   que la hace usable la primera vez.
 * - **El árbol y los modelos comparten ese mismo panel.** Antes eran dos paneles más, uno fijo a
 *   la izquierda y otro flotando sobre el modelo; ahora es un sitio y se turnan.
 * - **Un punto en el icono** avisa de que la familia tiene algo activo —un corte puesto, la vista
 *   fantasma, una medición— así que se sabe dónde ir a deshacerlo.
 */
export function ToolRail({
  enabled,
  active,
  expanded,
  projection,
  navigation,
  style,
  measureMode,
  hasSections,
  hasModels,
  measurementCount,
  onSelect,
  onToggleExpanded,
  onFrameAll,
}: {
  /** `false` mientras no hay modelo: las herramientas se ven, pero no hay dónde aplicarlas. */
  readonly enabled: boolean;
  readonly active: PanelId | null;
  readonly expanded: boolean;
  readonly projection: Projection;
  readonly navigation: NavigationMode;
  readonly style: RenderStyle;
  readonly measureMode: MeasureMode | null;
  readonly hasSections: boolean;
  readonly hasModels: boolean;
  readonly measurementCount: number;
  readonly onSelect: (panel: PanelId) => void;
  readonly onToggleExpanded: () => void;
  readonly onFrameAll: () => void;
}) {
  const boton = (
    panel: PanelId,
    icono: React.ReactNode,
    hint: string,
    marked = false,
    puedeUsarse = enabled,
  ) => (
    <RailButton
      label={TITULOS[panel]}
      hint={hint}
      icon={icono}
      expanded={expanded}
      open={active === panel}
      marked={marked}
      disabled={!puedeUsarse}
      onClick={() => onSelect(panel)}
    />
  );

  return (
    <nav
      aria-label="Herramientas"
      // **El cambio de ancho es instantáneo, sin animación.** Animarlo se ve bien un instante y
      // cuesta caro: el lienzo de WebGL es hermano de esta columna, así que cada fotograma de la
      // animación cambia su tamaño y obliga al renderizador a reconstruir sus búferes. Una
      // herramienta que se abre y cierra decenas de veces no debe pagar eso.
      className={[
        "flex shrink-0 flex-col gap-0.5 border-r border-white/10 bg-ink/60 p-1.5",
        expanded ? "w-44" : "w-12",
      ].join(" ")}
    >
      {boton("structure", <IconTree />, "El árbol del modelo: aislar y ocultar", false, hasModels)}
      {boton("models", <IconLayers />, "Ordenar, apagar y cerrar lo cargado", false, hasModels)}

      <Divider />

      <RailButton
        label="Encuadrar todo"
        hint="Vuelve a la vista general"
        icon={<IconFrameAll />}
        expanded={expanded}
        disabled={!enabled}
        onClick={onFrameAll}
      />
      {boton("views", <IconViews />, "Isométrica, planta y alzados")}
      {boton(
        "projection",
        <IconProjection />,
        projection === "Perspective" ? "Perspectiva" : "Ortográfica",
        projection === "Orthographic",
      )}
      {boton(
        "navigation",
        <IconNavigate />,
        ETIQUETA_NAVEGACION[navigation],
        navigation !== "Orbit",
      )}
      {boton(
        "appearance",
        <IconAppearance />,
        style === "solid" ? "Sólido" : "Vista fantasma",
        style !== "solid",
      )}
      {boton("sections", <IconSections />, "Cortar el modelo por un plano", hasSections)}
      {boton(
        "measure",
        <IconMeasure />,
        "Distancia, ángulo y área",
        measureMode !== null || measurementCount > 0,
      )}

      <div className="flex-1" />

      <RailButton
        label={expanded ? "Ocultar nombres" : "Mostrar nombres"}
        hint="Amplía o reduce esta columna"
        icon={expanded ? <IconChevronLeft /> : <IconChevronRight />}
        expanded={expanded}
        onClick={onToggleExpanded}
      />
    </nav>
  );
}

/**
 * Las opciones de una familia de herramientas, para el panel lateral.
 *
 * Devuelve `null` para los paneles que no son de herramientas —el árbol y los modelos tienen su
 * propio componente— de modo que quien compone la pantalla no tenga que repartir el `switch`.
 */
export function ToolPanel({
  panel,
  projection,
  navigation,
  style,
  measureMode,
  snapMode,
  distanceMode,
  drawn,
  hasSections,
  hasSelection,
  onView,
  onFrameSelection,
  onProjection,
  onNavigation,
  onStyle,
  onMeasureMode,
  onSnapMode,
  onDistanceMode,
  onToggleMeasurement,
  onDeleteMeasurement,
  onSection,
  onClearSections,
  onFinishMeasurement,
  onClearMeasurements,
}: {
  readonly panel: PanelId;
  readonly projection: Projection;
  readonly navigation: NavigationMode;
  readonly style: RenderStyle;
  readonly measureMode: MeasureMode | null;
  readonly snapMode: SnapMode;
  readonly distanceMode: DistanceMode;
  /** Las cotas dibujadas, para poder apagarlas o borrarlas una por una. */
  readonly drawn: readonly DrawnMeasurement[];
  readonly hasSections: boolean;
  readonly hasSelection: boolean;
  readonly onSnapMode: (mode: SnapMode) => void;
  readonly onDistanceMode: (mode: DistanceMode) => void;
  readonly onToggleMeasurement: (id: string, visible: boolean) => void;
  readonly onDeleteMeasurement: (id: string) => void;
  readonly onView: (view: StandardView) => void;
  readonly onFrameSelection: () => void;
  readonly onProjection: (projection: Projection) => void;
  readonly onNavigation: (mode: NavigationMode) => void;
  readonly onStyle: (style: RenderStyle) => void;
  readonly onMeasureMode: (mode: MeasureMode | null) => void;
  readonly onSection: (axis: SectionAxis) => void;
  readonly onClearSections: () => void;
  readonly onFinishMeasurement: () => void;
  readonly onClearMeasurements: () => void;
}) {
  if (panel === "views") {
    return (
      <Group title={TITULOS[panel]}>
        <Option
          icon={<IconViewIso />}
          label="Isométrica"
          hint="La vista general, en tres cuartos"
          onClick={() => onView("iso")}
        />
        <Option
          icon={<IconViewTop />}
          label="Planta"
          hint="Desde arriba, en vertical"
          onClick={() => onView("top")}
        />
        <Option
          icon={<IconViewFront />}
          label="Alzado frontal"
          hint="De frente, sin girar"
          onClick={() => onView("front")}
        />
        <Option
          icon={<IconViewSide />}
          label="Alzado lateral"
          hint="Desde el costado"
          onClick={() => onView("side")}
        />
        <Separator />
        <Option
          icon={<IconFrameSelection />}
          label="Encuadrar selección"
          hint={hasSelection ? "También con doble clic" : "Selecciona un elemento primero"}
          disabled={!hasSelection}
          onClick={onFrameSelection}
        />
      </Group>
    );
  }

  if (panel === "projection") {
    return (
      <Group title={TITULOS[panel]}>
        <Option
          icon={<IconPerspective />}
          label="Perspectiva"
          hint="Con fuga, como lo ve el ojo"
          active={projection === "Perspective"}
          onClick={() => onProjection("Perspective")}
        />
        <Option
          icon={<IconOrthographic />}
          label="Ortográfica"
          hint="Sin fuga, como un plano"
          active={projection === "Orthographic"}
          onClick={() => onProjection("Orthographic")}
        />
      </Group>
    );
  }

  if (panel === "navigation") {
    return (
      <Group title={TITULOS[panel]}>
        <Option
          icon={<IconOrbit />}
          label="Órbita"
          hint="Girar alrededor del modelo"
          active={navigation === "Orbit"}
          onClick={() => onNavigation("Orbit")}
        />
        <Option
          icon={<IconPan />}
          label="Desplazar en planta"
          hint="Mover sobre el modelo, sin girar"
          active={navigation === "Plan"}
          onClick={() => onNavigation("Plan")}
        />
        <Option
          icon={<IconFirstPerson />}
          label="Primera persona"
          hint="Recorrer el interior"
          active={navigation === "FirstPerson"}
          onClick={() => onNavigation("FirstPerson")}
        />
        <p className="px-2 pt-2 text-[11px] leading-snug text-white/40">
          La rueda acerca hacia donde apunta el cursor. El botón derecho desplaza.
        </p>
      </Group>
    );
  }

  if (panel === "appearance") {
    return (
      <Group title={TITULOS[panel]}>
        <Option
          icon={<IconSolid />}
          label="Sólido"
          hint="Con sombras y aristas"
          active={style === "solid"}
          onClick={() => onStyle("solid")}
        />
        <Option
          icon={<IconGhost />}
          label="Vista fantasma"
          hint="Translúcido, para ver lo que hay detrás"
          active={style === "wireframe"}
          onClick={() => onStyle("wireframe")}
        />
      </Group>
    );
  }

  if (panel === "sections") {
    return (
      <Group title={TITULOS[panel]}>
        <Option
          icon={<IconSectionHorizontal />}
          label="Corte horizontal"
          hint="La planta, sin la cubierta encima"
          onClick={() => onSection("horizontal")}
        />
        <Option
          icon={<IconSectionLongitudinal />}
          label="Corte longitudinal"
          hint="Vertical, por el lado largo"
          onClick={() => onSection("longitudinal")}
        />
        <Option
          icon={<IconSectionTransversal />}
          label="Corte transversal"
          hint="Vertical, cruzando el modelo"
          onClick={() => onSection("transversal")}
        />
        <Separator />
        <Option
          icon={<IconTrash />}
          label="Quitar los cortes"
          hint={hasSections ? "Deja el modelo completo" : "No hay ninguno puesto"}
          disabled={!hasSections}
          onClick={onClearSections}
        />
        <p className="px-2 pt-2 text-[11px] leading-snug text-white/40">
          El plano se arrastra con el ratón una vez puesto.
        </p>
      </Group>
    );
  }

  if (panel === "measure") {
    return (
      <Group title={TITULOS[panel]}>
        {/* La selección es un modo más, y se muestra como tal: es lo que dice si el próximo clic
            va a abrir una ficha o a poner un punto de cota. Antes había que adivinarlo. */}
        <Option
          icon={<IconCursor />}
          label="Seleccionar"
          hint="Clic para ver las propiedades"
          active={measureMode === null}
          onClick={() => onMeasureMode(null)}
        />
        <Separator />
        <Option
          icon={<IconDistance />}
          label="Distancia"
          hint="Clic en dos puntos"
          active={measureMode === "distance"}
          onClick={() => onMeasureMode(measureMode === "distance" ? null : "distance")}
        />
        <Option
          icon={<IconAngle />}
          label="Ángulo"
          hint="Tres puntos; el segundo es el vértice"
          active={measureMode === "angle"}
          onClick={() => onMeasureMode(measureMode === "angle" ? null : "angle")}
        />
        <Option
          icon={<IconArea />}
          label="Área"
          hint="Un contorno de tres puntos o más"
          active={measureMode === "area"}
          onClick={() => onMeasureMode(measureMode === "area" ? null : "area")}
        />
        <Separator />
        <Option
          icon={<IconClose />}
          label="Cerrar el contorno"
          hint="También con Enter"
          disabled={measureMode !== "area"}
          onClick={onFinishMeasurement}
        />

        <Subtitulo>Ajuste del cursor</Subtitulo>
        <Option
          icon={<IconSnapVertex />}
          label="A vértices y aristas"
          hint="Dos personas miden lo mismo"
          active={snapMode === "vertex"}
          onClick={() => onSnapMode("vertex")}
        />
        <Option
          icon={<IconSnapFree />}
          label="Punto libre en la cara"
          hint="Para medir en medio de un paño"
          active={snapMode === "face"}
          onClick={() => onSnapMode("face")}
        />

        <Subtitulo>Qué mide la distancia</Subtitulo>
        <Option
          icon={<IconDistance />}
          label="Entre dos puntos"
          hint="Los dos que se elijan"
          active={distanceMode === "points"}
          onClick={() => onDistanceMode("points")}
        />
        <Option
          icon={<IconEdge />}
          label="El largo de una arista"
          hint="Un solo clic sobre ella"
          active={distanceMode === "edge"}
          onClick={() => onDistanceMode("edge")}
        />

        <Subtitulo>
          Cotas dibujadas ({drawn.length})
          {drawn.length > 0 && (
            <button
              type="button"
              onClick={onClearMeasurements}
              className="ml-auto rounded px-1 text-[10px] text-white/40 normal-case hover:bg-white/10 hover:text-red-400"
              title="Borrar todas las cotas"
            >
              borrar todas
            </button>
          )}
        </Subtitulo>

        {drawn.length === 0 ? (
          <p className="px-2 py-1 text-[11px] leading-snug text-white/35">
            Todavía no hay ninguna. Las que se hagan quedan acá y se pueden apagar sin borrarlas.
          </p>
        ) : (
          <ul>
            {drawn.map((cota) => (
              <MedicionEnLista
                key={cota.id}
                cota={cota}
                onToggle={onToggleMeasurement}
                onDelete={onDeleteMeasurement}
              />
            ))}
          </ul>
        )}

        <p className="px-2 pt-2 text-[11px] leading-snug text-white/40">
          Escape cancela la cota a medias. Mientras se mide no se selecciona nada: la herramienta y
          la selección no se pisan.
        </p>
      </Group>
    );
  }

  return null;
}

const ETIQUETA_NAVEGACION: Record<NavigationMode, string> = {
  Orbit: "Órbita",
  Plan: "Desplazar en planta",
  FirstPerson: "Primera persona",
};

/**
 * Un botón de la columna.
 *
 * El nombre viaja en `title` y en `aria-label` incluso cuando se ve escrito al lado: un icono sin
 * nombre es exactamente el problema que esta barra viene a resolver, y quien use un lector de
 * pantalla no ve ninguno.
 */
function RailButton({
  label,
  hint,
  icon,
  expanded,
  onClick,
  open = false,
  marked = false,
  disabled = false,
}: {
  readonly label: string;
  readonly hint: string;
  readonly icon: React.ReactNode;
  readonly expanded: boolean;
  readonly onClick: () => void;
  readonly open?: boolean;
  readonly marked?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} — ${hint}`}
      aria-label={label}
      aria-pressed={open}
      className={[
        "relative flex h-9 shrink-0 items-center gap-2.5 rounded-md transition-colors",
        expanded ? "w-full px-2" : "w-9 justify-center",
        disabled
          ? "text-white/20"
          : open
            ? "bg-brand text-white"
            : "text-white/65 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <span className="shrink-0">{icon}</span>
      {expanded && <span className="min-w-0 flex-1 truncate text-left text-xs">{label}</span>}
      {marked && !open && (
        <span
          className={[
            "absolute h-1.5 w-1.5 rounded-full bg-brand",
            expanded ? "top-1.5 left-1.5" : "top-1 right-1",
          ].join(" ")}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px shrink-0 bg-white/10" aria-hidden="true" />;
}

/** Un panel de herramientas con su título. */
function Group({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-white/10 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-white/70 uppercase">{title}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">{children}</div>
    </div>
  );
}

/** Una opción del panel: icono, nombre y una línea de qué hace. */
function Option({
  icon,
  label,
  hint,
  onClick,
  active = false,
  disabled = false,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint?: string;
  readonly onClick: () => void;
  readonly active?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors",
        disabled
          ? "text-white/25"
          : active
            ? "bg-brand/20 text-white"
            : "text-white/80 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <span className={active ? "text-brand" : "text-white/50"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{label}</span>
        {hint !== undefined && (
          <span className="block truncate text-[11px] text-white/40">{hint}</span>
        )}
      </span>
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-white/10" aria-hidden="true" />;
}

/** Un subtítulo dentro de un panel, para separar bloques sin abrir otro nivel de menú. */
function Subtitulo({ children }: { readonly children: React.ReactNode }) {
  return (
    <h4 className="mt-3 flex items-center gap-1 border-t border-white/10 px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide text-white/40 uppercase">
      {children}
    </h4>
  );
}

/**
 * Una cota de la lista: su valor, el interruptor para apagarla y el botón para borrarla.
 *
 * **Apagar y borrar son cosas distintas.** Una cota apagada sigue existiendo y vuelve con un clic;
 * borrada hay que medirla otra vez. Con diez cotas encima del modelo, apagar es lo que se usa.
 */
function MedicionEnLista({
  cota,
  onToggle,
  onDelete,
}: {
  readonly cota: DrawnMeasurement;
  readonly onToggle: (id: string, visible: boolean) => void;
  readonly onDelete: (id: string) => void;
}) {
  const icono =
    cota.kind === "distance" ? (
      <IconDistance className="h-3.5 w-3.5" />
    ) : cota.kind === "angle" ? (
      <IconAngle className="h-3.5 w-3.5" />
    ) : (
      <IconArea className="h-3.5 w-3.5" />
    );

  return (
    <li className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5">
      <button
        type="button"
        onClick={() => onToggle(cota.id, !cota.visible)}
        className={cota.visible ? "text-brand" : "text-white/30 hover:text-white/60"}
        title={cota.visible ? "Apagar esta cota" : "Encender esta cota"}
        aria-label={cota.visible ? "Apagar esta cota" : "Encender esta cota"}
        aria-pressed={cota.visible}
      >
        {cota.visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
      </button>

      <span className={cota.visible ? "text-white/40" : "text-white/20"}>{icono}</span>

      <span
        className={[
          "min-w-0 flex-1 truncate font-mono text-xs",
          cota.visible ? "text-white/85" : "text-white/35 line-through",
        ].join(" ")}
      >
        {cota.label}
      </span>

      <button
        type="button"
        onClick={() => onDelete(cota.id)}
        className="text-white/30 opacity-0 group-hover:opacity-100 hover:text-red-400"
        title="Borrar esta cota"
        aria-label="Borrar esta cota"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
