"""Las descargas se sirven **desde el archivo**, no desde una copia en memoria.

## El defecto

`FileResponse(BytesIO(storage.leer(clave)))`: **un IFC de 200 MB se materializaba entero en RAM para
servirlo**. El tope del registro son 200 MB y los archivos de obra los alcanzan —el COPC del CC 741
son 124,7 MB—, y `gunicorn.conf.py` pone `workers = cpu*2+1`: nueve en una VM de cuatro núcleos.
Tres descargas grandes a la vez son uno o dos gigas de memoria residente, y el final de esa historia
es el OOM killer llevándose un worker a mitad de otra cosa.

No fallaba nunca en desarrollo, porque los archivos de prueba pesan kilobytes.

## Y la trampa que hay al arreglarlo, que ya costó tres veces

`FileResponse` solo llama a `set_headers` cuando el contenido tiene `read`. Con `iter([bytes])` se
traga `as_attachment` y `filename` **sin avisar**, y el archivo llega sin `Content-Disposition`: el
navegador lo guarda con el nombre de la URL en vez del que la persona reconoce. Está escrito tres
veces en `views.py` porque apareció tres veces.

**Un archivo abierto tiene `read`**, así que cumple las dos cosas: no carga nada y el nombre llega.
Esta prueba comprueba las dos, porque arreglar una rompiendo la otra es exactamente lo que pasó.
"""

import hashlib

import pytest
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse

from apps.documents import storage
from apps.documents.models import Revision

PDF = b"%PDF-1.4\n% una revision de mentira\n%%EOF\n"


def dar(usuario, *permisos):
    from django.contrib.auth import get_user_model

    for permiso in permisos:
        app_label, codename = permiso.split(".")
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=usuario.pk)


@pytest.fixture
def revision_subida(db, entregable, proyectista, tmp_path):
    """Una revisión con su archivo en el disco, bajo un `DOCUMENTS_DIR` de prueba."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        clave = storage.clave_para(
            proyecto_codigo=entregable.proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=hashlib.sha256(PDF).hexdigest(),
            extension="pdf",
        )
        storage.guardar(clave, PDF)
        yield Revision.objects.create(
            entregable=entregable,
            correlativo="P01",
            clave_archivo=clave,
            sha256=hashlib.sha256(PDF).hexdigest(),
            nombre_original="Planta piso 5.pdf",
            subida_por=proyectista,
        )


@pytest.mark.django_db
def test_la_descarga_no_lee_el_archivo_entero(
    client, revision_subida, proyectista, tmp_path, monkeypatch
):
    """**El oráculo que distingue el caso bueno del malo.**

    Comparar los bytes no sirve: `BytesIO(leer(...))` devuelve exactamente los mismos. Lo que
    distingue es **cómo llegan**, y eso se puede preguntar directamente: se rompe `storage.leer`
    —el que trae el archivo entero a memoria— y se exige que la descarga siga funcionando.

    Antes del arreglo esto fallaba; ahora pasa porque la vista usa `storage.abrir`, que devuelve un
    archivo y deja que `FileResponse` lo mande por tramos.

    Se prueba así y no mirando las tripas de `FileResponse` a propósito: `file_to_stream` es un
    detalle interno de Django que no sobrevive al cliente de pruebas, y una prueba que se apoya en
    eso se rompe con una versión nueva sin que nada esté mal.
    """
    # `add_revision` además de `view_revision`: `solo_publicadas` esconde las que están en curso a
    # quien no puede subirlas, y la de esta prueba nace con la idoneidad por omisión.
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    def no_se_puede_leer_entero(clave):
        raise AssertionError(
            f"la descarga leyó {clave} entero en memoria: con un IFC de 200 MB y nueve workers, "
            "eso es el OOM killer"
        )

    monkeypatch.setattr(storage, "leer", no_se_puede_leer_entero)

    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(reverse("documents:descargar-revision", args=[revision_subida.pk]))

        assert respuesta.status_code == 200
        assert b"".join(respuesta.streaming_content) == PDF
        respuesta.close()


@pytest.mark.django_db
def test_y_el_nombre_que_la_persona_reconoce_sigue_llegando(
    client, revision_subida, proyectista, tmp_path
):
    """**La otra mitad, y la que se rompe al arreglar la primera.**

    `FileResponse` solo pone `Content-Disposition` cuando el contenido tiene `read`. Un iterador no
    lo tiene, y entonces el archivo llega con el nombre de la URL — sin error y sin aviso.
    """
    # `add_revision` además de `view_revision`: `solo_publicadas` esconde las que están en curso a
    # quien no puede subirlas, y la de esta prueba nace con la idoneidad por omisión.
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(reverse("documents:descargar-revision", args=[revision_subida.pk]))

        disposicion = respuesta.headers.get("Content-Disposition", "")
        assert "attachment" in disposicion
        assert "Planta piso 5.pdf" in disposicion

        assert b"".join(respuesta.streaming_content) == PDF
        respuesta.close()


@pytest.mark.django_db
def test_el_archivo_que_no_esta_sigue_dando_404(client, revision_subida, proyectista, tmp_path):
    """Abrir en vez de leer cambia **cuándo** falla: `open` levanta al abrir y `read_bytes` al leer.

    Si el `except` se hubiera quedado mirando el error de antes, un archivo borrado a mano daría un
    500 en vez de un 404 — y un 500 en una descarga se lee como «el servidor está roto».
    """
    # `add_revision` además de `view_revision`: `solo_publicadas` esconde las que están en curso a
    # quien no puede subirlas, y la de esta prueba nace con la idoneidad por omisión.
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        storage.ruta_de(revision_subida.clave_archivo).unlink()

        respuesta = client.get(reverse("documents:descargar-revision", args=[revision_subida.pk]))

    assert respuesta.status_code == 404
