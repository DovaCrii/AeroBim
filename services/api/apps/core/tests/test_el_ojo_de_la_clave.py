"""**El ojo del campo de contraseña llega a las tres pantallas que tienen uno.**

## Por qué esto es una prueba y no «ya está puesto»

Porque ya falló una vez, al escribirlo. El `<script>` se puso en `base.html` —donde viven los otros
dos del portal— y **no llegó a la puerta**: `registration/login.html` no extiende `base.html`, es
una página entera por su cuenta. Medido en el navegador: de los tres scripts del portal, en la
pantalla de entrar solo cargaba `tema.js`.

Y la puerta es justo donde más falta hace. La clave que se teclea ahí son dieciséis caracteres
generados que alguien acaba de dictar por teléfono, contra un error a propósito genérico —«usuario
o contraseña incorrectos», para no confirmar qué usuarios existen— y contra `axes`, que bloquea la
cuenta a los cinco intentos. Sin poder leer lo que uno escribe, un dedo torpe acaba en una llamada.

**El fallo no se ve**: el campo funciona, la pantalla se pinta, y lo único que pasa es que el ojo no
está. Nadie abre una incidencia por un botón que nunca vio.

## Y por qué mide también que el botón NO esté en el HTML

Porque si este archivo no llega —una caché rara, un bloqueador, un `collectstatic` a medias— un ojo
escrito en la plantilla estaría ahí **sin hacer nada al pulsarlo**, que es la forma de fallo que
enseña a desconfiar de la pantalla entera. Lo crea el script: sin script no hay ojo, y el campo se
comporta como siempre.
"""

from pathlib import Path

import pytest
from django.conf import settings

RAIZ = Path(settings.BASE_DIR)
GUION = "js/ver-la-clave.js"

#: Las plantillas que pintan un campo de contraseña. Si aparece una cuarta, se añade aquí.
CON_CLAVE = (
    "registration/login.html",
    "base.html",
)


@pytest.mark.parametrize("plantilla", CON_CLAVE)
def test_el_guion_llega_a_la_plantilla(plantilla):
    """`base.html` cubre el portal entero —cambiar la contraseña y el cambio obligatorio del primer
    día—; `login.html` va aparte porque **no la extiende**, que es el defecto que esto fija."""
    texto = (RAIZ / "templates" / plantilla).read_text(encoding="utf-8")
    assert GUION in texto, f"{plantilla} pinta un campo de contraseña y no carga {GUION}"


def test_la_puerta_no_extiende_la_base_y_por_eso_lo_lleva_aparte():
    """**La razón de que la de arriba tenga dos entradas y no una.**

    Si algún día la puerta pasara a extender `base.html`, tener el `<script>` en las dos sería
    cargarlo dos veces — y esta prueba es la que avisaría de que hay que quitar uno. Sin ella, el
    duplicado se queda para siempre porque no rompe nada.
    """
    puerta = (RAIZ / "templates" / "registration" / "login.html").read_text(encoding="utf-8")
    assert "{% extends" not in puerta, (
        "la puerta ya extiende una plantilla: mira si `ver-la-clave.js` se carga dos veces"
    )


def test_el_boton_lo_crea_el_guion_y_no_la_plantilla():
    """Sin el archivo, mejor ningún ojo que uno que no hace nada.

    Se comprueba por la ausencia en las plantillas y por la presencia en el guion: las dos mitades,
    porque solo una de ellas pasaría con el botón escrito en los dos sitios.
    """
    guion = (RAIZ / "static" / GUION).read_text(encoding="utf-8")
    assert 'createElement("button")' in guion

    for plantilla in RAIZ.joinpath("templates").rglob("*.html"):
        texto = plantilla.read_text(encoding="utf-8")
        assert 'class="ojo"' not in texto, (
            f"{plantilla.name} escribe el ojo a mano: si el guion no llega, el botón no hará nada"
        )


def test_el_guion_no_envia_el_formulario_al_pulsarlo():
    """**Dentro de un `<form>`, un `<button>` sin `type` envía el formulario.**

    O sea que el ojo intentaría entrar con la clave a medio escribir — y gastaría uno de los cinco
    intentos que `axes` concede antes de bloquear la cuenta. El botón que existe para no agotarlos
    los agotaría.
    """
    guion = (RAIZ / "static" / GUION).read_text(encoding="utf-8")
    assert 'boton.type = "button"' in guion


def test_el_ojo_dice_en_que_estado_esta():
    """Es un interruptor, y quien navega con lector de pantalla necesita oír si está pulsado — no
    que hay un botón llamado «ojo»."""
    guion = (RAIZ / "static" / GUION).read_text(encoding="utf-8")
    assert "aria-pressed" in guion
    assert "aria-label" in guion
