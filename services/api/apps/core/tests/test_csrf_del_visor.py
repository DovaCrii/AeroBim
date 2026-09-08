"""Que el visor pueda escribir de verdad, y no solo desde las pruebas.

**El cliente de pruebas de Django no comprueba CSRF**, así que una configuración que rompe todas las
escrituras del navegador puede pasar el gate entero en verde. Es lo que pasó: con
`CSRF_COOKIE_HTTPONLY = True`, el testigo era ilegible desde JavaScript, `testigoCsrf()` del visor
devolvía siempre cadena vacía y **cada `POST` del visor moría con `403 CSRF Failed: CSRF token
missing`**: dejar una nota sobre un elemento, descartar un conflicto, marcar la coordinación como
vista y guardar una vista compartida.

Cuatro capacidades enteras que nunca funcionaron en un navegador, y ninguna prueba lo veía.

Lo destapó el usuario intentando anotar un elemento con un rol que **sí** tiene `add_observacion`, y
el visor le decía «tu sesión caducó o tu rol no puede abrir observaciones»: ni una cosa ni la otra.

Así que estas pruebas hacen lo que el navegador hace, y solo eso: **usan `enforce_csrf_checks` y
mandan el testigo que JavaScript puede leer de la cookie**. Si alguien vuelve a poner la cookie en
`HttpOnly`, fallan aquí en vez de descubrirse anotando en obra.
"""

import json

import pytest
from django.contrib.auth.models import Permission
from django.test import Client
from django.urls import reverse

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def como_el_navegador(usuario) -> tuple[Client, str]:
    """Un cliente que **sí** comprueba CSRF, con el testigo leído como lo lee el visor.

    Devuelve el cliente y el valor del testigo. La `GET` inicial no es ceremonia: es la que hace que
    Django escriba la cookie, igual que la primera carga de la página en el navegador.
    """
    cliente = Client(enforce_csrf_checks=True)
    cliente.force_login(usuario)
    cliente.get(reverse("portal"))
    return cliente, cliente.cookies["csrftoken"].value


def dar(user, *permisos):
    from django.contrib.auth import get_user_model

    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.mark.django_db
def test_el_testigo_de_csrf_lo_puede_leer_javascript(proyectista):
    """**Es la causa raíz, y va como prueba propia** para que el fallo señale al ajuste y no a una
    de las cuatro pantallas que rompía.

    El visor lee `document.cookie`; con `HttpOnly` puesto, ahí no hay nada que leer.
    """
    cliente, _testigo = como_el_navegador(proyectista)

    cookie = cliente.cookies["csrftoken"]

    # Django deja la bandera como cadena vacía cuando no está puesta.
    assert not cookie["httponly"], (
        "La cookie de CSRF es HttpOnly, así que el visor no puede leer el testigo y todas sus "
        "escrituras devuelven 403. La de sesión sí debe ser HttpOnly; esta no puede."
    )
    # Y la de sesión sigue guardada, que es la que de verdad protege.
    assert cliente.cookies["sessionid"]["httponly"]


@pytest.mark.django_db
def test_dejar_una_nota_desde_el_visor_funciona_en_un_navegador(revision, proyectista):
    """La capacidad completa, con CSRF de verdad: es lo que el usuario no podía hacer.

    Lleva `change_revision` además de los dos obvios porque **la revisión de la fixture está en
    `S3`, o sea en curso**, y `solo_publicadas` se la esconde a quien no puede editar revisiones.
    Eso no tiene que ver con CSRF, pero sin ello la prueba daría 404 y no probaría nada: un 404
    también llega después de pasar el CSRF.
    """
    quien = dar(
        proyectista,
        "documents.view_revision",
        "documents.change_revision",
        "documents.add_observacion",
    )
    cliente, testigo = como_el_navegador(quien)
    ruta = reverse("documents_api:revision-observaciones", args=[revision.pk])

    respuesta = cliente.post(
        ruta,
        json.dumps({"titulo": "El pilar choca con el conducto", "guid": GUID}),
        content_type="application/json",
        headers={"x-csrftoken": testigo},
    )

    assert respuesta.status_code == 201, respuesta.content
    assert revision.observaciones.count() == 1


@pytest.mark.django_db
def test_sin_el_testigo_sigue_siendo_403(revision, proyectista):
    """**La protección no se ha quitado, solo se ha hecho legible.** Sin testigo no se escribe, que
    es justamente lo que impide que otro sitio mande la petición por ti."""
    quien = dar(
        proyectista,
        "documents.view_revision",
        "documents.change_revision",
        "documents.add_observacion",
    )
    cliente, _testigo = como_el_navegador(quien)

    respuesta = cliente.post(
        reverse("documents_api:revision-observaciones", args=[revision.pk]),
        json.dumps({"titulo": "Sin testigo"}),
        content_type="application/json",
    )

    assert respuesta.status_code == 403
    assert b"CSRF" in respuesta.content


@pytest.mark.django_db
def test_un_testigo_de_otra_sesion_tampoco_vale(revision, proyectista, revisor):
    """Que sea legible no lo hace intercambiable: el testigo va atado a la sesión que lo recibió."""
    quien = dar(
        proyectista,
        "documents.view_revision",
        "documents.change_revision",
        "documents.add_observacion",
    )
    cliente, _mio = como_el_navegador(quien)
    _otro_cliente, ajeno = como_el_navegador(revisor)

    respuesta = cliente.post(
        reverse("documents_api:revision-observaciones", args=[revision.pk]),
        json.dumps({"titulo": "Con el testigo de otro"}),
        content_type="application/json",
        headers={"x-csrftoken": ajeno},
    )

    assert respuesta.status_code == 403


@pytest.mark.django_db
def test_marcar_la_coordinacion_como_vista_tambien_escribe(proyecto, proyectista):
    """La segunda de las cuatro que estaban rotas. Va aparte porque **pide otro permiso**
    —`view_observacion`, no `add_*`— y un fallo en cualquiera de las dos cosas da el mismo 403."""
    quien = dar(proyectista, "documents.view_observacion")
    cliente, testigo = como_el_navegador(quien)

    respuesta = cliente.post(
        reverse("documents_api:proyecto-coordinacion-vista", args=[proyecto.pk]),
        json.dumps({}),
        content_type="application/json",
        headers={"x-csrftoken": testigo},
    )

    assert respuesta.status_code == 200, respuesta.content
