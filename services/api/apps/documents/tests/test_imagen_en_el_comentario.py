"""Una captura adjunta al comentario: `F12.11`.

**Una queja del portal no llevaba imagen.** El caso que lo pide es el del piloto: alguien de la obra
encuentra que una pantalla no hace lo que espera, abre una observacion y tiene que contarla con
palabras. El otro camino era el que dejo escrito el plan —un entregable `PILOTO-CAPTURAS` con los
PNG sueltos y el correlativo citado a mano en el texto— y eso no es un hilo, es dos sitios.

Lo que se prueba aca son las tres cosas que pueden salir mal sin dar error: que el adjunto **se
guarde de verdad** —el `enctype` es facil de olvidar y no avisa—, que **la firma manda** sobre la
extension y el tipo declarado, y que **la imagen no se sirva a quien no puede ver la observacion**,
que es la parte con superficie de seguridad.
"""

import hashlib

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.documents import storage
from apps.documents.models import Comentario, Observacion

#: Un PNG minimo de verdad: la firma es lo que se comprueba, no la extension.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

#: Y un JPEG, porque una foto de obra es JPEG y una captura de pantalla es PNG.
JPEG = b"\xff\xd8\xff" + b"\x00" * 64


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def observacion(db, organizacion, proyecto, revision, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        revision=revision,
        titulo="La pantalla de observaciones no filtra por obra",
        autor=proyectista,
        responsable=proyectista,
    )


@pytest.fixture
def quien_comenta(proyectista):
    return dar(proyectista, "documents.view_observacion", "documents.add_comentario")


def comentar(client, observacion, **extra):
    return client.post(
        reverse("documents:comentar-observacion", args=[observacion.pk]),
        {"texto": "Esto es lo que sale en mi pantalla", **extra},
    )


# --- Que el adjunto llegue y se guarde ------------------------------------------------


@pytest.mark.django_db
def test_un_comentario_con_captura_la_guarda(
    client, quien_comenta, observacion, tmp_path, settings
):
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    comentar(client, observacion, imagen=SimpleUploadedFile("captura.png", PNG, "image/png"))

    comentario = Comentario.objects.get(observacion=observacion)
    assert comentario.imagen != ""
    # **La clave lleva el sha256 y no el nombre que vino de fuera**, que es la regla del almacen.
    assert hashlib.sha256(PNG).hexdigest() in comentario.imagen
    assert storage.leer(comentario.imagen) == PNG


@pytest.mark.django_db
def test_una_foto_jpeg_tambien(client, quien_comenta, observacion, tmp_path, settings):
    """Una captura de pantalla es PNG; **una foto de obra es JPEG**, y esto sirve para las dos."""
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    comentar(client, observacion, imagen=SimpleUploadedFile("grieta.jpg", JPEG, "image/jpeg"))

    assert Comentario.objects.get(observacion=observacion).imagen.endswith(".jpg")


@pytest.mark.django_db
def test_sin_adjunto_el_comentario_sigue_siendo_un_comentario(client, quien_comenta, observacion):
    """**La imagen es opcional**: casi todos los comentarios son texto y asi tienen que seguir."""
    client.force_login(quien_comenta)

    comentar(client, observacion)

    assert Comentario.objects.get(observacion=observacion).imagen == ""


@pytest.mark.django_db
def test_el_formulario_manda_multipart(client, quien_comenta, observacion):
    """**El `enctype` es la trampa de esta tarea y no da error.**

    Sin `multipart/form-data` el navegador manda el formulario como texto, el archivo no viaja, el
    comentario se guarda sin imagen y nadie se entera. Solo se ve echando en falta la captura, asi
    que lo comprueba una prueba sobre la plantilla.
    """
    client.force_login(quien_comenta)

    html = client.get(reverse("documents:observacion", args=[observacion.pk])).content.decode()
    formulario = html[html.index('id="responder"') - 200 : html.index('id="responder"') + 400]

    assert 'enctype="multipart/form-data"' in formulario
    assert 'type="file"' in html


# --- Lo que no se acepta --------------------------------------------------------------


