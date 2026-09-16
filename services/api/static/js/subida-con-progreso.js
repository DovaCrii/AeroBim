/*
 * La barra de progreso al subir un archivo.
 *
 * ## Por qué hace falta, y no es cosmética
 *
 * Los archivos de este producto son de obra: un IFC de 200 MB, un COPC de 130. Por una conexión de
 * oficina eso son **minutos**, y durante esos minutos el navegador no dice nada — la página se
 * queda quieta con el botón pulsado. Lo que hace cualquiera entonces es **volver a pulsar**, o
 * cerrar y reintentar, y cada reintento vuelve a subir el archivo entero.
 *
 * Con el tamaño que se mueve aquí, «no sé si está pasando algo» no es una molestia: es la causa
 * más probable de que una subida no termine nunca.
 *
 * ## Por qué XHR y no `fetch`
 *
 * **`fetch` no informa del progreso de subida.** Su `ReadableStream` es de la *respuesta*; lo que
 * hace falta es cuánto del cuerpo se ha enviado, y eso solo lo da `XMLHttpRequest.upload.onprogress`.
 * Es el único sitio del producto donde XHR sigue siendo lo correcto.
 *
 * ## Lo que NO cambia
 *
 * **El formulario sigue siendo un formulario.** Si este archivo no llega —una caché rara, un
 * bloqueador, un `collectstatic` a medias— el `submit` normal se envía como siempre y la subida
 * funciona sin barra. Es la misma regla que el ojo de la contraseña: nada de lo que se añade aquí
 * puede ser la única forma de hacer la cosa.
 *
 * Y la respuesta la pinta el servidor igual que antes: se reemplaza el documento con lo que
 * devuelva —sea la página del expediente o el formulario con sus errores—, así que no hay una
 * segunda forma de tratar el resultado que pueda decir algo distinto de la primera.
 */
(function () {
  "use strict";

  function texto(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
    if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function preparar(formulario) {
    var caja = document.createElement("div");
    caja.className = "subida";
    caja.hidden = true;
    caja.innerHTML =
      '<div class="subida-barra"><span class="subida-relleno"></span></div>' +
      '<p class="subida-dice" role="status" aria-live="polite"></p>';
    formulario.appendChild(caja);

    var relleno = caja.querySelector(".subida-relleno");
    var dice = caja.querySelector(".subida-dice");

    formulario.addEventListener("submit", function (evento) {
      var entrada = formulario.querySelector('input[type="file"]');
      // Sin archivo elegido no hay nada que medir: que lo conteste el servidor, que es quien sabe
      // si el campo era obligatorio.
      if (!entrada || !entrada.files || entrada.files.length === 0) return;

      evento.preventDefault();
      var datos = new FormData(formulario);
      var total = entrada.files[0].size;

      var boton = formulario.querySelector('button[type="submit"]');
      // **Se desactiva el botón, y esa es la mitad que evita el reintento.** La barra informa; lo
      // que impide subir dos veces los mismos 200 MB es que el botón deje de aceptar pulsaciones.
      if (boton) {
        boton.disabled = true;
        boton.dataset.decia = boton.textContent;
        boton.textContent = boton.dataset.subiendo || "Subiendo…";
      }
      caja.hidden = false;

      var peticion = new XMLHttpRequest();
      peticion.open("POST", formulario.action || window.location.href);

      peticion.upload.addEventListener("progress", function (avance) {
        if (!avance.lengthComputable) return;
        var parte = avance.loaded / avance.total;
        relleno.style.width = Math.round(parte * 100) + "%";
        // **Los megas van además del porcentaje**, y no en su lugar: «45 %» de un archivo que no se
        // sabe cómo de grande es no dice cuánto queda. Con «90 de 200 MB» sí.
        dice.textContent =
          Math.round(parte * 100) + "% · " + texto(avance.loaded) + " de " + texto(total);
      });

      peticion.addEventListener("load", function () {
        // **El documento se reemplaza con lo que conteste el servidor**, sea el expediente o el
        // formulario con sus errores. Así no hay una segunda forma de tratar el resultado que
        // pueda decir algo distinto de la del envío normal.
        document.open();
        document.write(peticion.responseText);
        document.close();
        if (peticion.responseURL && peticion.responseURL !== window.location.href) {
          window.history.replaceState(null, "", peticion.responseURL);
        }
      });

      peticion.addEventListener("error", function () {
        // Se devuelve el botón: un error de red se reintenta, y dejarlo desactivado dejaría la
        // pantalla muerta con el archivo ya elegido.
        if (boton) {
          boton.disabled = false;
          if (boton.dataset.decia) boton.textContent = boton.dataset.decia;
        }
        relleno.style.width = "0%";
        dice.textContent = caja.dataset.fallo || "No se pudo subir. Inténtalo otra vez.";
        dice.classList.add("subida-fallo");
      });

      peticion.send(datos);
    });
  }

  function barrer() {
    var formularios = document.querySelectorAll("form[data-con-progreso]");
    for (var i = 0; i < formularios.length; i++) preparar(formularios[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", barrer);
  } else {
    barrer();
  }
})();
