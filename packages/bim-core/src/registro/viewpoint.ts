/**
 * La cámara de una observación, del sistema del visor al del IFC: la otra mitad de `F4.1`.
 *
 * **El problema es que los dos sistemas no son el mismo.** La escena del visor tiene el eje **Y**
 * hacia arriba —así trabaja Three.js— y el IFC tiene **Z**. Un BCF que llevara la posición sin
 * convertir abre en Solibri mirando de lado o bajo tierra, y eso es peor que un BCF sin cámara:
 * afirma algo falso. Por eso `F4.4` no exportaba ninguna hasta que esto existiera.
 *
 * **La transformación no se inventa acá: ya estaba en el repositorio, y comprobada.**
 * [grid.ts:61](../../../viewer/src/grid.ts) dibuja los ejes de replanteo leyendo las coordenadas del
 * IFC y poniéndolas en la escena como `(x, 0, -y)` con la cota en Y, y **los ejes caen sobre el
 * modelo**: si la transformación fuera otra, las letras de los ejes aparecerían a noventa grados o
 * en el sitio equivocado, que es justo lo que se ve cuando se equivoca. La misma la usa el plano DXF
 * de referencia, que calza con el modelo con error de milímetros.
 *
 * De ahí sale el mapeo, en los dos sentidos:
 *
 * | escena (Three.js) | IFC        |
 * | ----------------- | ---------- |
 * | `x`               | `x`        |
 * | `y` (arriba)      | `z` (cota) |
 * | `z`               | `-y`       |
 *
 * **Y el vector «arriba» no se adivina: se lee.** La tentación es asumir que arriba es el eje
 * vertical, y con la cámara en planta —mirando recto hacia abajo, que es el caso más común porque es
 * lo que hace el Modo 2D— eso no vale: la vertical es paralela a la dirección de vista y no puede
 * ser el «arriba» de la imagen. El giro real de la cámara sí se conoce, sale de su cuaternión, y
 * quien la lee lo pasa. Así no hay convención que elegir ni caso degenerado que resolver a dedo.
 */

import type { Point3 } from "../measure/geometry.js";

/** Cómo se proyecta la vista. Los mismos dos casos que distingue BCF. */
export type BcfCameraKind = "perspectiva" | "ortogonal";

/**
 * La cámara tal como la ve el visor: **coordenadas de la escena**, con Y hacia arriba.
 *
 * `up` es el «arriba» de la imagen, ya girado — no el eje vertical del mundo.
 */
export interface SceneCameraState {
  readonly position: Point3;
  readonly target: Point3;
  readonly up: Point3;
  readonly kind: BcfCameraKind;
  /**
   * Alto de la vista en metros, y **solo para la ortogonal**.
   *
   * Es el `ViewToWorldScale` de BCF: cuánto mundo entra de arriba abajo en la imagen. Una cámara
   * ortogonal sin él no se puede reproducir —la posición dice desde dónde se mira y nada dice cuánto
   * se ve—, así que si falta, la cámara no se exporta.
   */
  readonly viewHeightM?: number;
  /** Campo visual vertical en grados, y solo para la perspectiva. */
  readonly fieldOfViewDeg?: number;
}

/**
 * La cámara en el sistema del IFC, con los campos que escribe un viewpoint de BCF.
 *
 * **Se guarda ya convertida, a propósito.** Es el sistema del modelo, que es el que entiende
 * cualquiera que reciba el archivo; guardar las coordenadas de nuestra escena metería una
 * convención interna del visor en la base de datos, y el día que el visor cambie de librería
 * quedarían mintiendo.
 */
export interface BcfCamera {
  readonly tipo: BcfCameraKind;
  /** `CameraViewPoint`: dónde está la cámara, en metros. */
  readonly punto: Point3;
  /** `CameraDirection`: a dónde mira, normalizado. */
  readonly direccion: Point3;
  /** `CameraUpVector`: el «arriba» de la imagen, normalizado y perpendicular a la dirección. */
  readonly arriba: Point3;
  /** `FieldOfView` en grados. Solo en la perspectiva. */
  readonly campoVisual?: number;
  /** `ViewToWorldScale` en metros. Solo en la ortogonal. */
  readonly escala?: number;
}

