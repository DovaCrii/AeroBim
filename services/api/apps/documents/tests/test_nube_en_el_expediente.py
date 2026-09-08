"""`F12.13`: **el levantamiento entra al expediente** y se abre desde ahí.

Hasta ahora la nube solo se podía abrir arrastrando un archivo del disco al lienzo. Eso deja el
levantamiento —que es un entregable de obra, con su fecha y su topógrafo— fuera del registro: no
tiene correlativo, no tiene idoneidad, y nadie puede decir cuál es la versión vigente.

Tres cosas se comprueban aquí, y son las tres mitades del requisito:

1. **Entra**: `.las` y `.laz` son extensiones aceptadas, con su firma comprobada.
2. **Se ofrece abrir solo lo que el visor sabe leer**: un `.copc.laz` sí, un `.laz` suelto no.
3. **Se sirve por tramos**: el COPC se lee por partes o no se lee (ver `test_rangos.py`).
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents import abribles, storage
from apps.documents.models import Idoneidad, Revision

#: La firma que declara la especificación LAS, y que llevan **las tres** variantes: LAS sin
#: comprimir, LAZ, y COPC —que es LAS 1.4 por dentro—.
FIRMA_LAS = b"LASF"


def revision_de(entregable, usuario, nombre, *, clave=None, correlativo="A1"):
    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=Idoneidad.A,
        subida_por=usuario,
        clave_archivo=clave or f"p/{entregable.codigo}/{nombre}",
        nombre_original=nombre,
        sha256="a" * 64,
        es_vigente=True,
    )


# --- 1. Entra al registro --------------------------------------------------------------


@pytest.mark.parametrize("extension", ["las", "laz"])
def test_las_y_laz_son_extensiones_aceptadas(extension):
    assert extension in storage.EXTENSIONES_ACEPTADAS


@pytest.mark.parametrize("nombre", ["levantamiento.las", "levantamiento.copc.laz"])
def test_una_nube_con_su_firma_se_acepta(nombre):
    # 4 bytes de firma + relleno: `validar` mira la cabecera, no el contenido.
    _clave, sha = storage.validar(nombre, FIRMA_LAS + b"\x00" * 200)
    assert len(sha) == 64


def test_se_acepta_el_las_original_y_no_solo_el_convertido():
    """**Es lo que entrega un topógrafo.**

    El visor solo abre COPC, y convertirlo es un paso posterior (`apps/web/scripts/a-copc.py`).
    Rechazar el original al entrar obligaría a convertir antes de archivar — o sea, a archivar solo
    la copia y perder el entregable.
    """
    _clave, _sha = storage.validar("Metro Camino Agricola Recortado.las", FIRMA_LAS + b"\x00" * 99)


def test_un_archivo_que_dice_ser_nube_y_no_lo_es_se_rechaza():
    """La extensión no basta: la firma es lo que se comprueba."""
    with pytest.raises(storage.CargaRechazada):
        storage.validar("mentira.laz", b"PK\x03\x04" + b"\x00" * 200)


# --- 2. Solo se ofrece abrir lo que el visor sabe leer ---------------------------------


@pytest.mark.django_db
def test_un_copc_se_abre_en_el_visor_de_modelos(db, entregable, proyectista):
    revision = revision_de(entregable, proyectista, "levantamiento.copc.laz")

    assert abribles.visor_de(revision) == abribles.VISOR_MODELO
    assert abribles.es_abrible(revision)


@pytest.mark.django_db
@pytest.mark.parametrize("nombre", ["levantamiento.laz", "levantamiento.las", "nube.LAS"])
def test_una_nube_sin_convertir_se_guarda_pero_no_se_ofrece_abrir(
    db, entregable, proyectista, nombre
):
    """**Un enlace que lleva a un visor que no sabe leerlo es peor que no ofrecerlo.**

    El visor lee COPC —el LAZ normal no lleva el octree dentro, así que no se puede pedir por
    partes—. El original se archiva igual y se descarga igual: lo que no se ofrece es abrirlo.
    """
    revision = revision_de(entregable, proyectista, nombre)

    assert abribles.visor_de(revision) is None


@pytest.mark.django_db
def test_la_extension_no_alcanza_para_distinguirlas(db, entregable, proyectista):
    """La trampa que obliga a mirar el nombre entero: `Path("x.copc.laz").suffix` es `.laz`.

    Si esta distinción se hiciera por extensión, un LAZ suelto y un COPC serían indistinguibles y
    los dos acabarían ofreciéndose — uno de ellos a una pantalla en blanco.
    """
    from pathlib import Path

    assert Path("levantamiento.copc.laz").suffix == Path("levantamiento.laz").suffix
    suelto = revision_de(entregable, proyectista, "a.laz", clave="p/a.laz", correlativo="A1")
    copc = revision_de(
        entregable, proyectista, "b.copc.laz", clave="p/b.copc.laz", correlativo="A2"
    )
    assert abribles.visor_de(suelto) != abribles.visor_de(copc)


# --- 3. Se sirve por tramos ------------------------------------------------------------


@pytest.fixture
def lector(client, db, proyectista):
    for etiqueta in ("view_revision", "view_entregable"):
        proyectista.user_permissions.add(Permission.objects.get(codename=etiqueta))
    usuario = get_user_model().objects.get(pk=proyectista.pk)
    client.force_login(usuario)
    return usuario


@pytest.mark.django_db
def test_el_contenido_se_sirve_por_tramos(client, lector, entregable, settings, tmp_path):
    """**Sin esto la nube del expediente no es usable**: 130 MB antes del primer punto.

    El visor lee la cabecera del COPC, decide qué nodos caen en pantalla y pide solo esos tramos.
    Aquí se comprueba la mitad del servidor: que un `Range` da `206` con **esos** bytes.
    """
    settings.DOCUMENTS_DIR = str(tmp_path)
    clave = "p/ENT/levantamiento.copc.laz"
    contenido = FIRMA_LAS + bytes(range(256)) * 2
    storage.guardar(clave, contenido)
    revision = revision_de(entregable, lector, "levantamiento.copc.laz", clave=clave)

    url = reverse("documents_api:revision-contenido", kwargs={"pk": revision.pk})

    completa = client.get(url)
    assert completa.status_code == 200
    assert completa["Accept-Ranges"] == "bytes"

    tramo = client.get(url, headers={"range": "bytes=4-19"})
    assert tramo.status_code == 206
    assert tramo["Content-Range"] == f"bytes 4-19/{len(contenido)}"
    assert tramo.content == contenido[4:20]


@pytest.mark.django_db
def test_la_cabecera_del_copc_son_unos_kilobytes_y_no_el_archivo(
    client, lector, entregable, settings, tmp_path
):
    """El primer gesto real de un lector de COPC: los primeros bytes, no el archivo.

    Se mide el `Content-Length` de la respuesta para que quede escrito que **no** se está sirviendo
    el archivo entero con un `206` de adorno.
    """
    settings.DOCUMENTS_DIR = str(tmp_path)
    clave = "p/ENT/grande.copc.laz"
    storage.guardar(clave, FIRMA_LAS + b"\x00" * 100_000)
    revision = revision_de(entregable, lector, "grande.copc.laz", clave=clave)

    url = reverse("documents_api:revision-contenido", kwargs={"pk": revision.pk})
    respuesta = client.get(url, headers={"range": "bytes=0-2047"})

    assert respuesta.status_code == 206
    assert respuesta["Content-Length"] == "2048"
    assert len(respuesta.content) == 2048
