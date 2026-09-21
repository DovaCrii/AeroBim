"""Un hallazgo y una actividad, leídos como **la misma cosa**: una tarea con dueño y fecha.

## Por qué hace falta

Porque las dos aparecen juntas en dos pantallas —la portada y la bandeja— y **no comparten
nombres**: `Observacion.estado` frente a `Actividad.status`, y la prioridad solo existe en la
primera. Sin esto, cada plantilla resuelve la diferencia con un `{% if %}` por campo, y son dos
plantillas resolviendo lo mismo de dos maneras: la primera vez que una gane un campo, la otra se
queda atrás sin avisar.

`pendientes_por_tramo` (`notify.py`) **no se toca**: alimenta el resumen por correo y hay una prueba
que exige que la pantalla y el correo salgan de la misma consulta. Esto se pone **encima** de lo que
esa función ya devuelve.

## Las tres columnas, y por qué son tres y no cinco

`Observacion` tiene cuatro estados y `Actividad` cinco, y los nombres no coinciden. Lo que sí
coincide es **en qué punto del trabajo está cada cosa**: nadie la ha tocado, alguien está en ella, o
está esperando que otro la mire. Eso son tres columnas, y son las que un tablero puede tener sin
inventarse una fila por cada estado de cada modelo.

Lo cerrado y lo descartado **no tienen columna**: no son un punto del trabajo, son la salida. Las
dos pantallas que usan esto listan lo pendiente.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.utils.translation import gettext_lazy as _

from apps.documents.models import Actividad, Observacion

#: Las tres columnas, en el orden en que avanza el trabajo.
POR_HACER = "por_hacer"
EN_MARCHA = "en_marcha"
EN_REVISION = "en_revision"

COLUMNAS: tuple[tuple[str, str], ...] = (
    (POR_HACER, _("To do")),
    (EN_MARCHA, _("In progress")),
    (EN_REVISION, _("Under review")),
)

#: De qué estado de cada modelo sale cada columna.
#:
#: **Una observación no pasa por «en marcha», y eso es el modelo y no un olvido**: `abierta` y
#: `respondida` son las dos posiciones que tiene antes de cerrarse. Contestar una observación *es*
#: pasarla a revisión.
_COLUMNA_DE_OBSERVACION = {
    Observacion.ABIERTA: POR_HACER,
    Observacion.RESPONDIDA: EN_REVISION,
}
_COLUMNA_DE_ACTIVIDAD = {
    Actividad.PENDIENTE: POR_HACER,
    Actividad.EN_CURSO: EN_MARCHA,
    Actividad.EN_REVISION: EN_REVISION,
}


@dataclass(frozen=True)
class Tarea:
    """Lo que una fila de tarea necesita saber, y nada más.

    Se lleva los valores ya resueltos en vez de una referencia al objeto porque la plantilla no
    tiene que saber de qué modelo viene: eso es exactamente lo que este módulo existe para tapar.
    """

    titulo: str
    url: str
    columna: str
    estado: str
    proyecto: str
    responsable: str
    vence: date | None
    #: `None` en una actividad, que no tiene prioridad. La fila no dibuja la píldora entonces —y no
    #: pone «media» por defecto, que sería inventarse un dato.
    prioridad: str | None
    prioridad_texto: str | None
    #: Para el círculo de estado, que necesita saber de qué habla al describirse en voz alta.
    es_observacion: bool
    #: Qué se puede hacer con esto, ya filtrado por permiso. Ver `_acciones_de`. Vacío si no se
    #: pasó usuario: ofrecer un botón que termina en 403 es peor que no ofrecerlo.
    acciones: tuple[tuple[str, str], ...] = ()

    @property
    def vencida(self) -> bool:
        """Si ya pasó su fecha.

        Se calcula aquí y no en la plantilla porque `{% if tarea.vence < hoy %}` obligaría a meter
        `hoy` en el contexto de las dos pantallas — y la que se olvidara compararía con vacío, que
        en una plantilla de Django no da error: da `False` siempre. Nada saldría en rojo y nadie
        sabría por qué.
        """
        from django.utils import timezone

        return self.vence is not None and self.vence < timezone.localdate()

    @property
    def dias_de_atraso(self) -> int:
        """Cuantos dias lleva vencida. `0` si no lo esta.

        **La cifra que no estaba en ninguna pantalla.** Lo vencido se pintaba en rojo y en negrita,
        y ahi se acababa: una tarea de hace tres meses y una de ayer se veian **exactamente igual**.
        El usuario lo dijo: *«queda el seguimiento pero el aviso no es claro»*.
        """
        from django.utils import timezone

        if not self.vencida:
            return 0
        return (timezone.localdate() - self.vence).days

    @property
    def gravedad(self) -> str:
        """`leve`, `serio` o `grave` — o cadena vacia si no esta vencida.

        **Tres grados y no uno**, porque el color solo no ordena: con todo lo vencido del mismo
        rojo, una lista de treinta atrasos no dice por donde empezar. Los cortes son 7 y 30 dias,
        los mismos que ya usan los tramos, para no inventar una segunda escala.

        Se devuelve el nombre y no el color: la hoja de estilo decide como se ve, y ademas cada
        grado cambia **tambien el peso de la letra**, que es la regla que ya defiende `app.css`
        para lo vencido — quien no distingue rojos tiene que poder distinguir esto.
        """
        dias = self.dias_de_atraso
        if dias <= 0:
            return ""
        if dias <= 7:
            return "leve"
        return "serio" if dias <= 30 else "grave"


def _acciones_de(item, usuario) -> tuple[tuple[str, str], ...]:
    """Qué se puede hacer con esto **ahora mismo**, como pares `(etiqueta, url)`.

    ## El hueco que cierra

    Lo atrasado se veía y no se podía hacer nada con ello: para replanificar o cerrar había que
    abrir el hallazgo y buscar el formulario dentro. El usuario lo dijo — *«queda el seguimiento
    pero el aviso no es claro; cuál es la acción a tomar»*. El seguimiento es **reactivo** mientras
    mirarlo y actuar sean dos pantallas distintas.

    ## No hay ni un endpoint nuevo, y es deliberado

    `RepartirObservacionView` ya cambia **dueño, fecha y prioridad** de un hallazgo abierto, y
    `CerrarObservacionView` ya cierra con su resolución. Lo que faltaba no era poder hacerlo: era
    llegar. Una acción nueva aquí sería una segunda forma de hacer lo mismo, y a la tercera semana
    una de las dos deja de auditar.

    ## Y se filtran por permiso, que ya costó una vez

    Ofrecer un botón que termina en 403 es peor que no ofrecerlo: la persona no sabe si le falta un
    permiso o si la aplicación está rota. Pasó este mismo mes con el botón de compartir, que miraba
    el permiso de la regla y no el de la vista. Aquí se mira **el que exige la vista**.
    """
    if usuario is None or not getattr(usuario, "is_authenticated", False):
        return ()

    from django.urls import reverse

    if isinstance(item, Observacion):
        acciones = []
        # Las dos piden `change_observacion`, que es lo que exigen `RepartirObservacionView` y
        # `CerrarObservacionView` — no un permiso parecido.
        if usuario.has_perm("documents.change_observacion"):
            acciones.append(
                (
                    _("Replan or hand over"),
                    reverse("documents:repartir-observacion", args=[item.pk]),
                )
            )
            if item.estado not in (Observacion.CERRADA, Observacion.DESCARTADA):
                acciones.append(
                    (_("Close it"), reverse("documents:cerrar-observacion", args=[item.pk]))
                )
        return tuple(acciones)

    if usuario.has_perm("documents.change_actividad"):
        # Una actividad no se reparte ni se cierra con resolución: avanza un paso por su flujo.
        return ((_("Move it forward"), reverse("documents:actividad", args=[item.pk])),)
    return ()


def como_tarea(item: Observacion | Actividad, usuario=None) -> Tarea:
    """Traduce un hallazgo o una actividad a la fila que las dos pantallas pintan.

    `usuario` es opcional **y sin él no se ofrece ninguna acción**, que es lo correcto: las acciones
    dependen de permisos, y una lista de botones calculada sin saber quién mira es una lista de
    botones que alguien no puede pulsar.
    """
    if isinstance(item, Observacion):
        return Tarea(
            titulo=item.titulo,
            url=item.get_absolute_url(),
            columna=_COLUMNA_DE_OBSERVACION.get(item.estado, POR_HACER),
            estado=item.get_estado_display(),
            proyecto=item.proyecto.codigo if item.proyecto_id else "",
            responsable=item.responsable.get_username(),
            vence=item.vence,
            prioridad=item.prioridad,
            prioridad_texto=item.get_prioridad_display(),
            es_observacion=True,
            acciones=_acciones_de(item, usuario),
        )
    return Tarea(
        titulo=item.titulo,
        url=item.get_absolute_url(),
        columna=_COLUMNA_DE_ACTIVIDAD.get(item.status, POR_HACER),
        estado=item.get_status_display(),
        proyecto=item.proyecto.codigo if item.proyecto_id else "",
        responsable=item.responsable.get_username(),
        vence=item.vence,
        prioridad=None,
        prioridad_texto=None,
        es_observacion=False,
        acciones=_acciones_de(item, usuario),
    )


def como_tareas(items, usuario=None) -> list[Tarea]:
    return [como_tarea(uno, usuario) for uno in items]
