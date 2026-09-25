"""**Archivar una obra la saca de lo pendiente de todos**, no solo de la lista (2026-09-25).

El usuario creó una obra de prueba y preguntó cómo archivarla o borrarla «para que no sea visible en
lo pendiente». Archivar existía, y su propio texto prometía «la saca de las listas y se lleva todo
lo suyo». **Solo cumplía la primera mitad**: no había un solo `proyecto__is_active` en el código,
así que sus observaciones seguían vencidas en la bandeja, en el seguimiento del equipo, en el correo
de cada mañana y en los cinco registros.

## Lo que se sujeta

1. Cada superficie de lo pendiente y cada registro deja fuera lo de la obra archivada — y **deja
   dentro** lo de la obra en curso, que es la mitad que prueba que el filtro no vacía todo.
2. La regla vive en `abiertos_con_fecha`, la definición única de «abierto»: por ahí pasan la
   bandeja, «Mi trabajo», el seguimiento y el correo.
3. Volver a abrirla la devuelve entera: archivar se puede deshacer, y ahora se puede **encontrar**
   para deshacerlo — antes la obra no salía en ninguna lista.
4. El registro se conserva: la ficha de la obra y el visor siguen abriendo lo archivado por su
   clave.
"""

from datetime import timedelta

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone

from apps.accounts import roles
from apps.documents.models import Actividad, Observacion, Transmittal
from apps.documents.notify import atrasos_que_no_avanzan, pendientes_por_tramo
from apps.documents.seguimiento import abiertos_con_fecha
from apps.projects.models import Proyecto

pytestmark = pytest.mark.django_db


@pytest.fixture
def coordinador(revisor):
    call_command("bootstrap_roles", verbosity=0)
    revisor.groups.add(Group.objects.get(name=roles.COORDINADOR))
    return type(revisor).objects.get(pk=revisor.pk)


@pytest.fixture
def de_prueba(organizacion):
    return Proyecto.objects.create(
        organizacion=organizacion, codigo="0001", nombre="test", naturaleza=Proyecto.PRUEBA
    )


def vencida(organizacion, obra, responsable, titulo):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=obra,
        titulo=titulo,
        autor=responsable,
        responsable=responsable,
        vence=timezone.localdate() - timedelta(days=3),
    )


def archivar(obra):
    obra.is_active = False
    obra.save(update_fields=["is_active"])


@pytest.fixture
def dos_obras(organizacion, proyecto, de_prueba, coordinador):
    """Una observación vencida en cada obra, y la de prueba archivada."""
    vencida(organizacion, proyecto, coordinador, "La de la obra en curso")
    vencida(organizacion, de_prueba, coordinador, "La de la obra de prueba")
    archivar(de_prueba)
    return proyecto, de_prueba


def titulos(items):
    return {item.titulo for item in items}


# --- Lo pendiente -----------------------------------------------------------------------


def test_la_bandeja_y_el_correo_no_la_cuentan(dos_obras, coordinador):
    """`pendientes_por_tramo` alimenta la bandeja, «Mi trabajo» y el correo: los tres a la vez."""
    tramos = pendientes_por_tramo(coordinador)

    assert titulos(tramos["vencido"]) == {"La de la obra en curso"}


def test_la_pantalla_de_la_bandeja_no_la_ensena(client, dos_obras, coordinador):
    client.force_login(coordinador)
    html = client.get(reverse("documents:bandeja")).content.decode()

    assert "La de la obra en curso" in html
    assert "La de la obra de prueba" not in html


def test_el_seguimiento_del_equipo_no_la_ensena(client, dos_obras, coordinador):
    client.force_login(coordinador)
    html = client.get(reverse("documents:seguimiento")).content.decode()

    assert "La de la obra en curso" in html
    assert "La de la obra de prueba" not in html


def test_no_escala_a_quien_la_abrio(organizacion, dos_obras, coordinador, proyectista):
    """El escalado es para lo que está parado; una obra archivada está parada a propósito."""
    _, de_prueba = dos_obras
    hace_un_mes = timezone.now() - timedelta(days=30)
    for obra, titulo in ((dos_obras[0], "Parada en curso"), (de_prueba, "Parada archivada")):
        observacion = Observacion.objects.create(
            organizacion=organizacion,
            proyecto=obra,
            titulo=titulo,
            autor=coordinador,
            responsable=proyectista,
            vence=timezone.localdate() - timedelta(days=20),
        )
        Observacion.objects.filter(pk=observacion.pk).update(updated_at=hace_un_mes)

    assert titulos(atrasos_que_no_avanzan(coordinador)) == {"Parada en curso"}


