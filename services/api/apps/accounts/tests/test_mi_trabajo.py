"""La portada como **«Mi trabajo»**: `F12.7`.

Tres cambios, y cada uno tiene su prueba porque cada uno puede salir mal sin dar error:

1. **La cifra del día** en vez de «Solo se lista lo que tu rol puede abrir». Una cifra mal armada da
   una frase rara —«2 obras Nada vencido y nada que venza esta semana»— o una contradicción
   —«3 vencidas · nada vencido»—, y las dos se leen como que la pantalla no es de fiar.
2. **Filas de tarea** en vez de tablas de tres columnas, con hallazgo y actividad leídos igual.
3. **Los pasos del recorrido** en vez de las doce tarjetas de módulo, filtrados por lo que esta
   persona puede hacer.
"""

import datetime as dt

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone, translation

from apps.accounts.views import PortalView
from apps.documents.models import Observacion


def cifra(**kwargs) -> list[str]:
    """Las piezas **en su idioma de origen**, que es el inglés del código.

    `ngettext` resuelve al idioma activo, así que sin esto la prueba comparaba «Nada vencido…»
    contra «Nothing overdue…» y fallaba por el motivo equivocado. Lo que se quiere fijar es la
    lógica de qué piezas salen, no cómo están traducidas.
    """
    with translation.override(None):
        return [str(p) for p in PortalView._cifra_del_dia(**kwargs)]


# --- 1. La cifra del día ---------------------------------------------------------------


def test_lo_vencido_va_primero():
    """Es lo único de la línea que pide hacer algo hoy."""
    piezas = cifra(vencidas=3, de_la_semana=2, obras=4)

    assert piezas[0].startswith("3")
    assert len(piezas) == 3


def test_sin_nada_pendiente_lo_dice_en_una_frase():
    piezas = cifra(vencidas=0, de_la_semana=0, obras=2)

    assert piezas[0] == "Nothing overdue and nothing due this week"


def test_la_frase_tranquilizadora_no_sale_si_hay_algo():
    """**Puesta siempre daría «3 vencidas · nada vencido».**

    Es la clase de contradicción que hace desconfiar de la pantalla entera, y sale sola si la frase
    se escribe como un `{% else %}` mal puesto.
    """
    piezas = cifra(vencidas=3, de_la_semana=0, obras=1)

    assert not any("Nothing overdue" in p for p in piezas)


def test_una_pieza_vacia_no_se_dibuja():
    """Cero de algo **no se escribe**: «0 esta semana» es ruido en una puerta."""
    piezas = cifra(vencidas=1, de_la_semana=0, obras=0)

    assert len(piezas) == 1


def test_sin_obras_visibles_no_se_habla_de_obras():
    """El mandante sin `view_proyecto` no ve la cifra de obras, y eso es correcto."""
    piezas = cifra(vencidas=0, de_la_semana=0, obras=0)

    assert piezas == ["Nothing overdue and nothing due this week"]


# --- 2. Las filas de tarea -------------------------------------------------------------


@pytest.fixture
def coordina(client, db, organizacion):
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("coordina", password="x")
    for codename in ("view_observacion", "view_proyecto", "view_actividad"):
        usuario.user_permissions.add(Permission.objects.get(codename=codename))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    return usuario


def observacion_de(proyecto, quien, *, vence, titulo="Algo", prioridad=Observacion.MEDIA):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=quien,
        responsable=quien,
        prioridad=prioridad,
        vence=vence,
    )


@pytest.mark.django_db
def test_las_tareas_salen_como_filas_y_no_como_tabla(client, coordina, proyecto):
    hoy = timezone.localdate()
    observacion_de(proyecto, coordina, vence=hoy - dt.timedelta(days=2), titulo="Lo atrasado")
    observacion_de(proyecto, coordina, vence=hoy + dt.timedelta(days=3), titulo="Lo de esta semana")

    html = client.get("/").content.decode("utf-8")

    assert html.count('<li class="tarea">') == 2
    assert "Lo atrasado" in html
    assert "Lo de esta semana" in html


@pytest.mark.django_db
def test_lo_vencido_se_marca_en_la_fila(client, coordina, proyecto):
    """En rojo **y** en negrita: el color solo no lo distingue quien no distingue rojos."""
    observacion_de(proyecto, coordina, vence=timezone.localdate() - dt.timedelta(days=1))

    html = client.get("/").content.decode("utf-8")

    assert "tarea-vencida" in html


@pytest.mark.django_db
def test_la_fila_lleva_dueno_fecha_y_prioridad(client, coordina, proyecto):
    """Los tres datos que hacen de un hallazgo una tarea. Antes la tabla solo traía fecha y obra."""
    observacion_de(proyecto, coordina, vence=timezone.localdate(), prioridad=Observacion.ALTA)

    html = client.get("/").content.decode("utf-8")

    assert "persona-inicial" in html
    assert "pildora-prioridad alta" in html


@pytest.mark.django_db
def test_el_circulo_de_estado_no_es_un_checkbox(client, coordina, proyecto):
    """**La decisión que separa esto de Asana.**

    Allí se marca hecho desde la lista; aquí no existe ese POST para una observación —se cierra con
    su resolución, que es un formulario con motivo—. Un checkbox que no guarda nada es peor que
    ningún checkbox.
    """
    observacion_de(proyecto, coordina, vence=timezone.localdate())

    html = client.get("/").content.decode("utf-8")

    assert 'class="tarea-estado' in html
    assert 'type="checkbox"' not in html


# --- 3. Los pasos, en vez de las doce tarjetas ----------------------------------------


@pytest.mark.django_db
def test_las_doce_tarjetas_de_modulo_ya_no_estan(client, coordina):
    """Con la barra lateral al lado eran **decir dos veces lo mismo**.

    Se comprueba por la clase de la tarjeta de módulo, que es lo que desaparece: las tarjetas de
    obra siguen y usan `.tarjeta obra`.
    """
    html = client.get("/").content.decode("utf-8")

    assert '<div class="tarjetas acento-' not in html


@pytest.mark.django_db
def test_salen_tres_pasos_del_recorrido(client, coordina):
    html = client.get("/").content.decode("utf-8")

    assert "pasos-cortos" in html
    assert html.count("<li>") >= 3


@pytest.mark.django_db
def test_no_se_ofrece_un_paso_que_esta_persona_no_puede_hacer(client, db, organizacion):
    """**En la puerta se filtra; en la ayuda no.**

    La pantalla de ayuda enseña los nueve pasos, los ajenos incluidos, porque explica el producto
    entero. Aquí no: para el mandante, «sube una revisión» no es un camino, es una puerta cerrada.
    """
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("mira-y-calla", password="x")
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    client.force_login(get_user_model().objects.get(pk=usuario.pk))

    respuesta = client.get("/")
    pasos = respuesta.context["pasos"]

    assert all(uno.puedes for uno in pasos)


# --- El título de la pantalla ---------------------------------------------------------


@pytest.mark.django_db
def test_la_portada_ya_no_se_titula_portal(client, coordina):
    """`F12.7` literal. «Portal» es el nombre de la cosa, no de lo que hay dentro."""
    html = client.get("/").content.decode("utf-8")

    # **Se corta desde la clase y no desde el primer `</header>`**: la barra de arriba también es un
    # `<header>` y está antes, así que buscar su cierre daba un trozo vacío — y una prueba sobre una
    # cadena vacía dice lo que uno quiera.
    desde = html.index('class="cabecera-pagina"')
    cabecera = html[desde : html.index("</header>", desde)]

    assert "Portal" not in cabecera
    assert "trabajo" in cabecera.lower()
