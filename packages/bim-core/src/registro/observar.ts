/**
 * El enlace que lleva de un elemento del modelo a una observación del registro: `F4.1`.
 *
 * **Por qué esto es del dominio y no de la interfaz.** La URL es un contrato con el servidor: los
 * nombres de los parámetros —`revision`, `guid`, `titulo`— los lee `NuevaObservacionView.ancla_pedida`
 * en el otro lado, y un cambio de nombre acá rompe el ancla **en silencio**: el formulario se abre
 * igual, sin GUID, y la observación queda diciendo «algo en este modelo». Un contrato que se puede
 * romper sin que nada se queje es exactamente lo que hay que probar.
 *
 * Y lo que decide si el enlace existe también es una regla, no una condición de dibujo: hay tres
 * motivos distintos por los que no hay dónde anotar un hallazgo, y los tres significan **que el
 * enlace no existe**, no que esté deshabilitado. Un botón gris que no dice por qué está gris manda
 * a buscar el error donde no está.
 */

import type { BcfCamera } from "./viewpoint.js";

/** De qué revisión del registro salió el modelo que está abierto. */
export interface RegistryOrigin {
  /** La revisión abierta. Es a lo que queda anclada la observación. */
  readonly revisionId: string;
  /** El entregable del que cuelga. El formulario vive bajo él, no bajo la revisión. */
  readonly entregableId: string;
  /**
   * La obra, para poder volver a ella.
   *
   * **Sin esto el visor es un callejón sin salida**: se entra desde el registro y la única salida
   * es el botón de atrás del navegador. Son opcionales porque un modelo abierto del disco no tiene
   * ninguno, y entonces no hay a dónde volver — que es distinto de que el enlace esté roto.
   */
  readonly proyectoId?: string;
  readonly proyectoCodigo?: string;
  readonly entregableCodigo?: string;
  readonly revisionCorrelativo?: string;
  /**
   * `true` si este usuario puede abrir observaciones.
   *
   * **Lo contesta el servidor**, que es el único que puede: depende de `add_observacion` y de la
   * organización. Llega en los metadatos de la revisión.
   */
  readonly puedeObservar: boolean;
}

/** Lo que se sabe del elemento seleccionado, reducido a lo que el enlace necesita. */
export interface ObservableElement {
  /** GUID de IFC ya validado, o `null` si el elemento no trae uno. */
  readonly guid: string | null;
  readonly category: string | null;
  readonly name: string | null;
}

/** Tope del título que acepta el formulario del registro. Más allá, el servidor lo recorta. */
const TITULO_MAXIMO = 250;

/** Un sitio del registro al que el visor puede volver, con su etiqueta ya resuelta. */
export interface Vuelta {
  readonly etiqueta: string;
  readonly href: string;
}

/**
 * Los sitios del registro a los que se puede volver desde el visor, de lo general a lo concreto.
 *
 * **Es lo que saca al visor de ser un callejón sin salida.** Se entraba desde el expediente de una
 * revisión y la única salida era el botón de atrás del navegador — que además pierde el modelo
 * cargado, veinte megas y medio minuto de conversión.
 *
 * Devuelve una lista vacía cuando el modelo se abrió de un archivo del disco: **no hay a dónde
 * volver**, y eso es distinto de un enlace roto. La cabecera simplemente no se dibuja.
 *
 * Las rutas son las mismas de `urls.py` del otro lado, así que esto es un contrato — el mismo
 * motivo por el que {@link urlDeNuevaObservacion} vive acá y no en el componente.
 */
export function rutasDeVuelta(origin: RegistryOrigin | null): Vuelta[] {
  if (origin === null) return [];

  const salida: Vuelta[] = [];
  if (origin.proyectoId !== undefined && origin.proyectoCodigo !== undefined) {
    salida.push({
      etiqueta: origin.proyectoCodigo,
      href: `/proyectos/${origin.proyectoId}/`,
    });
  }
  if (origin.entregableCodigo !== undefined) {
    salida.push({
      etiqueta: origin.entregableCodigo,
      href: `/documentos/entregables/${origin.entregableId}/`,
    });
  }
  return salida;
}

