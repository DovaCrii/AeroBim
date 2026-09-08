/*
 * Un desplegable de filtro que envía su formulario al cambiar.
 *
 * **Existe porque la CSP prohíbe el JavaScript en línea.** `apps/core/middleware.py` sirve
 * `script-src 'self'` sin `'unsafe-inline'`, así que los tres `onchange="this.form.submit()"` que
 * había en `observaciones.html` **no corrían en producción**: funcionaban en desarrollo —donde la
 * cabecera va igual, pero el navegador la aplica al archivo servido y no al inline de la página en
 * el mismo grado— y en el servidor de verdad el navegador los bloqueaba en silencio.
 *
 * Es la peor forma de romper algo: se prueba, funciona, y se despliega sin un mensaje. Lo salvaba
 * el botón «Filtrar», que estaba puesto como respaldo sin que nadie supiera que era el único
 * camino. Ahora hay una prueba que prohíbe los manejadores en línea en cualquier plantilla
 * (`test_plantillas.py`).
 *
 * **El botón «Filtrar» se queda de todas formas**, y no es redundante: es lo que hace que esto
 * funcione sin JavaScript. Un filtro que solo se aplica con un script no se aplica en un navegador
 * con scripts desactivados ni si este archivo no llega.
 */
(function () {
  "use strict";

  document.addEventListener("change", function (evento) {
    var control = evento.target;
    if (!control.matches || !control.matches("[data-envia-al-cambiar]")) return;
    var formulario = control.form;
    if (formulario === null) return;
    // `requestSubmit` y no `submit`: `submit()` **se salta la validación** del formulario y los
    // eventos de envío. Aquí no hay campos obligatorios, pero elegir el que respeta las reglas
    // evita que el día que los haya esto los ignore sin avisar.
    if (typeof formulario.requestSubmit === "function") {
      formulario.requestSubmit();
    } else {
      formulario.submit();
    }
  });
})();
