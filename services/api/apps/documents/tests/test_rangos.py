"""Que un tramo pedido sea **exactamente** el tramo servido.

Un error de un byte aquí no da un error: da puntos de la nube en el sitio equivocado, porque cada
nodo del COPC se pide por su tramo y se interpreta como registros de tamaño fijo. Un byte de más al
principio corre todo el nodo y las coordenadas salen basura — sin que nada falle.

Así que el oráculo no es «responde 206»: es **comparar los bytes servidos con los del archivo**
cortados en Python, que es una forma independiente de calcular el mismo tramo.
"""

import pytest

from apps.documents import rangos
from apps.documents.rangos import RangoFueraDeAlcance, Tramo, tramo_pedido

# --- La aritmética, que es lo único que puede estar mal -------------------------------


@pytest.mark.parametrize(
    ("cabecera", "esperado"),
    [
        # Las cuatro formas del RFC 7233.
        ("bytes=0-499", Tramo(0, 499)),
        ("bytes=500-", Tramo(500, 999)),
        ("bytes=-500", Tramo(500, 999)),
        ("bytes=0-0", Tramo(0, 0)),
        # El fin más allá del final **se recorta**, no es un error: es pedir hasta donde haya.
        ("bytes=900-99999", Tramo(900, 999)),
        # Los últimos más bytes de los que hay: se sirve el archivo entero, no se desborda.
        ("bytes=-99999", Tramo(0, 999)),
        # El último byte, que es lo que pide un lector para leer un pie de archivo.
        ("bytes=999-999", Tramo(999, 999)),
        # Espacios y mayúsculas: la cabecera la escribe el cliente, no nosotros.
        ("  BYTES=10-20  ", Tramo(10, 20)),
    ],
)
def test_las_formas_que_se_atienden(cabecera, esperado):
    assert tramo_pedido(cabecera, 1000) == esperado


@pytest.mark.parametrize(
    "cabecera",
    [
        None,
        "",
        # Otra unidad: el RFC deja ignorarla, y es lo prudente.
        "items=0-10",
        # Varios tramos. **Se ignoran a propósito**: servir el primero daría un `Content-Range` de
        # un tramo para una petición de dos, y el cliente creería que tiene los dos.
        "bytes=0-10,20-30",
        # Mal escrita: sin guion, con letras, con el fin antes del inicio.
        "bytes=100",
        "bytes=a-b",
        "bytes=500-100",
        "bytes=-0",
    ],
)
def test_lo_que_no_se_sabe_atender_se_sirve_entero(cabecera):
    """`None` es «sirve el archivo entero», y es la respuesta correcta a todo lo dudoso.

    Un `200` con todo el archivo siempre es válido; adivinar qué quiso decir una cabecera rota no.
    """
    assert tramo_pedido(cabecera, 1000) is None


@pytest.mark.parametrize("cabecera", ["bytes=1000-", "bytes=1000-1500", "bytes=5000-6000"])
def test_empezar_mas_alla_del_final_es_416(cabecera):
    """**No es lo mismo que no pedir tramo.**

    Devolver el archivo entero aquí dejaría al cliente creyendo que recibió lo que pidió.
    """
    with pytest.raises(RangoFueraDeAlcance):
        tramo_pedido(cabecera, 1000)


def test_el_largo_cuenta_el_fin_incluido():
    """La trampa de todo esto: `bytes=0-499` son **500** bytes, y `[0:499]` en Python son 499."""
    assert Tramo(0, 499).largo == 500
    assert Tramo(999, 999).largo == 1


def test_un_archivo_de_un_byte():
    assert tramo_pedido("bytes=0-0", 1) == Tramo(0, 0)
    with pytest.raises(RangoFueraDeAlcance):
        tramo_pedido("bytes=1-", 1)


# --- Los bytes servidos contra los bytes del archivo ----------------------------------


@pytest.fixture
def archivo(tmp_path):
    """Bytes que **no se repiten**: así un desplazamiento de uno se ve en la comparación.

    Con un archivo de ceros, leer el tramo equivocado daría el mismo resultado que leer el bueno.
    """
    ruta = tmp_path / "nube.copc.laz"
    ruta.write_bytes(bytes(range(256)) * 4)  # 1024 bytes, todos distintos dentro de su bloque
    return ruta


@pytest.mark.parametrize("tramo", [Tramo(0, 0), Tramo(0, 511), Tramo(300, 700), Tramo(1023, 1023)])
def test_leer_tramo_da_los_mismos_bytes_que_cortar_en_python(archivo, tramo):
    completo = archivo.read_bytes()

    servido = rangos.leer_tramo(archivo, tramo)

    assert servido == completo[tramo.inicio : tramo.fin + 1]
    assert len(servido) == tramo.largo


def test_los_tramos_seguidos_reconstruyen_el_archivo(archivo):
    """El oráculo de conjunto: pedirlo en trozos de 100 y pegarlos da el archivo original.

    Es la forma de comprobar que no se pierde ni se repite un byte **en las costuras**, que es
    donde un error de uno se esconde: cada tramo por separado puede parecer correcto.
    """
    trozos = []
    inicio = 0
    while inicio < 1024:
        tramo = rangos.tramo_pedido(f"bytes={inicio}-{inicio + 99}", 1024)
        assert tramo is not None
        trozos.append(rangos.leer_tramo(archivo, tramo))
        inicio = tramo.fin + 1

    assert b"".join(trozos) == archivo.read_bytes()


# --- La respuesta HTTP -----------------------------------------------------------------


def test_sin_range_se_sirve_todo_y_se_anuncia_que_hay_tramos(archivo):
    """`Accept-Ranges` va **también en la respuesta completa**.

    Sin ella un lector prudente descarga el archivo entero aunque el servidor sepa cortarlo: es
    como se enteran de que pueden pedir tramos.
    """
    respuesta = rangos.respuesta_de_archivo(archivo, None, tipo="application/octet-stream")

    assert respuesta.status_code == 200
    assert respuesta["Accept-Ranges"] == "bytes"
    assert respuesta["Content-Length"] == "1024"


def test_con_range_se_sirve_206_con_content_range(archivo):
    respuesta = rangos.respuesta_de_archivo(
        archivo, "bytes=100-199", tipo="application/octet-stream"
    )

    assert respuesta.status_code == 206
    assert respuesta["Content-Range"] == "bytes 100-199/1024"
    assert respuesta["Content-Length"] == "100"
    assert respuesta.content == archivo.read_bytes()[100:200]


def test_un_tramo_fuera_de_alcance_da_416_con_el_tamano_real(archivo):
    """El `416` lleva `bytes */1024`: es lo que permite al cliente corregir y volver a pedir."""
    respuesta = rangos.respuesta_de_archivo(
        archivo, "bytes=5000-6000", tipo="application/octet-stream"
    )

    assert respuesta.status_code == 416
    assert respuesta["Content-Range"] == "bytes */1024"
