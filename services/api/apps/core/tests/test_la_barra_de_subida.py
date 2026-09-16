"""**Subir 200 MB sin señal de vida es cómo se acaba subiéndolos tres veces.**

## Por qué existe

Los archivos de este producto son de obra: un IFC de 200 MB, un COPC de 130. Por una conexión de
oficina eso son **minutos**, y durante esos minutos el navegador no decía nada — la página se
quedaba quieta con el botón pulsado. Lo que hace cualquiera entonces es volver a pulsar, o cerrar
y reintentar, y **cada reintento vuelve a subir el archivo entero**.

Con el tamaño que se mueve aquí, «no sé si está pasando algo» no es una molestia de interfaz: es la
causa más probable de que una subida no termine nunca.

## Lo que estas pruebas sujetan

No que la barra se mueva —eso pide un archivo grande y un navegador, y se mira— sino **las tres
cosas que se pueden romper sin que nadie se entere**:

1. Que el guion llegue a la pantalla que sube.
2. Que el formulario **siga siendo un formulario**: si el archivo no llega, la subida tiene que
   funcionar igual, sin barra. Es la misma regla que el ojo de la contraseña.
3. Que use `XMLHttpRequest` y no `fetch`, que es lo único que informa del progreso de **subida**.
   Alguien que «modernice» esto a `fetch` deja la barra quieta en cero sin romper nada más.
"""

from pathlib import Path

from django.conf import settings

RAIZ = Path(settings.BASE_DIR)
GUION = "js/subida-con-progreso.js"


def _guion() -> str:
    return (RAIZ / "static" / GUION).read_text(encoding="utf-8")


def test_el_guion_llega_a_la_pantalla_que_sube():
    """Va en `base.html` porque la CSP prohíbe el JavaScript en línea y una plantilla no puede
    añadir un `<script>` a la cabecera. Lo que se comprueba es que **de verdad llegue**."""
    base = (RAIZ / "templates" / "base.html").read_text(encoding="utf-8")
    subir = (RAIZ / "templates" / "documents" / "subir_revision.html").read_text(encoding="utf-8")

    assert GUION in base
    assert "data-con-progreso" in subir, "el formulario de subir no pide la barra"


def test_el_formulario_sigue_siendo_un_formulario():
    """**Si el guion no llega, la subida tiene que funcionar igual.**

    Una caché rara, un bloqueador, un `collectstatic` a medias. Con el envío dependiendo del
    script, cualquiera de esas tres deja la pantalla muerta con el archivo ya elegido — y nada en
    la página lo explicaría.
    """
    subir = (RAIZ / "templates" / "documents" / "subir_revision.html").read_text(encoding="utf-8")

    assert 'method="post"' in subir
    assert 'enctype="multipart/form-data"' in subir
    assert 'type="submit"' in subir
    # Y el guion **no** es quien decide a dónde va: el `action` sale del formulario o de la URL.
    assert "formulario.action" in _guion()


def test_usa_xhr_porque_fetch_no_informa_del_progreso_de_subida():
    """**`fetch` no sirve aquí y conviene que quede escrito.**

    Su `ReadableStream` es el de la *respuesta*; lo que hace falta es cuánto del cuerpo se ha
    enviado, y eso solo lo da `XMLHttpRequest.upload.onprogress`. Es el único sitio del producto
    donde XHR sigue siendo lo correcto, así que sin esta prueba alguien lo «moderniza» a `fetch`,
    la barra se queda en cero, y **nada más se rompe** — el archivo sube igual.
    """
    guion = _guion()

    assert "XMLHttpRequest" in guion
    assert "upload" in guion and "progress" in guion


def test_el_boton_se_desactiva_mientras_sube():
    """**La barra informa; lo que impide subir dos veces los mismos 200 MB es el botón.**

    Son dos cosas distintas y la segunda es la que ahorra la subida repetida: alguien que ve la
    barra pero puede seguir pulsando, pulsa.
    """
    guion = _guion()

    assert "boton.disabled = true" in guion
    # Y se devuelve si falla la red: un error se reintenta, y dejarlo desactivado dejaría la
    # pantalla muerta con el archivo ya elegido.
    assert "boton.disabled = false" in guion


def test_dice_cuanto_lleva_y_no_solo_el_porcentaje():
    """«45 %» de un archivo que no se sabe cómo de grande es no dice cuánto queda. Con «90 de
    200 MB» sí, y es la diferencia entre esperar y volver a pulsar."""
    guion = _guion()

    assert "avance.loaded" in guion
    assert "avance.total" in guion
