"""**El IFC comprimido (`.ifczip`) se desempaqueta al entrar** (2026-09-28).

Por un proyecto de metro: el tope del registro son 200 MB y un modelo de estación o de túnel los
pasa, mientras que el mismo IFC comprimido cabe de sobra. Ver `apps/documents/ifczip.py`.

## Lo que se sujeta

1. **Lo que se archiva es el IFC de dentro**, byte a byte, con su huella y su nombre de modelo: si
   se archivara el zip, el visor, las interferencias y el IDS lo abrirían como si fuera STEP.
2. **Las guardas**: un solo `.ifc`, un tope contado al descomprimir y no creído de la cabecera, y
   un zip roto o cifrado que da un motivo y no un 500.
3. **Ningún temporal se queda en el disco**, tampoco cuando el formulario falla por otra cosa: un
   giga por intento llena el disco sin avisar.
"""

import hashlib
import io
import zipfile
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.documents import ifczip
from apps.documents.models import Idoneidad, Revision
from apps.documents.revisar import modelos_vigentes

MODELO = (
    Path(settings.REPO_DIR)
    / "apps"
    / "web"
    / "public"
    / "samples"
    / "interferencias-a-proposito.ifc"
).read_bytes()


def comprimido(miembros: dict[str, bytes]) -> bytes:
    sobre = io.BytesIO()
    with zipfile.ZipFile(sobre, "w", zipfile.ZIP_DEFLATED) as zipeado:
        for nombre, contenido in miembros.items():
            zipeado.writestr(nombre, contenido)
    return sobre.getvalue()


@pytest.fixture
def almacen(settings, tmp_path):
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    return settings.DOCUMENTS_DIR


@pytest.fixture
def quien_sube(client, revisor):
    from django.contrib.auth import get_user_model

    for codename in ("add_revision", "view_entregable"):
        revisor.user_permissions.add(
            Permission.objects.get(content_type__app_label="documents", codename=codename)
        )
    usuario = get_user_model().objects.get(pk=revisor.pk)
    client.force_login(usuario)
    return usuario


def subir(client, entregable, contenido: bytes, nombre="Estacion-E3.ifczip", correlativo="P01"):
    return client.post(
        reverse("documents:subir-revision", args=[entregable.pk]),
        data={
            "correlativo": correlativo,
            "idoneidad": Idoneidad.S3,
            "archivo": SimpleUploadedFile(nombre, contenido, content_type="application/zip"),
        },
    )


def temporales(almacen) -> list[Path]:
    raiz = Path(almacen)
    return list(raiz.rglob("*.parcial")) if raiz.exists() else []


# --- Lo que se archiva ------------------------------------------------------------------


@pytest.mark.django_db
def test_se_archiva_el_ifc_de_dentro_con_su_huella(client, entregable, quien_sube, almacen):
    from apps.documents import storage

    respuesta = subir(client, entregable, comprimido({"model.ifc": MODELO}))

    assert respuesta.status_code == 302
    revision = Revision.objects.get(entregable=entregable)
    # El nombre es el del sobre —el que eligió quien sube— con extensión de modelo.
    assert revision.nombre_original == "Estacion-E3.ifc"
    assert revision.sha256 == hashlib.sha256(MODELO).hexdigest()
    assert revision.tamano_bytes == len(MODELO)
    assert storage.ruta_de(revision.clave_archivo).read_bytes() == MODELO
    assert revision.clave_archivo.endswith(".ifc")
    # Y se lee como cualquier IFC: los metadatos salen al subir.
    assert revision.metadatos
    assert temporales(almacen) == []


@pytest.mark.django_db
def test_entra_en_la_revision_de_interferencias(client, entregable, quien_sube, almacen):
    """El filtro de `modelos_vigentes` mira el nombre: si quedara `.ifczip`, no se cruzaría."""
    subir(client, entregable, comprimido({"model.ifc": MODELO}))
    Revision.objects.filter(entregable=entregable).update(idoneidad=Idoneidad.A)

    assert len(modelos_vigentes(entregable.proyecto)) == 1


# --- Las guardas -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "miembros",
    [
        {"a.ifc": MODELO, "b.ifc": MODELO},
        {"leeme.txt": b"sin modelo"},
    ],
    ids=["dos-modelos", "ninguno"],
)
@pytest.mark.django_db
def test_tiene_que_traer_un_solo_modelo(client, entregable, quien_sube, almacen, miembros):
    respuesta = subir(client, entregable, comprimido(miembros))

    assert respuesta.status_code == 400
    assert "exactamente un" in respuesta.content.decode()
    assert not Revision.objects.filter(entregable=entregable).exists()


@pytest.mark.django_db
def test_el_tope_se_cuenta_al_descomprimir(client, entregable, quien_sube, almacen, monkeypatch):
    """**No se cree la cabecera del zip**, que la escribe quien lo manda. Aquí el tope se baja por
    debajo del modelo y tiene que saltar mientras sale, dejando el disco limpio."""
    monkeypatch.setattr(ifczip, "TAMANO_MAXIMO_DESCOMPRIMIDO", len(MODELO) // 2)

    respuesta = subir(client, entregable, comprimido({"model.ifc": MODELO}))

    assert respuesta.status_code == 400
    assert "navegador" in respuesta.content.decode()
    assert temporales(almacen) == []


@pytest.mark.django_db
def test_un_zip_cortado_da_un_motivo_y_no_un_500(client, entregable, quien_sube, almacen):
    """Una subida que la red cortó a medias: la firma de zip está, los datos no."""
    entero = comprimido({"model.ifc": MODELO * 20})
    cortado = entero[: len(entero) // 2]

    respuesta = subir(client, entregable, cortado)

    assert respuesta.status_code == 400
    assert temporales(almacen) == []


@pytest.mark.django_db
def test_lo_de_dentro_tiene_que_ser_texto(client, entregable, quien_sube, almacen):
    """La misma regla que un `.ifc` suelto: un ejecutable renombrado dentro de un zip no entra."""
    respuesta = subir(client, entregable, comprimido({"model.ifc": b"\x00MZ\x90" * 2000}))

    assert respuesta.status_code == 400
    assert temporales(almacen) == []


@pytest.mark.django_db
def test_con_el_formulario_invalido_tampoco_queda_el_temporal(
    client, entregable, quien_sube, almacen
):
    """El correlativo repetido falla el formulario **después** de desempaquetar: el archivo se
    valida igual. Es justo el camino donde un temporal se olvidaba."""
    subir(client, entregable, comprimido({"model.ifc": MODELO}), correlativo="P01")

    respuesta = subir(client, entregable, comprimido({"model.ifc": MODELO}), correlativo="P01")

    assert respuesta.status_code == 400
    assert temporales(almacen) == []
