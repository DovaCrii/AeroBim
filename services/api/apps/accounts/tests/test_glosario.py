"""El vocabulario BIM y qué hace AeroBim con cada palabra: `F11.11`.

**Lo que hay que probar de un glosario no es que salga, es que no pueda prometer de más.** Un
glosario con dieciséis definiciones y ninguna reserva se lee como un catálogo de capacidades, y
quien lo lea va a buscar el botón de 4D. El campo que vale es `en_aerobim`, y la mitad de su valor
está en los ocho que dicen que no —que son, literalmente, la mitad—.

Así que se comprueba, por este orden:

1. **Los ocho que no están son exactamente estos ocho**, fijados por nombre. Mover uno a «sí» sin
   construirlo rompe el gate — que es justo lo que se quiere que pase.
2. **Cada enlace resuelve y está en el catálogo del portal**, el mismo guardián que la ayuda: un
   término que lleva a una pantalla retirada miente igual que un paso que lo hace.
3. **Solo los que están tienen enlace.** Un «Ir allí» debajo de un término ausente sería la
   contradicción más cara de la pantalla.
4. Y lo de la forma: los dieciséis de la lámina, sin repetir, cada uno con sus cuatro textos.
"""

import pytest
from django.urls import NoReverseMatch, reverse

from apps.accounts.glosario import GRUPOS, TERMINOS, cuantos_no_estan, terminos_por_grupo
from apps.accounts.modulos import CATALOGO

#: Los ocho que el producto **no** hace, escritos a mano. Es el corazón de esta prueba: la lista
#: existe para que pasar uno a `lo_hace=True` obligue a venir aquí y a mirar si de verdad se
#: construyó.
NO_ESTAN = {
    "LOD",
    "BEP",
    "Modelado paramétrico",
    "4D BIM",
    "5D BIM",
    "COBie",
    "AIM",
    "Gemelo digital",
}


# --- Que no pueda prometer de más ----------------------------------------------------


def test_los_que_no_estan_son_exactamente_estos():
    """**El guardián.** Un glosario que promete las dieciséis cosas convierte la ayuda en un
    folleto, y quien lo lee lo descubre buscando un botón que no existe."""
    ausentes = {uno.sigla for uno in TERMINOS if not uno.lo_hace}

    assert ausentes == NO_ESTAN
    assert cuantos_no_estan() == len(NO_ESTAN)


def test_el_que_no_esta_dice_que_hay_en_su_lugar():
    """Decir «no» a secas no ayuda a nadie: lo accionable es qué hay en su lugar o qué haría falta.

    Se mide con el largo porque una frase corta aquí es siempre un «no lo hace» pelado.
    """
    for termino in TERMINOS:
        if termino.lo_hace:
            continue
        assert len(termino.en_aerobim) > 120, termino.sigla


def test_solo_los_que_estan_llevan_a_una_pantalla():
    """Un «Ir allí» debajo de un término ausente sería la contradicción más cara de la pantalla."""
    for termino in TERMINOS:
        if not termino.lo_hace:
            assert termino.ruta is None, termino.sigla


def test_todos_los_destinos_resuelven():
    for termino in TERMINOS:
        if termino.ruta is None:
            continue
        try:
            reverse(termino.ruta)
        except NoReverseMatch:  # pragma: no cover - es el fallo que se busca
            pytest.fail(f"«{termino.sigla}» apunta a «{termino.ruta}», que no resuelve")


def test_cada_destino_esta_en_el_catalogo_del_portal():
    """El mismo guardián que la ayuda: si un módulo se quita del portal, esto deja de tener sentido
    y el gate lo dice en vez de llevar a una pantalla que ya nadie ofrece."""
    del_portal = {modulo.ruta for modulo in CATALOGO}

    for termino in TERMINOS:
        if termino.ruta is None:
            continue
        assert termino.ruta in del_portal, (
            f"«{termino.sigla}» lleva a «{termino.ruta}», que no está en el portal"
        )


# --- La forma ------------------------------------------------------------------------


def test_estan_las_dieciseis_de_la_lamina_y_sin_repetir():
    """Las dieciséis son las de la lámina que trajo el usuario el 2026-09-11."""
    siglas = [uno.sigla for uno in TERMINOS]

    assert len(siglas) == 16
    assert len(set(siglas)) == 16


def test_cada_termino_dice_que_es_y_que_hace_aerobim_con_ello():
    """`que_es` sin `en_aerobim` es la definición que ya hay en veinte sitios; el par es lo
    nuevo."""
    for termino in TERMINOS:
        assert len(termino.que_es) > 60, termino.sigla
        assert len(termino.en_aerobim) > 60, termino.sigla
        assert termino.grupo in GRUPOS, termino.sigla


def test_ningun_texto_lleva_negritas_de_markdown():
    """**Esto se vio mirando la pantalla, no leyendo el código.** La casa escribe en Markdown y aquí
    no hay Markdown: la plantilla de Django imprime el texto tal cual, así que un `**así**` sale con
    los asteriscos puestos. Con dieciséis fichas el error se cuela sin que nadie lo relea."""
    for termino in TERMINOS:
        for campo, texto in (
            ("que_es", termino.que_es),
            ("en_aerobim", termino.en_aerobim),
            ("nombre", termino.nombre),
        ):
            assert "**" not in texto, f"«{termino.sigla}» lleva negritas de Markdown en {campo}"


def test_los_grupos_salen_en_orden_y_ninguno_vacio():
    """El orden no es alfabético a propósito: un índice alfabético no enseña que el CDE y el BEP son
    la misma conversación."""
    agrupados = terminos_por_grupo()

    assert [grupo for grupo, _ in agrupados] == list(GRUPOS)
    for grupo, terminos in agrupados:
        assert terminos, grupo
    assert sum(len(terminos) for _, terminos in agrupados) == len(TERMINOS)


# --- La pantalla ---------------------------------------------------------------------


@pytest.mark.django_db
def test_el_vocabulario_solo_pide_sesion(client, proyectista):
    """Por lo mismo que la ayuda: explica el oficio, no da acceso a nada, y el rol más acotado es el
    que más lo necesita."""
    ruta = reverse("accounts:glosario")

    assert client.get(ruta).status_code == 302  # sin sesión, al login

    client.force_login(proyectista)
    respuesta = client.get(ruta)

    assert respuesta.status_code == 200
    cuerpo = respuesta.content.decode()
    for termino in TERMINOS:
        assert termino.sigla in cuerpo, termino.sigla
    # Y lo que no está sale marcado, no escondido.
    assert "no está en AeroBim" in cuerpo


@pytest.mark.django_db
def test_se_llega_desde_como_se_usa(client, proyectista):
    """Es material de lectura y se busca desde «cómo se usa», no desde el rail."""
    client.force_login(proyectista)

    ayuda = client.get(reverse("accounts:ayuda")).content.decode()

    assert reverse("accounts:glosario") in ayuda
