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
 *
 * **Y depende de un ajuste del servidor: la cookie no puede ser `HttpOnly`.** Con
 * `CSRF_COOKIE_HTTPONLY = True` —como estuvo hasta el 2026-09-02— `document.cookie` no la ve,
 * `testigoCsrf()` devuelve cadena vacía y **todo `POST` del visor muere con 403**: la nota sobre un
 * elemento, descartar un conflicto, marcar la coordinación como vista y guardar una vista. El
 * razonamiento está en `config/settings/base.py`, y hay una prueba que lo sujeta —
 * `apps/core/tests/test_csrf_del_visor.py`— porque el cliente de pruebas de Django no comprueba
 * CSRF y por eso el gate entero pasaba en verde con las cuatro escrituras rotas.
 */

/**
 * El nombre de la cookie que Django escribe.
 *
 * **No es `csrftoken`, y el motivo no es estético.** En `p340` conviven AeroControl, AeroConvert y
 * AeroBim **bajo el mismo nombre de máquina**, con puertos distintos — y el navegador **no separa
 * las cookies por puerto**: el puerto no forma parte de su ámbito. Con el nombre de fábrica, las
 * tres aplicaciones se pisan la misma cookie.
 *
 * Con la de sesión eso echa a la gente de la otra aplicación sin ninguna señal. Con esta es peor:
 * el testigo de una valdría para la otra, así que **cada `POST` del visor moriría con un 403** que
 * no explica nada — exactamente el fallo que ya costó cuatro capacidades enteras cuando la cookie
 * era `HttpOnly`.
 *
 * Tiene que coincidir con `CSRF_COOKIE_NAME` de `config/settings/base.py`, y **hay una prueba que
 * comprueba que los dos archivos dicen lo mismo**: `apps/core/tests/test_las_cookies.py`. Sin ella,
 * cambiar uno de los dos deja el visor sin escribir y el gate en verde.
 */
const COOKIE = "aerobim_csrftoken";

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

/**
 * Qué decirle a alguien cuando el registro contesta 403, leyendo **por qué** lo contestó.
 *
 * **Tres causas distintas daban el mismo mensaje**, y por eso el mensaje no servía: «tu sesión
 * caducó o tu rol no puede abrir observaciones» se enseñaba también cuando lo que faltaba era el
 * testigo CSRF, que no es ninguna de las dos. El usuario lo vivió con un rol que **sí** podía
 * anotar, y el mensaje le mandó a buscar el problema donde no estaba.
 *
 * DRF sí las distingue en el cuerpo, así que aquí solo hay que leerlo.
 */
export function motivoDe403(cuerpo: unknown): string {
  const detalle =
    typeof cuerpo === "object" && cuerpo !== null && "detail" in cuerpo
      ? String((cuerpo as { detail?: unknown }).detail ?? "")
      : "";

  if (detalle.includes("CSRF")) {
    // No es de rol ni de sesión: es que la página está sin el testigo. Recargar lo trae.
    return "El navegador no mandó el testigo de seguridad. Recarga la página y vuelve a intentarlo.";
  }
  if (detalle.toLowerCase().includes("credenciales") || detalle.includes("credentials")) {
    return "Tu sesión caducó. Vuelve a entrar y lo que escribiste sigue aquí.";
  }
  return "Tu rol puede ver este modelo pero no escribir en el registro.";
}
