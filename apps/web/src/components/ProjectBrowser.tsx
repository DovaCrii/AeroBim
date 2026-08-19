import type { DrawnMeasurement } from "@aerobim/viewer";
import { useState } from "react";
import {
  IconAngle,
  IconArea,
  IconChevronDown,
  IconChevronRight,
  IconDistance,
  IconEye,
  IconEyeOff,
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
  estructura,
  modelos,
  cotas,
  onToggleMeasurement,
  onDeleteMeasurement,
}: {
  readonly estructura: React.ReactNode;
  readonly modelos: React.ReactNode;
  /** Las cotas dibujadas. La sección aparece sola cuando hay alguna. */
  readonly cotas: readonly DrawnMeasurement[];
  readonly onToggleMeasurement: (id: string, visible: boolean) => void;
  readonly onDeleteMeasurement: (id: string) => void;
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(
    new Set(["estructura", "modelos", "cotas"]),
  );

  const alternar = (clave: string) =>
    setAbiertas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Seccion
        titulo="Estructura del modelo"
        abierta={abiertas.has("estructura")}
        onAlternar={() => alternar("estructura")}
      >
        {estructura}
      </Seccion>

      <Seccion
        titulo="Modelos abiertos"
        abierta={abiertas.has("modelos")}
        onAlternar={() => alternar("modelos")}
      >
        {modelos}
      </Seccion>

      {cotas.length > 0 && (
        <Seccion
          // "Cotas dibujadas" era jerga y además decía menos de lo que la lista hace: acá están las
          // mediciones tomadas, con su valor, y se pueden apagar o borrar una por una.
          titulo={`Mediciones tomadas (${cotas.length})`}
          abierta={abiertas.has("cotas")}
          onAlternar={() => alternar("cotas")}
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
 * Una sección plegable del navegador.
 *
 * Abierta toma su parte del alto disponible y hace su propio desplazamiento; plegada ocupa solo su
 * cabecera. Así tres listas largas conviven sin que ninguna empuje a las otras fuera de la pantalla.
 */
function Seccion({
  titulo,
  abierta,
  onAlternar,
  children,
}: {
  readonly titulo: string;
  readonly abierta: boolean;
  readonly onAlternar: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "flex min-h-0 flex-col border-b border-white/10",
        abierta ? "flex-1" : "shrink-0",
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
