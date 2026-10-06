"""Las actividades: lista, ficha, avance y alta."""

import logging

from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents.forms import (
    ActividadForm,
)
from apps.documents.models import (
    Actividad,
)
from apps.documents.views._comun import crear_con_aviso

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


class ActividadesView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    model = Actividad
    template_name = "documents/actividades.html"
    context_object_name = "actividades"
    paginate_by = 50

    def get_queryset(self):
        consulta = (
            super()
            .get_queryset()
            .select_related("proyecto", "responsable", "entregable")
            .exclude(proyecto__is_active=False)
        )
        if self.request.GET.get("mias") == "1":
            consulta = consulta.filter(responsable=self.request.user)
        return consulta


class ActividadView(ModelViewPermissionRequiredMixin, OrganizacionScopedQuerysetMixin, DetailView):
    """Una actividad: qué hay que hacer, quién y para cuándo.

    **Hasta hoy no existía.** Había listado y alta, y ninguna pantalla de detalle: una fila que se
    ve vencer en la bandeja y no se puede abrir es una fila muerta. Y con el portal convertido en
    punto de partida —donde lo que te toca es lo primero que se ve— eso pasa de incómodo a roto.

    Lleva su paso a paso, que **se deriva del propio modelo** con `status_steps_for()` y no se
    escribe en la plantilla: el flujo vive en `Actividad.STATUS_FLOW`, en un solo sitio.
    """

    model = Actividad
    template_name = "documents/actividad.html"
    context_object_name = "actividad"

    def get_queryset(self):
        return super().get_queryset().select_related("proyecto", "responsable", "entregable")

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["pasos"] = self.object.status_steps()
        contexto["siguiente"] = siguiente_estado(self.object)
        contexto["puede_avanzar"] = self.request.user.has_perm("documents.change_actividad")
        return contexto


def siguiente_estado(actividad) -> str | None:
    """El estado que viene después en el flujo, o `None` si ya no hay a dónde avanzar.

    **Sale de `STATUS_FLOW` y no de una lista teclada**, que es lo mismo que hace el paso a paso:
    ofrecer los cinco estados en un desplegable deja pasar de «pendiente» a «hecha» de un salto,
    que es justo lo que el flujo existe para que no ocurra.
    """
    flujo = actividad.STATUS_FLOW
    if actividad.status not in flujo:
        # Anulada, o un estado que no está en el flujo: no avanza a ninguna parte.
        return None
    posicion = flujo.index(actividad.status)
    return flujo[posicion + 1] if posicion + 1 < len(flujo) else None


class AvanzarActividadView(ModelPermissionRequiredMixin, View):
    """Mueve la actividad **un paso**, al estado que sigue en su flujo."""

    model = Actividad
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        actividad = get_object_or_404(
            scope_queryset_to_organizacion(Actividad.objects.all(), request.user), pk=kwargs["pk"]
        )
        siguiente = siguiente_estado(actividad)
        # **Se compara con lo que el flujo permite y no se confía en el formulario.** El `POST` no
        # pasa por el botón: se puede mandar `status=hecha` a mano desde «pendiente».
        if siguiente is None or request.POST.get("status") != siguiente:
            messages.error(request, _("That is not the next step for this activity."))
            return redirect("documents:actividad", pk=actividad.pk)

        actividad.status = siguiente
        actividad.save(update_fields=["status", "updated_at"])
        set_audit_context(request, actividad, action="avanzar_actividad")
        messages.success(
            request,
            _("Activity moved to %(estado)s.") % {"estado": actividad.get_status_display()},
        )
        return redirect("documents:actividad", pk=actividad.pk)


class NuevaActividadView(ModelPermissionRequiredMixin, View):
    model = Actividad
    permission_action = "add"
    template_name = "documents/nueva_actividad.html"

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, {"form": ActividadForm()})

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        form = ActividadForm(request.POST)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form}, status=400)

        actividad = form.save(commit=False)
        entregable = form.cleaned_data.get("entregable")
        if entregable is None:
            messages.error(request, _("Pick the deliverable the activity belongs to."))
            return render(request, self.template_name, {"form": form}, status=400)
        actividad.organizacion = entregable.organizacion
        actividad.proyecto = entregable.proyecto
        actividad.creada_por = request.user
        crear_con_aviso(actividad, request, "crear_actividad")
        messages.success(request, _("Activity created and the owner notified."))
        return redirect("documents:actividades")
