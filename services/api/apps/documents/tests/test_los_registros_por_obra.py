"""**«Separarlo por proyectos, y que se pueda colapsar y no se llene de todo.»**

El repositorio y los transmittals eran **listas planas ordenadas por fecha**, con la obra como una
columna de texto. Con una obra eso esta bien. Con cuatro —que es lo que hay en cuanto el piloto
arranca— sesenta archivos mezclan cuatro obras y el repositorio deja de servir para lo unico que
sirve: encontrar algo.

## La decision que estas pruebas sujetan

**Se agrupa solo cuando hay mas de una obra.** Con una sola, un unico grupo plegable es un clic de
mas y un titulo que repite lo que ya dice la pagina. Que la pantalla cambie de forma segun lo que
hay no es incoherencia: es que con una obra **no hay nada que separar**.
"""

import pytest
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.models import Entregable, Revision
from apps.documents.por_obra import por_obra
from apps.projects.models import Proyecto


def con_permiso(usuario, app, *codigos):
    from django.contrib.auth import get_user_model

    for codigo in codigos:
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app, codename=codigo)
        )
    return get_user_model().objects.get(pk=usuario.pk)


# ── El repartidor ──────────────────────────────────────────────────────────────────────


def test_no_se_reordena_nada_dentro_de_un_grupo():
    """**Cada listado ya decidio su orden** —lo mas reciente primero, por codigo, por vencimiento—
    y reordenar aqui lo tiraria sin que se note."""

    class Obra:
        pk, codigo, nombre, naturaleza = 1, "A", "Una", "real"

    obra = Obra()
    filas = [("z", obra), ("a", obra), ("m", obra)]

    grupos = por_obra(filas, lambda f: f[1])

    assert [f[0] for f in grupos[0].filas] == ["z", "a", "m"]


def test_lo_que_no_tiene_obra_va_al_final_y_no_se_descarta():
    """Si hay veinte sin asignar, eso es justamente lo que hay que ver."""

    class Obra:
        pk, codigo, nombre, naturaleza = 1, "B", "Una", "real"

    filas = [("suelta", None), ("con obra", Obra())]

    grupos = por_obra(filas, lambda f: f[1])

    assert [g.codigo for g in grupos] == ["B", ""]
    assert grupos[-1].cuantas == 1


# ── El repositorio ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def dos_obras(organizacion, proyectista, disciplina, proyecto, entregable, revision):
    """La obra de siempre con su archivo, y una segunda con el suyo.

    **Las dos revisiones en idoneidad `A`**, y no es decoración: `solo_publicadas` esconde lo que
    está en curso a quien no puede subir, así que con la `S3` de la fixtura esta pantalla salía
    vacía. Lo que se quiere medir aquí es el reparto por obra, no el filtro contractual — ese tiene
    su propia prueba en `test_el_repositorio.py`.
    """
    from apps.documents.models import Idoneidad
    from apps.projects.models import Disciplina

    revision.idoneidad = Idoneidad.A
    revision.nombre_original = "modelo-de-la-primera.ifc"
    revision.save(update_fields=["idoneidad", "nombre_original"])

    otra = Proyecto.objects.create(
        organizacion=organizacion, codigo="999-XYZ", nombre="La segunda obra"
    )
    suya = Disciplina.objects.create(proyecto=otra, codigo="ES", nombre="Estructura")
    entregable_de_otra = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=otra,
        disciplina=suya,
        codigo="999-XYZ-ES-0001",
        titulo="Planta de fundaciones",
        responsable=proyectista,
    )
    Revision.objects.create(
        entregable=entregable_de_otra,
        correlativo="00",
        idoneidad=Idoneidad.A,
        nombre_original="fundaciones.ifc",
        subida_por=proyectista,
    )
    return otra


@pytest.mark.django_db
def test_con_una_sola_obra_el_repositorio_sale_plano(
    client, proyectista, proyecto, entregable, revision
):
    """**Un solo grupo plegable es un clic de más** con un título que repite la página."""
    from apps.documents.models import Idoneidad

    revision.idoneidad = Idoneidad.A
    revision.save(update_fields=["idoneidad"])
    quien = con_permiso(proyectista, "documents", "view_revision")
    client.force_login(quien)

    respuesta = client.get(reverse("documents:archivos"))

    assert respuesta.context["grupos"] == []
    assert "grupo-de-obra" not in respuesta.content.decode()


@pytest.mark.django_db
def test_con_dos_obras_el_repositorio_se_parte(client, proyectista, dos_obras):
    """Lo que se pidió: separado por obra y plegable."""
    quien = con_permiso(proyectista, "documents", "view_revision")
    client.force_login(quien)

    respuesta = client.get(reverse("documents:archivos"))
    html = respuesta.content.decode()

    assert len(respuesta.context["grupos"]) == 2
    assert html.count("grupo-de-obra") == 2
    assert "999-XYZ" in html


@pytest.mark.django_db
def test_los_grupos_nacen_abiertos(client, proyectista, dos_obras):
    """**Uno cerrado esconde lo que hay y obliga a abrir cuatro para buscar.**

    El plegado es para quitar de en medio lo que ya sabes que no quieres, no para descubrir.
    """
    quien = con_permiso(proyectista, "documents", "view_revision")
    client.force_login(quien)

    html = client.get(reverse("documents:archivos")).content.decode()

    assert '<details class="grupo-de-obra" open>' in html


@pytest.mark.django_db
def test_no_se_pierde_ni_un_archivo_al_agrupar(client, proyectista, dos_obras):
    """**La comprobación que hace que esto no sea solo cosmética.**

    Agrupar es repartir, no filtrar: si un grupo se come una fila, la pantalla sigue pareciendo
    correcta y falta un archivo. Se cuenta contra lo que la vista trajo, no contra un número fijo.
    """
    quien = con_permiso(proyectista, "documents", "view_revision")
    client.force_login(quien)

    respuesta = client.get(reverse("documents:archivos"))

    en_grupos = sum(g.cuantas for g in respuesta.context["grupos"])
    assert en_grupos == len(respuesta.context["archivos"])


# ── Los transmittals ───────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_pantalla_dice_que_es_un_transmittal(client, proyectista):
    """**Es la única palabra del rail que no se puede deducir.**

    «Archivos», «Entregables» y «Observaciones» se entienden solas; ésta es un préstamo del oficio
    que quien no viene de control documental no ha visto nunca. El usuario lo pidió: «indicar para
    qué sirve bien esa sección».
    """
    quien = con_permiso(proyectista, "documents", "view_transmittal")
    client.force_login(quien)

    html = client.get(reverse("documents:transmittals")).content.decode()

    assert "What a transmittal is" in html or "Qué es un transmittal" in html
    assert "explicacion" in html


@pytest.mark.django_db
def test_los_transmittals_se_parten_por_obra(client, proyectista, organizacion, proyecto):
    from apps.documents.models import Transmittal

    otra = Proyecto.objects.create(
        organizacion=organizacion, codigo="999-XYZ", nombre="La segunda obra"
    )
    for obra, folio in ((proyecto, "T-001"), (otra, "T-002")):
        Transmittal.objects.create(
            organizacion=organizacion,
            proyecto=obra,
            folio=folio,
            asunto="Entrega",
            emisor=proyectista,
        )

    quien = con_permiso(proyectista, "documents", "view_transmittal")
    client.force_login(quien)

    respuesta = client.get(reverse("documents:transmittals"))

    assert len(respuesta.context["grupos"]) == 2
    assert sum(g.cuantas for g in respuesta.context["grupos"]) == 2
