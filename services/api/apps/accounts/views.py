"""El portal: los modulos que le tocan a cada uno, y el centro de administracion.

**La regla que ordena esta pantalla:** cada entrada se filtra por su propio
`view_*`, y si no lo tienes **la fila no existe**. No aparece en gris ni lleva a un
403: ofrecer un boton que termina en 403 es peor que no ofrecerlo, porque enseña a
probar puertas.
"""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.views.generic import TemplateView

from apps.core.exports import CsvExportMixin
from apps.core.jobs import trabajos_colgados, ultima_corrida
from apps.core.mail import mail_is_delivered, undelivered_reason
from apps.core.models import AuditEvent, JobRun, Organizacion
from apps.core.views import ModelViewPermissionRequiredMixin


class PortalView(LoginRequiredMixin, TemplateView):
    """La puerta: los modulos agrupados **por etapa de trabajo, no por modelo**.

    Agruparlos por modelo de datos deja una lista que solo entiende quien escribio la
    base de datos. Por etapa, la lista se lee como se trabaja: primero el proyecto,
    despues el modelo, despues los documentos, despues la coordinacion.
    """

    template_name = "accounts/portal.html"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["modulos"] = [
            m for m in (self._modulo(*args) for args in self._definicion()) if m is not None
        ]
        return contexto

    def _definicion(self):
        """(grupo, titulo, url, permiso, descripcion) de cada entrada."""
        return [
            (
                _("Project"),
                _("Organisations"),
                "core:organizaciones",
                "core.view_organizacion",
                _("Who the project data belongs to."),
            ),
            (
                _("Model"),
                _("BIM viewer"),
                None,
                None,
                _("Opens the IFC and DXF viewer. Available to anyone who can sign in."),
            ),
            (
                _("Administration"),
                _("Users and roles"),
                "accounts:usuarios-roles",
                "auth.view_user",
                _("Who holds which role. Read-only."),
            ),
            (
                _("Administration"),
                _("Audit trail"),
                "accounts:auditoria",
                "core.view_auditevent",
                _("Every change, append-only."),
            ),
            (
                _("Administration"),
                _("Scheduled jobs"),
                "accounts:trabajos",
                "core.view_jobrun",
                _("Whether the nightly work actually ran."),
            ),
        ]

    def _modulo(self, grupo, titulo, ruta, permiso, descripcion):
        if permiso is not None and not self.request.user.has_perm(permiso):
            return None
        return {
            "grupo": grupo,
            "titulo": titulo,
            "url": reverse(ruta) if ruta else None,
            "descripcion": descripcion,
        }


class UsuariosRolesView(ModelViewPermissionRequiredMixin, CsvExportMixin, TemplateView):
    """Quien tiene que rol. **Solo lectura, y con lista blanca al exportar.**

    La exportacion enumera sus campos uno por uno para que el hash de la contraseña no
    pueda salir nunca. Con un `"__all__"` basta que Django añada un campo al modelo de
    usuario para filtrarlo.
    """

    template_name = "accounts/usuarios_roles.html"
    csv_filename = "usuarios-y-roles.csv"
    csv_fields = ("username", "first_name", "last_name", "email", "is_active", "roles")
    csv_headers = ("Usuario", "Nombre", "Apellido", "Correo", "Activo", "Roles")

    @property
    def model(self):
        from django.contrib.auth import get_user_model

        return get_user_model()

    def get(self, request, *args, **kwargs):
        if request.GET.get("formato") == "csv":
            return self.csv_response(self._filas())
        return super().get(request, *args, **kwargs)

    def _filas(self):
        from django.contrib.auth import get_user_model

        usuarios = get_user_model().objects.prefetch_related("groups").order_by("username")
        for usuario in usuarios:
            usuario.roles = ", ".join(g.name for g in usuario.groups.all()) or "—"
            yield usuario

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["usuarios"] = list(self._filas())
        return contexto


class AuditoriaView(ModelViewPermissionRequiredMixin, TemplateView):
    template_name = "accounts/auditoria.html"
    model = AuditEvent

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["eventos"] = AuditEvent.objects.select_related("actor")[:200]
        return contexto


class TrabajosView(ModelViewPermissionRequiredMixin, TemplateView):
    """Salud de los trabajos programados, y si el correo sale de la maquina.

    Las dos cosas juntas por una razon: un trabajo que corrio bien y un correo que no
    se envio se ven **igual** desde el historial, y es el caso que mas engaña.
    """

    template_name = "accounts/trabajos.html"
    model = JobRun

    # Los trabajos que este servicio va a tener. Se listan aunque no existan todavia:
    # "nunca corrio" es una respuesta, y la que hace falta al desplegar.
    ESPERADOS = ("avisar_vencimientos", "enviar_resumen", "verificar_respaldo")

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["corridas"] = JobRun.objects.all()[:50]
        contexto["colgados"] = trabajos_colgados()
        contexto["esperados"] = [
            {"comando": nombre, "ultima": ultima_corrida(nombre)} for nombre in self.ESPERADOS
        ]
        contexto["correo_entrega"] = mail_is_delivered()
        contexto["correo_motivo"] = undelivered_reason()
        return contexto


class OrganizacionesView(ModelViewPermissionRequiredMixin, TemplateView):
    template_name = "accounts/organizaciones.html"
    model = Organizacion

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["organizaciones"] = Organizacion.objects.prefetch_related("miembros")
        return contexto
