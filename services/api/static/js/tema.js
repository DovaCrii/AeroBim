/*
 * Claro u oscuro, recordado en este equipo.
 *
 * **Es el único JavaScript del portal**, y son treinta líneas a propósito: un archivo servido por
 * `static/` y nada más — sin CDN, sin empaquetador, sin dependencia. La regla de `AGENTS.md` es que
 * ninguna librería descarga nada de un CDN, y la forma barata de cumplirla es no necesitar ninguna.
 *
 * Se carga en el `<head>` y **se ejecuta antes de pintar**: puesto al final del cuerpo se ve un
 * destello blanco en cada carga antes de que el oscuro entre, y eso se nota en cada clic.
 */

(function () {
  var CLAVE = "aerobim:tema";

  /* En `try/catch` porque un navegador con el almacenamiento bloqueado —modo privado, o la opción
     de no guardar datos de sitios— lanza al **leer**, no al escribir. Sin la guarda, la página
     entera se queda sin pintar por una preferencia. */
  function guardado() {
    try {
      return localStorage.getItem(CLAVE);
    } catch (_) {
      return null;
    }
  }

  function recordar(tema) {
    try {
      localStorage.setItem(CLAVE, tema);
    } catch (_) {
      /* Se pierde al recargar y la página funciona igual. */
    }
  }

  /* Sin preferencia guardada **manda la del sistema**: quien tiene el equipo en oscuro no debería
     tener que decirlo otra vez acá. */
  function inicial() {
    var elegido = guardado();
    if (elegido === "claro" || elegido === "oscuro") return elegido;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "oscuro"
      : "claro";
  }

  function aplicar(tema) {
    /* Solo el oscuro lleva atributo: el claro es el de `:root`, así que quitarlo es volver al
       tema base en vez de tener dos ramas que mantener de acuerdo. */
    if (tema === "oscuro") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  aplicar(inicial());

  /* El botón vive en la barra y no existe todavía cuando esto corre: se engancha al cargar. */
  document.addEventListener("DOMContentLoaded", function () {
    var boton = document.querySelector("button.tema");
    if (!boton) return;

    function pintarBoton() {
      var oscuro = document.documentElement.getAttribute("data-theme") === "dark";
      boton.textContent = oscuro ? "☀" : "☾";
      /* El nombre accesible dice **qué va a pasar**, no en qué estado está: es lo que necesita
         quien lo oye antes de pulsar. */
      boton.setAttribute("aria-label", oscuro ? boton.dataset.aClaro : boton.dataset.aOscuro);
      boton.title = boton.getAttribute("aria-label");
    }

    boton.addEventListener("click", function () {
      var siguiente =
        document.documentElement.getAttribute("data-theme") === "dark" ? "claro" : "oscuro";
      aplicar(siguiente);
      recordar(siguiente);
      pintarBoton();
    });

    pintarBoton();
  });
})();