/**
 * Cómo se llama lo que está abierto: `716-LCD-ES-M-001 rev. A1`, o cadena vacía si no se sabe.
 *
 * Se separa de {@link rutasDeVuelta} porque **la revisión no tiene pantalla propia**: es una
 * etiqueta, no un destino. Ponerla como enlace llevaría al expediente, que ya está en la lista, y
 * dos enlaces al mismo sitio en la misma línea es una promesa que no se cumple.
 */
export function nombreDeLoAbierto(origin: RegistryOrigin | null): string {
  if (origin === null) return "";
  return [
    origin.entregableCodigo,
    origin.revisionCorrelativo && `rev. ${origin.revisionCorrelativo}`,
  ]
    .filter((parte): parte is string => typeof parte === "string" && parte !== "")
    .join(" ");
}

/**
 * El título propuesto para la observación: la categoría y el nombre del elemento.
 *
 * Es lo que quien abre la observación tendría que escribir a mano mirando la ficha, y es editable en
 * el formulario. Se propone y no se impone.
 */
export function tituloPropuesto(element: ObservableElement): string {
  return [element.category, element.name]
    .filter((parte): parte is string => typeof parte === "string" && parte.trim() !== "")
    .join(" · ")
    .slice(0, TITULO_MAXIMO);
}

/**
 * A dónde lleva «Observar este elemento», o `null` si no lleva a ninguna parte.
 *
 * Devuelve `null` en tres casos:
 *
 * 1. **El modelo no vino del registro** (`origin === null`): se abrió arrastrando un archivo, y no
 *    hay entregable donde colgar la observación.
 * 2. **El rol no puede abrirlas**: ofrecer un enlace que termina en 403 enseña a probar puertas.
 * 3. **El elemento no trae GUID válido**: un ancla sin identidad no apunta a nada. Es el caso menos
 *    obvio y el que más importa — el GUID es lo único estable entre versiones del modelo y entre
 *    herramientas, y es lo que después selecciona la viga en Solibri.
 */
export function urlDeNuevaObservacion(
  origin: RegistryOrigin | null,
  element: ObservableElement | null,
  camera: BcfCamera | null = null,
): string | null {
  if (origin === null || !origin.puedeObservar) return null;
  if (element === null || element.guid === null) return null;

  // **Cada valor escapado, uno por uno.** No es adorno: un GUID de IFC usa `$` en su alfabeto y un
  // nombre de elemento puede traer `&` —«Muro básico & tabique» es un nombre real de Revit—, y
  // pegado a mano ese `&` inventaría un parámetro y partiría el título en dos.
  //
  // Se escribe con `encodeURIComponent` y no con `URLSearchParams` porque este paquete es dominio
  // puro: se prueba en Node sin DOM, y una API del navegador acá lo ataría a él.
  const partes = [
    `revision=${encodeURIComponent(origin.revisionId)}`,
    `guid=${encodeURIComponent(element.guid)}`,
  ];
  const titulo = tituloPropuesto(element);
  if (titulo !== "") partes.push(`titulo=${encodeURIComponent(titulo)}`);

  // **La cámara es opcional y su ausencia no es un fallo.** `camaraBcfDesdeEscena` devuelve `null`
  // para las cámaras que no se pueden reproducir, y una observación sin cámara sigue valiendo: el
  // BCF sale con el elemento seleccionado, que es lo que hacía `F4.4` antes de que esto existiera.
  //
  // Viaja como JSON en un parámetro y no como seis números sueltos porque **es un solo dato**: media
  // cámara —posición sin dirección— no se puede dibujar, y con parámetros separados el servidor
  // tendría que comprobar que llegaron todos. Así, o está o no está.
  if (camera !== null) {
    partes.push(`camara=${encodeURIComponent(JSON.stringify(camera))}`);
  }

  // **La visibilidad (`F4.7`) no viaja por acá, y es una decisión.** Una cámara son doscientos
  // caracteres; la visibilidad puede ser una lista de miles de GUID, y los navegadores y los proxys
  // cortan las URL largas **sin avisar** — la observación se abriría con media lista y describiría
  // una pantalla que nadie vio. Va por el cuerpo del POST, que es el camino de la tarjeta flotante;
  // este enlace abre el formulario de página completa, y esa nota sale sin restricción de
  // visibilidad, que es lo mismo que hacía antes de que `F4.7` existiera.

  return `/documentos/entregables/${origin.entregableId}/observar/?${partes.join("&")}`;
}
