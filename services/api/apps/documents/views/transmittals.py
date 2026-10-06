"""Los transmittals: lista, ficha, alta, emisión y acuse."""

import logging

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import organizaciones_visibles, scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents.forms import (
    TransmittalForm,
)
from apps.documents.models import (
    Transmittal,
)
from apps.documents.notify import avisar_transmittal
from apps.documents.views._comun import revisiones_visibles

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


class TransmittalsView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    model = Transmittal
    template_name = "documents/transmittals.html"
    context_object_name = "transmittals"
    paginate_by = 50

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("proyecto", "emisor")
            .prefetch_related("destinatarios", "revisiones__entregable")
            .exclude(proyecto__is_active=False)
        )

    def get_context_data(self, **kwargs):
        from apps.documents.por_obra import por_obra

        contexto = super().get_context_data(**kwargs)
        contexto["puede_crear"] = self.request.user.has_perm("documents.add_transmittal")
        # Partido por obra igual que el repositorio, y solo si hay más de una: un transmittal
        # pertenece a una obra y se busca por obra — «¿qué le mandamos al mandante del 716?».
        grupos = por_obra(contexto["transmittals"], lambda t: t.proyecto)
        contexto["grupos"] = grupos if len(grupos) > 1 else []
        return contexto


class TransmittalView(
    ModelViewPermissionRequiredMixin, OrganizacionScopedQuerysetMixin, DetailView
):
    """La carátula: qué lleva, a quién va, en qué estado está y qué se puede hacer.

    **Es la pantalla que faltaba.** El modelo sabía emitir desde el principio y la lista solo
    listaba, así que un transmittal solo se podía emitir desde una consola.
    """

    model = Transmittal
    template_name = "documents/transmittal.html"
    context_object_name = "transmittal"

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("proyecto", "emisor")
            .prefetch_related("destinatarios", "revisiones__entregable")
        )

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        # **El botón solo si se puede ejecutar**, y son dos condiciones distintas: el permiso
        # y el estado. Separadas, porque el mensaje que merece cada una no es el mismo: a
        # quien no tiene permiso no se le explica qué le falta al borrador.
        puede_cambiar = self.request.user.has_perm("documents.change_transmittal")
        contexto["puede_emitir"] = puede_cambiar and self.object.puede_emitirse
        contexto["puede_acusar"] = puede_cambiar and self.object.puede_acusarse
        contexto["falta_para_emitir"] = self.falta_para_emitir()
        return contexto

    def falta_para_emitir(self) -> list[str]:
        """Qué le falta al borrador, **nombrado**. Es la idea del expediente."""
        if self.object.status != Transmittal.BORRADOR:
            return []
        faltas = []
        if not self.object.revisiones.exists():
            faltas.append(_("Add at least one revision."))
        if not self.object.destinatarios.exists():
            faltas.append(_("Add at least one recipient."))
        return faltas


class NuevoTransmittalView(ModelPermissionRequiredMixin, View):
    """Armar el borrador: qué revisiones van y a quién.

    Nace **borrador** siempre, aunque esté completo: emitir es un acto aparte y con acuse, y
    juntarlo con el alta quitaría el paso en que alguien revisa la carátula antes de que salga.
    """

    model = Transmittal
    permission_action = "add"
    template_name = "documents/nuevo_transmittal.html"

    def formulario(self, request, datos=None):
        # Las opciones se acotan a la organización de quien mira: un desplegable con las
        # revisiones de todas las organizaciones no es solo incómodo, es una fuga.
        return TransmittalForm(
            datos,
            revisiones=revisiones_visibles(request.user),
            # **Solo quien comparte organización con quien arma el transmittal.** Antes eran todos
            # los usuarios activos de todas las organizaciones: el formulario enseñaba el directorio
            # de otra empresa y aceptaba dirigirle un transmittal, con su aviso por correo. El
            # permiso dice qué se puede hacer, no sobre qué; con las personas pasa lo mismo que
            # con los documentos. Una cuenta sin membresía no pertenece a nadie: no entra.
            destinatarios=get_user_model()
            .objects.filter(
                is_active=True,
                membresia__organizacion__in=organizaciones_visibles(request.user),
            )
            .distinct()
            .order_by("username"),
        )

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, {"form": self.formulario(request)})

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        form = self.formulario(request, request.POST)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form}, status=400)

        transmittal = form.save(commit=False)
        transmittal.proyecto = form.proyecto
        transmittal.organizacion = form.proyecto.organizacion
        transmittal.emisor = request.user
        transmittal.save()
        # El `save_m2m` va después del `save()` y no antes: sin identificador no hay a qué
        # colgar las relaciones.
        form.save_m2m()
        set_audit_context(request, transmittal, action="crear_transmittal")
        messages.success(request, _("Draft transmittal created. Review the cover and issue it."))
        return redirect("documents:transmittal", pk=transmittal.pk)


class EmitirTransmittalView(ModelPermissionRequiredMixin, View):
    """Emitir: cambia el estado **y avisa**. Las dos cosas, o no sirve de nada."""

    model = Transmittal
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        transmittal = get_object_or_404(
            scope_queryset_to_organizacion(Transmittal.objects.all(), request.user), pk=kwargs["pk"]
        )
        try:
            transmittal.emitir()
        except ValidationError as rechazo:
            # El modelo ya lo impide; la pantalla lo dice con palabras en vez de con un 500.
            messages.error(request, "; ".join(rechazo.messages))
            return redirect("documents:transmittal", pk=transmittal.pk)

        avisados, sin_correo = avisar_transmittal(transmittal)
        set_audit_context(
            request,
            transmittal,
            action="emitir_transmittal",
            metadata={"avisados": avisados, "sin_correo": len(sin_correo)},
        )
        messages.success(
            request,
            _("Transmittal %(folio)s issued, %(n)s recipients notified.")
            % {"folio": transmittal.folio, "n": avisados},
        )
        # **No se calla a quien no recibió nada.** Emitir tiene consecuencias contractuales:
        # decir "emitido" a secas cuando dos destinatarios no tienen correo deja al emisor
        # creyendo que avisó.
        if sin_correo:
            messages.warning(
                request,
                _("No email address for %(quienes)s: they were not notified.")
                % {"quienes": ", ".join(sin_correo)},
            )
        return redirect("documents:transmittal", pk=transmittal.pk)


class AcusarTransmittalView(ModelPermissionRequiredMixin, View):
    """Acusar recibo: cierra el ciclo del registro."""

    model = Transmittal
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        transmittal = get_object_or_404(
            scope_queryset_to_organizacion(Transmittal.objects.all(), request.user), pk=kwargs["pk"]
        )
        try:
            transmittal.acusar(request.user)
        except ValidationError as rechazo:
            messages.error(request, "; ".join(rechazo.messages))
            return redirect("documents:transmittal", pk=transmittal.pk)

        set_audit_context(request, transmittal, action="acusar_transmittal")
        messages.success(request, _("Receipt acknowledged."))
        return redirect("documents:transmittal", pk=transmittal.pk)
