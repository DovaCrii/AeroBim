import type { NavigationMode, Projection, RenderStyle } from "@aerobim/viewer";

/**
 * Barra de modos de vista.
 *
 * Agrupa lo que cambia *cómo se mira* el modelo, separado de lo que cambia *qué* se mira
 * (eso es el árbol). Los tres grupos son independientes: se puede estar en ortográfica, en
 * modo planta y en vista fantasma a la vez.
 */
export function ViewToolbar({
  projection,
  navigation,
  style,
  measuring,
  onProjection,
  onNavigation,
  onStyle,
  onToggleMeasure,
}: {
  readonly projection: Projection;
  readonly navigation: NavigationMode;
  readonly style: RenderStyle;
  readonly measuring: boolean;
  readonly onProjection: (projection: Projection) => void;
  readonly onNavigation: (mode: NavigationMode) => void;
  readonly onStyle: (style: RenderStyle) => void;
  readonly onToggleMeasure: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-ink/90 p-1 backdrop-blur">
      <Group label="Proyección">
        <Toggle
          active={projection === "Perspective"}
          onClick={() => onProjection("Perspective")}
          title="Perspectiva: con fuga, como lo ve el ojo"
        >
          Perspectiva
        </Toggle>
        <Toggle
          active={projection === "Orthographic"}
          onClick={() => onProjection("Orthographic")}
          title="Ortográfica: sin fuga, como un plano"
        >
          Ortográfica
        </Toggle>
      </Group>

      <Separator />

      <Group label="Navegación">
        <Toggle
          active={navigation === "Orbit"}
          onClick={() => onNavigation("Orbit")}
          title="Girar alrededor del modelo"
        >
          Órbita
        </Toggle>
        <Toggle
          active={navigation === "Plan"}
          onClick={() => onNavigation("Plan")}
          title="Desplazar sobre el modelo, como sobre un plano"
        >
          Planta
        </Toggle>
        <Toggle
          active={navigation === "FirstPerson"}
          onClick={() => onNavigation("FirstPerson")}
          title="Recorrer el interior"
        >
          Interior
        </Toggle>
      </Group>

      <Separator />

      <Group label="Representación">
        <Toggle active={style === "solid"} onClick={() => onStyle("solid")} title="Sólido">
          Sólido
        </Toggle>
        <Toggle
          active={style === "wireframe"}
          onClick={() => onStyle("wireframe")}
          title="Vista fantasma: translúcido, para ver lo que hay detrás"
        >
          Fantasma
        </Toggle>
      </Group>

      <Separator />

      <Toggle
        active={measuring}
        onClick={onToggleMeasure}
        title="Medir distancia entre dos puntos, con ajuste a vértices y aristas"
      >
        Medir
      </Toggle>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />;
}

function Toggle({
  active,
  onClick,
  title,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={[
        "rounded px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
        active ? "bg-brand text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
