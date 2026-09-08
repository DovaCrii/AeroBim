"""Las reglas de las plantillas, comprobadas **leyendo los archivos**.

Ninguna es de estilo: cada una tapa un fallo **que no da error**, y por eso hace falta una prueba.

## 1. Un comentario de plantilla que se imprime en la pantalla

**`{# … #}` de Django es de una sola línea.** El lexer lo reconoce con una expresión que no cruza
saltos, así que si el cierre queda en la línea siguiente **el comentario no es un comentario**: es
texto, y sale impreso en la página. No hay error, no hay aviso, y en una pantalla con datos encima
puede pasar semanas sin que nadie lo vea.

Ha pasado tres veces en este repositorio: en la cabecera del portal, en la tabla de proyectos —donde
llevaba meses imprimiéndose— y en el mensaje de error de la pantalla de entrada, que solo se ve
cuando alguien falla la contraseña. Las dos últimas las encontró este mismo barrido.

Así que deja de ser una lección escrita en un archivo y pasa a ser una prueba: para un comentario de
más de una línea está `{% comment %}`.

## 2. Un `<h1>` dentro de `contenido`

Se pinta igual, un poco más abajo, sin las migas ni las acciones. Se ve como un descuido de diseño y
no como un fallo, así que nadie lo busca — y la siguiente pantalla que alguien escriba copiando esa
se va con el defecto puesto. El título va en `titulo_pagina`, o en `cabecera` cuando es compuesto.

## 3. Un manejador en línea

`onclick`, `onchange` y compañía **funcionan en desarrollo y no en producción**: la CSP los bloquea
allí y no aquí. Es la peor combinación posible — se prueba, funciona, y se despliega roto sin un
mensaje. Ya pasó con los tres `onchange="this.form.submit()"` de los filtros de observaciones.
"""

import re
from pathlib import Path

import pytest

# El paquete está en `apps/core/tests/`, así que la raíz del servicio son cuatro niveles arriba.
RAIZ = Path(__file__).resolve().parents[3]
PLANTILLAS = RAIZ / "templates"

ABRE = re.compile(r"\{#")
CIERRA = re.compile(r"#\}")

#: La puerta de entrada no extiende `base.html`: tiene su propio `<html>`, con la presentación al
#: lado del formulario. No tiene cabecera que migrar.
FUERA_DE_LA_BASE = {"registration/login.html"}


def _extienden_la_base() -> list[Path]:
    return sorted(
        p
        for p in PLANTILLAS.rglob("*.html")
        if p.name != "base.html"
        and not p.name.startswith("_")
        and p.relative_to(PLANTILLAS).as_posix() not in FUERA_DE_LA_BASE
    )


def _sin_comentarios(texto: str) -> str:
    """Fuera los `{% comment %}` y los `{# #}`.

    Los comentarios de estas plantillas **citan HTML** —«tenía un `<h1>` suelto», «la fila es un
    enlace»— y sin quitarlos las reglas de abajo denunciarían la explicación en vez del código.
    """
    texto = re.sub(r"\{%\s*comment\s*%\}.*?\{%\s*endcomment\s*%\}", "", texto, flags=re.DOTALL)
    return re.sub(r"\{#.*?#\}", "", texto, flags=re.DOTALL)


def _bloque_contenido(texto: str) -> str:
    """Lo que hay entre `{% block contenido %}` y el final del archivo.

    Basta con cortar por el principio: `contenido` es el último bloque de todas las plantillas del
    portal, así que no hace falta emparejar `endblock` — y emparejarlos mal daría un trozo de más.
    """
    marca = "{% block contenido %}"
    return texto[texto.index(marca) + len(marca) :] if marca in texto else ""


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


# --- La cabecera del sistema ----------------------------------------------------------


