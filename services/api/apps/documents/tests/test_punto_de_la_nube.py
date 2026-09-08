"""El punto del levantamiento al que se ancla una observacion: `F12.14`.

**Por que existe este ancla.** En obra el levantamiento llega antes que el modelo, asi que hasta
que exista el IFC de esa etapa no hay ningun elemento del que colgar una nota sobre lo construido.
Sin esto, la coordinacion sobre la nube no empieza hasta que aparece el modelo — al revés de como se
trabaja.

Y como la camara, **es dato hostil**: llega en una peticion, o sea que lo escribe cualquiera.
"""

import json

import pytest

from apps.documents.punto import LARGO_MAXIMO, LEJOS_M, como_texto, leer

#: Un punto real de la obra, en UTM 19S, que es lo que declara el COPC del CC 741.
EN_LA_OBRA = [345678.9, 6298123.45, 412.3]


# --- Lo que se acepta -----------------------------------------------------------------


def test_un_punto_del_visor_pasa_entero():
    assert leer(json.dumps(EN_LA_OBRA)) == EN_LA_OBRA


def test_tambien_llega_ya_decodificado():
    """La API lee `request.data`, que a veces trae la lista y a veces el texto."""
    assert leer(EN_LA_OBRA) == EN_LA_OBRA


def test_los_enteros_valen_y_salen_como_flotantes():
    assert leer([1, 2, 3]) == [1.0, 2.0, 3.0]


def test_una_coordenada_utm_no_se_rechaza_por_grande():
    """**Es la prueba que justifica el tope propio, y casi no existe.**

    El tope de la camara son mil kilometros, que sobra para una camara en el sistema local de un
    IFC — y **rechazaria todos los puntos reales de esta obra**: el eje norte de UTM en Chile ronda
    los 6,3 millones de metros. Reusar aquel numero habria descartado en silencio cada punto de cada
    levantamiento, con la nota guardandose «bien» y sin decir donde.
    """
    from apps.documents.camara import LEJOS_M as LEJOS_DE_LA_CAMARA

    assert EN_LA_OBRA[1] > LEJOS_DE_LA_CAMARA
    assert leer(EN_LA_OBRA) == EN_LA_OBRA


# --- Lo que no ------------------------------------------------------------------------


def test_sin_punto_no_hay_punto():
    assert leer(None) is None
    assert leer("") is None


@pytest.mark.parametrize("cuantas", [[1.0, 2.0], [1.0, 2.0, 3.0, 4.0], []])
def test_tienen_que_ser_tres(cuantas):
    """Media coordenada no señala nada, y cuatro no es un punto."""
    assert leer(cuantas) is None


def test_un_booleano_no_es_una_coordenada():
    """`bool` es `int` en Python, asi que hay que rechazarlo a mano."""
    assert leer([True, 0.0, 0.0]) is None


@pytest.mark.parametrize("raro", [float("nan"), float("inf"), float("-inf")])
def test_ni_nan_ni_infinito(raro):
    """Pasan por `isinstance` y envenenan cualquier cuenta posterior."""
    assert leer([raro, 0.0, 0.0]) is None


def test_fuera_de_escala_terrestre_se_descarta():
    """No es un limite fisico: es la marca de que algo se leyo en las unidades equivocadas."""
    assert leer([LEJOS_M + 1, 0.0, 0.0]) is None


def test_un_texto_enorme_no_se_intenta_ni_decodificar():
    assert leer("[" + "0," * LARGO_MAXIMO + "0]") is None


def test_lo_que_no_es_json_se_descarta_sin_reventar():
    assert leer("{no es json") is None
    assert leer('{"x": 1}') is None


# --- Como se escribe para leerlo ------------------------------------------------------


def test_se_escribe_como_un_replanteo():
    """**Con el separador decimal en español y el de miles tambien**, que es como se lee aca.

    Y va al texto de la observacion porque **el BCF no sabe decir «este punto de esta nube»**: no
    hay elemento al que apuntar, asi que la coordenada tiene que viajar como texto o no viaja.
    """
    assert como_texto(EN_LA_OBRA) == "E 345.678,90 · N 6.298.123,45 · Z 412,30"


def test_sin_punto_no_escribe_nada():
    assert como_texto(None) == ""


def test_los_dos_separadores_no_salen_iguales():
    """El intercambio de coma y punto en dos pasos los deja iguales: el segundo pisa al primero."""
    escrito = como_texto([1234.5, 0.0, 0.0])

    assert escrito.startswith("E 1.234,50")
    assert ".5" not in escrito
