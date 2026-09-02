"""El color de una disciplina, y como se pinta sin que deje de leerse.

**Cada especialidad se reconoce por su color antes de leerse.** Es lo que pidio el usuario el
2026-09-02 —«las disciplinas, ver como se representan, sumar una figura o algo con algun color que
identifique cada especialidad»— y es lo que hace que una tabla de cuarenta entregables se recorra
buscando arquitectura en vez de leyendo cuarenta filas.

## El problema que resuelve este modulo, y no es decorativo

El color lo elige una persona en un formulario, asi que **puede ser cualquiera**: un violeta oscuro,
un amarillo casi blanco o un negro. Escribir el codigo en blanco encima y confiar en que se lea es
lo que produce «AR» invisible sobre amarillo.

Asi que **el color del texto se decide midiendo**, no suponiendo: se calcula la luminancia relativa
del fondo con la formula de WCAG 2.1 y se elige blanco o tinta segun cual de los dos contraste mas.
La misma formula que ya vive en `bim-core` para el visor; aca esta en Python porque la plantilla se
pinta en el servidor.

**Y no hay un umbral magico.** Se comparan los dos contrastes de verdad y gana el mayor, que es lo
que funciona igual con un color medio —donde un umbral fijo se equivoca— que con los extremos.
"""

from __future__ import annotations

#: La tinta oscura del sistema, para cuando el fondo del distintivo es claro.
#:
#: Es `--ab-text` del tema claro: si el chip lleva letra oscura, que sea la misma oscura que el
#: resto de la pantalla y no un negro suelto.
TINTA = "#172238"

#: El color con el que nace una disciplina si nadie elige uno. El mismo que el `default` del modelo.
POR_DEFECTO = "#5b3a9e"

#: Corte de la formula de WCAG 2.1. **`0,03928` y no `0,04045`**, que es el que distingue el
#: `#777777` a 4,48:1 del mismo a 4,54:1 — la misma constante que usa `contraste.ts` en `bim-core`,
#: y esta escrita dos veces porque una vive en el navegador y la otra en el servidor.
CORTE = 0.03928


def _canal(valor: float) -> float:
    return valor / 12.92 if valor <= CORTE else ((valor + 0.055) / 1.055) ** 2.4


def normalizar(color: str | None) -> str:
    """Un `#rrggbb` utilizable, siempre.

    **El campo se valida en el formulario y no en el modelo** —un color mal escrito no puede impedir
    que se guarde el registro de un entregable, dice el propio modelo— asi que aqui puede llegar
    cualquier cosa: vacio, sin almohadilla, en tres digitos o una palabra. Se arregla lo que se
    puede y lo que no cae al color por defecto, porque una disciplina sin color no se distingue de
    la de al lado.
    """
    crudo = (color or "").strip()
    if not crudo:
        return POR_DEFECTO
    if not crudo.startswith("#"):
        crudo = f"#{crudo}"
    cuerpo = crudo[1:]
    # `#abc` es CSS valido y hay quien lo escribe: se expande en vez de rechazarlo.
    if len(cuerpo) == 3 and all(c in "0123456789abcdefABCDEF" for c in cuerpo):
        cuerpo = "".join(c * 2 for c in cuerpo)
    if len(cuerpo) != 6 or not all(c in "0123456789abcdefABCDEF" for c in cuerpo):
        return POR_DEFECTO
    return f"#{cuerpo.lower()}"


def luminancia(color: str) -> float:
    """La luminancia relativa de WCAG 2.1, entre 0 y 1."""
    cuerpo = normalizar(color)[1:]
    r, g, b = (int(cuerpo[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * _canal(r) + 0.7152 * _canal(g) + 0.0722 * _canal(b)


def contraste(uno: str, otro: str) -> float:
    """El ratio de contraste entre dos colores. 1 es igual, 21 es blanco contra negro."""
    a, b = sorted((luminancia(uno), luminancia(otro)), reverse=True)
    return (a + 0.05) / (b + 0.05)


def tinta_sobre(color: str) -> str:
    """Blanco o tinta oscura, **el que mas contraste da** sobre ese fondo.

    Ver el docstring del modulo: no hay umbral fijo. Se comparan los dos y gana el mayor, que es lo
    que acierta tambien con los colores medios — un umbral en 0,5 de luminancia se equivoca justo
    ahi, y «justo ahi» es donde caen los azules y los verdes de una paleta de disciplinas.
    """
    fondo = normalizar(color)
    return "#ffffff" if contraste("#ffffff", fondo) >= contraste(TINTA, fondo) else TINTA


def distintivo(disciplina) -> dict:
    """Lo que la plantilla necesita para pintar el distintivo de una disciplina.

    Devuelve un diccionario y no HTML: quien pinta es la plantilla, que es donde se puede mirar.
    """
    color = normalizar(getattr(disciplina, "color", None))
    return {
        "codigo": getattr(disciplina, "codigo", "") or "—",
        "nombre": getattr(disciplina, "nombre", "") or "",
        "fondo": color,
        "tinta": tinta_sobre(color),
        # Cuanto contraste tiene de verdad, para poder avisar en la pantalla de edicion cuando
        # alguien elige un color con el que su propio codigo se lee mal.
        "contraste": round(contraste(tinta_sobre(color), color), 2),
    }
