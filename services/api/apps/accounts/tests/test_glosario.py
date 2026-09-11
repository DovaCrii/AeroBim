"""Los vocabularios del oficio: `F11.11` (BIM) y `F11.12` (levantamiento).

**Lo que hay que probar de un glosario no es que salga, es que no pueda prometer de más.** Un
glosario con definiciones y ninguna reserva se lee como un catálogo de capacidades, y quien lo lea
va a buscar el botón de 4D o el de cubicación. El campo que vale es `en_aerobim`, y la mitad de su
valor está en los que dicen que no.

Así que se comprueba, por este orden:

1. **Los que no están son exactamente estos**, fijados por nombre en los dos vocabularios. Mover uno
   a «sí» sin construirlo rompe el gate — que es justo lo que se quiere que pase.
2. **Cada enlace resuelve y está en el catálogo del portal**, el mismo guardián que la ayuda: un
   término que lleva a una pantalla retirada miente igual que un paso que lo hace.
3. **Solo los que están tienen enlace.** Un «Ir allí» debajo de un término ausente sería la
   contradicción más cara de la pantalla.
4. Lo de la forma: sin repetir, cada uno con sus cuatro textos, y **sin negritas de Markdown** — que
   se vio mirando la pantalla y no leyendo el código.

Casi todo va parametrizado sobre los dos vocabularios: un tercero entra sin escribir una prueba.
"""

import pytest
from django.urls import NoReverseMatch, reverse

from apps.accounts.glosario import (
    Vocabulario,
    cuantos_no_estan,
    terminos_por_grupo,
    vocabularios,
)
from apps.accounts.modulos import CATALOGO

TODOS: list[Vocabulario] = list(vocabularios().values())
CLAVES = [uno.clave for uno in TODOS]

#: Los que el producto **no** hace, escritos a mano. Es el corazón de estas pruebas: la lista existe
#: para que pasar uno a `lo_hace=True` obligue a venir aquí y a mirar si de verdad se construyó.
NO_ESTAN: dict[str, set[str]] = {
    "bim": {
        "LOD",
        "BEP",
        "Modelado paramétrico",
        "4D BIM",
        "5D BIM",
        "COBie",
        "AIM",
        "Gemelo digital",
    },
    "levantamiento": {
        "Fotogrametría",
        "LiDAR",
        "Densidad de puntos",
        "GSD",
        "Cota elipsoidal y cota ortométrica",
        "RTK y PPK",
        "Punto de apoyo y punto de chequeo",
        "MDT y MDS",
        "Ortofoto",
        "Curvas de nivel y TIN",
        "Cubicación",
    },
}


def por_clave(clave: str) -> Vocabulario:
    return vocabularios()[clave]


# --- Que no pueda prometer de más ----------------------------------------------------


@pytest.mark.parametrize("clave", CLAVES)
def test_los_que_no_estan_son_exactamente_estos(clave):
    """**El guardián.** Un vocabulario en el que todo sale a «sí» convierte la ayuda en un folleto,
    y quien lo lee lo descubre buscando un botón que no existe."""
    vocabulario = por_clave(clave)
    ausentes = {uno.sigla for uno in vocabulario.terminos if not uno.lo_hace}

    assert ausentes == NO_ESTAN[clave]
    assert cuantos_no_estan(vocabulario) == len(NO_ESTAN[clave])


@pytest.mark.parametrize("clave", CLAVES)
def test_el_que_no_esta_dice_que_hay_en_su_lugar(clave):
    """Decir «no» a secas no ayuda a nadie: lo accionable es qué hay en su lugar o qué haría falta.

    Se mide con el largo porque una frase corta aquí es siempre un «no lo hace» pelado.
    """
    for termino in por_clave(clave).terminos:
        if termino.lo_hace:
            continue
        assert len(termino.en_aerobim) > 120, termino.sigla


@pytest.mark.parametrize("clave", CLAVES)
def test_solo_los_que_estan_llevan_a_una_pantalla(clave):
    """Un «Ir allí» debajo de un término ausente sería la contradicción más cara de la pantalla."""
    for termino in por_clave(clave).terminos:
        if not termino.lo_hace:
            assert termino.ruta is None, termino.sigla


@pytest.mark.parametrize("clave", CLAVES)
def test_todos_los_destinos_resuelven(clave):
    for termino in por_clave(clave).terminos:
        if termino.ruta is None:
            continue
        try:
            reverse(termino.ruta)
        except NoReverseMatch:  # pragma: no cover - es el fallo que se busca
            pytest.fail(f"«{termino.sigla}» apunta a «{termino.ruta}», que no resuelve")


@pytest.mark.parametrize("clave", CLAVES)
def test_cada_destino_esta_en_el_catalogo_del_portal(clave):
    """El mismo guardián que la ayuda: si un módulo se quita del portal, esto deja de tener sentido
    y el gate lo dice en vez de llevar a una pantalla que ya nadie ofrece."""
    del_portal = {modulo.ruta for modulo in CATALOGO}

    for termino in por_clave(clave).terminos:
        if termino.ruta is None:
            continue
        assert termino.ruta in del_portal, (
            f"«{termino.sigla}» lleva a «{termino.ruta}», que no está en el portal"
        )


