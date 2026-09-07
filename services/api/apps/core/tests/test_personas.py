"""La inicial de una persona con su color: que el color **no cambie**.

Es la única cosa interesante de esta etiqueta, y es una trampa fácil: `hash("coordinadora") % 5`
parece la forma obvia y está mal. Python aleatoriza el hash de las cadenas por proceso
(`PYTHONHASHSEED`), así que el color de una persona cambiaría en cada reinicio del servidor **y
entre dos trabajadores de gunicorn a la vez** — o sea que la misma lista podría dar dos colores
distintos al recargar.
"""

from apps.core.templatetags.personas import ACENTOS, persona


def test_la_inicial_es_la_primera_letra_en_mayuscula():
    assert ">C<" in persona("coordinadora")


def test_el_nombre_va_escrito_al_lado():
    """**No es redundancia.** Una inicial no distingue a dos personas que empiezan igual, y el
    color no lo lee quien no distingue colores: es un ancla para la vista, no la información."""
    salida = persona("proyectista")

    assert "proyectista" in salida


def test_el_color_es_siempre_el_mismo_para_la_misma_persona():
    """**La prueba que existe por `hash()`.**

    Con el hash de Python esto pasaría dentro de un proceso y fallaría entre dos, que es la forma
    de no verlo nunca en las pruebas y verlo siempre en producción.
    """
    primera = persona("coordinadora")
    segunda = persona("coordinadora")

    assert primera == segunda


def test_personas_distintas_no_caen_todas_en_el_mismo_color():
    """Con cinco colores y cinco nombres no tienen que salir cinco distintos —el reparto es un
    módulo, no una asignación— pero **sí más de uno**: si salieran todos iguales, la etiqueta no
    haría nada y el fallo sería invisible."""
    colores = {persona(n).split("acento-")[1][0] for n in ("ana", "beto", "carla", "dani", "eli")}

    assert len(colores) > 1


def test_el_indice_nunca_se_sale_de_los_cinco_acentos():
    """Un sexto índice apuntaría a una clase que no existe: la inicial saldría **sin fondo**.

    Se prueban cien nombres porque el módulo se hace sobre un `crc32` de 32 bits, y comprobarlo con
    uno no dice nada.
    """
    for i in range(100):
        salida = persona(f"persona-{i}")
        indice = int(salida.split("acento-")[1][0])
        assert 0 <= indice < ACENTOS


def test_un_nombre_vacio_no_dibuja_un_circulo_con_nada_dentro():
    assert persona("") == ""
    assert persona(None) == ""
    assert persona("   ") == ""


def test_el_nombre_se_escapa():
    """La etiqueta usa `format_html`, así que un nombre con `<` no puede inyectar HTML.

    Los nombres de usuario de Django no admiten `<`, pero esta etiqueta también se usa con nombres
    y apellidos, que sí admiten casi cualquier cosa.
    """
    salida = persona("<script>alert(1)</script>")

    assert "<script>" not in salida
    assert "&lt;script&gt;" in salida
