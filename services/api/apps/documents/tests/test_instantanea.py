"""La foto de lo que se estaba mirando: leerla del visor, guardarla y meterla en el BCF.

**Un tema de BCF sin imagen es media observacion.** Todo visor del mercado dibuja la lista de temas
con su miniatura al lado, y es lo que hace que quien la recibe sepa de que se le habla antes de
cargar el modelo. Los nuestros salian sin ninguna.

El oraculo del archivo sigue siendo `bcf-client`, la implementacion de referencia de buildingSMART:
es quien lee el `<Snapshot>` del markup y saca los bytes del ZIP.
"""

import base64
import json
import zlib

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.bcf import NOMBRE_INSTANTANEA, exportar
from apps.documents.instantanea import BYTES_MAXIMOS, LARGO_MAXIMO, PREFIJO, leer
from apps.documents.models import Idoneidad, Observacion, Revision

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def png(ancho: int = 2, alto: int = 2) -> bytes:
    """Un PNG valido de verdad, escrito a mano.

    **Se construye en vez de guardarse como fixture** por la misma regla del repositorio que impide
    versionar archivos de proyecto: un binario en el arbol es algo que nadie vuelve a mirar. Y
    ademas asi la prueba dice de que esta hecho lo que compara.
    """

    def trozo(etiqueta: bytes, datos: bytes) -> bytes:
        cuerpo = etiqueta + datos
        return len(datos).to_bytes(4, "big") + cuerpo + zlib.crc32(cuerpo).to_bytes(4, "big")

    cabecera = ancho.to_bytes(4, "big") + alto.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    crudo = b"".join(b"\x00" + b"\xff\x00\x00" * ancho for _ in range(alto))
    return (
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", cabecera)
        + trozo(b"IDAT", zlib.compress(crudo))
        + trozo(b"IEND", b"")
    )


def data_url(datos: bytes) -> str:
    return PREFIJO + base64.b64encode(datos).decode()


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


# --- Lo que se acepta y lo que no ----------------------------------------------------


def test_un_png_del_lienzo_pasa_entero():
    imagen = png()
    assert leer(data_url(imagen)) == imagen


def test_sin_dato_no_hay_instantanea():
    assert leer(None) is None
    assert leer("") is None


def test_solo_se_acepta_png_y_solo_de_un_lienzo():
    """Aceptar cualquier `data:` abriria la puerta a guardar un SVG —que lleva scripts— o un
    archivo cualquiera con la cabecera cambiada."""
    assert leer("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=") is None
    assert leer("data:text/plain;base64,aG9sYQ==") is None
    assert leer("no es un data url") is None


def test_la_firma_manda_y_no_la_cabecera_del_data_url():
    """La cabecera la escribe quien manda; los primeros bytes son el archivo. Es la misma
    comprobacion con la que se cae `virus.exe` renombrado a `plano.pdf`."""
    assert leer(PREFIJO + base64.b64encode(b"MZ\x90\x00 esto es un ejecutable").decode()) is None


def test_un_base64_roto_no_revienta():
    assert leer(PREFIJO + "no-es-base64-valido!!!") is None


def test_una_imagen_enorme_se_descarta_antes_de_decodificarla():
    """El tope de caracteres esta **por debajo del limite de Django** para el cuerpo de una
    peticion: asi el campo que sobra se rechaza aca, con un motivo, en vez de que el framework
    devuelva un 400 sin decir cual era."""
    assert leer(PREFIJO + "A" * LARGO_MAXIMO) is None


def test_el_tope_decodificado_va_acompasado_con_el_de_la_cadena():
    """Base64 crece un tercio: si el tope de bytes fuera mayor que el de caracteres, nunca se
    alcanzaria y el segundo no diria nada."""
    assert BYTES_MAXIMOS < LARGO_MAXIMO


# --- En el BCF -----------------------------------------------------------------------


