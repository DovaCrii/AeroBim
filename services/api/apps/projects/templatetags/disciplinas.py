"""El distintivo de una disciplina, para usarlo en cualquier plantilla.

**Existe para que el color de una especialidad se pinte igual en todas las pantallas.** El color ya
vivia en la base —una sola copia, dice el modelo— y aun asi cada plantilla lo pintaba a su manera:
la tabla de disciplinas ensenaba un cuadrado y el hexadecimal en texto, la barra de avance lo usaba
de relleno y la tabla de entregables no lo usaba en absoluto. Tres formas de decir lo mismo, y una
de ellas ensenando `#5b3a9e` a quien no le importa.

Se usa asi:

    {% load disciplinas %}
    {% distintivo entregable.disciplina %}
    {% marca_etiqueta una_etiqueta %}
"""

from django import template

from apps.projects.color import distintivo as calcular
from apps.projects.color import normalizar, tinta_sobre

register = template.Library()


@register.inclusion_tag("projects/_distintivo.html")
def distintivo(disciplina, con_nombre: bool = False):
    """El distintivo de una disciplina: su codigo sobre su color.

    Con `con_nombre` sale ademas el nombre al lado, que es lo que hace falta la primera vez que
    aparece en una pantalla —una leyenda— y estorba en una tabla de cuarenta filas.
    """
    if disciplina is None:
        return {"vacio": True}
    datos = calcular(disciplina)
    datos["con_nombre"] = con_nombre
    datos["vacio"] = False
    return datos


@register.inclusion_tag("projects/_etiqueta.html")
def marca_etiqueta(etiqueta):
    """La marca de una etiqueta: **su nombre** sobre su color. `F10.1`.

    No usa `distintivo` aunque se parezca, y la diferencia no es estetica: una disciplina se
    identifica por su **codigo** —«AR», dos letras que caben en una tabla de cuarenta filas— y una
    etiqueta no tiene codigo, porque su nombre *es* su identidad. Con `distintivo` saldria un «—»
    donde tendria que ir la palabra.

    Lo que si comparte es **la regla de la tinta**: la letra se elige midiendo la luminancia del
    fondo, en `apps/projects/color.py`, y esa regla vive en un solo sitio.
    """
    color = normalizar(getattr(etiqueta, "color", None))
    return {
        "nombre": getattr(etiqueta, "nombre", "") or "—",
        "fondo": color,
        "tinta": tinta_sobre(color),
    }
