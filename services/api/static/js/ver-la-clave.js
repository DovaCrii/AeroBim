/*
 * El ojo para ver lo que se está escribiendo en un campo de contraseña.
 *
 * ## Por qué hacía falta
 *
 * AeroBim reparte **claves generadas**: dieciséis caracteres con mayúsculas, minúsculas y dígitos,
 * que llegan por WhatsApp o dictadas por teléfono porque todavía no hay SMTP. Se teclean a ciegas,
 * y si sale mal el único mensaje es «usuario o contraseña incorrectos» —genérico a propósito, para
 * no confirmar qué usuarios existen—. Así que quien se equivoca en un carácter no sabe si falló al
 * copiar, si le pasaron mal la clave o si la cuenta no existe.
 *
 * Y a los cinco intentos `axes` bloquea la cuenta. O sea que un dedo torpe en una clave que **no se
 * puede leer** acaba en una llamada para que alguien reinicie la contraseña.
 *
 * Es además la primera pantalla que ve cada persona del equipo, y la ve con una clave que no eligió.
 *
 * ## Por qué el botón lo crea este archivo y no la plantilla
 *
 * **Porque si este archivo no llega, un botón muerto es peor que ningún botón.** La CSP sirve
 * `script-src 'self'` sin `'unsafe-inline'` (`apps/core/middleware.py`), así que el JavaScript vive
 * en archivos como este; y un archivo puede no llegar —una caché rara, un bloqueador, un
 * `collectstatic` a medias—. Con el botón escrito en la plantilla, el ojo estaría ahí y no haría
 * nada al pulsarlo, que es la forma de fallo que enseña a desconfiar de la pantalla.
 *
 * Creándolo aquí, sin el archivo **no hay ojo** y el campo funciona exactamente como siempre.
 * Es la misma lección que dejaron los `onchange` en línea: ver `filtros.js`.
 *
 * ## Tres detalles que no son de estilo
 *
 * 1. **`type="button"`.** Dentro de un `<form>`, un `<button>` sin tipo **envía el formulario**: el
 *    ojo intentaría entrar con la clave a medio escribir y gastaría un intento de los cinco.
 * 2. **`aria-pressed` y no solo el dibujo.** Es un interruptor, y quien navega con lector de
 *    pantalla necesita oír en qué estado está, no que hay un botón llamado «ojo».
 * 3. **El foco vuelve al campo.** Si no, después de mirar la clave hay que volver a pinchar dentro
 *    para seguir escribiendo — y con el teclado, tabular hacia atrás.
 */
(function () {
  "use strict";

  // Los dos dibujos, en línea y no como `<use>` del sprite: este botón lo crea el script y el
  // sprite vive en la plantilla, así que depender de él ataría dos cosas que pueden no coincidir.
  // Son los mismos trazos que `i-ojo` e `i-ojo-tachado` de `generic/_iconos.html`.
  var OJO =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M1.8 12S5.4 5.5 12 5.5 22.2 12 22.2 12 18.6 18.5 12 18.5 1.8 12 1.8 12z"/>' +
    '<circle cx="12" cy="12" r="3.2"/></svg>';
  var OJO_TACHADO =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M3 3l18 18"/>' +
    '<path d="M9.5 6C10.3 5.7 11.1 5.5 12 5.5c6.6 0 10.2 6.5 10.2 6.5s-1 1.9-2.9 3.6"/>' +
    '<path d="M16.4 17.4c-1.3.7-2.7 1.1-4.4 1.1-6.6 0-10.2-6.5-10.2-6.5s1.4-2.6 3.9-4.4"/>' +
    '<path d="M10 10.2a2.8 2.8 0 0 0 3.9 3.9"/></svg>';

  function pintar(boton, visible) {
    // **El símbolo dice a qué se va, no en qué se está.** Un interruptor que muestra el estado
    // actual se lee al revés la mitad de las veces; es la misma regla que el botón de tema.
    boton.innerHTML = visible ? OJO_TACHADO : OJO;
    boton.setAttribute("aria-pressed", visible ? "true" : "false");
    var etiqueta = visible ? "Ocultar la contraseña" : "Ver la contraseña";
    boton.setAttribute("aria-label", etiqueta);
    boton.setAttribute("title", etiqueta);
  }

  function ponerElOjo(campo) {
    if (campo.dataset.conOjo === "si") return;
    campo.dataset.conOjo = "si";

    var caja = document.createElement("div");
    caja.className = "campo-con-ojo";
    campo.parentNode.insertBefore(caja, campo);
    caja.appendChild(campo);

    // **El margen del campo pasa a la caja, y esto no es maquillaje: sin ello el ojo se sale.**
    //
    // Medido en la puerta: el campo lleva `margin-bottom: 16px`, así que la caja recién creada mide
    // **58 px de alto cuando el campo mide 42** — el margen queda dentro—. El botón se dimensiona
    // contra la caja, y salía de 56: dieciséis píxeles asomando por debajo del campo.
    //
    // Se hace aquí y no en el CSS porque cada pantalla le da su propio margen al campo, y una regla
    // que lo pisara —`margin: 0` en `.campo-con-ojo > input`— aplastaría el espaciado de todas.
    // Moviéndolo, la caja queda **exactamente del tamaño del campo** y el ojo puede fiarse de ella.
    //
    // **Los cuatro lados, no el atajo `margin`.** `getComputedStyle(x).margin` devuelve la cadena
    // vacía en cuanto los cuatro no coinciden —es un atajo, y el estilo *calculado* solo lo resuelve
    // cuando se puede resumir—. Escrito con el atajo, esto no movía nada y el ojo seguía saliéndose:
    // medido, 56 px de botón sobre un campo de 42.
    var estilo = window.getComputedStyle(campo);
    var lados = ["marginTop", "marginRight", "marginBottom", "marginLeft"];
    for (var i = 0; i < lados.length; i++) {
      caja.style[lados[i]] = estilo[lados[i]];
      campo.style[lados[i]] = "0px";
    }

    var boton = document.createElement("button");
    boton.type = "button";
    boton.className = "ojo";
    pintar(boton, false);
    caja.appendChild(boton);

    boton.addEventListener("click", function () {
      var visible = campo.type === "text";
      campo.type = visible ? "password" : "text";
      pintar(boton, !visible);
      campo.focus();
    });
  }

  function barrer() {
    var campos = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < campos.length; i++) ponerElOjo(campos[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", barrer);
  } else {
    barrer();
  }
})();
