/*
 * Vacía la caché local de modelos del visor al pulsar «Salir».
 *
 * El visor guarda en IndexedDB (`apps/web/src/cache-modelos.ts`) los modelos ya convertidos. En un
 * equipo compartido de obra, la persona siguiente podría ver, con las herramientas del navegador,
 * modelos de una obra a la que no tiene acceso. Por eso, antes de enviar el cierre de sesión, se
 * borra la base entera.
 *
 * - Es JavaScript propio del origen y en archivo: la CSP no permite scripts en línea.
 * - **Nunca bloquea el cierre**: todo va en try/catch y, pase lo que pase (borrada, error, bloqueada
 *   por otra pestaña o sin respuesta en 1,5 s), el formulario se envía.
 * - El nombre de la base se repite aquí porque el portal no carga el visor; una prueba
 *   (`cache-modelos.test.ts`) comprueba que coincide con `NOMBRE_DB`.
 */
(function () {
  "use strict";
  var NOMBRE_DB = "aerobim-cache-modelos";
  var ESPERA_MAXIMA_MS = 1500;

  document.addEventListener("submit", function (evento) {
    var formulario = evento.target;
    if (
      !formulario ||
      !formulario.hasAttribute ||
      !formulario.hasAttribute("data-vaciar-cache-local")
    ) {
      return;
    }
    var enviado = false;
    function enviar() {
      if (enviado) return;
      enviado = true;
      try {
        formulario.submit();
      } catch (e) {
        // Sin el envío programático no queda más que dejar que el navegador lo repita.
        enviado = false;
      }
    }
    try {
      if (typeof indexedDB === "undefined") return;
      evento.preventDefault();
      var peticion = indexedDB.deleteDatabase(NOMBRE_DB);
      peticion.onsuccess = enviar;
      peticion.onerror = enviar;
      peticion.onblocked = enviar;
      setTimeout(enviar, ESPERA_MAXIMA_MS);
    } catch (e) {
      enviar();
    }
  });
})();
