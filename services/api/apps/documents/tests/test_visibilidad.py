"""Que se veia cuando se abrio la observacion, leido del visor: `F4.7`.

**Es dato hostil**, igual que la camara. El visor lo arma bien —la regla de que lado se escribe vive
en `bim-core`, con sus pruebas— pero lo que llega por la red lo escribe cualquiera, y lo que se
guarda **sale despues en un archivo BCF que se manda al mandante**.

Todo lo que no sirve devuelve `{}`, que significa «sin restriccion»: el viewpoint sale con el modelo
entero, que es lo que hacia antes de que esto existiera.
"""

import json

from apps.documents.visibilidad import LARGO_MAXIMO, MAXIMO_EXCEPCIONES, leer

#: GUID de IFC de verdad: 22 caracteres del alfabeto del formato.
UNO = "2x9ibDgrvAu8y4Yd$Ug4Qu"
DOS = "1KJm3fT2n9wPz$Lq7BvXcD"

APAGANDO = {"porDefecto": True, "excepciones": [UNO]}
AISLANDO = {"porDefecto": False, "excepciones": [UNO, DOS]}


def texto(datos) -> str:
    return json.dumps(datos)


# --- Lo que se acepta -----------------------------------------------------------------


def test_lo_apagado_a_mano_pasa_entero():
    assert leer(texto(APAGANDO)) == APAGANDO


def test_un_aislamiento_pasa_entero():
    """El lado corto de un aislamiento: no se ve nada salvo lo enumerado."""
    assert leer(texto(AISLANDO)) == AISLANDO


def test_acepta_el_diccionario_ya_decodificado():
    """La tarjeta manda JSON en el cuerpo; una llamada interna puede pasar el objeto. Los dos
    caminos existen y los dos tienen que valer."""
    assert leer(APAGANDO) == APAGANDO


def test_quita_los_repetidos_y_conserva_el_orden():
    """Dos modelos abiertos pueden traer el mismo elemento, y la lista se duplicaria sin decir nada
    nuevo."""
    leida = leer(texto({"porDefecto": True, "excepciones": [DOS, UNO, DOS, UNO]}))
    assert leida["excepciones"] == [DOS, UNO]


def test_descarta_lo_que_no_es_un_guid_y_conserva_lo_demas():
    """Un GUID mal formado no rompe nada visible hoy: produce un `<Component>` que el otro extremo
    ignora en silencio, y entonces el viewpoint muestra algo distinto de lo que se anoto."""
    leida = leer(texto({"porDefecto": True, "excepciones": [UNO, "corto", "", None, 7, DOS]}))
    assert leida["excepciones"] == [UNO, DOS]


# --- Lo que no ------------------------------------------------------------------------


def test_sin_dato_no_hay_restriccion():
    assert leer(None) == {}
    assert leer("") == {}


def test_un_json_roto_no_revienta():
    assert leer("{no es json") == {}
    assert leer(texto([1, 2, 3])) == {}


def test_el_valor_por_defecto_tiene_que_ser_un_booleano_de_verdad():
    """`isinstance(True, int)` es verdadero en Python, asi que un `1` que se cuela como `True`
    **invierte el sentido del viewpoint entero**: lo que se veia pasa a estar apagado."""
    assert leer(texto({"porDefecto": 1, "excepciones": [UNO]})) == {}
    assert leer(texto({"porDefecto": "true", "excepciones": [UNO]})) == {}
    assert leer(texto({"excepciones": [UNO]})) == {}


def test_las_excepciones_tienen_que_ser_una_lista():
    assert leer(texto({"porDefecto": True, "excepciones": UNO})) == {}
    assert leer(texto({"porDefecto": True})) == {}


def test_sin_ninguna_excepcion_utilizable_no_se_guarda_nada():
    """Y por el lado `false` esto importa de verdad: `DefaultVisibility="false"` con la lista vacia
    es un viewpoint que **apaga el modelo entero** y se abre en negro."""
    assert leer(texto({"porDefecto": False, "excepciones": []})) == {}
    assert leer(texto({"porDefecto": False, "excepciones": ["basura"]})) == {}


def test_una_lista_mas_larga_que_el_tope_se_descarta_entera():
    """No se recorta: recortar guardaria una visibilidad **distinta** de la que alguien vio, que es
    peor que no guardar ninguna. El tope es el punto donde el archivo deja de ser util."""
    demasiadas = {"porDefecto": True, "excepciones": [UNO] * (MAXIMO_EXCEPCIONES + 1)}
    assert leer(demasiadas) == {}


def test_un_json_enorme_no_se_llega_a_parsear():
    """El tope de caracteres cierra la puerta a que alguien meta un megabyte en un `JSONField`, y
    lo hace **antes** de decodificarlo."""
    assert leer("x" * (LARGO_MAXIMO + 1)) == {}