@pytest.fixture
def observacion(db, organizacion, proyecto, revisor, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga del eje C choca con el ducto",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )


def leer_bcf(contenido: bytes, tmp_path):
    from bcf.v2.bcfxml import BcfXml

    ruta = tmp_path / "salida.bcf"
    ruta.write_bytes(contenido)
    return BcfXml.load(ruta)


@pytest.mark.django_db
def test_la_foto_viaja_en_el_zip_y_bcf_client_la_encuentra(
    observacion, tmp_path, settings, monkeypatch
):
    """**Es el oraculo que importa**: no que nosotros escribamos un archivo, sino que el lector de
    buildingSMART siga el `<Snapshot>` del markup y saque los bytes."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"

    from apps.documents import storage

    imagen = png()
    clave = storage.clave_para(
        proyecto_codigo="716-LCD", entregable_codigo="EST-001", sha256="a" * 64, extension="png"
    )
    storage.guardar(clave, imagen)
    observacion.instantanea = clave
    observacion.save(update_fields=["instantanea"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0]

    assert vista.snapshot == imagen


@pytest.mark.django_db
def test_sin_foto_el_tema_sale_igual_y_sin_declararla(observacion, tmp_path):
    """Una observacion que no viene del visor no tiene pantalla que fotografiar, y el tema sigue
    valiendo: dice que hay un problema, quien lo abrio y a quien le toca."""
    import zipfile
    from io import BytesIO

    contenido = exportar([observacion], "716-LCD")

    with zipfile.ZipFile(BytesIO(contenido)) as zip_bcf:
        assert f"{observacion.pk}/{NOMBRE_INSTANTANEA}" not in zip_bcf.namelist()
        assert "<Snapshot>" not in zip_bcf.read(f"{observacion.pk}/markup.bcf").decode()

    documento = leer_bcf(contenido, tmp_path)
    [tema] = list(documento.topics.values())
    assert list(tema.viewpoints.values())[0].snapshot is None


@pytest.mark.django_db
def test_una_foto_que_ya_no_esta_en_el_disco_no_tumba_la_exportacion(
    observacion, tmp_path, settings
):
    """**Un archivo que falta no puede llevarse por delante la exportacion del proyecto entero.**
    La imagen vive en el disco del operador y la fila solo guarda su clave: un montaje mal puesto o
    una copia restaurada a medias dejan la clave apuntando a nada."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    observacion.instantanea = "716-LCD/EST-001/no-esta.png"
    observacion.save(update_fields=["instantanea"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    assert list(tema.viewpoints.values())[0].snapshot is None
    assert tema.topic.title == observacion.titulo


# --- Desde la tarjeta del visor ------------------------------------------------------


@pytest.fixture
def revision_ifc(db, entregable, proyectista):
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/abc.ifc",
        nombre_original="Estructura.ifc",
        sha256="d" * 64,
        es_vigente=True,
    )


@pytest.mark.django_db
def test_la_nota_desde_el_visor_guarda_su_foto(
    client, proyectista, revision_ifc, tmp_path, settings
):
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        reverse("documents_api:revision-observaciones", args=[revision_ifc.pk]),
        {"titulo": "Choca con el ducto", "guid": GUID, "instantanea": data_url(png())},
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.instantanea.endswith(".png")
    from apps.documents import storage

    assert storage.leer(guardada.instantanea) == png()


@pytest.mark.django_db
def test_una_foto_mala_no_impide_guardar_el_hallazgo(
    client, proyectista, revision_ifc, settings, tmp_path
):
    """**Lo que hay que conservar es el hallazgo.** Quien escribe la nota no compuso ese `data:`:
    lo manda el visor, y perder la nota por el seria el peor de los dos errores."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        reverse("documents_api:revision-observaciones", args=[revision_ifc.pk]),
        {"titulo": "Choca con el ducto", "guid": GUID, "instantanea": "data:image/png;base64,xxx"},
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).instantanea == ""


@pytest.mark.django_db
def test_dos_notas_desde_la_misma_pantalla_no_duplican_el_archivo(
    client, proyectista, revision_ifc, settings, tmp_path
):
    """La clave lleva el sha256 del contenido, que es lo que hace idempotente volver a subir lo
    mismo. Con treinta observaciones de una revision, el disco no guarda treinta copias iguales."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    client.force_login(dar(proyectista, "documents.add_observacion"))
    ruta = reverse("documents_api:revision-observaciones", args=[revision_ifc.pk])
    cuerpo = {"titulo": "Choca", "guid": GUID, "instantanea": data_url(png())}

    primera = client.post(ruta, json.dumps(cuerpo), content_type="application/json")
    segunda = client.post(
        ruta, json.dumps({**cuerpo, "titulo": "Y otra vez"}), content_type="application/json"
    )

    claves = {
        Observacion.objects.get(pk=primera.json()["id"]).instantanea,
        Observacion.objects.get(pk=segunda.json()["id"]).instantanea,
    }
    assert len(claves) == 1
