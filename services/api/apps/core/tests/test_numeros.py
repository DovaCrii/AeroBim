"""Leer tres numeros que vienen de fuera sin creerles nada.

**Esta funcion estaba escrita cuatro veces** —la camara de una observacion, el marcado del
viewpoint, los cortes de una vista compartida y el ancla de un punto de la nube— y en el camino dos
de las copias ya se habian separado sin que nadie lo notara: unas aplicaban el tope de distancia
dentro de la terna y otras fuera y solo a una de sus dos ternas.

Aca se prueba una sola vez, y con ella se prueba el mismo comportamiento de los cuatro llamadores.
Cada uno conserva su propio tope, que es la parte que **no** se unifico y no debe unificarse.
"""

import json

import pytest

from apps.core.numeros import terna


def test_tres_numeros_pasan_como_flotantes():
    assert terna([1, 2.5, -3]) == [1.0, 2.5, -3.0]


def test_una_tupla_tambien_vale():
    """Los lectores reciben lo que devuelve `json.loads` unas veces y una tupla nuestra otras."""
    assert terna((0, 0, 0)) == [0.0, 0.0, 0.0]


# --- La forma ------------------------------------------------------------------------


@pytest.mark.parametrize("cuantas", [[1.0, 2.0], [1.0, 2.0, 3.0, 4.0], [], "123", {"x": 1}, None])
def test_lo_que_no_son_exactamente_tres_numeros_se_descarta(cuantas):
    assert terna(cuantas) is None


def test_un_booleano_no_es_una_coordenada():
    """**`bool` es `int` en Python**, asi que pasa el `isinstance` y hay que rechazarlo a mano."""
    assert terna([True, 0, 0]) is None
    assert terna([0, False, 0]) is None


@pytest.mark.parametrize("raro", [float("nan"), float("inf"), float("-inf")])
def test_ni_nan_ni_infinito(raro):
    """**Son `float`**, asi que tambien pasan el `isinstance` y envenenan cualquier cuenta."""
    assert terna([raro, 0, 0]) is None


def test_una_cadena_dentro_de_la_lista_no_se_convierte():
    """No se intenta `float("12")`: lo que llega tiene que ser un numero, no parecerlo."""
    assert terna(["12", 0, 0]) is None


# --- El entero enorme, que las cuatro copias dejaban reventar -------------------------


def test_un_entero_enorme_se_descarta_en_vez_de_reventar():
    """**Es el defecto que la unificacion destapo**, y no lo cazaba ninguna de las cuatro copias.

    `json.loads` de cuatrocientos nueves devuelve un `int` de Python, que **no tiene tope**, y
    `float(ese int)` lanza `OverflowError`. Ninguna copia lo capturaba, asi que un cuerpo de
    peticion con un numero de cuatrocientos digitos daba un **500** en vez de descartarse —
    comprobado el 2026-09-08 contra los cuatro lectores, los cuatro reventaban.

    Y es justo lo contrario del contrato de estos modulos: son dato hostil, se descartan.
    """
    enorme = json.loads("[" + "9" * 400 + ", 0, 0]")

    assert isinstance(enorme[0], int)
    assert terna(enorme) is None


def test_y_el_negativo_tambien():
    assert terna([-int("9" * 400), 0, 0]) is None


# --- El tope, que lo pone quien llama ------------------------------------------------


def test_sin_tope_no_se_mira_la_distancia():
    """Lo que hace falta para un vector de direccion: no es una posicion, no esta lejos de nada."""
    assert terna([1e30, 0, 0]) == [1e30, 0.0, 0.0]


def test_con_tope_se_descarta_lo_que_lo_pasa():
    assert terna([101.0, 0, 0], lejos=100.0) is None


def test_justo_en_el_tope_se_acepta():
    """El tope es «cuan lejos se admite», asi que el valor del tope todavia se admite."""
    assert terna([100.0, -100.0, 100.0], lejos=100.0) == [100.0, -100.0, 100.0]


def test_el_tope_mira_el_valor_absoluto():
    assert terna([-101.0, 0, 0], lejos=100.0) is None


def test_los_topes_de_los_llamadores_son_distintos_a_proposito():
    """**Es la razon de que el tope sea un parametro** y no una constante de este modulo.

    Una camara vive en el sistema local de un IFC; un punto de un levantamiento vive en UTM, donde
    el eje norte en Chile ronda los 6,3 millones de metros. Un solo tope obligaria a elegir entre
    dejar pasar una camara absurda o descartar todos los levantamientos de la obra.
    """
    from apps.documents.camara import LEJOS_M as DE_LA_CAMARA
    from apps.documents.punto import LEJOS_M as DEL_LEVANTAMIENTO

    norte_de_la_obra = 6_298_123.45

    assert norte_de_la_obra > DE_LA_CAMARA
    assert terna([0, norte_de_la_obra, 0], lejos=DE_LA_CAMARA) is None
    assert terna([0, norte_de_la_obra, 0], lejos=DEL_LEVANTAMIENTO) is not None
