"""El color de una disciplina, y que su código siga leyéndose encima.

**El color lo elige una persona en un formulario, así que puede ser cualquiera**: un violeta
oscuro, un amarillo casi blanco o un negro. Escribir el código en blanco y confiar en que se lea es
lo que produce «AR» invisible sobre amarillo.

Lo que se prueba: la fórmula de WCAG con sus vectores conocidos, que la letra se elija **midiendo**
—y no con un umbral fijo, que se equivoca justo en los colores medios—, y que un valor con mala
forma no deje una disciplina sin color.
"""

import pytest

from apps.projects.color import (
    POR_DEFECTO,
    TINTA,
    contraste,
    distintivo,
    luminancia,
    normalizar,
    tinta_sobre,
)

# --- La fórmula, fijada con los vectores de la norma ---------------------------------


def test_la_luminancia_es_la_de_wcag():
    assert luminancia("#000000") == pytest.approx(0.0)
    assert luminancia("#ffffff") == pytest.approx(1.0)


def test_el_contraste_es_el_de_wcag():
    # Blanco contra negro es el máximo posible.
    assert contraste("#ffffff", "#000000") == pytest.approx(21.0, abs=0.01)
    # **El vector que distingue el umbral `0,03928` del `0,04045`**: `#777777` sobre blanco da
    # 4,48:1 con el primero y 4,54:1 con el segundo, o sea que uno pasa AA y el otro no. Es la
    # misma comprobación que fija `contraste.ts` en `bim-core`.
    assert contraste("#777777", "#ffffff") == pytest.approx(4.48, abs=0.01)
    # Un color contra sí mismo es 1: es el caso que delata un chip que se disuelve en su fondo.
    assert contraste("#5b3a9e", "#5b3a9e") == pytest.approx(1.0)


# --- La letra se elige midiendo, no suponiendo --------------------------------------


def test_sobre_un_color_oscuro_la_letra_es_blanca():
    assert tinta_sobre("#5b3a9e") == "#ffffff"
    assert tinta_sobre("#000000") == "#ffffff"


def test_sobre_un_color_claro_la_letra_es_la_tinta_del_sistema():
    """**El caso que motiva el módulo**: «AR» en blanco sobre amarillo no se lee.

    Y la tinta es la del sistema y no un negro suelto: si el chip lleva letra oscura, que sea la
    misma oscura que el resto de la pantalla.
    """
    assert tinta_sobre("#ffe066") == TINTA
    assert tinta_sobre("#ffffff") == TINTA


def test_la_letra_elegida_siempre_gana_al_alternativo():
    """**No hay umbral fijo, se comparan los dos contrastes.** Un umbral en 0,5 de luminancia se
    equivoca justo en los colores medios, y ahí caen los azules y los verdes de una paleta de
    disciplinas."""
    for color in (
        "#5b3a9e",  # violeta oscuro
        "#2ec4b6",  # turquesa medio
        "#087f78",  # verde oscuro
        "#c53b4d",  # rojo medio
        "#ffe066",  # amarillo claro
        "#68b8e5",  # azul claro
        "#808080",  # el gris justo en medio
    ):
        elegida = tinta_sobre(color)
        otra = TINTA if elegida == "#ffffff" else "#ffffff"
        assert contraste(elegida, color) >= contraste(otra, color), color


def test_el_distintivo_siempre_se_puede_leer():
    """**Es el objetivo del módulo dicho como número.** Un chip es texto pequeño en negrita, así que
    el mínimo que se le pide es el de texto grande: 3:1."""
    for color in ("#5b3a9e", "#2ec4b6", "#ffe066", "#808080", "#000000", "#ffffff", "#68b8e5"):
        assert contraste(tinta_sobre(color), color) >= 3.0, color


# --- Un color con mala forma no deja una disciplina sin identidad -------------------


def test_lo_que_no_es_un_color_cae_al_de_por_defecto():
    """**El campo se valida en el formulario y no en el modelo** —dice el propio modelo, para que un
    color mal escrito no impida guardar un entregable—, así que aquí llega cualquier cosa."""
    for basura in ("", None, "   ", "violeta", "#12345", "#zzzzzz", "#1234567"):
        assert normalizar(basura) == POR_DEFECTO


def test_se_acepta_lo_que_es_css_valido_aunque_no_sea_como_lo_guardamos():
    # Sin almohadilla: es lo que pasa al copiar de un selector de color.
    assert normalizar("5b3a9e") == "#5b3a9e"
    # De tres dígitos: es CSS válido y hay quien lo escribe a mano.
    assert normalizar("#abc") == "#aabbcc"
    # Y en mayúsculas, que es como lo escribe media herramienta de diseño.
    assert normalizar("#5B3A9E") == "#5b3a9e"


# --- Lo que la plantilla recibe ----------------------------------------------------


class Falsa:
    def __init__(self, codigo="AR", nombre="Arquitectura", color="#5b3a9e"):
        self.codigo = codigo
        self.nombre = nombre
        self.color = color


def test_el_distintivo_trae_lo_que_la_plantilla_necesita_y_nada_mas():
    datos = distintivo(Falsa())

    assert datos["codigo"] == "AR"
    assert datos["nombre"] == "Arquitectura"
    assert datos["fondo"] == "#5b3a9e"
    assert datos["tinta"] == "#ffffff"
    assert datos["contraste"] >= 3.0


def test_una_disciplina_sin_codigo_no_deja_un_chip_en_blanco():
    """Un chip vacío parece un fallo de pintado. La raya dice «no hay», que es un dato."""
    assert distintivo(Falsa(codigo=""))["codigo"] == "—"
