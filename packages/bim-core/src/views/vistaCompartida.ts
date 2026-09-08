/**
 * Una vista que se le puede pasar a otra persona.
 *
 * **Las vistas guardadas vivían en el navegador y ahí se quedaban.** Sobrevivían a recargar la
 * página y no salían del equipo, que era lo que decía su propio pie de sección; el resultado es que
 * dos personas revisando el mismo modelo **no podían mirar lo mismo**. Coordinar es exactamente eso,
 * así que la limitación pasó de aceptable a molesta en cuanto la coordinación se metió en el visor.
 *
 * ## Por qué esto no es «la misma vista, pero en el servidor»
 *
 * Una {@link SavedView} está escrita en el idioma de **esta sesión**: coordenadas de la escena del
 * visor —con el eje Y hacia arriba, que es una convención de Three.js— y `localId` de Fragments para
 * lo oculto, que es el identificador del motor y **cambia entre versiones del modelo**. Guardar eso
 * en una base de datos sería meter dos convenciones internas en un dato que va a durar más que
 * ellas: el día que el visor cambie de librería, todas las vistas guardadas quedarían mintiendo.
 *
 * Una vista compartida está escrita en el idioma del **modelo**, que es el que entiende cualquiera:
 *
 * | Qué          | Cómo viaja                                                           |
 * | ------------ | -------------------------------------------------------------------- |
 * | La cámara    | {@link BcfCamera}, ya en el sistema del IFC — lo mismo que un viewpoint |
 * | Lo apagado   | {@link VisibilidadBcf}, por **GUID** — lo que cerró `F4.7`           |
 * | Los cortes   | Normal y origen, también en el sistema del IFC                       |
 *
 * O sea: **es un viewpoint de BCF con nombre y con cortes**. Eso no es una casualidad, es la
 * consecuencia de exigirle que sobreviva a quien la escribió.
 *
 * ## Lo que deliberadamente no viaja
 *
 * **El modo de navegación** —órbita, planta, interior—. Es cómo se mueve uno, no lo que se ve, y
 * quien recibe la vista está mirando, no recorriendo. Ponerlo cambiaría el control del ratón de otra
 * persona sin que nadie se lo pidiera. La proyección sí viaja, porque una ortográfica y una
 * perspectiva del mismo sitio **no muestran lo mismo**, y eso lo lleva la propia cámara de BCF en su
 * tipo.
 */

import type { Point3 } from "../measure/geometry.js";
import { escenaAIfc, ifcAEscena, type BcfCamera } from "../registro/viewpoint.js";
import type { VisibilidadBcf } from "../registro/visibilidad.js";
import type { SavedSection } from "./savedView.js";

/**
 * Un plano de corte en el sistema del IFC.
 *
 * `escenaAIfc` es lineal, así que sirve igual para el punto y para la normal: no hay que tratar el
 * vector aparte, que es el error clásico al convertir sistemas de coordenadas y el que deja los
 * cortes girados noventa grados.
 */
export interface CorteIfc {
  readonly normal: Point3;
  readonly origen: Point3;
}

/** Una vista compartida, completa. Es lo que se guarda y lo que viaja. */
export interface VistaCompartida {
  readonly nombre: string;
  readonly camara: BcfCamera;
  /** Qué se veía, o `null` si no había ninguna restricción: el modelo entero. */
  readonly visibilidad: VisibilidadBcf | null;
  readonly cortes: readonly CorteIfc[];
}

/** Tope del nombre, el mismo que acepta el registro para un título. */
export const NOMBRE_MAXIMO = 120;

/** Cuántos cortes se admiten. El visor pone tres ejes; más de una docena es un dato inventado. */
export const MAXIMO_CORTES = 12;

/** Un corte de la escena, llevado al sistema del IFC. */
export function corteAIfc(corte: SavedSection): CorteIfc {
  return { normal: escenaAIfc(corte.normal), origen: escenaAIfc(corte.origin) };
}

/** La vuelta exacta de {@link corteAIfc}. */
export function corteAEscena(corte: CorteIfc): SavedSection {
  return { normal: ifcAEscena(corte.normal), origin: ifcAEscena(corte.origen) };
}

function esPunto(valor: unknown): valor is Point3 {
  return (
    Array.isArray(valor) &&
    valor.length === 3 &&
    valor.every((n) => typeof n === "number" && isFinite(n))
  );
}

/** Lee la cámara de una vista compartida. Es la misma forma que escribe `camaraBcfDesdeEscena`. */
function leerCamara(valor: unknown): BcfCamera | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;

  const tipo = bruto.tipo;
  if (tipo !== "perspectiva" && tipo !== "ortogonal") return null;
  if (!esPunto(bruto.punto) || !esPunto(bruto.direccion) || !esPunto(bruto.arriba)) return null;

  const comun = { punto: bruto.punto, direccion: bruto.direccion, arriba: bruto.arriba };

  if (tipo === "ortogonal") {
    // **Una ortogonal sin alto de vista no se puede reproducir**: la posición dice desde dónde se
    // mira y nada dice cuánto se ve. Sin eso, la vista compartida encuadraría otra cosa.
    const escala = bruto.escala;
    if (typeof escala !== "number" || !isFinite(escala) || escala <= 0) return null;
    return { tipo, ...comun, escala };
  }

  const campo = bruto.campoVisual;
  return {
    tipo,
    ...comun,
    ...(typeof campo === "number" && isFinite(campo) && campo > 0 && campo < 180
      ? { campoVisual: campo }
      : {}),
  };
}

function leerVisibilidad(valor: unknown): VisibilidadBcf | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;

  if (typeof bruto.porDefecto !== "boolean") return null;
  if (!Array.isArray(bruto.excepciones)) return null;
  const excepciones = bruto.excepciones.filter(
    (g): g is string => typeof g === "string" && g !== "",
  );

  // Sin excepciones, el lado `false` apagaría el modelo entero. Ver `visibilidad.ts`.
  if (excepciones.length === 0) return null;
  return { porDefecto: bruto.porDefecto, excepciones };
}

function leerCortes(valor: unknown): readonly CorteIfc[] {
  if (!Array.isArray(valor)) return [];

  const cortes: CorteIfc[] = [];
  for (const bruto of valor.slice(0, MAXIMO_CORTES)) {
    if (typeof bruto !== "object" || bruto === null) continue;
    const { normal, origen } = bruto as Record<string, unknown>;
    if (!esPunto(normal) || !esPunto(origen)) continue;
    cortes.push({ normal, origen });
  }
  return cortes;
}

/**
 * Lee una vista compartida de lo que devuelva el servidor, o `null`.
 *
 * **Lo que llega por la red se lee con la misma desconfianza que el almacenamiento del navegador.**
 * No es paranoia sobre el servidor: es que una vista guardada hace meses puede venir de una versión
 * anterior del formato, y aplicar media vista deja la pantalla en un sitio que nadie eligió.
 *
 * Exige lo imprescindible —nombre y cámara— y es tolerante con el resto: una vista sin cortes es una
 * vista sin cortes, no una vista corrupta.
 */
export function leerVistaCompartida(valor: unknown): VistaCompartida | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;

  const nombre =
    typeof bruto.nombre === "string" ? bruto.nombre.trim().slice(0, NOMBRE_MAXIMO) : "";
  if (nombre === "") return null;

  const camara = leerCamara(bruto.camara);
  if (camara === null) return null;

  return {
    nombre,
    camara,
    visibilidad: leerVisibilidad(bruto.visibilidad),
    cortes: leerCortes(bruto.cortes),
  };
}
