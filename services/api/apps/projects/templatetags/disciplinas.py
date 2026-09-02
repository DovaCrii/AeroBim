"""El distintivo de una disciplina, para usarlo en cualquier plantilla.

**Existe para que el color de una especialidad se pinte igual en todas las pantallas.** El color ya
vivia en la base —una sola copia, dice el modelo— y aun asi cada plantilla lo pintaba a su manera:
la tabla de disciplinas ensenaba un cuadrado y el hexadecimal en texto, la barra de avance lo usaba
de relleno y la tabla de entregables no lo usaba en absoluto. Tres formas de decir lo mismo, y una
de ellas ensenando `#5b3a9e` a quien no le importa.

Se usa asi:

    {% load disciplinas %}
    {% distintivo entregable.disciplina %}
"""

from django import template

from apps.projects.color import distintivo as calcular

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