@pytest.mark.django_db
def test_un_ejecutable_renombrado_a_png_no_pasa(
    client, quien_comenta, observacion, tmp_path, settings
):
    """**La firma manda, no la extension ni el tipo que declara el navegador**, que los escribe
    quien manda. Es la misma comprobacion con la que se cae `virus.exe` renombrado a `plano.pdf`."""
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    comentar(
        client,
        observacion,
        imagen=SimpleUploadedFile("captura.png", b"MZ\x90\x00" + b"\x00" * 64, "image/png"),
    )

    assert not Comentario.objects.filter(observacion=observacion).exists()


@pytest.mark.django_db
def test_un_pdf_no_es_una_imagen(client, quien_comenta, observacion, tmp_path, settings):
    """Un PDF adjunto a un comentario **es un documento**, o sea un entregable con su codigo y su
    revision. Aceptarlo aqui es como se pierde la trazabilidad de un documento de obra."""
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    comentar(
        client, observacion, imagen=SimpleUploadedFile("plano.pdf", b"%PDF-1.7", "application/pdf")
    )

    assert not Comentario.objects.filter(observacion=observacion).exists()


@pytest.mark.django_db
def test_el_rechazo_se_dice_en_vez_de_callarse(
    client, quien_comenta, observacion, tmp_path, settings
):
    """**Al contrario que la camara del visor**, que se descarta en silencio.

    Ahi el parametro lo genera el programa; aqui **la persona eligio el archivo a mano**, y guardar
    su comentario sin la imagen que adjunto seria decirle que salio bien.
    """
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    respuesta = comentar(
        client,
        observacion,
        imagen=SimpleUploadedFile("apunte.txt", b"no soy una imagen", "text/plain"),
    )

    mensajes = [str(m) for m in respuesta.wsgi_request._messages]
    assert mensajes, "el rechazo tiene que decirse"


# --- Quien puede verla ----------------------------------------------------------------


@pytest.fixture
def comentario_con_imagen(db, observacion, quien_comenta, tmp_path, settings, client):
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)
    comentar(client, observacion, imagen=SimpleUploadedFile("captura.png", PNG, "image/png"))
    client.logout()
    return Comentario.objects.get(observacion=observacion)


def ruta_de_la_imagen(comentario):
    return reverse("documents:imagen-de-comentario", args=[comentario.pk])


@pytest.mark.django_db
def test_la_imagen_se_sirve_en_linea_a_quien_puede_ver(
    client, quien_comenta, comentario_con_imagen, tmp_path, settings
):
    """**En linea y no como descarga**: el punto de la imagen es verla en el hilo."""
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(quien_comenta)

    respuesta = client.get(ruta_de_la_imagen(comentario_con_imagen))

    assert respuesta.status_code == 200
    assert respuesta["Content-Type"] == "image/png"
    assert b"attachment" not in respuesta.get("Content-Disposition", "").encode()


@pytest.mark.django_db
def test_sin_sesion_no_se_sirve(client, comentario_con_imagen):
    """Es dato de obra: vive fuera de lo que el servidor web sirve a cualquiera, y pasa por aqui."""
    respuesta = client.get(ruta_de_la_imagen(comentario_con_imagen))

    assert respuesta.status_code in (302, 403)


@pytest.mark.django_db
def test_sin_el_permiso_de_ver_la_observacion_tampoco(client, comentario_con_imagen, revisor):
    """**El permiso es el de la observacion y no el del comentario**, y lo enseño esta prueba.

    La ficha del hallazgo dibuja el hilo entero a quien puede ver la observacion, sin pedir
    `view_comentario` por separado. Con el permiso mas estricto en la vista de la imagen, esa misma
    persona veria el hilo con **las imagenes roras**: una vista mas severa que la pantalla que la
    usa no protege nada, solo rompe la pantalla.
    """
    client.force_login(revisor)

    assert client.get(ruta_de_la_imagen(comentario_con_imagen)).status_code == 403


@pytest.mark.django_db
def test_un_comentario_sin_imagen_no_tiene_imagen_que_servir(client, quien_comenta, observacion):
    """404 y no una respuesta vacia: pedir la imagen de un comentario que no la tiene es un error de
    quien pide, y una imagen de cero bytes se veria como un adjunto roto."""
    client.force_login(quien_comenta)
    comentar(client, observacion)
    comentario = Comentario.objects.get(observacion=observacion)

    assert client.get(ruta_de_la_imagen(comentario)).status_code == 404
