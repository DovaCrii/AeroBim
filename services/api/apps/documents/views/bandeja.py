"""Lo atrasado y lo pendiente: la bandeja de cada uno y el seguimiento del equipo."""

import logging
import uuid

from django.utils import timezone
from django.views.generic import TemplateView

from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
)
from apps.documents.models import (
    Actividad,
    Entregable,
    Observacion,
)

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


class MiBandejaView(ModelViewPermissionRequiredMixin, TemplateView):
    """Lo que le toca a quien está mirando. **Es la pantalla que se abre cada mañana.**

    Se llama **«Todo lo pendiente»** desde el 2026-09-07, porque la portada pasó a llamarse «Mi
    trabajo» (`F12.7`): dos pantallas «mías» con nombres parecidos son dos sitios donde buscar lo
    mismo. La portada trae lo que arde —vencido y esta semana— y esta trae el mes entero.

    Y tiene **dos vistas de los mismos datos**: lista por tramo de fecha, y tablero por punto del
    trabajo. No son dos consultas: las dos salen de `pendientes_por_tramo`, y hay una prueba que
    exige que el conjunto de tareas sea idéntico — dos vistas que discrepan sobre qué está pendiente
    valen menos que una.
    """

    model = Observacion
    template_name = "documents/bandeja.html"

    #: Las vistas que existen. **Un valor que no esté aquí cae a la lista en silencio**, que es la
    #: misma regla que `orden.criterio`: una URL compartida por correo con un parámetro viejo tiene
    #: que seguir abriendo la pantalla, no dar un error.
    VISTAS = ("lista", "tablero")

    def get_context_data(self, **kwargs):
        from apps.documents.notify import TRAMOS, pendientes_por_tramo
        from apps.documents.tareas import COLUMNAS, como_tareas

        contexto = super().get_context_data(**kwargs)
        tramos = pendientes_por_tramo(self.request.user)

        pedida = self.request.GET.get("vista", "")
        contexto["vista"] = pedida if pedida in self.VISTAS else "lista"
        contexto["vistas"] = self.VISTAS

        # La etiqueta se arma acá y no en la plantilla: un diccionario recorrido en una
        # plantilla de Django no puede traducir su clave.
        #
        # **Y sale de `TRAMOS`, no escrita a mano.** Estaban los cuatro nombres enumerados aquí, y
        # el día que se añadió un quinto tramo esta pantalla **dejó de pintarlo en silencio**: la
        # consulta lo traía y la lista no lo nombraba. Con la suite entera en verde, porque ninguna
        # prueba tenía una tarea a más de treinta días. Es el mismo defecto que este bloque venía a
        # arreglar, un piso más arriba.
        contexto["tramos_etiquetados"] = [
            # Se pasa quién mira: las acciones de una fila dependen de sus permisos.
            (etiqueta, como_tareas(tramos[nombre], self.request.user), nombre == "vencido")
            for _d, _h, nombre, etiqueta in TRAMOS
        ]
        # **Los mismos tramos con su clave**, que es lo que necesita el resumen de arriba para
        # enlazar a cada sección. Se construye **de la lista de arriba** y no de otra consulta, por
        # lo mismo que el tablero: dos listas armadas por separado pueden discrepar.
        contexto["tramos_con_clave"] = [
            (nombre, etiqueta, tareas, urgente)
            for (_d, _h, nombre, _e), (etiqueta, tareas, urgente) in zip(
                TRAMOS, contexto["tramos_etiquetados"], strict=True
            )
        ]
        contexto["total_pendiente"] = sum(
            len(tareas) for _e, tareas, _u in contexto["tramos_etiquetados"]
        )

        # **El tablero se arma de la misma lista de tareas, no de otra consulta.** Es lo que hace
        # imposible que las dos vistas digan cosas distintas: si el reparto por columnas se hiciera
        # con su propio `filter`, un estado nuevo caería en una vista y no en la otra.
        todas = [tarea for _e, tareas, _u in contexto["tramos_etiquetados"] for tarea in tareas]
        contexto["columnas"] = [
            (clave, etiqueta, [t for t in todas if t.columna == clave])
            for clave, etiqueta in COLUMNAS
        ]

        contexto["entregables"] = (
            Entregable.objects.filter(responsable=self.request.user, is_active=True)
            .select_related("proyecto", "disciplina")
            .prefetch_related("revisiones")
        )
        return contexto


class SeguimientoView(ModelPermissionRequiredMixin, TemplateView):
    """**Quién va atrasado y con qué**, para quien reparte el trabajo. Ver `seguimiento.py`.

    ## Pide dos permisos, y ninguno de los dos basta solo

    Es una lectura, así que lleva su `view_observacion` —regla de la casa para toda superficie de
    lectura—. Pero **todos los roles tienen ese**, el mandante incluido: lo necesitan para leer el
    hallazgo que les toca. Y lo que esta pantalla enseña no es un hallazgo: es **cuánto va atrasada
    cada persona del equipo**, que es información interna. Un mandante mirando la carga de trabajo
    de la oficina es exactamente lo que no tiene que pasar.

    Así que además pide `change_observacion`, que es el de quien **reparte y replanifica**:
    Coordinador y Revisor. Es además el permiso que hace falta para actuar sobre lo que aquí se ve,
    así que la pantalla solo se enseña a quien puede hacer algo con ella.

    ## Acotada por organización, las dos clases de tarea

    Por la consulta y no solo por el permiso: `change_observacion` dice «puede repartir hallazgos»,
    no «puede ver los de otra empresa».
    """

    template_name = "documents/seguimiento.html"
    model = Observacion
    permission_action = "change"

    def get_permission_required(self):
        return ("documents.view_observacion", *super().get_permission_required())

    def get_context_data(self, **kwargs):
        from apps.documents.seguimiento import abiertos_con_fecha, del_equipo
        from apps.projects.models import Proyecto

        contexto = super().get_context_data(**kwargs)
        usuario = self.request.user
        observaciones = scope_queryset_to_organizacion(Observacion.objects.all(), usuario)
        actividades = scope_queryset_to_organizacion(Actividad.objects.all(), usuario)

        obras = scope_queryset_to_organizacion(Proyecto.objects.all(), usuario).filter(
            is_active=True
        )
        # **La obra se valida contra las visibles**, no se usa tal cual llega: un `?obra=` con el
        # identificador de otra organización devolvería vacío en vez de fallar, que es correcto,
        # pero dejaría el selector diciendo que hay un filtro puesto sobre algo que no existe.
        #
        # Y se parsea antes: la clave es un UUID, y `filter(pk="abc")` **lanza** en vez de devolver
        # vacío. Un enlace mal copiado daría un 500.
        pedida = self.request.GET.get("obra", "")
        try:
            obra = obras.filter(pk=uuid.UUID(pedida)).first() if pedida else None
        except ValueError:
            obra = None
        if obra is not None:
            observaciones = observaciones.filter(proyecto=obra)
            actividades = actividades.filter(proyecto=obra)

        contexto["seguimiento"] = del_equipo(
            abiertos_con_fecha(observaciones, actividades), timezone.localdate()
        )
        contexto["obras"] = obras.order_by("codigo")
        contexto["obra"] = obra
        return contexto
