"""El catálogo de módulos del portal: **qué hay, quién lo ve, y dónde estoy ahora.**

## Por qué sale de la vista

Vivía dentro de `PortalView._definicion()`, y desde ahí solo lo podía leer la portada. La barra
lateral persistente lo necesita **en todas las páginas**, así que o se duplicaba la lista —dos
verdades sobre qué módulos existen, que se separan al primer cambio— o salía a su propio módulo.

Se saca **sin tocar el contenido**: los mismos doce módulos, los mismos grupos, las mismas líneas
de ayuda y los mismos permisos. Una prueba fija la lista contra una constante escrita a mano
(`test_modulos.py`) precisamente para que este movimiento no cambie nada de lo que se ve.

## Las tres reglas de los nombres, que se conservan

Se revisaron enteros el 2026-09-02 a petición del usuario —«buscar los mejores nombres para cada
sección y mejorar las etiquetas de ayuda»— y valen para lo que se añada después:

1. **El grupo dice de qué trata, no qué clase de objeto es.** «Proyecto», «Modelo» y «Documentos»
   son nombres de tablas; «Las obras», «El modelo» y «El registro documental» son sitios a los que
   se va. La lista se lee como una tabla de contenidos.
2. **La línea de ayuda contesta «qué encuentro ahí» y no repite el título.**
3. **Ninguna promete lo que no hay.** El transmittal no dice «con acuse de recibo» porque no lo
   tiene todavía.

Y «Lo mío» va en coordinación y no en documentos: lista observaciones y actividades. **El permiso no
es el sitio.**
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.urls import reverse
from django.utils.translation import gettext_lazy as _


@dataclass(frozen=True)
class Modulo:
    """Una entrada del portal.

    Es una `dataclass` y no una tupla de cinco porque ahora la leen tres sitios —la portada, el rail
    y la ayuda— y en una tupla `uno[3]` no dice si es el permiso o la descripción. El icono entra
    como campo, a diferencia de antes: cuando la lista solo alimentaba las tarjetas, tenerlo en un
    diccionario aparte mantenía legible la matriz de permisos; con el rail el icono **es** el módulo
    en la versión plegada, y separarlo dejaba la mitad de la información en otro sitio.
    """

    grupo: str
    titulo: str
    ruta: str
    permiso: str | None
    descripcion: str
    icono: str
    #: Rutas que también «encienden» este módulo en el rail, además de la suya.
    #:
    #: **Hacen falta porque una pantalla de detalle no tiene entrada propia.** Estando en
    #: `/documentos/entregables/<pk>/` el rail tiene que marcar «Entregables»; sin esto no marcaría
    #: nada, y el rail dejaría de contestar «¿dónde estoy?» justo en las pantallas donde se trabaja.
    rutas_extra: tuple[str, ...] = field(default=())

    @property
    def url(self) -> str:
        """El camino, resuelto.

        Va como propiedad y no como campo porque `reverse()` necesita las URL ya cargadas, y
        `CATALOGO` se construye al importar el módulo: resolverlo ahí daría un `AppRegistryNotReady`
        según quién importe primero. Así se resuelve al pintarlo, que es cuando hace falta.

        El nombre es `url` y no `camino` porque **es lo que la plantilla ya escribe**
        (`portal.html:159`): esta mudanza no cambia una sola línea de plantilla.
        """
        return reverse(self.ruta)


#: Los doce módulos, en el orden en que se leen.
#:
#: **El orden es el del trabajo, no el alfabético**: se elige una obra, se mira el modelo, se
#: gestiona el papel, se coordina, y al final se administra la máquina.
CATALOGO: tuple[Modulo, ...] = (
    Modulo(
        grupo=_("The works"),
        titulo=_("Projects"),
        ruta="projects:proyectos",
        permiso="projects.view_proyecto",
        descripcion=_("Each work with its progress, its calendar and what it has open."),
        icono="i-proyecto",
    ),
    Modulo(
        grupo=_("The works"),
        titulo=_("Organisations"),
        ruta="core:organizaciones",
        permiso="core.view_organizacion",
        descripcion=_("Which office each work belongs to, and who can see it."),
        icono="i-organizacion",
    ),
    Modulo(
        grupo=_("The model"),
        titulo=_("BIM viewer"),
        ruta="visor:visor",
        # Sin permiso: mirar un modelo es lo que cualquiera que pueda entrar viene a hacer. Lo que
        # **sí** está guardado es qué revisiones puede abrir, y eso lo decide `view_revision` en la
        # API.
        permiso=None,
        descripcion=_("Open the IFC and DXF in force: measure, section and note on the model."),
        icono="i-modelo",
        # El visor de documentos es la otra mitad de lo mismo (`F8.6`): se llega desde una revisión
        # en PDF y el rail tiene que seguir diciendo «el modelo».
        rutas_extra=("visor:documento",),
    ),
    # ══════════════════════════════════════════════════════════════════════════════════════
    #   **«Archivos» va primero del grupo, y es la entrada que faltaba.**
    #
    #   Todo lo que esta pantalla enseña **ya estaba guardado en el servidor** desde el primer
    #   día: un IFC, un COPC, un DXF o un PDF subidos como revisión viven en
    #   `/var/lib/aerobim/documentos`, con su sha256, y el visor los abre desde «Del registro».
    #   Lo que no existía era **un sitio donde verlos todos**.
    #
    #   El usuario lo dijo exactamente: «si no queda en el servidor no es solo un visor; debe
    #   almacenar la nube o el modelo, así ir teniendo un repositorio para ir abriendo,
    #   linkeando o revisando, pero que se busque del panel lateral, es lo más práctico».
    #
    #   Tenía razón en la necesidad y la mitad de la premisa era falsa: **sí queda en el
    #   servidor**. Lo que no se podía era encontrarlo — para llegar a un archivo había que
    #   saber de qué entregable colgaba, y eso es justo lo que no sabe quien lo busca.
    #
    #   Va **antes** de «Entregables» porque contesta la pregunta más frecuente —«¿dónde está
    #   el modelo?»— mientras que «Entregables» contesta la de planificación —«¿qué falta por
    #   entregar?»—, que se hace una vez por semana y no diez veces al día.
    # ══════════════════════════════════════════════════════════════════════════════════════
    Modulo(
        grupo=_("The document register"),
        titulo=_("Files"),
        ruta="documents:archivos",
        permiso="documents.view_revision",
        descripcion=_(
            "Everything stored on the server: models, point clouds, drawings and documents."
        ),
        icono="i-archivos",
    ),
    Modulo(
        grupo=_("The document register"),
        titulo=_("Deliverables"),
        ruta="documents:entregables",
        permiso="documents.view_entregable",
        descripcion=_("What has to be delivered, which revision it is on and how far along."),
        icono="i-entregable",
    ),
    Modulo(
        grupo=_("The document register"),
        titulo=_("Transmittals"),
        ruta="documents:transmittals",
        permiso="documents.view_transmittal",
        descripcion=_("What was issued, to whom and on what date."),
        icono="i-transmittal",
    ),
    Modulo(
        grupo=_("The document register"),
        titulo=_("Information requirements"),
        ruta="documents:requisitos-ids",
        permiso="documents.view_requisitoids",
        descripcion=_("What the client demands every model carry, checked against IDS."),
        icono="i-requisito",
    ),
    Modulo(
        grupo=_("Coordination"),
        # **Se llamaba «Lo mío» y cambia con la portada** (`F12.7`, 2026-09-07): con «Mi trabajo»
        # arriba, dos entradas «mías» eran dos sitios donde buscar lo mismo. El rail y el título de
        # la pantalla tienen que decir lo mismo — se vio mirándolo, con el rail diciendo «Lo mío» al
        # lado de una pantalla titulada «Todo lo pendiente».
        titulo=_("Everything pending"),
        ruta="documents:bandeja",
        permiso="documents.view_observacion",
        descripcion=_("Yours alone, soonest due first: what you have to answer."),
        icono="i-bandeja",
    ),
    Modulo(
        grupo=_("Coordination"),
        titulo=_("Observations"),
        ruta="documents:observaciones",
        permiso="documents.view_observacion",
        descripcion=_("Everything to be resolved, with an owner and a due date."),
        icono="i-observacion",
    ),
    Modulo(
        grupo=_("Coordination"),
        titulo=_("Activities"),
        ruta="documents:actividades",
        permiso="documents.view_actividad",
        descripcion=_("Planned work: who does what, and by when."),
        icono="i-actividad",
    ),
    Modulo(
        grupo=_("Administration"),
        titulo=_("Users and roles"),
        ruta="accounts:usuarios-roles",
        permiso="auth.view_user",
        descripcion=_("Who holds which role, and what that role can open. Read-only."),
        icono="i-usuarios",
    ),
    Modulo(
        grupo=_("Administration"),
        titulo=_("Audit trail"),
        ruta="accounts:auditoria",
        permiso="core.view_auditevent",
        descripcion=_("Every change, in order and impossible to erase."),
        icono="i-auditoria",
    ),
    Modulo(
        grupo=_("Administration"),
        titulo=_("Scheduled jobs"),
        ruta="accounts:trabajos",
        permiso="core.view_jobrun",
        descripcion=_("Whether last night's warnings and backup actually ran."),
        icono="i-trabajos",
    ),
)


def modulos_para(user) -> list[Modulo]:
    """Los módulos que **esta persona** puede abrir.

    **Se filtra y no se marca como deshabilitado**, que es la regla del sistema: un enlace que
    termina en 403 enseña a probar puertas. La ayuda (`ayuda.py`) sí enseña los pasos ajenos, y ahí
    es lo correcto porque explica el producto en vez de dar acceso.
    """
    return [m for m in CATALOGO if m.permiso is None or user.has_perm(m.permiso)]


def por_grupo(modulos: list[Modulo]) -> list[tuple[str, list[Modulo]]]:
    """Los módulos agrupados, **conservando el orden del catálogo**.

    Un `defaultdict` daría el mismo agrupamiento y perdería el orden en el que se declararon, que es
    el orden del trabajo. Y se agrupa aquí y no en la plantilla porque `{% regroup %}` exige que la
    lista venga ya ordenada por la clave: cumplirlo obligaría a ordenar el catálogo por nombre de
    grupo, o sea a que el orden de la pantalla lo decidiera el alfabeto.
    """
    grupos: list[tuple[str, list[Modulo]]] = []
    for modulo in modulos:
        if grupos and grupos[-1][0] == modulo.grupo:
            grupos[-1][1].append(modulo)
        else:
            grupos.append((modulo.grupo, [modulo]))
    return grupos


def activo(request, modulos: list[Modulo] | None = None) -> Modulo | None:
    """En qué módulo está esta petición, o `None` si en ninguno.

    **Por prefijo de URL más largo, y no por nombre de ruta**, y la diferencia importa: las
    pantallas de detalle —`/documentos/entregables/<pk>/`, la ficha de una observación— no tienen
    entrada propia en el catálogo, y comparando nombres de ruta el rail no marcaría nada justo en
    las pantallas donde se trabaja.

    **El más largo gana** porque los prefijos se solapan: `/documentos/observaciones/` empieza por
    `/documentos/`, y con el primero que coincida el rail marcaría «Entregables» estando en
    observaciones. Se resuelve midiendo, no ordenando la lista a mano.

    `None` es una respuesta legítima y frecuente: la portada, la ayuda y el cambio de contraseña no
    son módulos. La plantilla no pinta ningún `aria-current` y ya está.
    """
    camino = request.path
    candidatos: list[tuple[int, Modulo]] = []
    for modulo in modulos if modulos is not None else modulos_para(request.user):
        for nombre in (modulo.ruta, *modulo.rutas_extra):
            prefijo = reverse(nombre)
            if camino.startswith(prefijo):
                candidatos.append((len(prefijo), modulo))
    if not candidatos:
        return None
    return max(candidatos, key=lambda par: par[0])[1]
