"""La antigüedad de algo, en una sola unidad.

**El filtro `timesince` de Django dice dos unidades**, y en una tabla eso convierte una columna de
apoyo en el texto más largo de la fila: «abierta hace 3 horas, 43 minutos» ocupa más que el título
del hallazgo que va al lado. La segunda unidad además no decide nada — quien recorre una lista de
observaciones quiere saber si algo lleva horas o semanas, no cuántos minutos sobran.

`timesince(..., depth=1)` es la misma función de Django con una unidad, así que las traducciones y
el redondeo siguen siendo los suyos: aquí no se reimplementa nada.
"""

from django import template
from django.utils.timesince import timesince

register = template.Library()


@register.filter
def antiguedad(cuando):
    """«3 horas» en vez de «3 horas, 43 minutos». Cadena vacía si no hay fecha."""
    if not cuando:
        return ""
    return timesince(cuando, depth=1)
