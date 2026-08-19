import type { ModelTree, SpatialNode } from "@aerobim/viewer";
import { useState } from "react";

/**
 * Hijos que un grupo lista de entrada, antes de ofrecer el resto.
 *
 * Una categoría con 470 elementos convierte el árbol en una lista que nadie recorre; treinta caben en
 * pantalla. Los demás **existen** y están a un clic, que es lo que faltaba antes.
 */
const MAX_HIJOS_LISTADOS = 30;

/**
 * Árbol espacial del modelo, con aislar y ocultar.
 *
 * Es lo primero que alguien intenta después de abrir un modelo: recorrer las plantas y
 * quitar de encima lo que estorba. Sin esto un visor solo sirve para mirar.
 */
export function SpatialTree({
  trees,
  hidden,
  onIsolate,
  onToggleVisible,
}: {
  readonly trees: readonly ModelTree[];
  /**
   * Claves de los nodos ocultos.
   *
   * El estado vive **fuera** del árbol a propósito: cuando estaba dentro de cada fila,
   * "Ver todo" restauraba el modelo pero los iconos seguían mostrando lo oculto, y la
   * interfaz mentía sobre lo que se estaba viendo.
   */
  readonly hidden: ReadonlySet<string>;
  readonly onIsolate: (modelId: string, localIds: readonly number[]) => void;
  readonly onToggleVisible: (node: SpatialNode, modelId: string, visible: boolean) => void;
}) {
  return (
    // Sin cabecera propia: el título y el plegado los pone la sección del navegador que lo contiene,
    // y "Ver todo" vive en la cinta, con el resto de lo que cambia la visibilidad.
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {trees.map((tree) => (
          <Node
            key={tree.modelId}
            node={tree.root}
            modelId={tree.modelId}
            depth={0}
            hidden={hidden}
            onIsolate={onIsolate}
            onToggleVisible={onToggleVisible}
          />
        ))}
      </div>
    </div>
  );
}

function Node({
  node,
  modelId,
  depth,
  hidden,
  onIsolate,
  onToggleVisible,
}: {
  readonly node: SpatialNode;
  readonly modelId: string;
  readonly depth: number;
  readonly hidden: ReadonlySet<string>;
  readonly onIsolate: (modelId: string, localIds: readonly number[]) => void;
  readonly onToggleVisible: (node: SpatialNode, modelId: string, visible: boolean) => void;
}) {
  // Los dos primeros niveles abiertos: proyecto y sitio no aportan nada plegados, y así se
  // ve el edificio sin tener que hacer clic.
  const [open, setOpen] = useState(depth < 2);
  /**
   * `true` cuando este grupo muestra **todos** sus hijos.
   *
   * Un grupo de 470 elementos no se lista de entrada —convierte el árbol en una lista que nadie
   * recorre— pero **sí se puede desplegar a mano**. Antes esos hijos ni existían en los datos y el
   * árbol decía "clic en el modelo para verlos", que era un callejón sin salida.
   */
  const [todosLosHijos, setTodosLosHijos] = useState(false);
  const visible = !hidden.has(node.key);
  const tieneHijos = node.children.length > 0;

  const listados = todosLosHijos ? node.children : node.children.slice(0, MAX_HIJOS_LISTADOS);
  const restantes = node.children.length - listados.length;

  return (
    <div>
      <div
        className="group flex items-center gap-1 pr-2 text-xs hover:bg-white/5"
        style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
      >
        <button
          type="button"
          onClick={() => setOpen((actual) => !actual)}
          className={[
            "w-4 shrink-0 text-white/40",
            tieneHijos ? "hover:text-white" : "invisible",
          ].join(" ")}
          aria-label={open ? "Plegar" : "Desplegar"}
        >
          {open ? "▾" : "▸"}
        </button>

        <button
          type="button"
          onClick={() => onIsolate(modelId, node.localIds)}
          className="min-w-0 flex-1 truncate py-1 text-left text-white/85 hover:text-white"
          title={`${node.label} — clic para aislar`}
        >
          {node.label}
        </button>

        {node.count > 0 && (
          <span className="shrink-0 text-white/30 tabular-nums">{node.count}</span>
        )}

        <button
          type="button"
          onClick={() => onToggleVisible(node, modelId, !visible)}
          className={[
            "shrink-0 hover:text-white",
            // El icono de lo oculto queda siempre a la vista; el de lo visible solo al pasar
            // por encima, para no llenar el árbol de adornos.
            visible ? "text-white/30 opacity-0 group-hover:opacity-100" : "text-brand",
          ].join(" ")}
          title={visible ? "Ocultar" : "Mostrar"}
          aria-label={visible ? "Ocultar" : "Mostrar"}
        >
          {visible ? "◉" : "○"}
        </button>
      </div>

      {open && (
        <>
          {listados.map((hijo) => (
            <Node
              key={hijo.key}
              node={hijo}
              modelId={modelId}
              depth={depth + 1}
              hidden={hidden}
              onIsolate={onIsolate}
              onToggleVisible={onToggleVisible}
            />
          ))}

          {restantes > 0 && (
            <button
              type="button"
              onClick={() => setTodosLosHijos(true)}
              className="py-1 text-xs text-white/40 italic hover:text-white/80"
              style={{ paddingLeft: `${(depth + 1) * 0.75 + 1.75}rem` }}
            >
              ver los {restantes} elementos restantes
            </button>
          )}
        </>
      )}
    </div>
  );
}
