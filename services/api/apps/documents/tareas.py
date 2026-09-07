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


def como_tarea(item: Observacion | Actividad) -> Tarea:
    """Traduce un hallazgo o una actividad a la fila que las dos pantallas pintan."""
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
    )


def como_tareas(items) -> list[Tarea]:
    return [como_tarea(uno) for uno in items]
