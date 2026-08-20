import type {
  DistanceMode,
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
  IconArea,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconCursor,
  IconDistance,
  IconEdge,
  IconEye,
  IconEyeOff,
  IconFirstPerson,
  IconIsolate,
  IconFrameAll,
  IconFrameSelection,
  IconGhost,
  IconLayers,
  IconOrbit,
  IconOrthographic,
  IconPan,
  IconPerpendicular,
  IconPerspective,
  IconPlan2D,
  IconSectionHorizontal,
  IconSectionLongitudinal,
  IconSectionTransversal,
  IconSnapFree,
  IconSnapPlan,
  IconSnapVertex,
  IconSolid,
  IconTrash,
  IconTree,
  IconUnisolate,
  IconViewFront,
  IconViewIso,
  IconViewSide,
  IconViewTop,
} from "./icons.js";

/**
 * Las pestañas de la cinta. Una por tipo de trabajo, no por tipo de control.
 *
 * `vista` es cómo se mira, `medir` es tomar datos del modelo y `modelo` es qué se muestra. La
 * división viene de cómo se usa un visor en la práctica: alguien pasa un rato entero mirando, otro
 * rato midiendo, y cambia de contenido pocas veces.
 */
export type RibbonTab = "vista" | "medir" | "modelo";

const TITULOS_PESTAÑA: Record<RibbonTab, string> = {
  vista: "Vista",
  medir: "Medición",
  modelo: "Modelo",
};

/**
 * Cinta de herramientas, al modo de Revit y de los modeladores de Bentley.
 *
 * **Por qué esta forma y no una barra de iconos.** Con iconos solos hay que aprenderse la barra
 * antes de poder usarla, y eso fue justo el problema de la primera versión: catorce botones en fila,
 * dos llamados "Planta", sin nombres. Acá cada herramienta lleva **su nombre debajo del icono** y
 * cada bloque lleva **el nombre del grupo** al pie, así que la pantalla se lee sin tener que pasar
 * el ratón por encima ni recordar nada. Es la convención que traen quienes vienen de Revit,
 * BricsCAD u OpenPlant, que son exactamente las personas que van a usar esto.
 *
 * Las pestañas mantienen la cinta en una sola fila: sin ellas serían veinte botones a la vez, que es
 * el mismo desorden de antes en horizontal.
 */
