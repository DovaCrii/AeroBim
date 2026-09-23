"""**Un correlativo repetido daba un 500 y dejaba el archivo en disco.**

Lo encontré escribiendo la publicación desde el visor: al decidir en qué orden comprobar las cosas
allí, medí lo que hace la pantalla del portal y hace lo contrario.

## Lo que pasaba

`SubirRevisionView` escribe el archivo —`storage.guardar_subida`— y **después** llama a
`revision.save()`. El `UniqueConstraint` sobre `(entregable, correlativo)` revienta ahí con un
`IntegrityError`, o sea:

- quien sube ve una página de error del servidor, sin saber que lo único mal era el correlativo;
- y en el disco queda un archivo que ninguna fila nombra.

Y con un DWG es peor: antes de llegar al `save()` se ejecuta el conversor, que tiene cinco minutos
de tope. Se espera la conversión entera para acabar en un 500.

## Por qué Django no lo cazaba solo

Un `ModelForm` sí valida las restricciones de unicidad en `_post_clean` — pero **excluye toda
restricción que toque un campo ausente del formulario**, y `entregable` no está: lo pone la vista
después de `save(commit=False)`. Así que la comprobación se saltaba sin que nada lo dijera.

## Y el oráculo

**No es el código de estado.** Que la respuesta sea 400 no dice si el archivo llegó a escribirse
antes de fallar; eso solo lo dice el disco. Es la misma medida que usa
`test_publicar_desde_el_visor.py`, y por el mismo motivo.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.documents.models import Idoneidad, Revision

#: Un DXF mínimo. Va sin firma binaria a propósito: `dxf` está en `SIN_FIRMA`, así que lo que se
#: prueba es el correlativo y no la validación del archivo.
DXF = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"


def dar(user, *etiquetas):
    from django.contrib.auth import get_user_model

    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def _lo_guardado() -> set[str]:
    raiz = Path(settings.DOCUMENTS_DIR)
    if not raiz.exists():
        return set()
    return {str(uno.relative_to(raiz)) for uno in raiz.rglob("*") if uno.is_file()}


def subir(client, entregable, correlativo, nombre="planta.dxf"):
    return client.post(
        reverse("documents:subir-revision", args=[entregable.pk]),
        data={
            "correlativo": correlativo,
            "idoneidad": Idoneidad.S3,
            "archivo": SimpleUploadedFile(nombre, DXF, content_type="application/dxf"),
        },
    )


@pytest.fixture
def quien_sube(client, revisor):
    usuario = dar(revisor, "documents.add_revision", "documents.view_entregable")
    client.force_login(usuario)
    return usuario


@pytest.mark.django_db
def test_un_correlativo_repetido_no_da_un_500(client, entregable, quien_sube):
    subir(client, entregable, "P01")

    respuesta = subir(client, entregable, "P01", nombre="otra.dxf")

    assert respuesta.status_code == 400, "un correlativo tomado lo arregla quien sube, no un 500"
    assert Revision.objects.filter(entregable=entregable).count() == 1


@pytest.mark.django_db
def test_y_dice_cual_es_el_problema_en_su_campo(client, entregable, quien_sube):
    subir(client, entregable, "P01")

    respuesta = subir(client, entregable, "P01", nombre="otra.dxf")

    # El error va **en el campo**, que es lo que lo pone al lado de lo que hay que cambiar.
    assert "correlativo" in respuesta.context["form"].errors
    assert "P01" in str(respuesta.context["form"].errors["correlativo"])


@pytest.mark.django_db
def test_y_no_deja_el_archivo_en_el_disco(client, entregable, quien_sube):
    """**El oráculo de verdad.** Un 400 no dice si el archivo llegó a escribirse antes de fallar."""
    subir(client, entregable, "P01")
    antes = _lo_guardado()

    subir(client, entregable, "P01", nombre="otra-distinta.dxf")

    assert _lo_guardado() == antes, "se guardó el archivo de una subida que no llegó a hacerse"


@pytest.mark.django_db
def test_el_correlativo_se_normaliza_como_los_demas_codigos(client, entregable, quien_sube):
    """`Proyecto` y `Disciplina` ya suben su código a mayúsculas; el correlativo no lo hacía."""
    subir(client, entregable, "  p01 ")

    assert Revision.objects.get(entregable=entregable).correlativo == "P01"


@pytest.mark.django_db
def test_y_por_eso_p01_y_P01_no_pueden_convivir(client, entregable, quien_sube):
    """**La comparación es insensible a mayúsculas a propósito.**

    La restricción de la base no lo es, así que sin esto el mismo expediente podía acabar con dos
    revisiones que se leen igual. Lo que importa no es lo que la base admita.
    """
    Revision.objects.create(
        entregable=entregable,
        correlativo="p01",
        idoneidad=Idoneidad.S3,
        subida_por=quien_sube,
        clave_archivo="p/e/vieja.dxf",
        nombre_original="vieja.dxf",
        sha256="c" * 64,
    )

    respuesta = subir(client, entregable, "P01")

    assert respuesta.status_code == 400
    assert Revision.objects.filter(entregable=entregable).count() == 1


@pytest.mark.django_db
def test_la_carrera_tampoco_da_un_500(client, entregable, quien_sube, monkeypatch):
    """**Lo que el formulario no puede cerrar**, y la razón de que el `save()` vaya en su `atomic`.

    `clean_correlativo` mira la base; dos subidas simultáneas del mismo correlativo pasan las dos
    esa mirada y la segunda choca en el `INSERT`. Es la única comprobación que no se puede
    adelantar.

    Se simula colando la fila entre la validación y el guardado, que es exactamente lo que hace la
    otra petición. Y sin el `atomic` esto no se puede ni escribir: el `IntegrityError` deja la
    transacción de la prueba rota, así que dibujar el formulario falla al primer `SELECT` con un
    `TransactionManagementError` — que es como lo descubrí.
    """
    from apps.documents.forms import RevisionForm

    original = RevisionForm.clean_correlativo

    def cuela(self):
        correlativo = original(self)
        Revision.objects.get_or_create(
            entregable=self.entregable,
            correlativo=correlativo,
            defaults={
                "idoneidad": Idoneidad.S3,
                "subida_por": quien_sube,
                "clave_archivo": "p/e/carrera.dxf",
                "nombre_original": "carrera.dxf",
                "sha256": "e" * 64,
            },
        )
        return correlativo

    monkeypatch.setattr(RevisionForm, "clean_correlativo", cuela)

    respuesta = subir(client, entregable, "P01")

    assert respuesta.status_code == 409, "una carrera es un conflicto, no un error del servidor"
    assert "correlativo" in respuesta.context["form"].errors
    assert Revision.objects.filter(entregable=entregable).count() == 1


@pytest.mark.django_db
def test_lo_que_no_choca_sigue_subiendo(client, entregable, quien_sube):
    """La otra mitad: una validación que rechaza siempre pasaría igual de verde."""
    assert subir(client, entregable, "P01").status_code == 302
    assert subir(client, entregable, "P02", nombre="otra.dxf").status_code == 302

    assert Revision.objects.filter(entregable=entregable).count() == 2