@pytest.mark.parametrize("plantilla", _extienden_la_base(), ids=lambda p: p.name)
def test_ningun_h1_dentro_de_contenido(plantilla):
    """**El oráculo del paso 4.**

    El título de la pantalla va en `titulo_pagina` —o en `cabecera` entera, cuando es compuesto—,
    para que la cabecera sea del sistema y no de cada plantilla. Antes eran treinta plantillas
    repitiendo su `<h1>` y su subtítulo, cada una con su margen y su orden.
    """
    dentro = _bloque_contenido(_sin_comentarios(plantilla.read_text(encoding="utf-8")))

    assert "<h1" not in dentro, (
        f"{plantilla.name} tiene un <h1> dentro de `contenido`. Va en "
        "`{% block titulo_pagina %}`, o en `{% block cabecera %}` si el título es compuesto."
    )


@pytest.mark.parametrize("plantilla", _extienden_la_base(), ids=lambda p: p.name)
def test_toda_pantalla_tiene_titulo_de_alguna_forma(plantilla):
    """La otra mitad: **que la pasada no haya dejado una pantalla sin encabezado.**

    Quitar el `<h1>` de `contenido` y olvidarse de ponerlo arriba deja una pantalla sin título, y
    con la cabecera vacía escondiéndose sola —que es lo que permite migrar de una en una— no se
    notaría en la que se olvidó.
    """
    texto = _sin_comentarios(plantilla.read_text(encoding="utf-8"))

    tiene = "{% block titulo_pagina %}" in texto or "{% block cabecera %}" in texto

    assert tiene, f"{plantilla.name} se quedó sin título: ni `titulo_pagina` ni `cabecera`"


def test_la_base_declara_cada_bloque_una_sola_vez():
    """Dos bloques con el mismo nombre es un error silencioso: **el segundo gana.**

    Y hay dos que se llaman parecido a propósito: `titulo` es el `<title>` de la pestaña y
    `titulo_pagina` es el `<h1>`. Si alguien renombra uno al otro, la pestaña o el encabezado
    desaparecen sin dar error.
    """
    base = _sin_comentarios((PLANTILLAS / "base.html").read_text(encoding="utf-8"))

    nombres = re.findall(r"\{%\s*block\s+([a-z_]+)\s*%\}", base)

    assert sorted(nombres) == sorted(set(nombres)), f"bloques repetidos: {nombres}"
    assert {"titulo", "titulo_pagina", "subtitulo", "migas", "acciones", "cabecera"} <= set(nombres)


# --- Lo que la CSP prohíbe -------------------------------------------------------------


def test_la_puerta_usa_el_css_del_producto():
    """`F12.6`. **Tenía diez tokens propios que eran los mismos hexadecimales que los del sistema.**

    El motivo escrito era que la pantalla de entrada «no tiene que depender de que el resto de la
    hoja de estilos cargue bien». No se sostiene —si `app.css` no carga, todas las demás pantallas
    están rotas también— y costaba dos cosas medidas: el arreglo de contraste de los campos no
    llegaba aquí, y el tema elegido se ignoraba.

    Esta prueba fija las tres: que cargue `app.css`, que cargue `tema.js`, y que no vuelva a tener
    un `<style>` con tokens suyos.
    """
    puerta = (PLANTILLAS / "registration" / "login.html").read_text(encoding="utf-8")
    limpio = _sin_comentarios(puerta)

    assert "css/app.css" in limpio, "la puerta no carga el CSS del producto"
    assert "js/tema.js" in limpio, "la puerta no respeta el tema elegido"
    assert "--login-" not in limpio, "la puerta volvió a tener sus propios tokens"
    assert "<style" not in limpio, "la puerta volvió a tener CSS embebido"


@pytest.mark.parametrize("plantilla", _extienden_la_base(), ids=lambda p: p.name)
def test_ninguna_plantilla_lleva_un_manejador_en_linea(plantilla):
    """**La CSP lo bloquea en producción y hasta hoy nadie lo vigilaba.**

    Ver el encabezado del módulo: funciona en desarrollo y no en el servidor, que es la forma de
    desplegar algo roto sin un solo mensaje.
    """
    texto = _sin_comentarios(plantilla.read_text(encoding="utf-8"))

    manejadores = re.findall(r"\son(?:click|change|submit|input|load|focus|blur|keyup)\s*=", texto)

    assert manejadores == [], (
        f"{plantilla.name} lleva {manejadores}: la CSP los bloquea en producción. "
        "El comportamiento va en `static/js/`, como `tema.js`."
    )
