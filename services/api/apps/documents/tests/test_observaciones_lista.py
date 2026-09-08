"""La lista de observaciones: inicial, agrupada por estado, y **la acción visible**.

Lo que ya estaba bien no se rehace —filtros, orden por columna con URL compartible, píldoras de
estado y prioridad, `.fila-resuelta`— y tiene sus propias pruebas en `test_orden.py`. Aquí van los
cuatro añadidos, y cada uno tiene una forma de salir mal sin dar error:

- La inicial: **el color tiene que ser estable** (ver `test_personas.py`).
- El agrupado: `{% ifchanged %}` en el orden equivocado agrupa por un valor que no está ordenado, y
  entonces sale un rótulo por fila.
- La acción: un enlace a un ancla que no existe **aterriza arriba de la página** y no falla.
- Los filtros rápidos: el activo mal calculado marca dos, o ninguno.
"""

import re

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.models import Observacion

RUTA = "documents:observaciones"


@pytest.fixture
def mira(client, db, organizacion):
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("mira", password="x")
    for codename in ("view_observacion", "add_comentario", "view_proyecto"):
        usuario.user_permissions.add(Permission.objects.get(codename=codename))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    return usuario


def hallazgo(proyecto, quien, *, estado=Observacion.ABIERTA, titulo="Algo"):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=quien,
        responsable=quien,
        estado=estado,
    )


# --- La inicial del dueño --------------------------------------------------------------


@pytest.mark.django_db
def test_el_dueno_sale_con_su_inicial_y_su_nombre(client, mira, proyecto):
    """**Los dos, y no es redundancia.** Una inicial no distingue a dos personas que empiezan
    igual, y el color no lo lee quien no distingue colores."""
    hallazgo(proyecto, mira)

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    assert "persona-inicial" in html
    assert ">mira<" in html


# --- Agrupar por estado ----------------------------------------------------------------


@pytest.mark.django_db
def test_ordenar_por_estado_agrupa(client, mira, proyecto):
    """Sin el rótulo, ordenar por estado deja filas seguidas con la misma píldora repetida: la
    columna está ordenada y no se ve dónde acaba un grupo."""
    hallazgo(proyecto, mira, estado=Observacion.ABIERTA, titulo="Una")
    hallazgo(proyecto, mira, estado=Observacion.ABIERTA, titulo="Dos")
    hallazgo(proyecto, mira, estado=Observacion.RESPONDIDA, titulo="Tres")

    html = client.get(reverse(RUTA), {"orden": "estado"}).content.decode("utf-8")

    # Dos grupos y no tres rótulos: `ifchanged` solo dibuja cuando el valor cambia.
    assert html.count('class="fila-grupo"') == 2


@pytest.mark.django_db
def test_en_cualquier_otro_orden_no_se_agrupa(client, mira, proyecto):
    """**Y es lo correcto.** Ordenando por prioridad los estados se alternan, así que un rótulo por
    fila sería ruido — `ifchanged` dibujaría uno en casi todas."""
    hallazgo(proyecto, mira, estado=Observacion.ABIERTA)
    hallazgo(proyecto, mira, estado=Observacion.RESPONDIDA)

    html = client.get(reverse(RUTA), {"orden": "prioridad"}).content.decode("utf-8")

    assert "fila-grupo" not in html


# --- La acción visible -----------------------------------------------------------------


@pytest.mark.django_db
def test_la_accion_de_la_fila_esta_visible_y_no_escondida(client, mira, proyecto):
    """**La regla del sistema, y donde se decide no copiar a Asana.**

    Allí las acciones aparecen al pasar el ratón, y eso funciona con una lista por pantalla en un
    monitor ancho — no con un rol que no sabe que existen, y no en un táctil.
    """
    hallazgo(proyecto, mira)

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    assert "accion-fila" in html
    assert "opacity: 0" not in html
    assert "opacity:0" not in html


@pytest.mark.django_db
def test_la_accion_lleva_al_ancla_del_formulario_de_respuesta(client, mira, proyecto):
    obs = hallazgo(proyecto, mira)

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    esperado = reverse("documents:observacion", kwargs={"pk": obs.pk}) + "#responder"
    assert esperado in html


@pytest.mark.django_db
def test_el_ancla_existe_de_verdad_en_la_ficha(client, mira, proyecto):
    """**La otra mitad, y hace falta porque un ancla que falta no da error.**

    El enlace sigue funcionando y aterriza en la cabecera, así que quien lo pulsa cree que la
    pantalla no responde.
    """
    obs = hallazgo(proyecto, mira)

    html = client.get(reverse("documents:observacion", kwargs={"pk": obs.pk})).content.decode(
        "utf-8"
    )

    assert 'id="responder"' in html


@pytest.mark.django_db
def test_no_se_ofrece_responder_a_quien_no_puede(client, db, organizacion, proyecto):
    """Un enlace que termina en 403 enseña a probar puertas."""
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("solo-mira", password="x")
    usuario.user_permissions.add(Permission.objects.get(codename="view_observacion"))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    hallazgo(proyecto, usuario)

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    assert "accion-fila" not in html


@pytest.mark.django_db
def test_un_hallazgo_cerrado_no_ofrece_responder(client, mira, proyecto):
    """Se ofrece **una** acción y solo cuando aplica: contestar algo cerrado no es el gesto.

    El hilo sigue abierto desde la ficha; lo que no se hace es invitar desde la lista.
    """
    hallazgo(proyecto, mira, estado=Observacion.CERRADA)

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    assert "accion-fila" not in html


# --- Los filtros rápidos ---------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("parametros", "esperado"),
    [({}, "todas"), ({"mias": "1"}, "mias"), ({"abiertas": "1"}, "abiertas")],
)
def test_el_filtro_rapido_activo_es_uno_solo(client, mira, parametros, esperado):
    respuesta = client.get(reverse(RUTA), parametros)

    assert respuesta.context["filtro_rapido"] == esperado
    html = respuesta.content.decode("utf-8")
    assert len(re.findall(r'class="segmento segmento-activo"', html)) == 1


@pytest.mark.django_db
def test_los_filtros_salen_de_la_cabecera_y_no_del_subtitulo(client, mira):
    """Dentro de la frase se leían como el final de la frase, no como controles."""
    html = client.get(reverse(RUTA)).content.decode("utf-8")

    desde = html.index('class="cabecera-pagina"')
    cabecera = html[desde : html.index("</header>", desde)]

    assert "segmentado" in cabecera
