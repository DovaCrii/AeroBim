"""La inicial de una persona, con su color.

## Para qué

Para reconocer de quién es una fila **sin leerla**. En una lista de treinta hallazgos, el nombre de
usuario repetido treinta veces en gris es una columna de ruido; una inicial con color deja ver de un
vistazo que veinte son de la misma persona y diez de otra.

**El nombre sigue escrito al lado**, y no es redundancia: una inicial no distingue a dos personas
que empiezan igual, y el color no lo lee quien no distingue colores. La inicial es un ancla para la
vista, no la información.

## El color no puede salir de `hash()`

`hash("coordinadora") % 5` parece la forma obvia y **está mal**: Python aleatoriza el hash de las
cadenas en cada proceso (`PYTHONHASHSEED`), así que el color de una persona cambiaría en cada
reinicio del servidor — y entre dos trabajadores de gunicorn a la vez, o sea que la misma página
podría dar dos colores distintos al recargar.

Se usa `crc32`, que es determinista y está en la biblioteca estándar. No hace falta que sea un buen
hash criptográfico: solo que sea el mismo siempre.

## Los cinco colores son los del portal, medidos

Son las cinco clases `.acento-N` de `app.css`, con sus contrastes anotados en una tabla y
comprobados por el gate (`test_sistema_de_diseno.py`). Inventar cinco colores nuevos para esto sería
inventar cinco contrastes sin medir.
"""

from zlib import crc32

from django import template
from django.utils.html import format_html

register = template.Library()

#: Cuántos acentos hay en `app.css`. El gate comprueba que sigan siendo cinco: con un sexto sin
#: medir, la inicial de alguien saldría con un color sin comprobar.
ACENTOS = 5


@register.simple_tag
def persona(nombre: str | None) -> str:
    """La inicial con su color, y el nombre al lado.

    Un nombre vacío devuelve cadena vacía en vez de un círculo con nada dentro: `responsable` es
    obligatorio en los dos modelos, pero esta etiqueta también la usa la lista de usuarios, donde
    un nombre puede faltar.
    """
    texto = (nombre or "").strip()
    if not texto:
        return ""
    indice = crc32(texto.encode("utf-8")) % ACENTOS
    return format_html(
        '<span class="persona acento-{}">'
        '<span class="persona-inicial" aria-hidden="true">{}</span>'
        '<span class="persona-nombre">{}</span>'
        "</span>",
        indice,
        texto[0].upper(),
        texto,
    )