# --- La forma ------------------------------------------------------------------------


def test_estan_los_dos_vocabularios_y_las_dieciseis_de_la_lamina():
    """Las dieciséis del BIM son las de la lámina que trajo el usuario el 2026-09-11."""
    assert set(CLAVES) == {"bim", "levantamiento"}
    assert len(por_clave("bim").terminos) == 16
    assert len(por_clave("levantamiento").terminos) >= 16


@pytest.mark.parametrize("clave", CLAVES)
def test_ninguna_sigla_se_repite(clave):
    siglas = [uno.sigla for uno in por_clave(clave).terminos]

    assert len(set(siglas)) == len(siglas)


@pytest.mark.parametrize("clave", CLAVES)
def test_cada_termino_dice_que_es_y_que_hace_aerobim_con_ello(clave):
    """`que_es` sin `en_aerobim` es la definición que ya hay en veinte sitios; el par es lo
    nuevo."""
    vocabulario = por_clave(clave)
    for termino in vocabulario.terminos:
        assert len(termino.que_es) > 60, termino.sigla
        assert len(termino.en_aerobim) > 60, termino.sigla
        assert termino.grupo in vocabulario.grupos, termino.sigla


@pytest.mark.parametrize("clave", CLAVES)
def test_ningun_texto_lleva_negritas_de_markdown(clave):
    """**Esto se vio mirando la pantalla, no leyendo el código.** La casa escribe en Markdown y aquí
    no hay Markdown: la plantilla de Django imprime el texto tal cual, así que un `**así**` sale con
    los asteriscos puestos. Con treinta y seis fichas el error se cuela sin que nadie lo relea."""
    for termino in por_clave(clave).terminos:
        for campo, texto in (
            ("que_es", termino.que_es),
            ("en_aerobim", termino.en_aerobim),
            ("nombre", termino.nombre),
        ):
            assert "**" not in texto, f"«{termino.sigla}» lleva negritas de Markdown en {campo}"


@pytest.mark.parametrize("clave", CLAVES)
def test_los_grupos_salen_en_orden_y_ninguno_vacio(clave):
    """El orden no es alfabético a propósito: un índice alfabético no enseña que el CDE y el BEP son
    la misma conversación, ni que el geoide y el RTK contestan la misma pregunta."""
    vocabulario = por_clave(clave)
    agrupados = terminos_por_grupo(vocabulario)

    assert [grupo for grupo, _ in agrupados] == list(vocabulario.grupos)
    for grupo, terminos in agrupados:
        assert terminos, grupo
    assert sum(len(terminos) for _, terminos in agrupados) == len(vocabulario.terminos)


# --- La pantalla ---------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("clave", CLAVES)
def test_el_vocabulario_solo_pide_sesion(client, proyectista, clave):
    """Por lo mismo que la ayuda: explica el oficio, no da acceso a nada, y el rol más acotado es el
    que más lo necesita."""
    ruta = reverse("accounts:glosario", args=[clave])

    assert client.get(ruta).status_code == 302  # sin sesión, al login

    client.force_login(proyectista)
    respuesta = client.get(ruta)

    assert respuesta.status_code == 200
    cuerpo = respuesta.content.decode()
    for termino in por_clave(clave).terminos:
        assert termino.sigla in cuerpo, termino.sigla
    # Y lo que no está sale marcado, no escondido.
    assert "no está en AeroBim" in cuerpo


@pytest.mark.django_db
def test_una_clave_desconocida_da_404_y_no_cae_al_primero(client, proyectista):
    """**Caer en silencio al primer vocabulario sería amabilidad mal puesta.** La URL la escribe
    alguien o la pega de un enlace, y devolver otra pantalla hace que nadie se entere de que su
    enlace está roto. (Un parámetro de presentación como `?vista=` sí cae al valor por defecto: ahí
    no hay nada que romper.)"""
    client.force_login(proyectista)

    assert client.get("/administracion/ayuda/vocabulario/no-existe/").status_code == 404


@pytest.mark.django_db
def test_se_llega_a_los_dos_desde_como_se_usa(client, proyectista):
    """Es material de lectura y se busca desde «cómo se usa», no desde el rail."""
    client.force_login(proyectista)

    ayuda = client.get(reverse("accounts:ayuda")).content.decode()

    for clave in CLAVES:
        assert reverse("accounts:glosario", args=[clave]) in ayuda


@pytest.mark.django_db
def test_desde_uno_se_llega_al_otro(client, proyectista):
    """Quien acaba de leer uno es exactamente quien puede querer el otro."""
    client.force_login(proyectista)

    bim = client.get(reverse("accounts:glosario", args=["bim"])).content.decode()

    assert reverse("accounts:glosario", args=["levantamiento"]) in bim
