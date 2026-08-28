import type { DrawnMeasurement, SavedView } from "@aerobim/viewer";
import { useRef, useState } from "react";
import { Resizer } from "./Resizer.js";
import {
  IconAngle,
  IconArea,
  IconChevronDown,
  IconChevronRight,
  IconDistance,
  IconEye,
  IconEyeOff,
  IconViewIso,
  IconX,
} from "./icons.js";

/**
 * El navegador del proyecto: qué hay abierto y qué se ha medido.
 *
 * **Es el panel de la derecha, como en Revit.** Reúne en un solo sitio las tres listas que se
 * consultan mientras se revisa —la estructura del modelo, los modelos abiertos y las cotas
 * dibujadas— cada una plegable, porque nunca se necesitan las tres a la vez.
 *
 * El contenido llega como nodos y no lo construye este componente: el árbol y el panel de modelos ya
 * existen y saben lo suyo. Acá se decide **el reparto del espacio**, que es el problema propio de un
 * panel con varias secciones.
 */
export function ProjectBrowser({
  registro,
  estructura,
  modelos,
  planos,
  planCount,
  generados,
  drawingCount,
  cotas,
  vistas,
  puedeGuardarVista,
  onToggleMeasurement,
  onDeleteMeasurement,
  onSaveView,
  onApplyView,
  onDeleteView,
}: {
  /** Lo que el registro documental ofrece abrir, agrupado por obra. */
  readonly registro: React.ReactNode;
  readonly estructura: React.ReactNode;
  readonly modelos: React.ReactNode;
  /** Los planos 2D cargados, con sus capas y su ajuste. */
  readonly planos: React.ReactNode;
  readonly planCount: number;
  /** Los planos generados desde el modelo, con su exportación. */
  readonly generados: React.ReactNode;
  readonly drawingCount: number;
  /** Las cotas dibujadas. La sección aparece sola cuando hay alguna. */
  readonly cotas: readonly DrawnMeasurement[];
  /** Las vistas guardadas, en el orden en que se guardaron. */
  readonly vistas: readonly SavedView[];
  /** `false` sin modelo abierto: no hay vista que guardar. */
  readonly puedeGuardarVista: boolean;
  readonly onToggleMeasurement: (id: string, visible: boolean) => void;
  readonly onDeleteMeasurement: (id: string) => void;
  readonly onSaveView: (name: string) => void;
  readonly onApplyView: (view: SavedView) => void;
  readonly onDeleteView: (id: string) => void;
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(
    new Set(["estructura", "modelos", "planos", "generados", "cotas", "vistas"]),
  );
  /**
   * El alto que se le fijó a mano a cada sección, en píxeles.
   *
   * Las que no están aquí se reparten lo que sobre, que es lo que hacían todas antes. Fijar una
   * sección es lo que permite, por ejemplo, dejar las capas de un plano grandes mientras el árbol
   * se queda en dos líneas — y al revés diez minutos después.
   */
  const [altos, setAltos] = useState<Readonly<Record<string, number>>>({});

  const alternar = (clave: string) =>
    setAbiertas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  /** Mueve el borde inferior de una sección. El alto de partida es el que tiene en pantalla. */
  const redimensionar = (clave: string, delta: number, actualEnPantalla: number) =>
    setAltos((actuales) => ({
      ...actuales,
      [clave]: Math.max(ALTO_MINIMO, (actuales[clave] ?? actualEnPantalla) + delta),
    }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* **Del registro, y va primero porque es de donde se parte.** Hasta hoy la única forma de
          abrir una revisión era entrar desde su expediente: la API del selector existía desde
          `F8.8` y no la consumía nadie. Arranca plegada para no empujar al árbol del modelo, que
          es lo que se mira mientras se revisa. */}
      <Seccion
        titulo="Del registro"
        abierta={abiertas.has("registro")}
        onAlternar={() => alternar("registro")}
        alto={altos["registro"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("registro", delta, actual)}
      >
        {registro}
      </Seccion>

      <Seccion
        titulo="Estructura del modelo"
        abierta={abiertas.has("estructura")}
        onAlternar={() => alternar("estructura")}
        alto={altos["estructura"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("estructura", delta, actual)}
      >
        {estructura}
      </Seccion>

      <Seccion
        titulo="Modelos abiertos"
        abierta={abiertas.has("modelos")}
        onAlternar={() => alternar("modelos")}
        alto={altos["modelos"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("modelos", delta, actual)}
      >
        {modelos}
      </Seccion>

      {/* **Los planos 2D van junto a los modelos, no en otra pestaña.** Son otra fuente del mismo
          proyecto —lo que hay abierto— y la comparación entre el plano y el modelo se hace
          encendiendo y apagando de los dos, que es un solo gesto si están a la misma altura. Las
          nubes de puntos entrarán aquí mismo cuando llegue su fase. */}
      <Seccion
        titulo={`Planos 2D (${planCount})`}
        abierta={abiertas.has("planos")}
        onAlternar={() => alternar("planos")}
        alto={altos["planos"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("planos", delta, actual)}
      >
        {planos}
      </Seccion>

      {/* Los planos que **salen** del modelo, justo debajo de los que **entran**: son las dos
          direcciones del mismo trabajo y se consultan en la misma columna. */}
      <Seccion
        titulo={`Planos generados (${drawingCount})`}
        abierta={abiertas.has("generados")}
        onAlternar={() => alternar("generados")}
        alto={altos["generados"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("generados", delta, actual)}
      >
        {generados}
      </Seccion>

      <Seccion
        titulo={`Vistas guardadas (${vistas.length})`}
        abierta={abiertas.has("vistas")}
        onAlternar={() => alternar("vistas")}
        alto={altos["vistas"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("vistas", delta, actual)}
      >
        <Vistas
          vistas={vistas}
          puedeGuardar={puedeGuardarVista}
          onGuardar={onSaveView}
          onAplicar={onApplyView}
          onBorrar={onDeleteView}
        />
      </Seccion>

      {cotas.length > 0 && (
        <Seccion
          // "Cotas dibujadas" era jerga y además decía menos de lo que la lista hace: acá están las
          // mediciones tomadas, con su valor, y se pueden apagar o borrar una por una.
          titulo={`Mediciones tomadas (${cotas.length})`}
          abierta={abiertas.has("cotas")}
          onAlternar={() => alternar("cotas")}
          alto={altos["cotas"] ?? null}
          onRedimensionar={(delta, actual) => redimensionar("cotas", delta, actual)}
        >
          <ul className="p-1">
            {cotas.map((cota) => (
              <CotaEnLista
                key={cota.id}
                cota={cota}
                onToggle={onToggleMeasurement}
                onDelete={onDeleteMeasurement}
              />
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}

/**
 * Las vistas guardadas: guardar la actual, volver a una, borrarla.
 *
 * **Una vista guarda desde dónde se mira, qué está apagado y por dónde está cortado.** Es lo que hace
 * falta para volver mañana a lo mismo, y para que dos personas mirando el mismo modelo estén mirando
 * de verdad lo mismo. Con solo la cámara, la vista del otro muestra otra cosa.
 *
 * Se guardan **en este navegador**, no en un servidor: la Fase 3 les dará un sitio compartido. Hasta
 * entonces sobreviven a recargar la página y no salen del equipo, lo que se dice en el pie de la
 * sección para que nadie cuente con más de lo que hay.
 */
function Vistas({
  vistas,
  puedeGuardar,
  onGuardar,
  onAplicar,
  onBorrar,
}: {
  readonly vistas: readonly SavedView[];
  readonly puedeGuardar: boolean;
  readonly onGuardar: (name: string) => void;
  readonly onAplicar: (view: SavedView) => void;
  readonly onBorrar: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");

  const guardar = () => {
    const limpio = nombre.trim();
    if (limpio === "") return;
    onGuardar(limpio);
    setNombre("");
  };

  return (
    <div className="p-1.5">
      <form
        className="flex gap-1"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar();
        }}
      >
        <input
          type="text"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          placeholder="Nombre de la vista"
          disabled={!puedeGuardar}
          className="min-w-0 flex-1 rounded border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/90 placeholder:text-white/30 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!puedeGuardar || nombre.trim() === ""}
          className="shrink-0 rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:bg-white/10 disabled:text-white/30"
          title={
            puedeGuardar
              ? "Guarda la cámara, lo que está apagado y los cortes puestos"
              : "Abre un modelo primero"
          }
        >
          Guardar
        </button>
      </form>

      {vistas.length === 0 ? (
        <p className="px-1 pt-2 text-[11px] leading-snug text-white/35">
          Ninguna todavía. Una vista guarda la cámara, lo que está apagado y los cortes, y vuelve
          con un clic.
        </p>
      ) : (
        <ul className="pt-1.5">
          {vistas.map((vista) => (
            <li
              key={vista.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/5"
            >
              <span className="shrink-0 text-white/40">
                <IconViewIso className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => onAplicar(vista)}
                className="min-w-0 flex-1 truncate text-left text-xs text-white/85 hover:text-white"
                title={`Volver a "${vista.name}" — guardada el ${new Date(vista.savedAt).toLocaleString("es-CL")}${
                  vista.sections.length > 0 ? ` · ${vista.sections.length} corte(s)` : ""
                }`}
              >
                {vista.name}
              </button>
              <button
                type="button"
                onClick={() => onBorrar(vista.id)}
                className="shrink-0 text-white/30 opacity-0 group-hover:opacity-100 hover:text-red-400"
                title="Borrar esta vista"
                aria-label="Borrar esta vista"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 pt-2 text-[11px] leading-snug text-white/30">
        Se guardan en este navegador. La Fase 3 les dará un sitio compartido.
      </p>
    </div>
  );
}

/** Lo mínimo que puede medir una sección: por debajo no cabe ni una fila. */
const ALTO_MINIMO = 56;

/**
 * Una sección plegable del navegador.
 *
 * Abierta toma su parte del alto disponible y hace su propio desplazamiento; plegada ocupa solo su
 * cabecera. Así tres listas largas conviven sin que ninguna empuje a las otras fuera de la pantalla.
 */
function Seccion({
  titulo,
  abierta,
  onAlternar,
  alto,
  onRedimensionar,
  children,
}: {
  readonly titulo: string;
  readonly abierta: boolean;
  readonly onAlternar: () => void;
  /** Alto fijado a mano, o `null` para repartirse lo que sobra con las demás. */
  readonly alto?: number | null;
  /** Llega el incremento del arrastre y el alto que la sección tenía en pantalla. */
  readonly onRedimensionar?: (delta: number, altoActual: number) => void;
  readonly children: React.ReactNode;
}) {
  const propia = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={propia}
      // Con alto fijado la sección no se estira ni se encoge; sin él se reparte el hueco, que es
      // como se comportaban todas antes de poder arrastrarlas.
      style={abierta && alto != null ? { height: alto, flex: "none" } : undefined}
      className={[
        "flex min-h-0 flex-col border-b border-white/10",
        abierta && alto == null ? "flex-1" : "shrink-0",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-left hover:bg-white/5"
      >
        <span className="text-white/40">
          {abierta ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <h2 className="text-[11px] font-semibold tracking-wide text-white/60 uppercase">
          {titulo}
        </h2>
      </button>

      {abierta && <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}

      {abierta && onRedimensionar !== undefined && (
        <Resizer
          orientacion="horizontal"
          ayuda={`Arrastra para cambiar el alto de "${titulo}"`}
          onArrastrar={(delta) =>
            onRedimensionar(delta, propia.current?.getBoundingClientRect().height ?? 0)
          }
        />
      )}
    </section>
  );
}

/**
 * Una cota de la lista: su valor, el interruptor para apagarla y el botón para borrarla.
 *
 * **Apagar y borrar son cosas distintas.** Una cota apagada sigue existiendo y vuelve con un clic;
 * borrada hay que medirla otra vez. Con diez cotas encima del modelo, apagar es lo que se usa.
 */
function CotaEnLista({
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
        title={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
        aria-label={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
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
        title="Borrar esta medición"
        aria-label="Borrar esta medición"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
