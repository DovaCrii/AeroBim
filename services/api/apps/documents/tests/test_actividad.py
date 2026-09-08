"""La pantalla de una actividad, y su paso a paso.

**Hasta hoy no existia.** Habia listado y alta, y ninguna pantalla de detalle: una fila que se ve
vencer en la bandeja y no se puede abrir es una fila muerta, y la bandeja estaba llena de ellas.
Con el portal convertido en punto de partida eso pasa de incomodo a roto.

Lo que se prueba, ademas del 403 y el aislamiento: que **el avance lo decide el flujo del modelo** y
no el formulario, porque el `POST` no pasa por el boton.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Actividad
from apps.projects.models import Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def actividad(db, organizacion, proyecto, proyectista, revisor):
    return Actividad.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Levantar el as-built del piso 5",
        descripcion="Con la nube del levantamiento de marzo.",
        responsable=proyectista,
        creada_por=revisor,
    )


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_la_pantalla_pide_su_permiso_de_lectura(client, proyectista, actividad):
    ruta = reverse("documents:actividad", args=[actividad.pk])

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_actividad"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_avanzar_pide_change_y_no_alcanza_con_leer(client, proyectista, actividad):
    ruta = reverse("documents:avanzar-actividad", args=[actividad.pk])

    client.force_login(dar(proyectista, "documents.view_actividad"))
    assert client.post(ruta, {"status": Actividad.EN_CURSO}).status_code == 403

    client.force_login(dar(proyectista, "documents.change_actividad"))
    assert client.post(ruta, {"status": Actividad.EN_CURSO}).status_code == 302


@pytest.mark.django_db
def test_no_se_abre_la_actividad_de_otra_organizacion(client, proyectista, revisor):
    """`view_actividad` dice que puede ver actividades, **no cuales**."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="OTRO", nombre="Obra de otro"
    )
    suya = Actividad.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        titulo="Tarea de otro cliente",
        responsable=proyectista,
        creada_por=revisor,
    )

    client.force_login(dar(proyectista, "documents.view_actividad"))

    assert client.get(reverse("documents:actividad", args=[suya.pk])).status_code == 404


@pytest.mark.django_db
def test_no_se_avanza_la_actividad_de_otra_organizacion(client, proyectista, revisor):
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="OTRO", nombre="Obra de otro"
    )
    suya = Actividad.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        titulo="Tarea de otro cliente",
        responsable=proyectista,
        creada_por=revisor,
    )

    client.force_login(dar(proyectista, "documents.change_actividad"))
    respuesta = client.post(
        reverse("documents:avanzar-actividad", args=[suya.pk]), {"status": Actividad.EN_CURSO}
    )

    assert respuesta.status_code == 404
    suya.refresh_from_db()
    assert suya.status == Actividad.PENDIENTE


# --- El paso a paso ------------------------------------------------------------------


@pytest.mark.django_db
def test_avanza_un_paso_y_solo_al_siguiente(client, proyectista, actividad):
    """**El siguiente lo decide `STATUS_FLOW`**, no el formulario."""
    client.force_login(dar(proyectista, "documents.view_actividad", "documents.change_actividad"))
    ruta = reverse("documents:avanzar-actividad", args=[actividad.pk])

    client.post(ruta, {"status": Actividad.EN_CURSO})
    actividad.refresh_from_db()
    assert actividad.status == Actividad.EN_CURSO

    client.post(ruta, {"status": Actividad.EN_REVISION})
    actividad.refresh_from_db()
    assert actividad.status == Actividad.EN_REVISION


@pytest.mark.django_db
def test_no_se_salta_del_primero_al_ultimo(client, proyectista, actividad):
    """**El `POST` no pasa por el boton**: se puede mandar `status=hecha` a mano desde
    «pendiente», y eso es exactamente lo que el flujo existe para impedir."""
    client.force_login(dar(proyectista, "documents.change_actividad"))

    respuesta = client.post(
        reverse("documents:avanzar-actividad", args=[actividad.pk]),
        {"status": Actividad.HECHA},
    )

    assert respuesta.status_code == 302
    actividad.refresh_from_db()
    assert actividad.status == Actividad.PENDIENTE


@pytest.mark.django_db
def test_una_actividad_anulada_no_avanza_a_ninguna_parte(client, proyectista, actividad):
    """`ANULADA` no esta en el flujo: es donde se detiene, no un paso hacia algo."""
    actividad.status = Actividad.ANULADA
    actividad.save(update_fields=["status"])
    client.force_login(dar(proyectista, "documents.view_actividad", "documents.change_actividad"))

    respuesta = client.get(reverse("documents:actividad", args=[actividad.pk]))
    assert respuesta.context["siguiente"] is None

    client.post(
        reverse("documents:avanzar-actividad", args=[actividad.pk]), {"status": Actividad.HECHA}
    )
    actividad.refresh_from_db()
    assert actividad.status == Actividad.ANULADA


@pytest.mark.django_db
def test_una_actividad_hecha_ya_no_ofrece_paso_siguiente(client, proyectista, actividad):
    actividad.status = Actividad.HECHA
    actividad.save(update_fields=["status"])
    client.force_login(dar(proyectista, "documents.view_actividad"))

    respuesta = client.get(reverse("documents:actividad", args=[actividad.pk]))

    assert respuesta.context["siguiente"] is None


@pytest.mark.django_db
def test_el_boton_no_se_dibuja_sin_permiso_para_ejecutarlo(client, proyectista, actividad):
    """Ofrecer un boton que termina en 403 enseña a probar puertas."""
    client.force_login(dar(proyectista, "documents.view_actividad"))
    ruta_avanzar = reverse("documents:avanzar-actividad", args=[actividad.pk])

    cuerpo = client.get(reverse("documents:actividad", args=[actividad.pk])).content.decode()
    assert ruta_avanzar not in cuerpo

    client.force_login(dar(proyectista, "documents.change_actividad"))
    cuerpo = client.get(reverse("documents:actividad", args=[actividad.pk])).content.decode()
    assert ruta_avanzar in cuerpo


# --- Que se pueda llegar -------------------------------------------------------------


@pytest.mark.django_db
def test_la_actividad_sabe_donde_vive(actividad):
    """`get_absolute_url` va en el modelo porque la bandeja mezcla observaciones y actividades en
    la misma lista: sin esto, la plantilla tendria que preguntar de que tipo es cada fila."""
    assert actividad.get_absolute_url() == reverse("documents:actividad", args=[actividad.pk])


@pytest.mark.django_db
def test_el_listado_lleva_a_la_actividad(client, proyectista, actividad):
    client.force_login(dar(proyectista, "documents.view_actividad"))

    cuerpo = client.get(reverse("documents:actividades")).content.decode()

    assert actividad.get_absolute_url() in cuerpo


@pytest.mark.django_db
def test_la_bandeja_enlaza_lo_que_vence(client, proyectista, actividad):
    """**Era texto plano**: se veia que algo vencia y no se podia ir, en la pantalla que se abre
    cada manana."""
    from datetime import date, timedelta

    actividad.vence = date.today() + timedelta(days=3)
    actividad.save(update_fields=["vence"])
    client.force_login(dar(proyectista, "documents.view_observacion"))

    cuerpo = client.get(reverse("documents:bandeja")).content.decode()

    assert actividad.get_absolute_url() in cuerpo
