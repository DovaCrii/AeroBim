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
  coordinacion,
  estructura,
  cuadros,
  modelos,
  nubes,
  calce,
  planos,
  planCount,
  generados,
  drawingCount,
  cotas,
  vistas,
  vistasDelProyecto,
  puedeGuardarVista,
  onToggleMeasurement,
  onDeleteMeasurement,
  onSaveView,
  onApplyView,
  onDeleteView,
}: {
  /** Lo que el registro documental ofrece abrir, agrupado por obra. */
  readonly registro: React.ReactNode;
  /** Las observaciones del modelo, con el clic que lleva al problema. */
  readonly coordinacion: React.ReactNode;
  readonly estructura: React.ReactNode;
  /** Los cuadros por categoría: qué hay en el modelo y cuántas hay. */
  readonly cuadros: React.ReactNode;
  readonly modelos: React.ReactNode;
  /** La nube de puntos: su ficha y sus mandos (`F12.1`). */
  readonly nubes: React.ReactNode;
  /** Calzar la nube con el modelo y medir lo que se aparta (`F12.2`). */
  readonly calce: React.ReactNode;
  /** Los planos 2D cargados, con sus capas y su ajuste. */
  readonly planos: React.ReactNode;
  readonly planCount: number;
  /** Los planos generados desde el modelo, con su exportación. */
  readonly generados: React.ReactNode;
  readonly drawingCount: number;
  /** Las cotas dibujadas. La sección aparece sola cuando hay alguna. */
  readonly cotas: readonly DrawnMeasurement[];
  /** Las vistas guardadas **en este navegador**, en el orden en que se guardaron. */
  readonly vistas: readonly SavedView[];
  /** Las que sí se le pueden pasar a otra persona: viven en el registro y se piden por proyecto. */
  readonly vistasDelProyecto: React.ReactNode;
  /** `false` sin modelo abierto: no hay vista que guardar. */
  readonly puedeGuardarVista: boolean;
  readonly onToggleMeasurement: (id: string, visible: boolean) => void;
  readonly onDeleteMeasurement: (id: string) => void;
  readonly onSaveView: (name: string) => void;
  readonly onApplyView: (view: SavedView) => void;
  readonly onDeleteView: (id: string) => void;
}) {
  /**
   * Qué secciones están desplegadas. **Todas arrancan plegadas.**
   *
   * Antes arrancaban abiertas casi todas, y con siete secciones eso llena la columna entera de
   * listas vacías —«Ninguno», «Ninguna todavía»— que empujan hacia abajo la única que se está
   * usando. Plegadas, la columna cabe de un vistazo y **se abre lo que se necesita**, que es lo que
   * pidió el usuario con esas palabras.
   *
   * No se recuerda entre sesiones a propósito: qué sección hace falta depende de lo que se esté
   * haciendo ahora, no de lo que se hacía ayer.
   */
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
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

      {/* **La coordinación va arriba, junto al registro y antes del árbol.** Es de donde se parte
          cuando se abre el modelo para revisar: primero qué hay que mirar, después el modelo. */}
      <Seccion
        titulo="Coordinación"
        abierta={abiertas.has("coordinacion")}
        onAlternar={() => alternar("coordinacion")}
        alto={altos["coordinacion"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("coordinacion", delta, actual)}
      >
        {coordinacion}
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

      {/* **Los cuadros van junto a la estructura, no con los planos.** El árbol dice **dónde** está
          cada cosa y el cuadro dice **qué es y cuántas hay**: son las dos preguntas que uno se hace
          mirando el modelo, y se contestan una detrás de la otra. Exportar es lo que se hace
          después, no lo que las emparenta. */}
      <Seccion
        titulo="Cuadros del modelo"
        abierta={abiertas.has("cuadros")}
        onAlternar={() => alternar("cuadros")}
        alto={altos["cuadros"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("cuadros", delta, actual)}
      >
        {cuadros}
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

      {/* **La nube va junto a los modelos abiertos y no al final**, porque es lo mismo: otra fuente
          del proyecto que está abierta ahora. La regla de crecimiento de `docs/UX.md` es que una
          capacidad nueva es una sección del navegador, y esta es la primera que la estrena. */}
      <Seccion
        titulo="Nube de puntos"
        abierta={abiertas.has("nubes")}
        onAlternar={() => alternar("nubes")}
        alto={altos["nubes"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("nubes", delta, actual)}
      >
        {nubes}
      </Seccion>

      {/* **El calce va justo debajo de la nube y no en Coordinación**, aunque acabe en una
          observación: es lo que se hace *con* la nube y antes de poder medir nada. Separarlos
          obligaría a saltar entre dos secciones para un solo trabajo. */}
      <Seccion
        titulo="Calce y desviación"
        abierta={abiertas.has("calce")}
        onAlternar={() => alternar("calce")}
        alto={altos["calce"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("calce", delta, actual)}
      >
        {calce}
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

      {/* **Las del proyecto van justo debajo de las locales**, y las dos existen a propósito: una
          vista local es de trabajo y no cuesta nada —ni viaje al servidor ni permiso—; una
          compartida es un acto explícito. Puestas juntas, la diferencia se lee sin explicarla. */}
      <Seccion
        titulo="Vistas del proyecto"
        abierta={abiertas.has("vistas-proyecto")}
        onAlternar={() => alternar("vistas-proyecto")}
        alto={altos["vistas-proyecto"] ?? null}
        onRedimensionar={(delta, actual) => redimensionar("vistas-proyecto", delta, actual)}
      >
        {vistasDelProyecto}
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
          className="min-w-0 flex-1 rounded-sm border border-borde bg-surface-3 px-2 py-1 text-xs text-fg placeholder:text-fg-3 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!puedeGuardar || nombre.trim() === ""}
          className="shrink-0 rounded-sm bg-action px-2 py-1 text-xs font-medium text-fg hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
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
        <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
          Ninguna todavía. Una vista guarda la cámara, lo que está apagado y los cortes, y vuelve
          con un clic.
        </p>
      ) : (
        <ul className="pt-1.5">
          {vistas.map((vista) => (
            <li
              key={vista.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
            >
              <span className="shrink-0 text-fg-3">
                <IconViewIso className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => onAplicar(vista)}
                className="min-w-0 flex-1 truncate text-left text-xs text-fg-2 hover:text-fg"
                title={`Volver a "${vista.name}" — guardada el ${new Date(vista.savedAt).toLocaleString("es-CL")}${
                  vista.sections.length > 0 ? ` · ${vista.sections.length} corte(s)` : ""
                }`}
              >
                {vista.name}
              </button>
              <button
                type="button"
                onClick={() => onBorrar(vista.id)}
                className="shrink-0 text-fg-3 hover:text-danger"
                title="Borrar esta vista"
                aria-label="Borrar esta vista"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
        Se guardan en este navegador y no salen del equipo. Para pasarle una a alguien, usa{" "}
        <span className="text-fg-3">Vistas del proyecto</span>.
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
        "flex min-h-0 flex-col border-b border-borde",
        abierta && alto == null ? "flex-1" : "shrink-0",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-left hover:bg-surface-2"
      >
        <span className="text-fg-3">
          {abierta ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <h2 className="text-nota font-semibold tracking-wide text-fg-2 uppercase">{titulo}</h2>
      </button>

      {abierta && <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">{children}</div>}

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
    <li className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
      <button
        type="button"
        onClick={() => onToggle(cota.id, !cota.visible)}
        className={cota.visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
        title={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
        aria-label={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
        aria-pressed={cota.visible}
      >
        {cota.visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
      </button>

      <span className={cota.visible ? "text-fg-3" : "text-apagado-fg"}>{icono}</span>

      <span
        className={[
          "min-w-0 flex-1 truncate font-mono text-xs",
          cota.visible ? "text-fg" : "text-fg-3 line-through",
        ].join(" ")}
      >
        {cota.label}
      </span>

      <button
        type="button"
        onClick={() => onDelete(cota.id)}
        className="text-fg-3 hover:text-danger"
        title="Borrar esta medición"
        aria-label="Borrar esta medición"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
