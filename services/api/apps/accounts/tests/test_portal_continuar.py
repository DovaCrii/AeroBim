"""El portal como punto de partida: la seccion «Continuar».

**Un menu dice a que sitios puedes entrar; esto dice en que ibas**, que es otra pregunta y es la
que uno tiene al abrir la aplicacion por la manana.

Lo que se prueba, mas alla de que las filas esten: que lo pendiente sale de la **misma** funcion
que alimenta el resumen por correo. Si la pantalla y el correo calcularan por separado, un dia el
correo diria tres y la pantalla cuatro, y nadie sabria cual creer.
"""

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Actividad, Observacion
from apps.projects.models import Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def vencida(db, organizacion, proyecto, proyectista, revisor):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Esta ya vencio",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        vence=date.today() - timedelta(days=2),
    )


@pytest.fixture
def esta_semana(db, organizacion, proyecto, proyectista, revisor):
    return Actividad.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Levantar el as-built",
        responsable=proyectista,
        creada_por=revisor,
        vence=date.today() + timedelta(days=3),
    )


@pytest.mark.django_db
def test_lo_vencido_aparece_y_se_puede_abrir(client, proyectista, vencida):
    """**La fila es un enlace, y era texto plano.** Se veia que algo vencia y no se podia ir."""
    client.force_login(proyectista)

    cuerpo = client.get(reverse("portal")).content.decode()

    assert vencida.titulo in cuerpo
    assert vencida.get_absolute_url() in cuerpo


@pytest.mark.django_db
def test_las_dos_clases_de_pendiente_conviven_en_la_misma_lista(
    client, proyectista, vencida, esta_semana
):
    """Observaciones y actividades mezcladas **a proposito**: para quien mira son lo mismo, algo
    con fecha y responsable. Y cada una se enlaza a su sitio sin que la plantilla pregunte de que
    tipo es, porque las dos llevan `get_absolute_url`."""
    client.force_login(proyectista)

    cuerpo = client.get(reverse("portal")).content.decode()

    assert vencida.get_absolute_url() in cuerpo
    assert esta_semana.get_absolute_url() in cuerpo


@pytest.mark.django_db
def test_lo_pendiente_sale_de_la_misma_fuente_que_el_resumen_por_correo(
    client, proyectista, vencida, esta_semana
):
    """Si se calcularan por separado, un dia el correo diria tres y la pantalla cuatro."""
    from apps.documents.notify import pendientes_por_tramo

    client.force_login(proyectista)
    respuesta = client.get(reverse("portal"))

    del_correo = pendientes_por_tramo(proyectista)
    assert respuesta.context["mis_pendientes"] == sum(len(v) for v in del_correo.values())


@pytest.mark.django_db
def test_lo_de_otro_no_aparece(client, proyectista, organizacion, proyecto, revisor):
    """La seccion dice **lo tuyo**: es lo unico que la hace util al abrir la aplicacion."""
    de_otro = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Le toca al revisor",
        autor=proyectista,
        responsable=revisor,
        prioridad=Observacion.ALTA,
        vence=date.today() - timedelta(days=1),
    )
    client.force_login(proyectista)

    cuerpo = client.get(reverse("portal")).content.decode()

    assert de_otro.titulo not in cuerpo


@pytest.mark.django_db
def test_sin_nada_pendiente_no_se_inventa_una_lista(client, proyectista):
    client.force_login(proyectista)

    respuesta = client.get(reverse("portal"))

    assert respuesta.status_code == 200
    assert respuesta.context["mis_pendientes"] == 0


@pytest.mark.django_db
def test_las_obras_solo_si_el_rol_puede_leerlas(client, proyectista, proyecto):
    """Sin `view_proyecto` la seccion **no existe**, en vez de aparecer vacia o llevar a un 403."""
    client.force_login(proyectista)
    assert client.get(reverse("portal")).context.get("mis_proyectos") is None

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    respuesta = client.get(reverse("portal"))
    assert list(respuesta.context["mis_proyectos"]) == [proyecto]


@pytest.mark.django_db
def test_no_se_ofrece_la_obra_de_otro_cliente(client, proyectista, proyecto):
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Obra de otro")

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    cuerpo = client.get(reverse("portal")).content.decode()

    assert proyecto.codigo in cuerpo
    assert "OTRO" not in cuerpo


@pytest.mark.django_db
def test_una_obra_cerrada_no_ocupa_la_puerta(client, proyectista, proyecto):
    """Se sigue pudiendo abrir desde el listado; lo que no hace es competir por el sitio donde se
    mira en que continuar."""
    proyecto.status = Proyecto.ETAPA_CERRADO
    proyecto.save(update_fields=["status"])

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    respuesta = client.get(reverse("portal"))

    assert list(respuesta.context["mis_proyectos"]) == []
