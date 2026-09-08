"""El criterio de aceptación de la Fase 3, que no tenía prueba.

`MASTER_PLAN.md` lo dice así: **«un modelo subido sobrevive al cierre del navegador, y la versión
anterior sigue recuperable»**. La primera mitad la cubre cualquier prueba que lea de la base de
datos; la segunda **no estaba probada en ningún sitio**, y es la que de verdad importa: es la que
contesta *«¿qué decía el plano cuando se aprobó la etapa?»*, la pregunta que llega seis meses
después y con un abogado detrás.

Lo que se comprueba no es que el registro guarde dos filas —eso es trivial— sino las tres cosas que
pueden romperlo sin que se note:

- que la revisión anterior **siga descargándose**, y no solo exista;
- que devuelva **sus propios bytes** y no los de la nueva, que es lo que pasaría si la clave del
  archivo se derivara del entregable en vez del contenido;
- y que **relevar no sea borrar**: la anterior deja de ser vigente y sigue estando.
"""

import hashlib

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.documents import storage
from apps.documents.models import Idoneidad, Revision

PRIMERA = b"%PDF-1.7\n% la primera version\n%%EOF\n"
SEGUNDA = b"%PDF-1.7\n% la segunda, con el muro corregido\n%%EOF\n"


def guardar_revision(entregable, quien, correlativo: str, contenido: bytes) -> Revision:
    """Sube una revisión por el mismo camino que la pantalla: validar, clave, guardar."""
    extension, sha = storage.validar(f"{correlativo}.pdf", contenido)
    clave = storage.clave_para(
        proyecto_codigo=entregable.proyecto.codigo,
        entregable_codigo=entregable.codigo,
        sha256=sha,
        extension=extension,
    )
    storage.guardar(clave, contenido)
    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=Idoneidad.A,
        subida_por=quien,
        clave_archivo=clave,
        nombre_original=f"Planta {correlativo}.pdf",
        tamano_bytes=len(contenido),
        sha256=sha,
    )


@pytest.mark.django_db
def test_la_version_anterior_sigue_recuperable(client, entregable, proyectista, tmp_path):
    with override_settings(DOCUMENTS_DIR=tmp_path):
        primera = guardar_revision(entregable, proyectista, "A1", PRIMERA)
        segunda = guardar_revision(entregable, proyectista, "A2", SEGUNDA)

        # **Relevar no es borrar.** La anterior deja de ser la vigente y sigue estando.
        primera.refresh_from_db()
        segunda.refresh_from_db()
        assert primera.es_vigente is False
        assert segunda.es_vigente is True
        assert entregable.revisiones.count() == 2
        assert entregable.revision_vigente == segunda

        from django.contrib.auth.models import Permission

        for etiqueta in ("view_revision", "add_revision"):
            proyectista.user_permissions.add(
                Permission.objects.get(content_type__app_label="documents", codename=etiqueta)
            )
        client.force_login(proyectista)

        # Y las dos se descargan, **cada una con sus propios bytes**. Si la clave del archivo se
        # derivara del entregable en vez del contenido, la segunda habría pisado a la primera y
        # las dos descargas devolverían lo mismo — con el registro diciendo que son distintas.
        for revision, esperado in ((primera, PRIMERA), (segunda, SEGUNDA)):
            respuesta = client.get(reverse("documents:descargar-revision", args=[revision.pk]))
            assert respuesta.status_code == 200
            recibido = b"".join(respuesta.streaming_content)
            assert recibido == esperado
            # Y el sha del registro es el del archivo que llegó: es la prueba de que lo que se
            # descarga es lo que se aprobó.
            assert hashlib.sha256(recibido).hexdigest() == revision.sha256


@pytest.mark.django_db
def test_subir_dos_veces_el_mismo_archivo_no_lo_duplica_en_el_disco(
    entregable, proyectista, tmp_path
):
    """**La clave sale del contenido, así que re-subir lo mismo es idempotente.**

    Pasa de verdad: alguien vuelve a subir el archivo porque no está seguro de que la primera vez
    funcionara. Con una clave derivada del nombre o de un correlativo habría dos copias del mismo
    plano ocupando disco, y ninguna forma de saber que son la misma.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        una = guardar_revision(entregable, proyectista, "A1", PRIMERA)
        otra = guardar_revision(entregable, proyectista, "A2", PRIMERA)

        assert una.sha256 == otra.sha256
        assert una.clave_archivo == otra.clave_archivo
        # Dos revisiones en el registro —son dos actos— y **un solo archivo en el disco**.
        assert len(list(tmp_path.rglob("*.pdf"))) == 1
