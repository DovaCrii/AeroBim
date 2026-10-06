"""Los entregables, su expediente y su idoneidad."""

import logging

from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
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
from apps.documents.abribles import RUTA_POR_VISOR, visor_de
from apps.documents.forms import (
    EntregableForm,
    IdoneidadForm,
)
from apps.documents.models import (
    Entregable,
    Idoneidad,
    Observacion,
    Revision,
    ValidacionIds,
)
from apps.documents.views._comun import revisiones_visibles, solo_publicadas
from apps.projects.models import Proyecto

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


class EntregablesView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    model = Entregable
    template_name = "documents/entregables.html"
    context_object_name = "entregables"
    paginate_by = 50

    def get_queryset(self):
        consulta = (
            super()
            .get_queryset()
            .filter(is_active=True)
            .exclude(proyecto__is_active=False)
            .select_related("proyecto", "disciplina", "responsable")
            .prefetch_related("revisiones")
        )
        disciplina = self.request.GET.get("disciplina")
        if disciplina:
            consulta = consulta.filter(disciplina__codigo=disciplina)
        if self.request.GET.get("mios") == "1":
            consulta = consulta.filter(responsable=self.request.user)
        return consulta


class ExpedienteView(ModelViewPermissionRequiredMixin, OrganizacionScopedQuerysetMixin, DetailView):
    """El expediente de un entregable: ¿está completo y documentado?"""

    model = Entregable
    template_name = "documents/expediente.html"
    context_object_name = "entregable"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        entregable = self.object
        usuario = self.request.user

        revisiones = list(
            solo_publicadas(entregable.revisiones.select_related("subida_por"), usuario)
        )
        # **Con qué visor se abre cada una, resuelto acá.** Se decide por la extensión —la
        # misma regla que ya usa la aplicación al soltar un archivo— y se le cuelga a la
        # revisión el nombre de la ruta ya resuelto: la plantilla no tiene que saber de
        # formatos, y tampoco hace falta un filtro nuevo para leer un diccionario por clave.
        for revision in revisiones:
            visor = visor_de(revision)
            revision.visor_ruta = RUTA_POR_VISOR[visor] if visor is not None else ""
        contexto["revisiones"] = revisiones

        # **La última validación IDS de cada revisión, no todas** (`F3.5`). El histórico está en la
        # base y se puede consultar; lo que el expediente contesta es «¿cumple hoy?», y una lista de
        # todas las corridas de todos los requisitos tapa esa respuesta con ruido.
        ultimas: dict = {}
        for validacion in ValidacionIds.objects.filter(
            revision__entregable=entregable
        ).select_related("requisito", "revision"):
            clave = (validacion.revision_id, validacion.requisito_id)
            if clave not in ultimas:
                ultimas[clave] = validacion
        for revision in revisiones:
            revision.validaciones_ultimas = [
                validacion
                for (revision_id, _r), validacion in ultimas.items()
                if revision_id == revision.pk
            ]
        contexto["puede_validar"] = usuario.has_perm("documents.add_validacionids")
        contexto["hay_requisitos"] = entregable.proyecto.requisitos_ids.filter(
            is_active=True
        ).exists()

        contexto["observaciones"] = Observacion.objects.filter(
            revision__entregable=entregable
        ).select_related("responsable", "autor")
        contexto["actividades"] = entregable.actividades.select_related("responsable")
        contexto["idoneidades"] = Idoneidad.choices

        # **Lo que falta, nombrado.** No un porcentaje: la fila concreta y el atajo que la
        # cierra, y el atajo solo si el usuario puede ejecutarlo.
        faltantes = []
        if entregable.revision_vigente is None:
            faltantes.append(
                {
                    "que": _("There is no revision yet: nothing has been issued."),
                    "url": (
                        reverse("documents:subir-revision", args=[entregable.pk])
                        if usuario.has_perm("documents.add_revision")
                        else None
                    ),
                    "accion": _("Upload a revision"),
                }
            )
        elif not entregable.esta_publicado:
            faltantes.append(
                {
                    "que": _("The current revision is not published (no A or B code yet)."),
                    "url": None,
                    "accion": None,
                }
            )
        abiertas = entregable.observaciones_abiertas.count()
        if abiertas:
            faltantes.append(
                {
                    "que": _("%(n)s open observations.") % {"n": abiertas},
                    "url": reverse("documents:observaciones") + f"?entregable={entregable.pk}",
                    "accion": _("See them"),
                }
            )
        if entregable.fecha_planificada is None:
            faltantes.append({"que": _("No planned date."), "url": None, "accion": None})
        contexto["faltantes"] = faltantes
        return contexto


