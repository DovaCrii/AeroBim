"""Los vocabularios: la maquinaria, y las dos reglas que valen para cualquiera de ellos.

Hay dos, y los pidió el usuario con un día de diferencia:

- **`vocabulario_bim.py`** (`F11.11`) — las dieciséis palabras de la lámina de conceptos BIM.
- **`vocabulario_levantamiento.py`** (`F11.12`) — nube de puntos, MDT, ortofoto y el sistema de
  referencia: «glosario topográfico para entender en general las diferentes especialidades».

## La regla que hace que esto no sea un glosario más

Definiciones hay en veinte sitios de internet y quien abre esto no necesita la vigesimoprimera. Lo
que **no** puede encontrar en ninguno es si la herramienta que tiene delante hace esa cosa. Por eso
cada término lleva `en_aerobim`, y por eso `lo_hace` es obligatorio: **decir que no es la mitad del
valor**. Un vocabulario en el que todo sale a «sí» es un folleto, y quien lo lee lo descubre
buscando un botón que no existe.

## La regla de escritura, que se aprendió mirando la pantalla

**Los textos van sin `**negritas**`.** Esto no se renderiza como Markdown sino como texto en una
plantilla de Django, y los asteriscos salen tal cual. Hay una prueba por vocabulario.

Y **el texto va en español literal, sin `gettext`**, por lo mismo que `ayuda.py`: el catálogo va de
`msgid` en inglés a `msgstr` en español, así que marcar prosa que ya está en español obligaría a
traducirla a sí misma. El chrome de la plantilla sí lleva `msgid`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Termino:
    """Una palabra de un vocabulario.

    `en_aerobim` es el campo que justifica la pantalla: contesta «¿esta herramienta hace esto?», que
    es lo único que no se puede buscar fuera.
    """

    sigla: str
    #: Lo que la sigla abrevia. Vacío cuando el término ya es su nombre.
    nombre: str
    que_es: str
    #: Qué hace AeroBim con esto — o qué hay en su lugar, cuando no lo hace.
    en_aerobim: str
    #: `True` si el producto lo hace. `False` si no, y entonces `en_aerobim` dice qué falta.
    lo_hace: bool
    grupo: str
    #: La ruta de la pantalla donde vive, o `None`. Solo tiene sentido cuando `lo_hace`.
    ruta: str | None = None


@dataclass(frozen=True)
class Vocabulario:
    """Un vocabulario entero: su clave de URL, su título y sus términos agrupados."""

    #: Va en la URL. Corta y sin acentos.
    clave: str
    titulo: str
    #: Los grupos, **en el orden en que se encuentra uno con ellos** y no alfabético: un índice
    #: alfabético no enseña que el CDE y el BEP son la misma conversación.
    grupos: tuple[str, ...]
    terminos: tuple[Termino, ...]


def vocabularios() -> dict[str, Vocabulario]:
    """Los vocabularios por clave.

    Se arma en una función y no como constante de módulo para que los módulos de contenido puedan
    importar `Termino` de aquí sin ciclo.
    """
    from apps.accounts.vocabulario_bim import VOCABULARIO as BIM
    from apps.accounts.vocabulario_levantamiento import VOCABULARIO as LEVANTAMIENTO

    return {BIM.clave: BIM, LEVANTAMIENTO.clave: LEVANTAMIENTO}


@dataclass(frozen=True)
class TerminoResuelto:
    """Un término con su enlace ya resuelto."""

    termino: Termino
    url: str | None


def terminos_por_grupo(vocabulario: Vocabulario) -> list[tuple[str, list[TerminoResuelto]]]:
    """El vocabulario agrupado, en el orden de sus grupos.

    **No se filtra por permisos**, al contrario que el portal y como la ayuda: esto explica el
    vocabulario del oficio, no da acceso a nada. El enlace sí se omite si la ruta no resuelve, para
    que un módulo retirado no tumbe la pantalla; el gate lo caza antes.
    """
    from django.urls import NoReverseMatch, reverse

    por_grupo: dict[str, list[TerminoResuelto]] = {grupo: [] for grupo in vocabulario.grupos}
    for termino in vocabulario.terminos:
        url = None
        if termino.ruta is not None:
            try:
                url = reverse(termino.ruta)
            except NoReverseMatch:
                url = None
        por_grupo[termino.grupo].append(TerminoResuelto(termino=termino, url=url))
    return [(grupo, por_grupo[grupo]) for grupo in vocabulario.grupos]


def cuantos_no_estan(vocabulario: Vocabulario) -> int:
    """Cuántos términos no están en el producto, para poder decirlo arriba."""
    return sum(1 for uno in vocabulario.terminos if not uno.lo_hace)
