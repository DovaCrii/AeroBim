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
  IconGrid,
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
  hasModels,
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
  gridAxisCount,
  gridVisible,
  onGridVisible,
  planSnap,
  onPlanSnap,
  measurementCount,
  measureInProgress,
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
  onCancelMeasurement,
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
  /**
   * `false` con la escena vacía: las herramientas se ven, pero no hay dónde aplicarlas.
   *
   * **Es "hay algo abierto", no "hay un modelo abierto"**, y la diferencia se pagó: `frameAll`
   * cuenta los planos 2D a propósito —lleva su comentario diciéndolo— pero esta puerta seguía
   * mirando solo a los modelos. Con un DXF solo, el cubo de vistas giraba la cámara y los botones
   * de al lado que hacen exactamente lo mismo estaban grises.
   */
  readonly enabled: boolean;
  /**
   * `true` con al menos un modelo IFC cargado.
   *
   * Lo que de verdad necesita un modelo y no le basta un plano: el **aspecto** —sólido y fantasma
   * pintan fragmentos— y los **cortes**, que `addSection` calcula desde la caja de los modelos y
   * se va sin hacer nada si no hay ninguno.
   */
  readonly hasModels: boolean;
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
  /** Cuántos ejes de replanteo trae el modelo. Cero deshabilita el botón. */
  readonly gridAxisCount: number;
  readonly gridVisible: boolean;
  readonly onGridVisible: (visible: boolean) => void;
  /** `true` si medir se engancha a los trazos del plano. */
  readonly planSnap: boolean;
  readonly onPlanSnap: (enabled: boolean) => void;
  readonly measurementCount: number;
  /** `true` con una medición empezada y sin cerrar: hay algo que cancelar. */
  readonly measureInProgress: boolean;
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
  /** Descarta la medición a medias sin tocar las ya terminadas. */
  readonly onCancelMeasurement: () => void;
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
    <div className="shrink-0 border-b border-borde bg-surface">
      {/* **Una sola fila arriba**: marca, pestañas y acciones. Antes eran dos —la cabecera de la
          aplicación y la fila de pestañas— y entre las dos se comían medio dedo de pantalla sin
          decir nada que no cupiera en una. */}
      <div className="flex items-center gap-1 border-b border-borde px-2">
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
              // Las pestañas medían 33 px de alto. A 36 sin tocar el texto: la fila la marca el
              // botón de plegar, que ya está en 32, así que esto no empuja nada.
              "flex min-h-9 items-center border-b-2 px-3 text-xs transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
              tab === cual && !collapsed
                ? "border-accent text-fg"
                : "border-transparent text-fg-2 hover:text-fg",
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
            // Medía justo 24 × 24, el mínimo de la norma. Con el icono igual y algo más de hueco
            // alrededor sube a 32 sin ocupar sitio: la fila de pestañas ya es más alta que eso.
            className="flex min-h-8 min-w-8 items-center justify-center rounded-sm text-fg-3 hover:bg-surface-3 hover:text-fg"
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
              {/* Los ejes del modelo: con lo que se habla en obra, y el ancla para calzar un plano
                  CAD —que trae su propia capa de ejes— sobre el IFC. */}
              <Boton
                icon={<IconGrid />}
                label="Ejes"
                hint={
                  gridAxisCount > 0
                    ? `Los ${gridAxisCount} ejes de replanteo del modelo, con su burbuja`
                    : "El modelo no trae ejes de replanteo"
                }
                active={gridVisible && gridAxisCount > 0}
                disabled={gridAxisCount === 0}
                onClick={() => onGridVisible(!gridVisible)}
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

            {/* El aspecto pinta fragmentos: con un plano solo no hay a qué aplicárselo. */}
            <Grupo label="Aspecto">
              <Boton
                icon={<IconSolid />}
                label="Sólido"
                hint={hasModels ? "Con sombras y aristas" : "Abre un modelo primero"}
                active={style === "solid"}
                disabled={!hasModels}
                onClick={() => onStyle("solid")}
              />
              <Boton
                icon={<IconGhost />}
                label="Fantasma"
                hint={
                  hasModels ? "Translúcido, para ver lo que hay detrás" : "Abre un modelo primero"
                }
                active={style === "wireframe"}
                disabled={!hasModels}
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
              {/* La perpendicular arranca de **una cara** y un plano 2D no tiene caras: es la
                  única de las cuatro que necesita un modelo. */}
              <Boton
                icon={<IconPerpendicular />}
                label="Perpendicular"
                hint={
                  hasModels
                    ? "Primero una cara de referencia, luego el punto: da la distancia en ángulo recto"
                    : "Necesita una cara del modelo: abre un IFC primero"
                }
                active={measureMode === "perpendicular"}
                disabled={!hasModels}
                onClick={() => onMeasureMode("perpendicular")}
              />
            </Grupo>

            <Grupo label="Ajuste del cursor">
              {/* Estos dos ajustan **al modelo**; el del plano es el tercero y se apaga aparte. */}
              <Boton
                icon={<IconSnapVertex />}
                label="A vértices"
                hint={
                  hasModels
                    ? "Se ajusta al vértice o la arista más cercana: dos personas miden lo mismo"
                    : "Es el ajuste al modelo: abre un IFC primero"
                }
                active={snapMode === "vertex"}
                disabled={!hasModels}
                onClick={() => onSnapMode("vertex")}
              />
              <Boton
                icon={<IconSnapFree />}
                label="Libre"
                hint={
                  hasModels
                    ? "Punto libre sobre la cara, para medir en medio de un paño"
                    : "Es el ajuste al modelo: abre un IFC primero"
                }
                active={snapMode === "face"}
                disabled={!hasModels}
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
              {/* "Cerrar" a secas, con una ✕ al lado, se lee como cerrar algo —el panel, la
                  aplicación—. Lo que cierra es **el contorno**, y el nombre lo dice ahora. */}
              <Boton
                icon={<IconArea />}
                label="Cerrar contorno"
                hint="Cierra el contorno del área. También con Enter"
                disabled={measureMode !== "area"}
                onClick={onFinishMeasurement}
              />
              {/* **La salida de una medida a medias.** `cancelMeasurement` estaba implementada y
                  comprobada en `diag.html`, y no la llamaba nadie desde la interfaz: con dos
                  vértices de un área puestos, la única forma de salirse era pulsar "Seleccionar"
                  —que la descarta de rebote— y volver a entrar a medir. */}
              <Boton
                icon={<IconClose />}
                label="Cancelar"
                hint={
                  measureInProgress
                    ? "Descarta la medida a medias, sin tocar las ya tomadas. También con Esc"
                    : "No hay ninguna medida empezada"
                }
                disabled={!measureInProgress}
                onClick={onCancelMeasurement}
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
            {/* **Los cortes se calculan desde la caja de los modelos**: `addSection` se va sin
                hacer nada si no hay ninguno, así que con un plano solo el botón no puede quedar
                encendido prometiendo un corte que no va a ocurrir. */}
            <Grupo label="Cortes">
              <Boton
                icon={<IconSectionHorizontal />}
                label="Horizontal"
                hint={
                  hasModels
                    ? "La planta, sin la cubierta encima. El plano se arrastra después"
                    : "Abre un modelo primero"
                }
                disabled={!hasModels}
                onClick={() => onSection("horizontal")}
              />
              <Boton
                icon={<IconSectionLongitudinal />}
                label="Longitudinal"
                hint={hasModels ? "Corte vertical por el lado largo" : "Abre un modelo primero"}
                disabled={!hasModels}
                onClick={() => onSection("longitudinal")}
              />
              <Boton
                icon={<IconSectionTransversal />}
                label="Transversal"
                hint={hasModels ? "Corte vertical cruzando el modelo" : "Abre un modelo primero"}
                disabled={!hasModels}
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
                destacado={isolated}
                disabled={!isolated}
                onClick={onUndoIsolate}
              />
              {/* **Mismo mandato, mismo icono.** Acá era un árbol —que es el icono de la
                  estructura del modelo— y en la barra de estado un ojo. Dos dibujos para el mismo
                  botón obligan a leerlos, que es justo lo que un icono viene a evitar. */}
              <Boton
                icon={<IconEye />}
                label="Ver todo"
                hint="Enciende todo el modelo, incluido lo que se apagó a mano"
                destacado={hasHidden}
                disabled={!enabled}
                onClick={onShowAll}
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
      className="flex shrink-0 flex-col border-r border-borde px-2 last:border-r-0"
    >
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <p className="text-center text-micro tracking-wide text-fg-3 uppercase">{label}</p>
    </section>
  );
}

