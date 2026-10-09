/**
 * Lógica pura del panel «Vista de la lámina»: cómo se llama cada capa, en qué orden va y qué filas
 * tiene la ficha. Vive aparte del componente para poder probarse sin DOM ni Three.
 */
import { rotuloDeEscala, sugerirHoja } from "@aerobim/bim-core";

/** Una capa tal como la lista el visor (`BimViewer.drawingLayers`). */
export interface CapaDeLamina {
  readonly name: string;
  readonly visible: boolean;
  readonly segments: number;
}

interface TextoDeCapa {
  readonly titulo: string;
  readonly ayuda: string;
}

/**
 * Los nombres son los de `CAPAS` en `packages/viewer/src/drawings.ts`, que son los que lleva el DXF.
 * El **orden** de este objeto es el del panel: primero lo que dibuja el modelo, después la referencia.
 */
const TEXTOS: Readonly<Record<string, TextoDeCapa>> = {
  "AB-VISIBLE": {
    titulo: "Trazos visibles",
    ayuda: "Las aristas del modelo que se ven desde esta vista.",
  },
  "AB-OCULTA": {
    titulo: "Aristas ocultas",
    ayuda: "Lo que el propio modelo tapa. Apagarlas deja el dibujo más limpio.",
  },
  "AB-NUBE": {
    titulo: "Nube de puntos",
    ayuda: "Los puntos del levantamiento que caen en esta lámina, como marcas.",
  },
  "AB-MALLA": {
    titulo: "Cuadrícula",
    ayuda: "La cuadrícula de PK y de cota del perfil.",
  },
  "AB-REGLA": {
    titulo: "Regla de PK",
    ayuda: "La graduación de PK sobre el borde inferior.",
  },
};

const ORDEN = Object.keys(TEXTOS);

export interface CapaParaPanel extends CapaDeLamina {
  readonly titulo: string;
  readonly ayuda: string;
}

/**
 * Las capas con su rótulo, en el orden del panel. Las que el panel no conoce van al final con su
 * nombre del DXF: ocultar una capa que no se sabe qué es sería peor que no poder apagarla.
 */
export function capasParaPanel(capas: readonly CapaDeLamina[]): readonly CapaParaPanel[] {
  const rango = (nombre: string) => {
    const i = ORDEN.indexOf(nombre);
    return i < 0 ? ORDEN.length : i;
  };
  return [...capas]
    .sort((a, b) => rango(a.name) - rango(b.name) || a.name.localeCompare(b.name))
    .map((capa) => ({
      ...capa,
      titulo: TEXTOS[capa.name]?.titulo ?? capa.name,
      ayuda: TEXTOS[capa.name]?.ayuda ?? `La capa ${capa.name} del dibujo.`,
    }));
}

/** Lo que se sabe de una lámina para su ficha. */
export interface DatosDeLamina {
  readonly nombre: string;
  readonly anchoM: number;
  readonly altoM: number;
  readonly segmentos: number;
  readonly segmentosOcultos: number;
  readonly generadoMs: number;
  readonly cruces?: number | undefined;
  readonly puntosDeNube?: number | undefined;
  readonly vista?: VistaDeLamina | undefined;
}

export type VistaDeLamina = "plan" | "front" | "side" | "profile";

/**
 * Desde dónde se mira una vista y cómo se lee de izquierda a derecha, **referido a la planta** y no a
 * puntos cardinales: el IFC no tiene por qué traer el norte del proyecto, y «desde el este» sería un
 * dato inventado. La planta es lo que la persona tiene delante, así que se verifica de un vistazo.
 *
 * Es la misma convención del visor 3D y de la proyección (`VISTAS` en `drawings.ts`): el frontal se
 * mira desde +Z, el lateral desde +X, y la planta tiene +X a la derecha y −Z hacia arriba.
 */
export function orientacionDeVista(
  vista: VistaDeLamina,
): { readonly desde: string; readonly lectura: string | null } | null {
  switch (vista) {
    case "plan":
      return { desde: "Arriba", lectura: null };
    case "front":
      return {
        desde: "El borde inferior de la planta",
        lectura: "Izquierda a derecha, como en la planta",
      };
    case "side":
      return {
        desde: "El borde derecho de la planta",
        lectura: "Frente de la planta a la izquierda, fondo a la derecha",
      };
    case "profile":
      return null;
  }
}

export interface FilaDeFicha {
  readonly etiqueta: string;
  readonly valor: string;
}

const ENTERO = new Intl.NumberFormat("es-CL");

function milisegundos(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** «36,2 × 69,0 m». */
export function textoDeTamano(anchoM: number, altoM: number): string {
  const f = (n: number) => n.toFixed(1).replace(".", ",");
  return `${f(anchoM)} × ${f(altoM)} m`;
}

/** Las filas de la ficha: solo las que tienen algo que decir. */
export function fichaDeLamina(datos: DatosDeLamina): readonly FilaDeFicha[] {
  const filas: FilaDeFicha[] = [
    { etiqueta: "Vista", valor: datos.nombre },
    { etiqueta: "Tamaño", valor: textoDeTamano(datos.anchoM, datos.altoM) },
  ];
  const sugerencia = sugerirHoja(datos.anchoM, datos.altoM);
  filas.push({
    etiqueta: "Hoja sugerida",
    valor:
      sugerencia === null
        ? "No cabe en una A0"
        : `${sugerencia.hoja.nombre} a ${rotuloDeEscala(sugerencia.escala)}`,
  });
  const orientacion = datos.vista === undefined ? null : orientacionDeVista(datos.vista);
  if (orientacion !== null) {
    filas.push({ etiqueta: "Se mira desde", valor: orientacion.desde });
    if (orientacion.lectura !== null)
      filas.push({ etiqueta: "Se lee", valor: orientacion.lectura });
  }
  filas.push({ etiqueta: "Trazos", valor: ENTERO.format(datos.segmentos) });
  filas.push({ etiqueta: "Aristas ocultas", valor: ENTERO.format(datos.segmentosOcultos) });
  if (datos.cruces !== undefined && datos.cruces > 0) {
    filas.push({ etiqueta: "Elementos que cruza", valor: ENTERO.format(datos.cruces) });
  }
  if (datos.puntosDeNube !== undefined && datos.puntosDeNube > 0) {
    filas.push({ etiqueta: "Puntos de nube", valor: ENTERO.format(datos.puntosDeNube) });
  }
  filas.push({ etiqueta: "Generada en", valor: milisegundos(datos.generadoMs) });
  return filas;
}
