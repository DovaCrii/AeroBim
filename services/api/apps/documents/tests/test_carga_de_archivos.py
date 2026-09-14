"""Un archivo que llega de fuera es entrada hostil. Estas son las tres reglas.

De `docs/ARCHITECTURE.md`: validar por extension, tipo y tamaño, y **nunca usar el
nombre de archivo del usuario en el sistema de archivos**.
"""

import pytest
from django.test import override_settings

from apps.documents.storage import (
    TAMANO_MAXIMO_BYTES,
    CargaRechazada,
    clave_para,
    guardar,
    leer,
    normalize_storage_key,
    validar,
)

PDF = b"%PDF-1.7\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
DXF = b"  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n"


def test_acepta_lo_que_un_control_documental_recibe():
    extension, sha = validar("plano.pdf", PDF)
    assert extension == "pdf"
    assert len(sha) == 64

    assert validar("captura.png", PNG)[0] == "png"
    assert validar("ACAD-Piso 5.dxf", DXF)[0] == "dxf"


def motivo(nombre: str, contenido: bytes) -> str:
    """El **codigo** del rechazo, no una palabra de su mensaje.

    La version anterior buscaba texto —`match="empty"`— y se rompio entera al traducir la
    interfaz al espanol, **sin que el comportamiento hubiera cambiado**. El motivo de un
    rechazo es una decision del programa: tiene que poder nombrarse sin depender del idioma en
    que se le cuente a nadie.
    """
    with pytest.raises(CargaRechazada) as rechazo:
        validar(nombre, contenido)
    return rechazo.value.codigo


def test_la_extension_no_basta_y_ahi_se_cae_el_ejecutable_renombrado():
    """**Es la regla que importa.** Renombrar `virus.exe` a `plano.pdf` satisface la
    extension; la firma real de los primeros bytes no."""
    assert motivo("plano.pdf", b"MZ\x90\x00" + b"\x00" * 40) == "firma-no-coincide"


def test_un_binario_disfrazado_de_dxf_tampoco_pasa():
    assert motivo("plano.dxf", bytes(range(256)) * 20) == "no-es-texto"


def test_rechaza_una_extension_que_no_esta_en_la_lista():
    assert motivo("script.exe", b"MZ\x90\x00") == "extension-no-aceptada"
    assert motivo("sin-extension", PDF) == "extension-no-aceptada"


def test_rechaza_el_archivo_vacio_y_el_demasiado_grande():
    assert motivo("plano.pdf", b"") == "vacio"
    assert motivo("modelo.ifc", b"x" * (TAMANO_MAXIMO_BYTES + 1)) == "demasiado-grande"


def test_lo_demasiado_grande_se_rechaza_sin_leerlo():
    """**Para decir «no cabe» ya no hay que traerlo entero a memoria.**

    `clean_archivo` hacía `subido.read()` y **después** validaba, así que con un tope de 200 MB y
    `workers = cpu*2+1` quien subiera por error el LAS original de 3,37 GB en vez del COPC hacía que
    el servidor lo cargara antes de rechazarlo.

    Se prueba con un archivo que **explota si alguien lo lee**: si el formulario vuelve a leer antes
    de mirar el tamaño, esto falla con ese mensaje en vez de con un rechazo limpio.
    """
    from django import forms as django_forms

    from apps.documents.forms import RevisionForm

    class BombaDeLectura:
        """Dice lo que pesa, y se queja si alguien intenta leerlo."""

        name = "levantamiento.las"
        size = TAMANO_MAXIMO_BYTES + 1

        def read(self, *a, **k):  # pragma: no cover - la prueba falla si esto corre
            raise AssertionError("leyó el archivo antes de comprobar que no cabía")

        def seek(self, *a, **k):  # pragma: no cover - ídem
            raise AssertionError("tocó el archivo antes de comprobar que no cabía")

    formulario = RevisionForm()
    formulario.cleaned_data = {"archivo": BombaDeLectura()}

    with pytest.raises(django_forms.ValidationError) as rechazo:
        formulario.clean_archivo()

    # Y el mensaje sigue siendo el de siempre: lo que cambia es cuándo se dice, no qué se dice.
    assert "200" in " ".join(rechazo.value.messages)


def test_el_tope_se_sigue_vigilando_por_los_dos_caminos():
    """`validar` conserva su propia comprobación aunque el formulario mire antes el tamaño.

    La llaman también caminos que ya tienen los bytes —la API, las pruebas—, y quitarla dejaría el
    tope sin vigilar según por dónde se entre.
    """
    from apps.documents.storage import validar_tamano

    assert motivo("modelo.ifc", b"x" * (TAMANO_MAXIMO_BYTES + 1)) == "demasiado-grande"

    with pytest.raises(CargaRechazada) as rechazo:
        validar_tamano(TAMANO_MAXIMO_BYTES + 1)
    assert rechazo.value.codigo == "demasiado-grande"
    # Y lo que cabe justo, cabe: un tope que rechaza el borde rechaza el COPC de la obra.
    validar_tamano(TAMANO_MAXIMO_BYTES)


def test_cada_rechazo_trae_ademas_su_mensaje_para_la_persona():
    """El codigo es para el programa; el mensaje sigue siendo para quien sube el archivo, y no
    puede quedarse vacio: es lo que le dice que arreglar."""
    with pytest.raises(CargaRechazada) as rechazo:
        validar("plano.pdf", b"")

    assert str(rechazo.value).strip() != ""
    assert rechazo.value.codigo == "vacio"


@pytest.mark.parametrize(
    "clave",
    [
        "/etc/passwd",
        "C:\\Windows\\system32\\algo",
        "../../fuera.pdf",
        "carpeta/../../fuera.pdf",
        "carpeta//doble.pdf",
        " con-espacio.pdf",
        "",
    ],
)
def test_una_clave_no_puede_salirse_de_su_carpeta(clave):
    """**Rechaza en vez de limpiar.** Una ruta con `..` no es un nombre raro que convenga
    arreglar: es un intento de escribir fuera, y arreglarlo en silencio lo deja sin
    registrar."""
    with pytest.raises(CargaRechazada):
        normalize_storage_key(clave)


def test_el_nombre_del_cliente_no_llega_al_disco():
    """La clave **se construye**, no se recibe. El nombre original se guarda en la base de
    datos para poder mostrarlo, y no en el sistema de archivos."""
    _extension, sha = validar("Plano — con acentos y ../ raros.pdf", PDF)
    clave = clave_para(
        proyecto_codigo="716-LCD",
        entregable_codigo="716-LCD-AR-P-001",
        sha256=sha,
        extension="pdf",
    )

    assert clave == f"716-LCD/716-LCD-AR-P-001/{sha}.pdf"
    assert "acentos" not in clave
    assert ".." not in clave


def test_un_codigo_de_proyecto_hostil_se_desinfecta():
    clave = clave_para(
        proyecto_codigo="../../etc", entregable_codigo="a/b", sha256="a" * 64, extension="pdf"
    )

    assert ".." not in clave
    assert clave.count("/") == 2


def test_guardar_dos_veces_lo_mismo_no_duplica_nada(tmp_path):
    with override_settings(DOCUMENTS_DIR=tmp_path):
        _extension, sha = validar("plano.pdf", PDF)
        clave = clave_para(proyecto_codigo="P", entregable_codigo="E", sha256=sha, extension="pdf")

        primero = guardar(clave, PDF)
        segundo = guardar(clave, PDF)

        assert primero == segundo
        assert leer(clave) == PDF
        assert len(list(tmp_path.rglob("*.pdf"))) == 1
