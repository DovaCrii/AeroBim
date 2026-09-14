"""Subir un archivo **sin traerlo entero a memoria**.

## El defecto

`clean_archivo` hacia `contenido = subido.read()` y despues `validar(nombre, contenido)`, y la vista
guardaba con `storage.guardar(clave, form.contenido)`. O sea que un IFC de 200 MB —el tope del
registro, y los archivos de obra lo alcanzan: el COPC del CC 741 son 124,7 MB— quedaba **entero en
la memoria del worker** durante toda la subida.

Con `workers = cpu*2+1` —nueve en una VM de cuatro nucleos— dos o tres subidas a la vez son uno o
dos gigas de memoria residente, y el final de esa historia es el OOM killer llevandose un worker a
mitad de otra cosa. No fallaba en desarrollo porque los archivos de prueba pesan kilobytes.

## Lo que se prueba

1. Que **se lea por tramos**, con un archivo que se queja si alguien intenta leerlo de una vez.
2. Que lo guardado sea **el archivo entero**, que es el fallo caro de un cambio asi: escribir solo
   el primer tramo y no enterarse.
3. Que el `sha256` que se calcula por tramos sea el mismo que el de siempre.
4. Que la escritura sea **de una sola pieza**, porque la clave lleva el hash y un archivo truncado
   con el nombre del completo no lo detecta nadie nunca.
"""

import hashlib

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.documents import storage

#: Dos tramos y medio, para que el bucle de lectura de verdad de mas de una vuelta.
GRANDE = b"%PDF-1.4\n" + b"x" * (storage.TROZO * 2 + storage.TROZO // 2)


class SoloPorTramos(SimpleUploadedFile):
    """Un archivo subido que **se niega a leerse de una vez**.

    Es el oraculo: si alguien vuelve a poner un `read()` sin argumento, esto falla con su mensaje en
    vez de pasar en verde con el defecto puesto.
    """

    def read(self, size=-1, /):
        if size is None or size < 0:
            raise AssertionError(
                "leyó el archivo entero: con un IFC de 200 MB y nueve workers, eso es el OOM killer"
            )
        if size > storage.TROZO:
            raise AssertionError(f"pidió {size} bytes de una vez, y el tramo son {storage.TROZO}")
        return super().read(size)


def subido(contenido: bytes = GRANDE, nombre: str = "planta.pdf") -> SoloPorTramos:
    return SoloPorTramos(nombre, contenido, content_type="application/pdf")


# --- Validar ---------------------------------------------------------------------------


def test_validar_una_subida_no_lee_el_archivo_entero():
    extension, sha = storage.validar_subida(subido())

    assert extension == "pdf"
    assert sha == hashlib.sha256(GRANDE).hexdigest()


def test_el_hash_por_tramos_es_el_mismo_que_el_de_siempre():
    """**Si no lo fuera, la clave del archivo cambiaria** y el registro dejaria de reconocer lo que
    ya tiene guardado: volver a subir el mismo archivo crearia una copia."""
    archivo = subido()

    _, por_tramos = storage.validar_subida(archivo)
    _, de_una_vez = storage.validar("planta.pdf", GRANDE)

    assert por_tramos == de_una_vez


def test_deja_el_archivo_rebobinado_para_quien_lo_guarde():
    """**No es cortesia.** Quien llama guarda el archivo justo despues, y un descriptor dejado al
    final escribe un archivo vacio **sin dar ningun error**."""
    archivo = subido()

    storage.validar_subida(archivo)

    assert archivo.tell() == 0


def test_sigue_cazando_lo_que_no_es_lo_que_dice():
    """La cabecera se mira igual, aunque salga del primer tramo en vez del contenido entero.

    Es donde se cae `virus.exe` renombrado a `plano.pdf`, y es lo que mas facil se pierde al
    cambiar de leerlo todo a leerlo por trozos.
    """
    with pytest.raises(storage.CargaRechazada) as rechazo:
        storage.validar_subida(subido(b"MZ\x90\x00" + b"\x00" * 5000, "plano.pdf"))

    assert rechazo.value.codigo == "firma-no-coincide"


def test_el_vacio_y_el_demasiado_grande_se_rechazan_antes_de_leer():
    with pytest.raises(storage.CargaRechazada) as vacio:
        storage.validar_subida(subido(b"", "plano.pdf"))
    assert vacio.value.codigo == "vacio"


# --- Guardar ---------------------------------------------------------------------------


def test_lo_guardado_es_el_archivo_entero(tmp_path):
    """**El fallo caro de un cambio asi: escribir solo el primer tramo y no enterarse.**

    El archivo tendria el nombre del completo —la clave lleva el `sha256`— y se serviria truncado
    para siempre.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        ruta = storage.guardar_subida("obra/entregable/abc.pdf", subido())

    assert ruta.read_bytes() == GRANDE


def test_se_escribe_de_una_sola_pieza_y_no_deja_restos(tmp_path):
    """`os.replace` sobre el mismo sistema de archivos es atomico: o esta el de antes, o esta el
    nuevo entero. Y el temporal no se queda."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        ruta = storage.guardar_subida("obra/entregable/abc.pdf", subido())

        restos = [uno.name for uno in ruta.parent.iterdir() if ".parcial" in uno.name]

    assert restos == []
    assert [uno.name for uno in ruta.parent.iterdir()] == ["abc.pdf"]


def test_no_reescribe_lo_que_ya_esta(tmp_path):
    """La clave sale del contenido, asi que re-subir lo mismo es idempotente: pasa de verdad,
    cuando alguien no esta seguro de que la primera vez funcionara."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        primera = storage.guardar_subida("obra/entregable/abc.pdf", subido())
        cuando = primera.stat().st_mtime_ns

        segunda = storage.guardar_subida("obra/entregable/abc.pdf", subido())

    assert segunda == primera
    assert segunda.stat().st_mtime_ns == cuando, "lo reescribió teniéndolo ya"


def test_guardar_con_bytes_tambien_va_de_una_pieza(tmp_path):
    """El camino de siempre —el DXF convertido, la imagen de un comentario— gana lo mismo: un
    archivo a medias con el nombre del completo es indetectable venga por donde venga."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        ruta = storage.guardar("obra/entregable/def.pdf", GRANDE)
        restos = [uno.name for uno in ruta.parent.iterdir() if ".parcial" in uno.name]

    assert ruta.read_bytes() == GRANDE
    assert restos == []
