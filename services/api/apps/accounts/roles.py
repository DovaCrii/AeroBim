"""Los roles de AeroBim, **como dato**.

Un rol es un `Group` de Django y la autorizacion son permisos de modelo. No hay
tabla de roles propia y no hace falta: Django ya trae el mecanismo, probado, y lo
que aporta este archivo es la matriz — que es la parte que se discute con el
usuario y la que cambia.

**La leccion que viene con el codigo.** El rol de solo lectura de AeroControl era
"todo permiso cuyo nombre empiece por `view_`", y eso le entregaba en silencio los
tokens de API, la lista de usuarios, las sesiones, la auditoria y el historial de
trabajos. Un rol de lectura lee **el registro del proyecto**, no la administracion
del sistema. Por eso `MANDANTE` es una lista blanca explicita y nunca un patron.
"""

from django.utils.translation import gettext_lazy as _

ADMINISTRADOR = "Administrador"
COORDINADOR = "Coordinador BIM"
PROYECTISTA = "Proyectista"
REVISOR = "Revisor"
MANDANTE = "Mandante"

# **No es un rol**: es un grupo de notificacion con cero permisos. Decide quien
# recibe el resumen, y meterlo en la matriz de permisos seria darle acceso a algo
# por el hecho de estar en una lista de correo.
DIRECCION = "Direccion"

GRUPOS_DE_NOTIFICACION = [DIRECCION]

DESCRIPCIONES = {
    ADMINISTRADOR: _("Everything, including system administration."),
    COORDINADOR: _(
        "Creates projects and deliverables, assigns owners, issues transmittals, "
        "closes observations."
    ),
    PROYECTISTA: _("Uploads revisions of their own deliverables and answers observations."),
    REVISOR: _("Opens and grades observations, changes a revision's suitability code."),
    MANDANTE: _("Reads published deliverables, downloads them and comments."),
    DIRECCION: _("Not a role: notification group for the executive summary."),
}

# La matriz. Cada entrada es `app_label.accion_modelo`, y se comprueba contra los
# permisos que Django genero de verdad: un nombre mal escrito **falla el arranque
# del comando** en vez de dejar un rol silenciosamente vacio.
#
# `ADMINISTRADOR` no aparece: se le dan todos los permisos que existan, porque
# enumerarlos seria una lista que se queda atras en cuanto se añade un modelo.
PERMISOS_POR_ROL: dict[str, tuple[str, ...]] = {
    COORDINADOR: (
        "core.view_organizacion",
        "core.view_membresia",
        "core.view_jobrun",
    ),
    PROYECTISTA: ("core.view_organizacion",),
    REVISOR: ("core.view_organizacion",),
    # **Lista blanca, no patron.** Cuando lleguen los entregables (`F8.1`), aqui se
    # añaden uno por uno los `view_*` del registro del proyecto — y ni uno de la
    # administracion del sistema.
    MANDANTE: ("core.view_organizacion",),
}
