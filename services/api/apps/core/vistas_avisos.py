"""El centro de avisos: **la otra mitad de la campana.**

Un contador sin sitio a donde ir es un número que molesta. Aquí se ve qué hay, se abre lo que
importa, y se marca lo leído.

## Dos decisiones

**Abrir un aviso lo marca leído y lleva al objeto.** No hay un paso intermedio de «marcar» aparte:
la razón de mirar un aviso es ir a lo que dice, y obligar a dos clics para lo mismo es como se
acumulan cien sin leer y el contador deja de significar nada.

**Solo pide sesión.** Los avisos de alguien son suyos; no hay ningún permiso de modelo que
preguntar, y exigir uno dejaría sin campana a quien menos permisos tiene — que suele ser quien más
depende de que le avisen. El acotado es por `destinatario`, siempre, y va en `avisos.sin_leer`.
"""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone
from django.views.generic import TemplateView, View

from apps.core import avisos
from apps.core.models import Aviso

#: Cuántos se listan. Pasados estos, lo que hace falta no es una página dos: es ponerse al día.
CUANTOS = 60


class AvisosView(LoginRequiredMixin, TemplateView):
    """Lo que hay, sin leer primero y lo ya leído debajo."""

    template_name = "core/avisos.html"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        mios = Aviso.objects.filter(destinatario=self.request.user)
        contexto["pendientes"] = list(mios.filter(leido_en=None)[:CUANTOS])
        contexto["leidos"] = list(mios.exclude(leido_en=None)[:CUANTOS])
        return contexto


class AbrirAvisoView(LoginRequiredMixin, View):
    """Marca uno como leído y lleva a donde apunta."""

    def get(self, request, *args, **kwargs):
        aviso = Aviso.objects.filter(destinatario=request.user, pk=kwargs["pk"]).first()
        if aviso is None:
            # **404 y no 403**: decir «no es tuyo» confirma que existe, y el número de un aviso
            # ajeno no es algo que haya que confirmarle a nadie.
            raise Http404
        if aviso.leido_en is None:
            aviso.leido_en = timezone.now()
            aviso.save(update_fields=["leido_en"])
        return HttpResponseRedirect(aviso.url or reverse("accounts:portal"))


class MarcarAvisosLeidosView(LoginRequiredMixin, View):
    """«Marcar todo como leído». Va por POST porque cambia estado."""

    def post(self, request, *args, **kwargs):
        avisos.marcar_leidos(request.user)
        return redirect("core:avisos")