def test_la_definicion_unica_de_abierto_la_deja_fuera(dos_obras):
    """Es el sitio por el que pasan las cuatro superficies: si el filtro sale de aquí, vuelven
    todas a enseñarla a la vez."""
    todas = abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all())

    assert titulos(todas) == {"La de la obra en curso"}


# --- Los registros ----------------------------------------------------------------------


def test_el_registro_de_observaciones_no_la_ensena(client, dos_obras, coordinador):
    client.force_login(coordinador)
    respuesta = client.get(reverse("documents:observaciones"))

    assert titulos(respuesta.context["observaciones"]) == {"La de la obra en curso"}
    # Y el filtro por obra no ofrece la archivada: sería un filtro que lleva a una lista vacía.
    assert set(respuesta.context["obras"]) == {dos_obras[0].codigo}


def test_el_registro_de_actividades_no_la_ensena(client, organizacion, dos_obras, coordinador):
    en_curso, de_prueba = dos_obras
    for obra, titulo in ((en_curso, "Actividad en curso"), (de_prueba, "Actividad archivada")):
        Actividad.objects.create(
            organizacion=organizacion, proyecto=obra, titulo=titulo, responsable=coordinador
        )
    client.force_login(coordinador)

    respuesta = client.get(reverse("documents:actividades"))

    assert titulos(respuesta.context["actividades"]) == {"Actividad en curso"}


def test_los_entregables_y_los_archivos_no_la_ensenan(
    client, organizacion, disciplina, entregable, revision, de_prueba, coordinador, proyectista
):
    from apps.documents.models import Entregable, Revision

    otro = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=de_prueba,
        disciplina=disciplina,
        codigo="0001-JEJ-ZZ-XX-M3-AR-0001",
        titulo="Entregable de prueba",
        responsable=proyectista,
    )
    Revision.objects.create(entregable=otro, correlativo="P01", subida_por=proyectista)
    archivar(de_prueba)
    client.force_login(coordinador)

    entregables = client.get(reverse("documents:entregables")).context["entregables"]
    archivos = client.get(reverse("documents:archivos")).context["archivos"]

    assert {e.pk for e in entregables} == {entregable.pk}
    assert {r.entregable_id for r in archivos} == {entregable.pk}


def test_los_transmittals_no_la_ensenan(client, organizacion, dos_obras, coordinador):
    en_curso, de_prueba = dos_obras
    for obra, asunto in ((en_curso, "Envío en curso"), (de_prueba, "Envío archivado")):
        Transmittal.objects.create(
            organizacion=organizacion, proyecto=obra, asunto=asunto, emisor=coordinador
        )
    client.force_login(coordinador)

    transmittals = client.get(reverse("documents:transmittals")).context["transmittals"]

    assert {t.asunto for t in transmittals} == {"Envío en curso"}


# --- Encontrarla para deshacerlo --------------------------------------------------------


def test_la_lista_de_obras_ofrece_las_archivadas(client, dos_obras, coordinador):
    en_curso, de_prueba = dos_obras
    client.force_login(coordinador)

    en_curso_html = client.get(reverse("projects:proyectos")).content.decode()
    archivo = client.get(reverse("projects:proyectos") + "?archivadas=1")

    assert "?archivadas=1" in en_curso_html
    assert [p.pk for p in archivo.context["proyectos"]] == [de_prueba.pk]


def test_sin_archivadas_no_se_ofrece_el_enlace(client, proyecto, coordinador):
    client.force_login(coordinador)

    assert "?archivadas=1" not in client.get(reverse("projects:proyectos")).content.decode()


def test_la_ficha_archivada_lo_dice_y_ofrece_reabrirla(client, dos_obras, coordinador):
    _, de_prueba = dos_obras
    client.force_login(coordinador)

    html = client.get(reverse("projects:proyecto", args=[de_prueba.pk])).content.decode()

    assert html.count(reverse("projects:archivar-proyecto", args=[de_prueba.pk])) == 2
    assert 'href="#titulo-salidas"' not in html


def test_la_ficha_en_curso_anuncia_la_salida_arriba(client, proyecto, coordinador):
    client.force_login(coordinador)

    html = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert 'href="#titulo-salidas"' in html
    assert html.index('href="#titulo-salidas"') < html.index('id="titulo-salidas"')


def test_reabrirla_la_devuelve_a_lo_pendiente(client, dos_obras, coordinador):
    _, de_prueba = dos_obras
    client.force_login(coordinador)

    client.post(reverse("projects:archivar-proyecto", args=[de_prueba.pk]))

    assert titulos(pendientes_por_tramo(coordinador)["vencido"]) == {
        "La de la obra en curso",
        "La de la obra de prueba",
    }
