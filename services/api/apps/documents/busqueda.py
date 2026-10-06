"""El buscador del registro: entregables y observaciones por lo que se recuerda de ellos (`F15.6`).

Es la mitad «ProjectWise» del buscador —encontrar un documento o un hallazgo por su código, su
título o lo que dice—; la mitad «Synchro», buscar un elemento del modelo, vive en el visor. Aquí
solo está lo que no depende de la base: cómo se parte lo que alguien escribe.

## Qué se compara con qué

Cada término tiene que aparecer en **algún campo** del registro (código o título en un entregable;
título o descripción en una observación), y **todos** los términos tienen que aparecer: «cota eje»
no encuentra una observación que solo habla del eje. La coincidencia es `icontains` de la base: **no
distingue mayúsculas** («ESTRUCTURA» y «estructura» son lo mismo) **pero sí acentos** («diseño» no
encuentra «DISENO»). Quitar los acentos exige la extensión `unaccent` de PostgreSQL, que es una
decisión de despliegue y no se toma aquí.
"""

from __future__ import annotations

#: Menos de esto devolvería media obra: se pide algo más antes de buscar.
MINIMO_DE_LETRAS = 2

#: Cuántos términos se aceptan. Una consulta de cuarenta palabras no es una búsqueda, es un pegado.
MAXIMO_DE_TERMINOS = 6

#: El largo máximo de un término. Más largo que un código de entregable no apunta a nada.
MAXIMO_LARGO_DE_TERMINO = 80


def terminos_de(consulta: str | None) -> list[str]:
    """La consulta partida en términos, o `[]` si no hay nada que buscar.

    Se parte por espacios, se descarta lo vacío y se recorta: **lo que sobra se ignora, no es un
    error**. Una búsqueda con un pegado de más no tiene que fallar, tiene que buscar lo que se
    pueda.
    """
    if not consulta:
        return []
    terminos = [t[:MAXIMO_LARGO_DE_TERMINO] for t in consulta.split() if t]
    if sum(len(t) for t in terminos) < MINIMO_DE_LETRAS:
        return []
    return terminos[:MAXIMO_DE_TERMINOS]
