"""El hilo de una observación desde el visor (`F15.4`): leerlo y contestar sin salir de la pantalla.

Lo que se prueba es lo que el contrato de permisos exige de toda vista nueva: su 403 para quien
está autenticado y no puede, su aislamiento entre organizaciones, y que contestar haga lo mismo que
la ficha —dejar la observación «respondida» y avisar sin que el aviso pueda tumbar lo guardado.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Comentario, Observacion
from apps.projects.models import Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def hallazgo(db, organizacion, proyecto, revisor, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Cota del eje C",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
    )


def ruta_de(observacion):
    return reverse("documents_api:hilo-de-observacion", args=[observacion.pk])


# --- Leer -----------------------------------------------------------------------------------


@pytest.mark.django_db
def test_el_hilo_sale_en_orden_con_quien_escribio_cada_mensaje(
    client, hallazgo, revisor, proyectista
):
    Comentario.objects.create(observacion=hallazgo, autor=revisor, texto="Primero.")
    Comentario.objects.create(observacion=hallazgo, autor=proyectista, texto="Después.")
    client.force_login(dar(proyectista, "documents.view_comentario"))

    datos = client.get(ruta_de(hallazgo)).json()

    assert [c["texto"] for c in datos["comentarios"]] == ["Primero.", "Después."]
    assert [c["esMio"] for c in datos["comentarios"]] == [False, True]
    assert datos["estado"] == Observacion.ABIERTA
    assert datos["puedeComentar"] is False  # tiene lectura, no `add_comentario`


@pytest.mark.django_db
def test_leer_el_hilo_pide_view_comentario(client, hallazgo, proyectista):
    client.force_login(dar(proyectista, "documents.add_comentario"))

    assert client.get(ruta_de(hallazgo)).status_code == 403


@pytest.mark.django_db
def test_un_anonimo_no_lee_el_hilo(client, hallazgo):
    assert client.get(ruta_de(hallazgo)).status_code in (401, 403)


@pytest.mark.django_db
def test_el_hilo_de_otra_organizacion_no_se_ve(client, hallazgo, proyectista):
    """`view_comentario` dice que puede leer hilos, no los de quién: sin acotar, el `pk` de la URL
    alcanzaría cualquier observación de la tabla."""
    otra = Organizacion.objects.create(nombre="Otra", slug="otra")
    ajeno = Proyecto.objects.create(organizacion=otra, codigo="X", nombre="Ajena")
    de_otra = Observacion.objects.create(
        organizacion=otra,
        proyecto=ajeno,
        titulo="Ajena",
        autor=proyectista,
        responsable=proyectista,
    )
    client.force_login(dar(proyectista, "documents.view_comentario"))

    assert client.get(ruta_de(de_otra)).status_code == 404


# --- Contestar ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_contestar_pide_add_comentario(client, hallazgo, proyectista):
    cuerpo = {"texto": "Corregido en la revisión B."}

    client.force_login(dar(proyectista, "documents.view_comentario"))
    assert (
        client.post(ruta_de(hallazgo), cuerpo, content_type="application/json").status_code == 403
    )
    assert Comentario.objects.count() == 0

    client.force_login(dar(proyectista, "documents.add_comentario"))
    assert (
        client.post(ruta_de(hallazgo), cuerpo, content_type="application/json").status_code == 201
    )


@pytest.mark.django_db
def test_contestar_guarda_el_mensaje_y_deja_la_observacion_respondida(
    client, hallazgo, proyectista
):
    client.force_login(dar(proyectista, "documents.view_comentario", "documents.add_comentario"))

    respuesta = client.post(
        ruta_de(hallazgo), {"texto": "  Corregido.  "}, content_type="application/json"
    )

    assert respuesta.status_code == 201
    datos = respuesta.json()
    assert datos["comentario"]["texto"] == "Corregido."  # sin el espacio de sobra
    assert datos["comentario"]["esMio"] is True
    assert datos["estado"] == Observacion.RESPONDIDA
    hallazgo.refresh_from_db()
    assert hallazgo.estado == Observacion.RESPONDIDA
    assert hallazgo.comentarios.get().autor == proyectista


@pytest.mark.django_db
def test_contestar_una_cerrada_no_la_reabre(client, hallazgo, proyectista):
    hallazgo.estado = Observacion.CERRADA
    hallazgo.save()
    client.force_login(dar(proyectista, "documents.add_comentario"))

    client.post(ruta_de(hallazgo), {"texto": "Gracias."}, content_type="application/json")

    hallazgo.refresh_from_db()
    assert hallazgo.estado == Observacion.CERRADA


@pytest.mark.django_db
@pytest.mark.parametrize("texto", ["", "   ", None])
def test_un_mensaje_vacio_contesta_400_y_no_guarda_nada(client, hallazgo, proyectista, texto):
    client.force_login(dar(proyectista, "documents.add_comentario"))

    respuesta = client.post(ruta_de(hallazgo), {"texto": texto}, content_type="application/json")

    assert respuesta.status_code == 400
    assert Comentario.objects.count() == 0


@pytest.mark.django_db
def test_no_se_contesta_en_el_hilo_de_otra_organizacion(client, proyectista):
    otra = Organizacion.objects.create(nombre="Otra", slug="otra-2")
    ajeno = Proyecto.objects.create(organizacion=otra, codigo="Y", nombre="Ajena")
    de_otra = Observacion.objects.create(
        organizacion=otra,
        proyecto=ajeno,
        titulo="Ajena",
        autor=proyectista,
        responsable=proyectista,
    )
    client.force_login(dar(proyectista, "documents.add_comentario"))

    respuesta = client.post(ruta_de(de_otra), {"texto": "Hola"}, content_type="application/json")

    assert respuesta.status_code == 404
    assert Comentario.objects.count() == 0


@pytest.mark.django_db
def test_si_el_aviso_falla_el_mensaje_queda_guardado(client, hallazgo, proyectista, monkeypatch):
    """Con el SMTP caído, un 500 con el comentario ya escrito haría que se reintentara y se
    duplicara: lo que se pierde es el aviso, no el mensaje."""

    def roto(_comentario):
        raise RuntimeError("SMTP caído")

    monkeypatch.setattr("apps.documents.notify.avisar_comentario", roto)
    client.force_login(dar(proyectista, "documents.add_comentario"))

    respuesta = client.post(
        ruta_de(hallazgo), {"texto": "Corregido."}, content_type="application/json"
    )

    assert respuesta.status_code == 201
    assert respuesta.json()["avisados"] is None
    assert Comentario.objects.count() == 1
