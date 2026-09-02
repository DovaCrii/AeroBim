"""Un comentario de plantilla que se imprime en la pantalla.

**`{# … #}` de Django es de una sola línea.** El lexer lo reconoce con una expresión que no cruza
saltos, así que si el cierre queda en la línea siguiente **el comentario no es un comentario**: es
texto, y sale impreso en la página. No hay error, no hay aviso, y en una pantalla con datos encima
puede pasar semanas sin que nadie lo vea.

Ha pasado tres veces en este repositorio: en la cabecera del portal, en la tabla de proyectos —donde
llevaba meses imprimiéndose— y en el mensaje de error de la pantalla de entrada, que solo se ve
cuando alguien falla la contraseña. Las dos últimas las encontró este mismo barrido.

Así que deja de ser una lección escrita en un archivo y pasa a ser una prueba: para un comentario de
más de una línea está `{% comment %}`.
"""

import re
from pathlib import Path

# El paquete está en `apps/core/tests/`, así que la raíz del servicio son cuatro niveles arriba.
RAIZ = Path(__file__).resolve().parents[3]
PLANTILLAS = RAIZ / "templates"

ABRE = re.compile(r"\{#")
CIERRA = re.compile(r"#\}")


def test_ningun_comentario_de_una_linea_se_queda_abierto():
    sueltos = []
    for plantilla in sorted(PLANTILLAS.rglob("*.html")):
        for numero, linea in enumerate(plantilla.read_text(encoding="utf-8").splitlines(), 1):
            if len(ABRE.findall(linea)) > len(CIERRA.findall(linea)):
                relativa = plantilla.relative_to(RAIZ).as_posix()
                sueltos.append(f"{relativa}:{numero}: {linea.strip()[:70]}")

    assert not sueltos, (
        "Estos `{# #}` no se cierran en su propia línea, así que Django los imprime en la "
        "pantalla. Para varias líneas se usa `{% comment %}`:\n  " + "\n  ".join(sueltos)
    )


def test_el_barrido_encuentra_de_verdad_las_plantillas():
    """**Una prueba que no mira nada pasa siempre**, que es la forma en que este guardián se
    rompería sin avisar: si mañana se mueven las plantillas, el `rglob` devuelve vacío y el test
    seguiría en verde."""
    assert PLANTILLAS.is_dir()
    assert len(list(PLANTILLAS.rglob("*.html"))) > 20