class NuevoEntregableView(ModelPermissionRequiredMixin, View):
    model = Entregable
    permission_action = "add"
    template_name = "documents/nuevo_entregable.html"

    def contexto(self, request, form=None):
        """El formulario **y si hay dónde colgar el entregable**.

        ## El callejón que esto cierra

        Un entregable necesita una disciplina, y las disciplinas **cuelgan de un proyecto**: en una
        instalación recién hecha no hay ninguna. El desplegable salía vacío, el formulario no podía
        validar nunca, y la pantalla no decía **qué faltaba ni dónde se conseguía**.

        Es el mismo callejón que tenía «Cuenta nueva» sin organizaciones, un piso más abajo — y la
        misma forma de fallo: una pantalla que exige algo correcto sin decir de dónde sale. Se
        arregla igual, porque la respuesta correcta es la misma: no ofrecer un formulario que no se
        va a poder enviar.

        ## Y por qué se nombra el proyecto

        Porque crear una disciplina se hace **dentro de una obra**, así que la salida no puede ser
        un enlace genérico: tiene que llevar a un proyecto concreto. Con una sola obra —el caso del
        piloto— se lleva directo a ella.
        """
        form = form or EntregableForm(autor=request.user)
        proyectos = scope_queryset_to_organizacion(Proyecto.objects.all(), request.user).filter(
            is_active=True
        )
        return {
            "form": form,
            "hay_disciplinas": form.fields["disciplina"].queryset.exists(),
            "proyectos": list(proyectos.order_by("codigo")[:6]),
            "hay_proyectos": proyectos.exists(),
            "puede_crear_proyecto": request.user.has_perm("projects.add_proyecto"),
        }

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, self.contexto(request))

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        # **`autor` también en el POST, y esa es la mitad que protege.** El acotado del `GET` solo
        # decide qué se ofrece; sin repetirlo aquí, un `disciplina=<id ajeno>` enviado a mano
        # seguiría creando el entregable **dentro de la empresa de otro** —la vista hace
        # `entregable.organizacion = disciplina.proyecto.organizacion`—. Es la lección de las siete
        # fugas: lo que decide no es la pantalla, es la consulta.
        form = EntregableForm(request.POST, autor=request.user)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, form), status=400)

        entregable = form.save(commit=False)
        disciplina = form.cleaned_data["disciplina"]
        entregable.proyecto = disciplina.proyecto
        entregable.organizacion = disciplina.proyecto.organizacion
        entregable.save()
        set_audit_context(request, entregable, action="crear_entregable")
        messages.success(request, _("Deliverable created."))
        return redirect("documents:expediente", pk=entregable.pk)


class CambiarIdoneidadView(ModelPermissionRequiredMixin, View):
    """El trabajo del revisor: decir para qué sirve el documento.

    **Es la firma del registro**: la idoneidad dice si ese plano se puede usar para construir, y por
    eso el acotado por organización aquí no es una formalidad. Iba con `Revision.objects`, o sea sin
    acotar, y **medido salió que se podía aprobar un documento de otra empresa** —de `A` a `B`— con
    solo conocer el UUID de su revisión. Va por `revisiones_visibles`, que sabe que `Revision` no
    lleva el campo `organizacion` y filtra por el de su entregable.
    """

    model = Revision
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        revision = get_object_or_404(revisiones_visibles(request.user), pk=kwargs["pk"])
        form = IdoneidadForm(request.POST)
        if form.is_valid():
            revision.idoneidad = form.cleaned_data["idoneidad"]
            revision.save(update_fields=["idoneidad", "updated_at"])
            set_audit_context(
                request,
                revision,
                action="cambiar_idoneidad",
                metadata={"idoneidad": revision.idoneidad},
            )
            messages.success(
                request,
                _("Revision %(rev)s is now %(cod)s.")
                % {"rev": revision.correlativo, "cod": revision.idoneidad},
            )
        return redirect("documents:expediente", pk=revision.entregable_id)
