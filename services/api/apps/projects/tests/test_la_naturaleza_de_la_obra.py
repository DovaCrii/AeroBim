"""**Cuál de estas obras es de verdad.**

Durante el piloto conviven en la misma lista obras de ensayo y obras reales, y nada las distinguía:
el usuario lo dijo pidiendo «una nomenclatura de código interno, sobre todo si son test, pruebas».

## Por qué un campo y no un prefijo en el código

Porque `Proyecto.codigo` es **texto libre a propósito** —cada mandante impone el suyo— así que un
`PRB-` acordado de palabra lo respeta quien se acuerda. Y un prefijo no se puede filtrar sin
adivinar, no se puede pintar distinto sin partir cadenas, y el día que alguien escriba `PRUEBA-2`
deja de existir.

Un campo cerrado se ve de un vistazo en las tres pantallas, se filtra con una consulta, y **no
depende de la disciplina de nadie**.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.projects.models import Proyecto


@pytest.fixture
def mirona(proyectista):
    proyectista.user_permissions.add(
        Permission.objects.get(content_type__app_label="projects", codename="view_proyecto")
    )
    return get_user_model().objects.get(pk=proyectista.pk)


@pytest.fixture
def obra_de_prueba(organizacion):
    return Proyecto.objects.create(
        organizacion=organizacion,
        codigo="ENSAYO-01",
        nombre="Obra para probar cosas",
        naturaleza=Proyecto.PRUEBA,
    )


@pytest.mark.django_db
def test_una_obra_nace_real(proyecto):
    """**El valor por omisión es el que no sorprende.** Lo excepcional se declara."""
    assert proyecto.naturaleza == Proyecto.REAL


@pytest.mark.django_db
def test_la_marca_sale_solo_en_lo_que_no_es_real(client, mirona, proyecto, obra_de_prueba):
    """**Una píldora en todas las filas no se lee en ninguna.**

    Se dibuja la excepción, no la norma: si «Obra real» saliera en el 95 % de las filas dejaría de
    verse justo el día que una de ellas dijera otra cosa.
    """
    client.force_login(mirona)
    html = client.get(reverse("projects:proyectos")).content.decode()

    assert "pildora-naturaleza" in html, "la obra de ensayo no se distingue de una real"
    assert html.count("pildora-naturaleza") == 1, "la obra real también salió marcada"


@pytest.mark.django_db
def test_se_pueden_esconder_las_pruebas_y_la_eleccion_se_recuerda(
    client, mirona, proyecto, obra_de_prueba
):
    """**Es una preferencia, no una búsqueda**, así que sobrevive a cambiar de pantalla.

    Volver a pulsar el filtro en cada visita es exactamente el trabajo que el filtro venía a
    ahorrar.
    """
    client.force_login(mirona)
    lista = reverse("projects:proyectos")

    assert "ENSAYO-01" in client.get(lista).content.decode()

    escondidas = client.get(lista, {"sin_pruebas": "1"}).content.decode()
    assert "ENSAYO-01" not in escondidas
    assert "716-LCD" in escondidas, "esconder las pruebas se llevó por delante la obra real"

    # Sin volver a pedirlo: la sesión lo recuerda.
    assert "ENSAYO-01" not in client.get(lista).content.decode()

    assert "ENSAYO-01" in client.get(lista, {"sin_pruebas": "0"}).content.decode()


@pytest.mark.django_db
def test_por_omision_las_pruebas_se_ven(client, mirona, obra_de_prueba):
    """**Y esto no es un detalle:** hoy casi todas las obras del piloto son de ensayo.

    Esconderlas de entrada dejaría la lista vacía sin decir por qué — el mismo defecto silencioso
    que este bloque acaba de arreglar en la columna de avance.
    """
    client.force_login(mirona)
    assert "ENSAYO-01" in client.get(reverse("projects:proyectos")).content.decode()
