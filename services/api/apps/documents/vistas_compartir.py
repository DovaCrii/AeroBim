"""Las pantallas **con sesión** para abrir y cerrar enlaces públicos.

Están aparte de `publico.py` a propósito: allí nada pide cuenta y aquí todo la pide. Mezclarlas en
un archivo haría que la diferencia dependiera de acordarse de heredar el mixin correcto.
"""

from datetime import timedelta

from django import forms
from django.conf import settings
from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from django.views.generic import View

from apps.core.audit import set_audit_context
from apps.core.views import ModelPermissionRequiredMixin
from apps.documents import abribles
from apps.documents.compartir import DIAS_MAXIMO, DIAS_POR_OMISION, EnlaceCompartido


class NuevoEnlaceForm(forms.Form):
    """Para quién es y cuánto dura. **Nada más, y es la idea.**

    Cada opción que se añada aquí es una decisión que quien comparte tiene que tomar con prisa,
    mirando el modelo, para mandarle algo a alguien. Dos campos se contestan sin pensar.
    """

    para = forms.CharField(
        label=gettext_lazy("Who is it for"),
        max_length=150,
        help_text=gettext_lazy(
            "A name you will recognise later. It is how you revoke this one and not the others."
        ),
    )
    dias = forms.IntegerField(
        label=gettext_lazy("Days it stays open"),
        min_value=1,
        max_value=DIAS_MAXIMO,
        initial=DIAS_POR_OMISION,
        help_text=gettext_lazy("After that it stops working on its own. There is no «forever»."),
    )


class EnlacesDeRevisionView(ModelPermissionRequiredMixin, View):
    """Los enlaces de una revisión: crear uno, ver los que hay, revocarlos.

    ## Por qué pide `change_revision` y no `view_revision`

    Compartir hacia fuera **no es leer**. Quien puede abrir un plano no necesariamente puede
    decidir que lo vea alguien ajeno a la obra, y con el permiso de lectura cualquier cuenta del
    piloto —incluida la del mandante— podría publicar el modelo. Se pide el permiso de quien manda
    sobre el documento.

    ## Y por qué solo sobre lo que el visor sabe abrir

    Un enlace a un archivo que el visor no puede dibujar manda a alguien de fuera a una pantalla
    que le dice «este formato no se puede ver». Eso no es compartir: es hacerle perder el tiempo y
    quedar mal. Si no es abrible, no se ofrece.
    """

    model = EnlaceCompartido
    permission_action = "add"
    template_name = "documents/enlaces.html"

    def revision(self, request, pk):
        from apps.documents.views import revisiones_visibles

        return get_object_or_404(revisiones_visibles(request.user), pk=pk)

    def contexto(self, request, revision, form=None):
        return {
            "revision": revision,
            "form": form or NuevoEnlaceForm(),
            "enlaces": revision.enlaces_compartidos.select_related("creado_por"),
            "abrible": abribles.es_abrible(revision),
            # **La base sale de los ajustes y no de la petición.** Es la misma que va en los
            # enlaces de los correos, y por el mismo motivo: compuesta con `request.get_host()`, un
            # enlace copiado desde la red interna llevaría un nombre que fuera no resuelve, y el
            # error saldría en la máquina de alguien ajeno a la obra, que no puede diagnosticarlo.
            "base": (settings.SITE_BASE_URL or "").rstrip("/"),
        }

    def get(self, request, *args, **kwargs):
        revision = self.revision(request, kwargs["pk"])
        return render(request, self.template_name, self.contexto(request, revision))

    def post(self, request, *args, **kwargs):
        revision = self.revision(request, kwargs["pk"])
        if not abribles.es_abrible(revision):
            messages.error(
                request,
                _("The viewer cannot open this file, so there is nothing to share."),
            )
            return redirect("documents:enlaces", pk=revision.pk)

        form = NuevoEnlaceForm(request.POST)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, revision, form))

        enlace = EnlaceCompartido.objects.create(
            revision=revision,
            para=form.cleaned_data["para"],
            expira_en=timezone.now() + timedelta(days=form.cleaned_data["dias"]),
            creado_por=request.user,
        )
        set_audit_context(request, enlace, action="compartir_revision")
        messages.success(request, _("Link created. Copy it now and send it to its recipient."))
        return redirect("documents:enlaces", pk=revision.pk)


class RevocarEnlaceView(ModelPermissionRequiredMixin, View):
    """Cerrar un enlace **ahora**, sin esperar a que caduque.

    Es la mitad que hace aceptable que existan estos enlaces: si uno se reenvió a quien no debía,
    la respuesta tiene que ser un botón y no una llamada a alguien.
    """

    model = EnlaceCompartido
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        from apps.documents.views import revisiones_visibles

        # **Por la revisión acotada y no por el `pk` del enlace.** Con el segundo, conocer el id de
        # un enlace bastaría para cerrar el de otra empresa: un ataque tonto pero real, y el mismo
        # patrón que ya costó siete vistas.
        enlace = get_object_or_404(
            EnlaceCompartido.objects.filter(revision__in=revisiones_visibles(request.user)),
            pk=kwargs["pk"],
        )
        if not enlace.revocado:
            enlace.revocar()
            set_audit_context(request, enlace, action="revocar_enlace")
            messages.success(request, _("Link revoked. It stops working immediately."))
        return redirect("documents:enlaces", pk=enlace.revision_id)
