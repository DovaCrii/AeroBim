/**
 * La luz de revisión: qué luces lleva cada modo y dónde va la que sigue a la cámara.
 *
 * Es lógica pura —números y vectores sueltos, nada de Three.js ni del DOM— para poder probarla sin
 * navegador. `index.ts` la aplica a la escena.
 *
 * **Por qué existe.** Un IFC con colores saturados, mirado con una luz fija desde un solo lado, se
 * ve plano: las caras de un mismo color reciben lo mismo y no se lee qué está delante. La luz de
 * revisión añade una luz principal que **sigue a la cámara** (desplazada hacia arriba y a un lado),
 * de modo que cada cara se sombrea según su orientación respecto de quien mira.
 *
 * **Fidelidad.** Nada de esto cambia un color del archivo ni una propiedad: es iluminación. El modo
 * de color «neutro» sí es una vista que sustituye el color por un gris, y se dice así en su ayuda.
 */

/** Cómo se ilumina la escena. */
export type ModoDeLuz = "revision" | "uniforme";

/** De qué color se ve el modelo. `ifc` es el del archivo, sin tocarlo; `neutro` es solo una vista. */
export type ModoDeColor = "ifc" | "neutro";

export const MODOS_DE_LUZ: readonly ModoDeLuz[] = ["revision", "uniforme"];
export const MODOS_DE_COLOR: readonly ModoDeColor[] = ["ifc", "neutro"];

export const LUZ_POR_DEFECTO: ModoDeLuz = "revision";
export const COLOR_POR_DEFECTO: ModoDeColor = "ifc";

/** Vector suelto: `lib` no importa Three.js. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Intensidades y mapeo de tonos de un modo de luz. */
export interface ParametrosDeLuz {
  /** `AmbientLight`. */
  readonly ambiente: number;
  /** `HemisphereLight`: cielo arriba, suelo abajo. */
  readonly hemisferio: number;
  /** La direccional fija que proyecta las sombras. */
  readonly sol: number;
  /** La direccional que sigue a la cámara. 0 = apagada. */
  readonly principal: number;
  /** Exposición del renderizador. */
  readonly exposicion: number;
  /**
   * `neutral` es el mapeo de tonos neutro de Khronos: deja intactos los colores medios y solo
   * comprime las luces altas, así que no reinterpreta el color del IFC. `ninguno` es lo de antes.
   */
  readonly tonos: "ninguno" | "neutral";
}

/**
 * Lo de hoy: ambiente 0,25, hemisferio 0,85, sol 2,2, sin luz que siga a la cámara.
 * Son los valores que ya estaban en `index.ts` antes de este módulo.
 */
const UNIFORME: ParametrosDeLuz = {
  ambiente: 0.25,
  hemisferio: 0.85,
  sol: 2.2,
  principal: 0,
  exposicion: 1,
  tonos: "ninguno",
};

/**
 * Menos luz difusa (que es la que aplana) y más direccional: el sol fija las sombras y la principal
 * da a cada cara un valor según cómo mira a la cámara. La suma queda cerca de la de antes para que
 * el modelo no se oscurezca en total.
 */
const REVISION: ParametrosDeLuz = {
  ambiente: 0.1,
  hemisferio: 0.55,
  sol: 1.2,
  principal: 1.6,
  exposicion: 1,
  tonos: "neutral",
};

export function parametrosDeLuz(modo: ModoDeLuz): ParametrosDeLuz {
  return modo === "revision" ? REVISION : UNIFORME;
}

/** El gris de la vista neutra (`0xRRGGBB`): claro, para que el sombreado tenga rango en las dos direcciones. */
export const GRIS_NEUTRO = 0xc9ccd1;

/**
 * El color con que se ve un material en cada modo de color. `null` significa «el del archivo, no
 * tocar»: es la garantía de fidelidad de `ifc`.
 */
export function colorDeVista(modo: ModoDeColor): number | null {
  return modo === "neutro" ? GRIS_NEUTRO : null;
}

/** Cuánto sube la luz principal respecto de la línea de visión, y cuánto se desplaza a un lado. */
const ELEVACION = 0.7;
const LATERAL = 0.5;

function normalizar(v: Vec3): Vec3 {
  const largo = Math.hypot(v.x, v.y, v.z);
  return largo < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: v.x / largo, y: v.y / largo, z: v.z / largo };
}

function cruz(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Dirección **hacia la luz** (unitaria) que sigue a la cámara.
 *
 * Parte de la dirección del objetivo hacia la cámara y la empuja hacia arriba y a la derecha de
 * ella: una luz exactamente en el ojo no da relieve (todo lo que mira a la cámara queda igual de
 * claro), y una luz muy lateral deja caras negras. Con el eje vertical `Y` del mundo de la escena.
 *
 * Devuelve `null` si la cámara y el objetivo coinciden, que no tiene dirección.
 */
export function direccionDeLuzPrincipal(camara: Vec3, objetivo: Vec3): Vec3 | null {
  const atras = normalizar({
    x: camara.x - objetivo.x,
    y: camara.y - objetivo.y,
    z: camara.z - objetivo.z,
  });
  if (atras.x === 0 && atras.y === 0 && atras.z === 0) return null;

  // La derecha de la cámara. Mirando casi en vertical (planta) el producto con Y se anula: se usa
  // entonces el eje X para que la luz no salte a una dirección arbitraria.
  let derecha = normalizar(cruz({ x: 0, y: 1, z: 0 }, atras));
  if (derecha.x === 0 && derecha.y === 0 && derecha.z === 0) derecha = { x: 1, y: 0, z: 0 };
  const arriba = normalizar(cruz(atras, derecha));

  return normalizar({
    x: atras.x + ELEVACION * arriba.x + LATERAL * derecha.x,
    y: atras.y + ELEVACION * arriba.y + LATERAL * derecha.y,
    z: atras.z + ELEVACION * arriba.z + LATERAL * derecha.z,
  });
}

// --- Memoria de la elección ---------------------------------------------------------------------

const CLAVE_LUZ = "aerobim.luz";
const CLAVE_COLOR = "aerobim.colorDeVista";

function esLuz(v: unknown): v is ModoDeLuz {
  return v === "revision" || v === "uniforme";
}

function esColor(v: unknown): v is ModoDeColor {
  return v === "ifc" || v === "neutro";
}

/** Lo guardado, con valores por defecto si no hay nada, no se puede leer o es de otra versión. */
export function leerEleccion(almacen: Pick<Storage, "getItem"> | undefined): {
  readonly luz: ModoDeLuz;
  readonly color: ModoDeColor;
} {
  let luz: unknown = null;
  let color: unknown = null;
  try {
    luz = almacen?.getItem(CLAVE_LUZ);
    color = almacen?.getItem(CLAVE_COLOR);
  } catch {
    // Ventana privada o datos bloqueados: se sigue con los valores por defecto.
  }
  return {
    luz: esLuz(luz) ? luz : LUZ_POR_DEFECTO,
    color: esColor(color) ? color : COLOR_POR_DEFECTO,
  };
}

export function guardarEleccion(
  almacen: Pick<Storage, "setItem"> | undefined,
  eleccion: { readonly luz: ModoDeLuz; readonly color: ModoDeColor },
): void {
  try {
    almacen?.setItem(CLAVE_LUZ, eleccion.luz);
    almacen?.setItem(CLAVE_COLOR, eleccion.color);
  } catch {
    // Sin almacenamiento la elección dura la sesión: no es un error.
  }
}