/** Precisión con la que se guarda una posición: el milímetro. Más dígitos son ruido del float. */
const DECIMALES_POSICION = 3;
/** Precisión de un vector unitario. Seis decimales son 0,00006° de error angular. */
const DECIMALES_DIRECCION = 6;

/** Bajo esto, un vector es cero y no define ninguna dirección. */
const EPSILON = 1e-9;

/** Del sistema de la escena al del IFC. Ver la tabla del docstring del módulo. */
export function escenaAIfc([x, y, z]: Point3): Point3 {
  return [x, -z, y];
}

/** Del sistema del IFC al de la escena. Es la inversa exacta de {@link escenaAIfc}. */
export function ifcAEscena([x, y, z]: Point3): Point3 {
  return [x, z, -y];
}

function resta(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function largo([x, y, z]: Point3): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function producto(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Normaliza, o `null` si el vector es cero: no hay dirección que devolver. */
function normalizar(v: Point3): Point3 | null {
  const norma = largo(v);
  if (norma < EPSILON) return null;
  return [v[0] / norma, v[1] / norma, v[2] / norma];
}

function redondear(v: Point3, decimales: number): Point3 {
  const factor = 10 ** decimales;
  return [
    Math.round(v[0] * factor) / factor,
    Math.round(v[1] * factor) / factor,
    Math.round(v[2] * factor) / factor,
  ];
}

/**
 * La cámara del visor, lista para escribir en un viewpoint de BCF. `null` si no se puede.
 *
 * Devuelve `null` en tres casos, y **ninguno es un error del que avisar**: son cámaras que no se
 * pueden reproducir, y para ellas el BCF sale con el elemento seleccionado y sin cámara, que es
 * exactamente lo que hacía antes de existir esta función.
 *
 * 1. **La cámara y su objetivo son el mismo punto**: no hay dirección de vista.
 * 2. **El «arriba» es paralelo a la dirección**: es una cámara imposible, y suele significar que
 *    quien la leyó pasó el eje vertical del mundo en vez del giro real.
 * 3. **Una ortogonal sin alto de vista**: la posición diría desde dónde se mira y nada diría cuánto
 *    se ve, así que el otro extremo tendría que inventar el encuadre.
 */
export function camaraBcfDesdeEscena(estado: SceneCameraState): BcfCamera | null {
  const direccion = normalizar(escenaAIfc(resta(estado.target, estado.position)));
  if (direccion === null) return null;

  const arribaCrudo = normalizar(escenaAIfc(estado.up));
  if (arribaCrudo === null) return null;

  // **Se ortogonaliza contra la dirección**, no se copia tal cual. BCF pide que `CameraUpVector` sea
  // perpendicular a `CameraDirection`, y el `up` de una cámara real puede venir con un residuo
  // numérico que no lo es. Si al quitarle la componente paralela no queda nada, era paralelo: no hay
  // cámara que exportar.
  const escala = producto(arribaCrudo, direccion);
  const arriba = normalizar([
    arribaCrudo[0] - direccion[0] * escala,
    arribaCrudo[1] - direccion[1] * escala,
    arribaCrudo[2] - direccion[2] * escala,
  ]);
  if (arriba === null) return null;

  const comun = {
    punto: redondear(escenaAIfc(estado.position), DECIMALES_POSICION),
    direccion: redondear(direccion, DECIMALES_DIRECCION),
    arriba: redondear(arriba, DECIMALES_DIRECCION),
  };

  if (estado.kind === "ortogonal") {
    const alto = estado.viewHeightM;
    if (alto === undefined || !isFinite(alto) || alto <= 0) return null;
    return {
      tipo: "ortogonal",
      ...comun,
      escala: Math.round(alto * 1000) / 1000,
    };
  }

  // El campo visual de BCF va en grados y en vertical, igual que el de Three.js. Sin dato no se
  // inventa un valor: se omite, y quien lo lea usará el suyo.
  const fov = estado.fieldOfViewDeg;
  return {
    tipo: "perspectiva",
    ...comun,
    ...(fov !== undefined && isFinite(fov) && fov > 0 && fov < 180
      ? { campoVisual: Math.round(fov * 100) / 100 }
      : {}),
  };
}