/**
 * Un botón de la cinta: icono arriba, nombre abajo.
 *
 * El nombre completo va en `title` y el corto debajo del icono. Los dos hacen falta: el corto para
 * reconocer la herramienta de un vistazo, el largo para saber qué hace exactamente antes de tocarla.
 *
 * **Hay dos clases de botón y antes eran una sola.** Un *interruptor* —Perspectiva, Órbita, Modo
 * 2D— tiene estado y lo declara con `aria-pressed`; un *mandato* —Encuadrar, Aislar, Ver todo,
 * Borrar— se pulsa y pasa algo, y no tiene estado que declarar. Todos llevaban `aria-pressed`, así
 * que un lector de pantalla anunciaba "Todo, botón de alternancia, no pulsado" sobre un botón que
 * no alterna nada. Ahora lo lleva **solo quien recibe `active`**.
 */
function Boton({
  icon,
  label,
  hint,
  onClick,
  active,
  destacado = false,
  disabled = false,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
  /**
   * Estado del interruptor. **Omitirlo declara que el botón es un mandato**, y entonces no se
   * dibuja `aria-pressed`.
   */
  readonly active?: boolean;
  /**
   * Resalta un **mandato** que ahora mismo tiene algo que hacer —"Ver todo" con cosas apagadas,
   * "Salir" con un aislamiento puesto—. Pinta igual que un interruptor encendido y no dice nada
   * de estado: seguir usando `active` para esto anunciaba "pulsado" un botón que nadie pulsó.
   */
  readonly destacado?: boolean;
  readonly disabled?: boolean;
}) {
  const encendido = active === true || destacado;

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
        //
        // **Y `min-h-11` —44 px— por `F9.4`, que costaba dos píxeles.** Medidos en pantalla, estos
        // botones salían a 62 × 42: los quince a dos píxeles del objetivo de área de toque. Es la
        // mejora más barata que había, y son las herramientas principales — las que más se pulsan.
        "flex min-h-11 w-14 flex-col items-center justify-center gap-px rounded-sm px-0.5 py-1",
        "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
        disabled
          ? "text-apagado-fg"
          : encendido
            ? "bg-action/30 text-fg"
            : "text-fg-2 hover:bg-surface-3 hover:text-fg",
      ].join(" ")}
    >
      <span
        className={[
          "[&>svg]:h-[18px] [&>svg]:w-[18px]",
          encendido && !disabled ? "text-accent" : "",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="w-full text-center text-micro leading-tight break-words">{label}</span>
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
        // Eran los más pequeños de la pantalla: 27 px de alto. Suben a 32, que es lo que cabe en
        // esta fila sin empujarla — y con `min-w-11` el ancho ya llega al objetivo.
        "flex min-h-8 min-w-11 items-center justify-center rounded-sm px-2 text-nota",
        "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
        open ? "bg-surface-2 text-fg" : "text-fg-3 hover:bg-surface-3 hover:text-fg-2",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
