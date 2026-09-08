"""La camara de una observacion, leida de la URL: `F4.1`.

**Es dato hostil.** El visor la arma bien, pero un parametro de una URL lo escribe cualquiera, y lo
que se guarda **sale despues en un archivo BCF que se manda al mandante**. Un numero absurdo no
rompe nada visible hoy y produce un viewpoint que abre mirando al infinito.

Todo lo que no sirve devuelve `{}`, que significa «sin camara» — un estado normal, no un fallo.
"""

import json

import pytest

from apps.documents.camara import ALTO_MAXIMO_M, LARGO_MAXIMO, LEJOS_M, leer

#: Una camara valida: mirando al origen desde el nordeste, en el sistema del IFC.
BUENA = {
    "tipo": "perspectiva",
    "punto": [10.0, -10.0, 10.0],
    "direccion": [-0.57735, 0.57735, -0.57735],
    "arriba": [-0.408248, 0.408248, 0.816497],
    "campoVisual": 60.0,
}

ORTOGONAL = {
    "tipo": "ortogonal",
    "punto": [5.0, -5.0, 40.0],
    "direccion": [0.0, 0.0, -1.0],
    "arriba": [0.0, 1.0, 0.0],
    "escala": 25.0,
}


def texto(datos) -> str:
    return json.dumps(datos)


# --- Lo que se acepta -----------------------------------------------------------------


def test_una_camara_del_visor_pasa_entera():
    assert leer(texto(BUENA)) == BUENA


def test_la_ortogonal_conserva_su_alto_de_vista():
    """Sin el, la posicion dice desde donde se mira y nada dice cuanto se ve."""
    assert leer(texto(ORTOGONAL)) == ORTOGONAL


def test_el_campo_visual_es_opcional():
    """Sin el, quien lo lea usa el suyo, que es un encuadre razonable. La posicion y la direccion
    —lo que de verdad importa— siguen ahi."""
    sin_campo = {k: v for k, v in BUENA.items() if k != "campoVisual"}

    leida = leer(texto(sin_campo))

    assert "campoVisual" not in leida
    assert leida["punto"] == BUENA["punto"]


def test_un_campo_visual_imposible_se_omite_sin_tirar_la_camara():
    """La posicion y la direccion son buenas: perderlas por un tercer numero seria peor."""
    for campo in (0, -10, 180, 400, "sesenta"):
        leida = leer(texto({**BUENA, "campoVisual": campo}))
        assert leida["punto"] == BUENA["punto"], campo
        assert "campoVisual" not in leida, campo


# --- Lo que se descarta ---------------------------------------------------------------


@pytest.mark.parametrize(
    "crudo",
    [
        None,
        "",
        "no es json",
        "[1, 2, 3]",  # JSON valido y no un objeto
        "42",
        '"perspectiva"',
    ],
)
def test_lo_que_no_es_un_objeto_json_no_es_una_camara(crudo):
    assert leer(crudo) == {}


def test_un_tipo_que_no_existe_se_descarta():
    """`tipo` decide si se escribe `PerspectiveCamera` u `OrthogonalCamera`: sin uno de los dos no
    hay nada que escribir."""
    assert leer(texto({**BUENA, "tipo": "isometrica"})) == {}
    assert leer(texto({k: v for k, v in BUENA.items() if k != "tipo"})) == {}


@pytest.mark.parametrize("clave", ["punto", "direccion", "arriba"])
def test_media_camara_no_se_guarda(clave):
    """Posicion sin direccion no es un punto de vista, y direccion sin arriba deja la imagen
    girada al azar. Las tres o ninguna."""
    assert leer(texto({k: v for k, v in BUENA.items() if k != clave})) == {}


@pytest.mark.parametrize(
    "valor",
    [
        [1, 2],  # dos componentes
        [1, 2, 3, 4],
        "1,2,3",
        [1, 2, "tres"],
        [1, 2, None],
        [True, 0, 0],  # `bool` es `int` en Python, y no es una coordenada
        {"x": 1, "y": 2, "z": 3},
    ],
)
def test_un_punto_que_no_son_tres_numeros_se_descarta(valor):
    assert leer(texto({**BUENA, "punto": valor})) == {}


def test_un_infinito_o_un_nan_no_pasan():
    """`json.loads` los acepta —`Infinity` y `NaN` son extensiones que Python lee— y envenenan
    cualquier cuenta posterior: el BCF saldria con `inf` escrito en una coordenada."""
    assert (
        leer(
            '{"tipo": "perspectiva", "punto": [Infinity, 0, 0], "direccion": [0, 0, -1],'
            ' "arriba": [0, 1, 0]}'
        )
        == {}
    )
    assert (
        leer(
            '{"tipo": "perspectiva", "punto": [NaN, 0, 0], "direccion": [0, 0, -1],'
            ' "arriba": [0, 1, 0]}'
        )
        == {}
    )


def test_una_direccion_que_no_es_unitaria_se_descarta():
    """Un vector de direccion que no mide 1 no es una direccion: BCF lo escribe tal cual y el otro
    extremo lo interpreta como quiera."""
    assert leer(texto({**BUENA, "direccion": [1.0, 1.0, 1.0]})) == {}
    assert leer(texto({**BUENA, "direccion": [0.0, 0.0, 0.0]})) == {}


def test_un_arriba_paralelo_a_la_direccion_se_descarta():
    """**Es un requisito del XSD**, no una elegancia: un lector estricto rechaza el viewpoint
    entero, y un lector permisivo dibuja la imagen girada.

    Y suele ser la marca de un error concreto: que quien la armo paso el eje vertical del mundo en
    vez del giro real de la camara.
    """
    assert leer(texto({**BUENA, "arriba": [-0.57735, 0.57735, -0.57735]})) == {}


def test_una_camara_absurdamente_lejos_se_descarta():
    """No es un limite fisico: es la marca de que algo se leyo en las unidades equivocadas. Un
    modelo en milimetros interpretado como metros pone la camara a mil veces su distancia."""
    assert leer(texto({**BUENA, "punto": [LEJOS_M * 2, 0.0, 0.0]})) == {}


def test_una_ortogonal_sin_alto_de_vista_no_se_guarda():
    assert leer(texto({k: v for k, v in ORTOGONAL.items() if k != "escala"})) == {}


@pytest.mark.parametrize("escala", [0, -5, ALTO_MAXIMO_M * 2, "veinticinco", True])
def test_un_alto_de_vista_imposible_se_descarta(escala):
    assert leer(texto({**ORTOGONAL, "escala": escala})) == {}


def test_un_json_enorme_no_entra_a_la_base():
    """Una camara son unos doscientos caracteres. El tope cierra la puerta a que alguien meta un
    megabyte en un `JSONField` por una URL."""
    relleno = {**BUENA, "descripcion": "x" * LARGO_MAXIMO}

    assert leer(texto(relleno)) == {}
