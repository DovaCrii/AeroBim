"""La navegación, disponible en **todas** las plantillas.

## Por qué un context processor y no un `{% include %}` con su vista

Porque la barra lateral se pinta en `base.html`, y `base.html` lo extienden treinta y tantas
plantillas de siete aplicaciones distintas. La alternativa era que cada vista metiera los módulos en
su contexto: treinta y tantos sitios donde se puede olvidar, y el síntoma sería **un rail que
desaparece en una pantalla suelta**.

## Y por qué `SimpleLazyObject`

Porque esto corre en **cada** respuesta, incluidas las que no pintan ninguna plantilla: las de la
API en DRF, las descargas de archivo, los redirects del login. Calcular los permisos de doce módulos
ahí es trabajo tirado.

Con `SimpleLazyObject` el cálculo pasa **la primera vez que la plantilla lo nombra**, así que una
respuesta sin plantilla no paga nada. Una prueba lo fija contando consultas.
"""

from django.utils.functional import SimpleLazyObject

from apps.accounts.modulos import activo, modulos_para, por_grupo


def navegacion(request):
    """`grupos_de_navegacion` y `modulo_activo` para la barra lateral.

    Los dos nombres son largos a propósito: el contexto de una plantilla es un espacio de nombres
    compartido con **todas** las vistas, y un `modulos` suelto lo pisaría cualquier vista que use
    esa palabra —que es justo lo que hace `PortalView`—. Un nombre corto aquí es una colisión
    esperando.
    """
    usuario = getattr(request, "user", None)
    if usuario is None or not usuario.is_authenticated:
        # **Sin sesión no hay navegación, y no es lo mismo que una lista vacía.** La puerta de
        # entrada extiende una base mínima sin rail, y un rail vacío ahí sería una columna de 248 px
        # de nada al lado del formulario.
        return {"grupos_de_navegacion": (), "modulo_activo": None}

    def calcular():
        return por_grupo(modulos_para(usuario))

    def pendientes():
        """El número del distintivo de la campana.

        **Va aquí y no en cada vista por el mismo motivo que el rail**: la barra la pinta
        `base.html` y la extienden treinta y tantas plantillas. Y va perezoso por el mismo motivo
        que lo de arriba: una descarga de archivo no tiene que pagar una consulta para un contador
        que nadie va a ver. Es un `count()` con índice por (destinatario, leído).
        """
        from apps.core.avisos import cuantos_sin_leer

        return cuantos_sin_leer(usuario)

    return {
        "grupos_de_navegacion": SimpleLazyObject(calcular),
        "modulo_activo": SimpleLazyObject(lambda: activo(request)),
        "avisos_sin_leer": SimpleLazyObject(pendientes),
    }
