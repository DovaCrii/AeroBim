/**
 * El tema del visor: claro u oscuro, con la **misma clave que el portal**.
 *
 * ## Por qué la clave es la del portal, y en español
 *
 * `localStorage["aerobim:tema"]`, con los valores `"claro"` y `"oscuro"`. No son los nombres que
 * uno elegiría escribiendo esto de cero —`light` / `dark` serían lo natural en un archivo en
 * inglés— y **se usan porque el portal llegó primero** (`services/api/static/js/tema.js`). Con dos
 * claves distintas, cruzar del expediente al modelo cambiaría de tema a mitad de un gesto, que es
 * exactamente la costura que `F12.8` viene a arreglar.
 *
 * Es una preferencia **de este equipo** y no del perfil: la pantalla del taller y el portátil de
 * casa no se miran igual, así que guardarla en el servidor la impondría en los dos.
 *
 * ## El atributo es el contrario que en el portal, y es coherente
 *
 * Aquí se pone `data-theme="light"` y allí `data-theme="dark"`: **cada uno marca su excepción.** El
 * visor parte de oscuro porque el lienzo lo es, el portal parte de claro, y los dos leen la misma
 * clave. Si los dos marcaran lo mismo, uno de los dos tendría que declarar su propio tema de
 * partida en el atributo, y entonces «sin atributo» dejaría de significar nada.
 */

const CLAVE = "aerobim:tema";

export type Tema = "claro" | "oscuro";

/** El tema de partida del visor. El lienzo es oscuro; una interfaz clara alrededor cansa. */
export const POR_DEFECTO: Tema = "oscuro";

/**
 * Lo guardado, o el de partida.
 *
 * **En `try`/`catch` porque un navegador con el almacenamiento bloqueado lanza al _leer_**, no al
 * escribir. Sin la guarda, el visor entero se queda sin arrancar por una preferencia — es la misma
 * lección que ya está escrita en `tema.js` del portal.
 */
export function temaGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE) === "claro" ? "claro" : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

/** Pone el atributo en la raíz. Sin atributo es oscuro, que es el de partida. */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === "claro") raiz.setAttribute("data-theme", "light");
  else raiz.removeAttribute("data-theme");
}

/** Guarda y aplica. Devuelve el que quedó puesto, para que quien llame no tenga que suponerlo. */
export function cambiarTema(tema: Tema): Tema {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento el tema no sobrevive a la recarga, y eso es aceptable: lo que no es
    // aceptable es que no se pueda cambiar en esta sesión.
  }
  aplicarTema(tema);
  return tema;
}