export function Ribbon({
  tab,
  enabled,
  projection,
  navigation,
  style,
  measureMode,
  snapMode,
  distanceMode,
  hasSections,
  hasSelection,
  selectionVisible,
  isolated,
  hasHidden,
  hasPlans,
  modo2D,
  onModo2D,
  planSnap,
  onPlanSnap,
  measurementCount,
  onTab,
  onToggleSelectionVisible,
  onIsolateSelection,
  onUndoIsolate,
  onFrameAll,
  onView,
  onFrameSelection,
  onProjection,
  onNavigation,
  onStyle,
  onMeasureMode,
  onSnapMode,
  onDistanceMode,
  onFinishMeasurement,
  onClearMeasurements,
  onSection,
  onClearSections,
  onShowAll,
  onTogglePanel,
  panelIzquierdo,
  panelDerecho,
  collapsed,
  onToggleCollapse,
  brand,
  actions,
}: {
  readonly tab: RibbonTab;
  /** `false` mientras no hay modelo: las herramientas se ven, pero no hay dónde aplicarlas. */
  readonly enabled: boolean;
  readonly projection: Projection;
  readonly navigation: NavigationMode;
  readonly style: RenderStyle;
  readonly measureMode: MeasureMode | null;
  readonly snapMode: SnapMode;
  readonly distanceMode: DistanceMode;
  readonly hasSections: boolean;
  readonly hasSelection: boolean;
  /** `false` cuando el elemento seleccionado está apagado. */
  readonly selectionVisible: boolean;
  /** `true` mientras se mira algo aislado, con el resto del modelo apagado por eso. */
  readonly isolated: boolean;
  /** `true` si hay algo fuera de la vista, aislado o apagado a mano. */
  readonly hasHidden: boolean;
  /** `true` con al menos un plano 2D cargado. */
  readonly hasPlans: boolean;
  /** `true` en modo 2D: el plano solo, en planta y ortográfica, con los modelos apagados. */
  readonly modo2D: boolean;
  readonly onModo2D: (activar: boolean) => void;
  /** `true` si medir se engancha a los trazos del plano. */
  readonly planSnap: boolean;
  readonly onPlanSnap: (enabled: boolean) => void;
  readonly measurementCount: number;
  readonly onTab: (tab: RibbonTab) => void;
  readonly onToggleSelectionVisible: () => void;
  readonly onIsolateSelection: () => void;
  /** Sale del último aislamiento y devuelve el modelo a como estaba antes de aislar. */
  readonly onUndoIsolate: () => void;
  readonly onFrameAll: () => void;
  readonly onView: (view: StandardView) => void;
  readonly onFrameSelection: () => void;
  readonly onProjection: (projection: Projection) => void;
  readonly onNavigation: (mode: NavigationMode) => void;
  readonly onStyle: (style: RenderStyle) => void;
  readonly onMeasureMode: (mode: MeasureMode | null) => void;
  readonly onSnapMode: (mode: SnapMode) => void;
  readonly onDistanceMode: (mode: DistanceMode) => void;
  readonly onFinishMeasurement: () => void;
  readonly onClearMeasurements: () => void;
  readonly onSection: (axis: SectionAxis) => void;
  readonly onClearSections: () => void;
  readonly onShowAll: () => void;
  readonly onTogglePanel: (lado: "izquierda" | "derecha") => void;
  readonly panelIzquierdo: boolean;
  readonly panelDerecho: boolean;
  /** `true` con la cinta plegada: solo la fila de pestañas, y el lienzo entero para el modelo. */
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  /** La marca de la aplicación, a la izquierda de las pestañas. */
  readonly brand?: React.ReactNode;
  /** Estado y acciones de archivo, a la derecha: es la barra de la aplicación, no otra fila. */
  readonly actions?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-ink/40">
      {/* **Una sola fila arriba**: marca, pestañas y acciones. Antes eran dos —la cabecera de la
          aplicación y la fila de pestañas— y entre las dos se comían medio dedo de pantalla sin
          decir nada que no cupiera en una. */}
      <div className="flex items-center gap-1 border-b border-white/10 px-2">
        {brand !== undefined && <div className="mr-2 flex shrink-0 items-center">{brand}</div>}

        {(["vista", "medir", "modelo"] as const).map((cual) => (
          <button
            key={cual}
            type="button"
            onClick={() => {
              // Volver a pulsar la pestaña abierta pliega la cinta, como en Revit y en Office: es
              // el gesto que ya conoce quien viene de ahí, y deja el lienzo entero para el modelo.
              if (cual === tab) onToggleCollapse();
              else {
                onTab(cual);
                if (collapsed) onToggleCollapse();
              }
            }}
            aria-pressed={tab === cual && !collapsed}
            title={
              cual === tab
                ? `${TITULOS_PESTAÑA[cual]} — clic para ${collapsed ? "desplegar" : "plegar"} la cinta`
                : TITULOS_PESTAÑA[cual]
            }
            className={[
              "border-b-2 px-3 py-1.5 text-xs transition-colors",
              tab === cual && !collapsed
                ? "border-brand text-white"
                : "border-transparent text-white/50 hover:text-white/80",
            ].join(" ")}
          >
            {TITULOS_PESTAÑA[cual]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 py-1">
          {actions}

          {/* Los dos paneles se pliegan desde acá: cuando se quiere ver el modelo grande, se
              recuperan de un clic sin buscar el borde de la pantalla. */}
          <PanelToggle
            label="Propiedades"
            side="izquierda"
            open={panelIzquierdo}
            onClick={() => onTogglePanel("izquierda")}
          />
          <PanelToggle
            label="Navegador"
            side="derecha"
            open={panelDerecho}
            onClick={() => onTogglePanel("derecha")}
          />
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-pressed={collapsed}
            title={collapsed ? "Desplegar la cinta" : "Plegar la cinta y ver el modelo entero"}
            aria-label={collapsed ? "Desplegar la cinta" : "Plegar la cinta"}
            className="rounded px-1 py-1 text-white/40 hover:bg-white/10 hover:text-white"
          >
            {collapsed ? (
              <IconChevronDown className="h-3.5 w-3.5" />
            ) : (
              <IconChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className={collapsed ? "hidden" : "flex items-stretch overflow-x-auto px-1 py-0.5"}>
        {tab === "vista" && (
          <>
            <Grupo label="Encuadre">
              <Boton
                icon={<IconFrameAll />}
                label="Todo"
                hint="Vuelve a la vista general del modelo"
                disabled={!enabled}
                onClick={onFrameAll}
              />
              <Boton
                icon={<IconFrameSelection />}
                label="Selección"
                hint={
                  hasSelection
                    ? "Acerca al elemento seleccionado. También con doble clic"
                    : "Selecciona un elemento primero"
                }
                disabled={!enabled || !hasSelection}
                onClick={onFrameSelection}
              />
            </Grupo>

            {/* **El modo 2D no es una vista más**: apaga los modelos y deja el plano solo, en
                planta y en ortográfica. Va aquí, junto al encuadre, porque es lo primero que se
                busca cuando se viene a revisar un CAD y no el modelo. */}
            <Grupo label="Trabajo">
              <Boton
                icon={<IconPlan2D />}
                label="Modo 2D"
                hint={
                  hasPlans
                    ? "Deja el plano solo, en planta y ortográfica. Vuelve a pulsarlo para recuperar el modelo"
                    : "No hay ningún plano 2D cargado"
                }
                active={modo2D}
                disabled={!hasPlans}
                onClick={() => onModo2D(!modo2D)}
              />
            </Grupo>

            <Grupo label="Vistas">
              <Boton
                icon={<IconViewIso />}
                label="Isométrica"
                hint="La vista general, en tres cuartos"
                disabled={!enabled}
                onClick={() => onView("iso")}
              />
              <Boton
                icon={<IconViewTop />}
                label="Planta"
                hint="Desde arriba, en vertical"
                disabled={!enabled}
                onClick={() => onView("top")}
              />
              <Boton
                icon={<IconViewFront />}
                label="Frontal"
                hint="Alzado de frente"
                disabled={!enabled}
                onClick={() => onView("front")}
              />
              <Boton
                icon={<IconViewSide />}
                label="Lateral"
                hint="Alzado desde el costado"
                disabled={!enabled}
                onClick={() => onView("side")}
              />
            </Grupo>

            <Grupo label="Proyección">
              <Boton
                icon={<IconPerspective />}
                label="Perspectiva"
                hint="Con fuga, como lo ve el ojo"
                active={projection === "Perspective"}
                disabled={!enabled}
                onClick={() => onProjection("Perspective")}
              />
              <Boton
                icon={<IconOrthographic />}
                label="Ortográfica"
                hint="Sin fuga, como un plano"
                active={projection === "Orthographic"}
                disabled={!enabled}
                onClick={() => onProjection("Orthographic")}
              />
            </Grupo>

            <Grupo label="Navegación">
              <Boton
                icon={<IconOrbit />}
                label="Órbita"
                hint="Girar alrededor del modelo"
                active={navigation === "Orbit"}
                disabled={!enabled}
                onClick={() => onNavigation("Orbit")}
              />
              <Boton
                icon={<IconPan />}
                label="Desplazar"
                hint="Mover sobre el modelo, sin girar"
                active={navigation === "Plan"}
                disabled={!enabled}
                onClick={() => onNavigation("Plan")}
              />
              <Boton
                icon={<IconFirstPerson />}
                label="Interior"
                hint="Recorrer por dentro, en primera persona"
                active={navigation === "FirstPerson"}
                disabled={!enabled}
                onClick={() => onNavigation("FirstPerson")}
              />
            </Grupo>

            <Grupo label="Aspecto">
              <Boton
                icon={<IconSolid />}
                label="Sólido"
                hint="Con sombras y aristas"
                active={style === "solid"}
                disabled={!enabled}
                onClick={() => onStyle("solid")}
              />
              <Boton
                icon={<IconGhost />}
                label="Fantasma"
                hint="Translúcido, para ver lo que hay detrás"
                active={style === "wireframe"}
                disabled={!enabled}
                onClick={() => onStyle("wireframe")}
              />
            </Grupo>
          </>
        )}

        {tab === "medir" && (
          <>
            <Grupo label="Modo">
              <Boton
                icon={<IconCursor />}
                label="Seleccionar"
                hint="El clic abre la ficha del elemento"
                active={measureMode === null}
                disabled={!enabled}
                onClick={() => onMeasureMode(null)}
              />
              <Boton
                icon={<IconDistance />}
                label="Distancia"
                hint="Clic en dos puntos: directa, en planta y desnivel"
                active={measureMode === "distance"}
                disabled={!enabled}
                onClick={() => onMeasureMode("distance")}
              />
              <Boton
                icon={<IconAngle />}
                label="Ángulo"
                hint="Tres puntos; el segundo es el vértice"
                active={measureMode === "angle"}
                disabled={!enabled}
                onClick={() => onMeasureMode("angle")}
              />
              <Boton
                icon={<IconArea />}
                label="Área"
                hint="Un contorno de tres puntos o más"
                active={measureMode === "area"}
                disabled={!enabled}
                onClick={() => onMeasureMode("area")}
              />
              <Boton
                icon={<IconPerpendicular />}
                label="Perpendicular"
                hint="Primero una cara de referencia, luego el punto: da la distancia en ángulo recto"
                active={measureMode === "perpendicular"}
                disabled={!enabled}
                onClick={() => onMeasureMode("perpendicular")}
              />
            </Grupo>

            <Grupo label="Ajuste del cursor">
              <Boton
                icon={<IconSnapVertex />}
                label="A vértices"
                hint="Se ajusta al vértice o la arista más cercana: dos personas miden lo mismo"
                active={snapMode === "vertex"}
                disabled={!enabled}
                onClick={() => onSnapMode("vertex")}
              />
              <Boton
                icon={<IconSnapFree />}
                label="Libre"
                hint="Punto libre sobre la cara, para medir en medio de un paño"
                active={snapMode === "face"}
                disabled={!enabled}
                onClick={() => onSnapMode("face")}
              />
              {/* El ajuste del modelo y el del plano son dos cosas distintas y se apagan por
                  separado: midiendo el modelo con un plano debajo, engancharse al CAD sin querer
                  falsea la medida. */}
              <Boton
                icon={<IconSnapPlan />}
                label="Al plano"
                hint={
                  hasPlans
                    ? "Se engancha a los extremos y puntos medios de los trazos del plano 2D"
                    : "No hay ningún plano 2D cargado"
                }
                active={planSnap}
                disabled={!hasPlans}
                onClick={() => onPlanSnap(!planSnap)}
              />
            </Grupo>

            <Grupo label="Qué mide la distancia">
              <Boton
                icon={<IconDistance />}
                label="Dos puntos"
                hint="Los dos puntos que se elijan"
                active={distanceMode === "points"}
                disabled={!enabled}
                onClick={() => onDistanceMode("points")}
              />
              <Boton
                icon={<IconEdge />}
                label="Arista"
                hint="El largo de una arista completa, con un solo clic"
                active={distanceMode === "edge"}
                disabled={!enabled}
                onClick={() => onDistanceMode("edge")}
              />
            </Grupo>

            <Grupo label="Cotas">
              <Boton
                icon={<IconClose />}
                label="Cerrar"
                hint="Cierra el contorno del área. También con Enter"
                disabled={measureMode !== "area"}
                onClick={onFinishMeasurement}
              />
              <Boton
                icon={<IconTrash />}
                label="Borrar todas"
                hint={
                  measurementCount > 0
                    ? `Borra las ${measurementCount} cotas dibujadas`
                    : "No hay ninguna dibujada"
                }
                disabled={measurementCount === 0}
                onClick={onClearMeasurements}
              />
            </Grupo>
          </>
        )}

        {tab === "modelo" && (
          <>
            <Grupo label="Cortes">
              <Boton
                icon={<IconSectionHorizontal />}
                label="Horizontal"
                hint="La planta, sin la cubierta encima. El plano se arrastra después"
                disabled={!enabled}
                onClick={() => onSection("horizontal")}
              />
              <Boton
                icon={<IconSectionLongitudinal />}
                label="Longitudinal"
                hint="Corte vertical por el lado largo"
                disabled={!enabled}
                onClick={() => onSection("longitudinal")}
              />
              <Boton
                icon={<IconSectionTransversal />}
                label="Transversal"
                hint="Corte vertical cruzando el modelo"
                disabled={!enabled}
                onClick={() => onSection("transversal")}
              />
              <Boton
                icon={<IconTrash />}
                label="Quitar"
                hint={hasSections ? "Quita todos los cortes" : "No hay ninguno puesto"}
                disabled={!hasSections}
                onClick={onClearSections}
              />
            </Grupo>

            <Grupo label="Visibilidad">
              <Boton
                icon={selectionVisible ? <IconEyeOff /> : <IconEye />}
                label={selectionVisible ? "Apagar" : "Encender"}
                hint={
                  hasSelection
                    ? "Apaga o enciende el elemento seleccionado. También en su ficha"
                    : "Selecciona un elemento primero"
                }
                disabled={!hasSelection}
                onClick={onToggleSelectionVisible}
              />
              <Boton
                icon={<IconIsolate />}
                label="Aislar"
                hint={
                  hasSelection
                    ? "Deja solo el elemento seleccionado a la vista"
                    : "Selecciona un elemento primero"
                }
                disabled={!hasSelection}
                onClick={onIsolateSelection}
              />
              {/* Salir y "Ver todo" no son lo mismo, y por eso son dos botones: salir deshace el
                  aislamiento y devuelve lo de antes —lo apagado a mano sigue apagado—, mientras que
                  "Ver todo" enciende el modelo entero. */}
              <Boton
                icon={<IconUnisolate />}
                label="Salir"
                hint={
                  isolated
                    ? "Sale del aislamiento y vuelve a como estaba el modelo antes de aislar"
                    : "No hay ningún aislamiento del que salir"
                }
                active={isolated}
                disabled={!isolated}
                onClick={onUndoIsolate}
              />
              <Boton
                icon={<IconTree />}
                label="Ver todo"
                hint="Enciende todo el modelo, incluido lo que se apagó a mano"
                active={hasHidden}
                disabled={!enabled}
                onClick={onShowAll}
              />
              <Boton
                icon={<IconLayers />}
                label="Navegador"
                hint="El árbol del modelo y los modelos abiertos"
                active={panelDerecho}
                onClick={() => onTogglePanel("derecha")}
              />
            </Grupo>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Un bloque de la cinta, con su nombre al pie.
 *
 * El rótulo abajo es la convención de Revit y de la cinta de Office, y hace un trabajo concreto:
 * dice de qué es el grupo sin gastar una línea de texto por botón.
 */
function Grupo({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex shrink-0 flex-col border-r border-white/10 px-2 last:border-r-0"
    >
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <p className="text-center text-[9px] tracking-wide text-white/30 uppercase">{label}</p>
    </section>
  );
}

/**
 * Un botón de la cinta: icono arriba, nombre abajo.
 *
 * El nombre completo va en `title` y el corto debajo del icono. Los dos hacen falta: el corto para
 * reconocer la herramienta de un vistazo, el largo para saber qué hace exactamente antes de tocarla.
 */
function Boton({
  icon,
  label,
  hint,
  onClick,
  active = false,
  disabled = false,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
  readonly active?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} — ${hint}`}
      aria-pressed={active}
      className={[
        // **Más estrecho y más bajo que antes.** La cinta ocupaba 110 px de alto en una pantalla
        // donde lo que importa es el modelo; con el icono a 18 px y el nombre pegado debajo se
        // queda en poco más de la mitad sin perder el nombre, que es lo que la hace legible.
        "flex w-14 flex-col items-center gap-px rounded px-0.5 py-1 transition-colors",
        disabled
          ? "text-white/20"
          : active
            ? "bg-brand/25 text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "[&>svg]:h-[18px] [&>svg]:w-[18px]",
          active && !disabled ? "text-brand" : "",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="w-full text-center text-[9px] leading-tight break-words">{label}</span>
    </button>
  );
}

/** Interruptor de un panel lateral, en la fila de pestañas. */
function PanelToggle({
  label,
  side,
  open,
  onClick,
}: {
  readonly label: string;
  readonly side: "izquierda" | "derecha";
  readonly open: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      title={`${open ? "Ocultar" : "Mostrar"} el panel de ${label.toLowerCase()} (${side})`}
      className={[
        "rounded px-2 py-1 text-[11px] transition-colors",
        open ? "bg-white/10 text-white/80" : "text-white/40 hover:bg-white/10 hover:text-white/70",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
