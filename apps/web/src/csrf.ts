/**
 * El testigo CSRF, para poder escribir en el registro desde el visor.
 *
 * **El SPA nunca había hecho un `POST`**: todo lo que escribía pasaba por un formulario de Django,
 * que trae su testigo en un campo oculto. Al dejar una nota sin salir del visor eso deja de valer, y
 * Django rechaza el `POST` con un 403 **sin decir que fue el CSRF** si el testigo no viaja.
 *
 * Se lee de la cookie porque es de donde Django espera que se lea: `CSRF_USE_SESSIONS` está en su
 * valor por defecto, así que el testigo va en la cookie `csrftoken` y se devuelve en la cabecera
 * `X-CSRFToken`. Los dos nombres los fija Django y **no se inventan aquí**.
 */

/** El nombre de la cookie que Django escribe. Cambiarlo exige cambiarlo también en los ajustes. */
const COOKIE = "csrftoken";

/** Y el de la cabecera que Django lee. */
export const CABECERA_CSRF = "X-CSRFToken";

/**
 * El testigo, o cadena vacía si no hay cookie.
 *
 * **Vacío no es un error que haya que gritar acá**: pasa si la sesión caducó, y lo que corresponde
 * entonces es que el servidor conteste 403 y quien llama lo diga como «vuelve a entrar». Inventar
 * un testigo o lanzar desde acá solo movería el mensaje a un sitio peor.
 */
export function testigoCsrf(): string {
  for (const trozo of document.cookie.split(";")) {
    const [nombre, ...resto] = trozo.trim().split("=");
    if (nombre === COOKIE) return decodeURIComponent(resto.join("="));
  }
  return "";
}

/** Las cabeceras de un `POST` con JSON al registro, con el testigo puesto. */
export function cabecerasDeEscritura(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    [CABECERA_CSRF]: testigoCsrf(),
  };
}
