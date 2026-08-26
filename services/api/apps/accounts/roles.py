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

# Lo que cualquiera con un rol puede leer del proyecto: sin esto no hay pantalla que
# abrir. Va aparte para no repetirlo en cada rol y que se olvide en uno.
_LECTURA_DEL_PROYECTO = (
    "core.view_organizacion",
    "projects.view_proyecto",
    "projects.view_disciplina",
    "projects.view_paquetewbs",
    "documents.view_entregable",
    "documents.view_revision",
    "documents.view_observacion",
    "documents.view_comentario",
    "documents.view_actividad",
    "documents.view_transmittal",
    # El requisito de informacion del proyecto y sus corridas (`F3.5`). **Se leen desde
    # cualquier rol**: saber si el modelo cumple lo que el mandante exigio no es un dato
    # interno, es el estado del entregable — y el mandante es justamente quien lo exigio.
    "documents.view_requisitoids",
    "documents.view_validacionids",
)

PERMISOS_POR_ROL: dict[str, tuple[str, ...]] = {
    # Arma el proyecto, asigna a quien le toca, emite y cierra.
    COORDINADOR: _LECTURA_DEL_PROYECTO
    + (
        "core.view_membresia",
        "core.view_jobrun",
        "projects.add_proyecto",
        "projects.change_proyecto",
        "projects.add_disciplina",
        "projects.change_disciplina",
        "projects.add_paquetewbs",
        "projects.change_paquetewbs",
        "documents.add_entregable",
        "documents.change_entregable",
        "documents.add_revision",
        "documents.change_revision",
        "documents.add_transmittal",
        "documents.change_transmittal",
        "documents.add_observacion",
        "documents.change_observacion",
        "documents.add_comentario",
        "documents.add_actividad",
        "documents.change_actividad",
        # **El requisito lo pone quien coordina**, porque es un acuerdo con el mandante y no
        # una preferencia de quien modela.
        "documents.add_requisitoids",
        "documents.change_requisitoids",
        "documents.add_validacionids",
    ),
    # Sube revisiones y responde. **No cierra observaciones**: quien las abre las cierra,
    # o el registro se convierte en "yo mismo declaro que lo arregle".
    PROYECTISTA: _LECTURA_DEL_PROYECTO
    + (
        "documents.add_revision",
        "documents.add_comentario",
        "documents.change_actividad",
        # **Puede validar contra el requisito, no escribirlo.** Es lo que le permite comprobar
        # su propio modelo antes de emitirlo, que es cuando corregirlo cuesta menos.
        "documents.add_validacionids",
    ),
    # Abre y califica observaciones, y cambia el codigo de idoneidad de una revision —
    # que es su trabajo: decir para que sirve el documento.
    REVISOR: _LECTURA_DEL_PROYECTO
    + (
        "documents.add_observacion",
        "documents.change_observacion",
        "documents.add_comentario",
        "documents.change_revision",
    ),
    # **Lista blanca, no patron.** Lee el registro del proyecto y comenta; ni un permiso
    # de la administracion del sistema, y ni uno de escritura sobre el registro. Lo que
    # ve, ademas, se acota a las revisiones publicadas: eso lo hace la vista, porque un
    # permiso no sabe distinguir una `S0` de una `A1`.
    MANDANTE: _LECTURA_DEL_PROYECTO + ("documents.add_comentario",),
}
