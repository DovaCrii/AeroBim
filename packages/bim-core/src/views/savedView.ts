/**
 * Una vista guardada: desde dónde se mira, qué está oculto y por dónde está cortado.
 *
 * **Por qué es del dominio y no de la interfaz.** Una vista guardada se persiste, se comparte y algún
 * día viajará en un BCF; en cuanto se guarda en algún sitio, su forma es un contrato. Aquí vive esa
 * forma y la lectura de lo que venga de fuera, que hay que tratar como sospechoso: el almacenamiento
 * del navegador puede tener vistas de una versión anterior, editadas a mano o a medio escribir.
 *
 * Las coordenadas van en metros y en el sistema de la escena, que es el del modelo cargado. Una vista
 * solo tiene sentido con los mismos modelos abiertos, y eso no se puede garantizar desde acá: al
 * aplicarla, lo que no exista se ignora en vez de fallar.
 */

import type { Point3 } from "../measure/geometry.js";

/** Cómo se proyecta la escena. Mismos nombres que usa el visor. */
export type ViewProjection = "Perspective" | "Orthographic";

/** Cómo se navega la escena. Mismos nombres que usa el visor. */
export type ViewNavigation = "Orbit" | "Plan" | "FirstPerson";

/** Desde dónde y cómo se mira. */
export interface SavedCamera {
  /** Dónde está la cámara, en metros. */
  readonly position: Point3;
  /** A dónde mira, en metros. Es el punto sobre el que orbita. */
  readonly target: Point3;
  readonly projection: ViewProjection;
  readonly navigation: ViewNavigation;
}

/** Un plano de corte, por su normal y un punto suyo. */
export interface SavedSection {
  readonly normal: Point3;
  readonly origin: Point3;
}

/** Una vista guardada, completa. */
export interface SavedView {
  readonly id: string;
  readonly name: string;
  /** Cuándo se guardó, en ISO 8601. Sirve para ordenar y para saber si está vieja. */
  readonly savedAt: string;
  readonly camera: SavedCamera;
  /**
   * Qué está oculto, por modelo: identificadores locales de Fragments.
   *
   * **Son identificadores del motor, no GUID**, y eso limita su vida: cambian entre versiones del
   * modelo. Es aceptable para una vista de trabajo —se guarda y se usa en la misma sesión o sobre el
   * mismo archivo— y **no lo será para un viewpoint de BCF**, que tendrá que ir por GUID. Cuando
   * llegue la Fase 4 hay que traducir esto; queda dicho acá para no descubrirlo entonces.
   */
  readonly hiddenByModel: Readonly<Record<string, readonly number[]>>;
  readonly sections: readonly SavedSection[];
}

/** `true` si el valor es una terna de números: un punto del espacio. */
function esPunto(valor: unknown): valor is Point3 {
  return (
    Array.isArray(valor) &&
    valor.length === 3 &&
    valor.every((n) => typeof n === "number" && isFinite(n))
  );
}

/** `true` si el texto es uno de los valores admitidos. */
function esUnoDe<T extends string>(valor: unknown, admitidos: readonly T[]): valor is T {
  return typeof valor === "string" && (admitidos as readonly string[]).includes(valor);
}

const PROYECCIONES: readonly ViewProjection[] = ["Perspective", "Orthographic"];
const NAVEGACIONES: readonly ViewNavigation[] = ["Orbit", "Plan", "FirstPerson"];

/** Lee una cámara guardada, o `null` si lo que hay no lo es. */
function leerCamara(valor: unknown): SavedCamera | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;

  if (!esPunto(bruto.position) || !esPunto(bruto.target)) return null;
  if (!esUnoDe(bruto.projection, PROYECCIONES)) return null;
  if (!esUnoDe(bruto.navigation, NAVEGACIONES)) return null;

  return {
    position: bruto.position,
    target: bruto.target,
    projection: bruto.projection,
    navigation: bruto.navigation,
  };
}

/** Lee la lista de cortes, descartando los que no sean planos. */
function leerCortes(valor: unknown): readonly SavedSection[] {
  if (!Array.isArray(valor)) return [];

  const cortes: SavedSection[] = [];
  for (const bruto of valor) {
    if (typeof bruto !== "object" || bruto === null) continue;
    const { normal, origin } = bruto as Record<string, unknown>;
    if (!esPunto(normal) || !esPunto(origin)) continue;
    cortes.push({ normal, origin });
  }
  return cortes;
}

/** Lee lo oculto por modelo, quedándose solo con listas de números. */
function leerOculto(valor: unknown): Readonly<Record<string, readonly number[]>> {
  if (typeof valor !== "object" || valor === null) return {};

  const oculto: Record<string, readonly number[]> = {};
  for (const [modelo, ids] of Object.entries(valor as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    oculto[modelo] = ids.filter(
      (id): id is number => typeof id === "number" && Number.isInteger(id),
    );
  }
  return oculto;
}

/**
 * Lee una vista guardada de un objeto cualquiera, o devuelve `null`.
 *
 * Exige lo imprescindible —nombre y cámara— y es tolerante con el resto: una vista sin cortes es una
 * vista sin cortes, no una vista corrupta. Lo que falta se rellena con lo neutro; lo que está mal se
 * descarta.
 */
export function readSavedView(valor: unknown): SavedView | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;

  const name = typeof bruto.name === "string" ? bruto.name.trim() : "";
  if (name === "") return null;

  const camera = leerCamara(bruto.camera);
  if (camera === null) return null;

  return {
    id: typeof bruto.id === "string" && bruto.id !== "" ? bruto.id : `vista-${name}`,
    name,
    savedAt: typeof bruto.savedAt === "string" ? bruto.savedAt : new Date(0).toISOString(),
    camera,
    hiddenByModel: leerOculto(bruto.hiddenByModel),
    sections: leerCortes(bruto.sections),
  };
}

/**
 * Lee la colección de vistas de un texto JSON.
 *
 * **Nunca lanza y nunca devuelve basura.** Lo que se lee viene del almacenamiento del navegador, que
 * es de fuera: puede estar truncado, ser de una versión anterior o haber sido editado a mano. Un
 * fallo ahí no puede impedir abrir la aplicación, así que lo ilegible se descarta en silencio y lo
 * legible se conserva.
 */
export function parseSavedViews(json: string): readonly SavedView[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(bruto)) return [];

  const vistas: SavedView[] = [];
  for (const entrada of bruto) {
    const vista = readSavedView(entrada);
    if (vista !== null) vistas.push(vista);
  }
  return vistas;
}
