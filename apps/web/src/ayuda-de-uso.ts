/**
 * **La barra de ayuda de uso** (`F17.1`): qué hace cada botón del ratón y qué tecla cierra la
 * herramienta activa, según lo que la aplicación tiene puesto.
 *
 * Es lógica pura y no sabe de React: recibe un resumen del estado y devuelve una lista corta de
 * pares «gesto → efecto». **Cada tecla que nombra existe en el código** (`Esc` en `App.tsx` para
 * medir, calzar y trazar; `Intro` para cerrar un área; `←`/`→` en `BarraDeLamina`); no se inventan
 * atajos para que la ayuda quede completa, porque una ayuda que promete una tecla que no hace nada
 * es peor que no tenerla.
 */

export type ModoDeMedida = "distance" | "angle" | "area" | "perpendicular";

export interface EstadoDeAyuda {
  /** Modelos IFC abiertos. */
  readonly modelos: number;
  /** Hay algo abierto que no es un modelo (plano, nube, lámina): evita el aviso de «arrastra un archivo». */
  readonly hayOtroContenido?: boolean;
  readonly medida: ModoDeMedida | null;
  /** Calce de un plano en curso. */
  readonly calzando?: boolean;
  /** Se está marcando el eje de un perfil. */
  readonly trazandoPerfil?: boolean;
  /** Hay una lámina a pantalla completa en el visor 2D. */
  readonly laminaEnVisor?: boolean;
  /** Modo 2D (planos sobre fondo vacío) o planta del modelo. */
  readonly modo2D?: boolean;
  /** Hay planos de corte puestos. */
  readonly cortes?: boolean;
  /** Hay un elemento seleccionado. */
  readonly seleccion?: boolean;
  /** Modo de navegación de la cinta: decide qué hace arrastrar. Por defecto, órbita. */
  readonly navegacion?: "Orbit" | "Plan" | "FirstPerson";
}

export interface Ayuda {
  /** El botón o la tecla, en pocas palabras: «Clic izq.», «Esc». */
  readonly gesto: string;
  /** Lo que hace, con el verbo en tercera persona: «Selecciona». */
  readonly efecto: string;
}

const ESC_SALE: Ayuda = { gesto: "Esc", efecto: "Sale de la herramienta" };
const RUEDA: Ayuda = { gesto: "Rueda", efecto: "Acerca o aleja" };

/**
 * La lista de ayuda para un estado, **de lo más útil a lo menos**: la barra muestra solo los
 * primeros cuando no cabe todo, y por eso `Esc` va siempre entre los tres primeros cuando hay una
 * herramienta que cerrar.
 */
export function ayudaDeUso(estado: EstadoDeAyuda): readonly Ayuda[] {
  if (estado.calzando === true) {
    return [{ gesto: "Clic izq.", efecto: "Pone el punto" }, ESC_SALE, RUEDA];
  }

  if (estado.trazandoPerfil === true) {
    return [
      { gesto: "Clic izq.", efecto: "Pone un punto del eje" },
      { gesto: "Generar", efecto: "Termina el eje y crea el perfil" },
      { gesto: "Esc", efecto: "Cancela el trazado" },
      { gesto: "Arrastrar", efecto: efectoDeArrastrar(estado.navegacion) },
      RUEDA,
    ];
  }

  if (estado.laminaEnVisor === true) {
    return [
      RUEDA,
      { gesto: "← →", efecto: "Cambia de lámina" },
      { gesto: "Arrastrar", efecto: "Mueve la lámina" },
      { gesto: "Medir", efecto: "Dos clics dan la distancia en la lámina" },
      { gesto: "Esc", efecto: "Termina la medida de lámina" },
    ];
  }

  if (estado.medida !== null) {
    return medida(estado.medida);
  }

  if (estado.modelos === 0 && estado.hayOtroContenido !== true) {
    return [
      { gesto: "Arrastrar un archivo", efecto: "Abre IFC, DXF o nube (LAS/LAZ)" },
      { gesto: "Abrir", efecto: "Elige el archivo desde el diálogo" },
    ];
  }

  if (estado.modo2D === true) {
    return [
      RUEDA,
      { gesto: "Arrastrar", efecto: "Mueve la vista" },
      { gesto: "Clic izq.", efecto: "Selecciona" },
      { gesto: "Doble clic", efecto: "Abre propiedades y acerca" },
    ];
  }

  if (estado.cortes === true) {
    return [
      { gesto: "Arrastrar el plano", efecto: "Mueve el corte" },
      { gesto: "Clic izq.", efecto: "Selecciona" },
      RUEDA,
      { gesto: "Quitar", efecto: "Quita todos los cortes (cinta Modelo)" },
    ];
  }

  return [
    {
      gesto: "Clic izq.",
      efecto: estado.seleccion === true ? "Cambia la selección" : "Selecciona",
    },
    { gesto: "Doble clic", efecto: "Propiedades y acerca" },
    { gesto: "Arrastrar", efecto: efectoDeArrastrar(estado.navegacion) },
    RUEDA,
  ];
}

/** Qué hace arrastrar con el ratón en cada modo de navegación de la cinta. */
function efectoDeArrastrar(navegacion: EstadoDeAyuda["navegacion"]): string {
  if (navegacion === "Plan") return "Desplaza la vista";
  if (navegacion === "FirstPerson") return "Mira alrededor";
  return "Gira la vista";
}

function medida(modo: ModoDeMedida): readonly Ayuda[] {
  if (modo === "area") {
    return [
      { gesto: "Clic izq.", efecto: "Pone un vértice del contorno" },
      { gesto: "Intro o doble clic", efecto: "Cierra el área" },
      ESC_SALE,
      RUEDA,
    ];
  }
  const efectoDelClic: Record<Exclude<ModoDeMedida, "area">, string> = {
    distance: "Pone un punto (dos dan la distancia)",
    angle: "Pone un punto (tres dan el ángulo)",
    perpendicular: "Señala la cara y luego el punto",
  };
  return [{ gesto: "Clic izq.", efecto: efectoDelClic[modo] }, ESC_SALE, RUEDA];
}
