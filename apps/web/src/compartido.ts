/**
 * El visor abierto **desde un enlace compartido**, sin cuenta.
 *
 * Es el único modo en el que el visor no habla con `/api/`: quien entra así no tiene sesión, así
 * que todas esas rutas le responderían 401. Habla con `/compartido/<testigo>/…`, que sirve una
 * sola revisión y nada más.
 *
 * **El testigo sale de la ruta y no de la cadena de consulta.** Un `?t=…` se pierde al copiar el
 * enlace desde algunos clientes de correo, que recortan por el `?` al detectar la URL, y el fallo
 * aparece en la máquina de alguien ajeno a la obra — que no puede diagnosticarlo ni contárnoslo
 * bien. En la ruta viaja entero o no viaja.
 */

/** La forma del testigo: lo que produce `secrets.token_urlsafe(32)` en el servidor. */
const FORMA = /^[A-Za-z0-9_-]{40,64}$/;

/**
 * El testigo del enlace por el que se entró, o `null` si esta no es una sesión compartida.
 *
 * Se comprueba la forma antes de devolverlo: cualquier cosa en la ruta no tiene por qué
 * convertirse en una petición al servidor.
 */
export function testigoCompartido(): string | null {
  const ruta = globalThis.location?.pathname ?? "";
  const partes = ruta.split("/").filter(Boolean);
  if (partes[0] !== "compartido" || partes.length < 2) return null;
  const testigo = partes[1] ?? "";
  return FORMA.test(testigo) ? testigo : null;
}

/** Lo que devuelve `/compartido/<testigo>/ficha/`. */
export interface FichaCompartida {
  readonly compartido: true;
  readonly para: string;
  readonly expiraEn: string;
  readonly nombre: string;
  /**
   * El nombre del archivo **que sirve `contenido`**, que no siempre es `nombre`.
   *
   * Un DWG se abre por su DXF convertido: los bytes son de DXF y el nombre original dice `.dwg`.
   * Como el visor elige el lector por la extensión, abrirlo por `nombre` mandaría ese DXF al lector
   * de IFC y el WebAssembly se caería sin decir de qué archivo habla.
   */
  readonly nombreParaElVisor: string;
  readonly visor: string | null;
  readonly correlativo: string;
  readonly idoneidad: string;
  readonly idoneidadTexto: string;
  readonly sha256: string;
  readonly tamanoBytes: number;
  readonly entregable: { readonly codigo: string; readonly titulo: string };
  readonly proyecto: { readonly codigo: string; readonly nombre: string };
  readonly puedeObservar: false;
  readonly puedeDescargar: false;
  readonly contenido: string;
}

/**
 * Pide la ficha del enlace.
 *
 * **Los tres motivos por los que puede fallar se contestan igual desde el servidor** —testigo
 * inventado, caducado o revocado son todos un 404— así que aquí tampoco se intenta distinguirlos:
 * el mensaje dice lo único que se sabe y lo que la persona puede hacer, que es pedir otro.
 */
export async function pedirFicha(testigo: string): Promise<FichaCompartida> {
  const respuesta = await fetch(`/compartido/${testigo}/ficha/`, {
    headers: { Accept: "application/json" },
  });
  if (!respuesta.ok) {
    throw new Error(
      "Este enlace ya no sirve. Puede haber caducado o haberse cerrado. " +
        "Pídele otro a quien te lo envió.",
    );
  }
  return (await respuesta.json()) as FichaCompartida;
}
