"""El portal: los modulos que le tocan a cada uno, y el centro de administracion.

**La regla que ordena esta pantalla:** cada entrada se filtra por su propio
`view_*`, y si no lo tienes **la fila no existe**. No aparece en gris ni lleva a un
403: ofrecer un boton que termina en 403 es peor que no ofrecerlo, porque enseña a
probar puertas.
"""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.utils.translation import gettext_lazy as _
from django.views.generic import TemplateView

from apps.accounts.modulos import modulos_para
from apps.core.exports import CsvExportMixin
from apps.core.jobs import trabajos_colgados, ultima_corrida
from apps.core.mail import mail_is_delivered, undelivered_reason
from apps.core.models import AuditEvent, JobRun, Organizacion
from apps.core.tenancy import scope_queryset_to_organizacion
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
        # **El catálogo vive en `modulos.py` desde el 2026-09-07.** La barra lateral lo necesita en
        # todas las páginas, así que dejarlo aquí obligaba a duplicar la lista: dos verdades sobre
        # qué módulos existen, que se separan al primer cambio.
        contexto["modulos"] = modulos_para(self.request.user)
        self._continuar(contexto)
        return contexto

    def _continuar(self, contexto) -> None:
        """Lo que te espera, encima de las tarjetas de módulo.

        **Un menú dice a qué sitios puedes entrar; esto dice en qué ibas**, que es otra pregunta y
        es la que uno tiene al abrir la aplicación por la mañana.

        Se reusa `pendientes_por_tramo`, que ya existe y ya alimenta el resumen por correo: así la
        pantalla y el correo **no pueden discrepar** sobre qué está vencido. Escribir la consulta
        otra vez acá es como se llega a un correo que dice tres y una pantalla que dice cuatro.
        """
        from apps.documents.notify import pendientes_por_tramo
        from apps.projects.models import Proyecto

        usuario = self.request.user
        tramos = pendientes_por_tramo(usuario)
        contexto["mis_tramos"] = [
            (_("Overdue"), tramos["vencido"], True),
            (_("Next 7 days"), tramos["en_7"], False),
        ]
        # Cuánto queda en total, para poder decir «y N más» sin listar treinta filas en la puerta.
        contexto["mis_pendientes"] = sum(len(v) for v in tramos.values())
        contexto["mis_mas_alla"] = len(tramos["en_15"]) + len(tramos["en_30"])

        # **Las obras con lo que cada una necesita.** Solo si el rol puede leerlas: si no, la
        # sección no existe en vez de aparecer vacía.
        if usuario.has_perm("projects.view_proyecto"):
            proyectos = list(
                scope_queryset_to_organizacion(Proyecto.objects.all(), usuario)
                .filter(is_active=True)
                .exclude(status=Proyecto.ETAPA_CERRADO)
                .prefetch_related("entregables__revisiones")
                .order_by("codigo")[:6]
            )
            self._cifras_de_obra(proyectos, usuario)
            contexto["mis_proyectos"] = proyectos

    def _cifras_de_obra(self, proyectos: list, usuario) -> None:
        """Le cuelga a cada obra **lo que hace que su tarjeta sirva**: avance y lo que arde.

        **La tarjeta decía «Edificio corporativo · Anteproyecto · avance 1» y eso no es un dato**:
        es la etapa y un número sin unidad. Lo que se quiere saber al mirar la puerta por la mañana
        es cuánto lleva la obra y si hay algo vencido, que es lo que decide dónde entrar.

        **Una consulta para todas las obras y no una por obra.** Con seis tarjetas la diferencia no
        se nota; el día que la lista sea de treinta, sí — y entonces el defecto está escrito en un
        bucle que nadie mira.
        """
        from django.db.models import Count, Q
        from django.utils import timezone

        from apps.documents.models import Observacion

        for proyecto in proyectos:
            proyecto.avance_pct = round(proyecto.avance_fisico * 100)

        if not usuario.has_perm("documents.view_observacion"):
            # Sin permiso de lectura no se cuentan hallazgos: la tarjeta enseña el avance y nada
            # más, que es exactamente lo que ese rol puede saber.
            return

        hoy = timezone.localdate()
        abiertas = ~Q(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
        cuentas = {
            fila["proyecto"]: fila
            for fila in Observacion.objects.filter(proyecto__in=proyectos)
            .values("proyecto")
            .annotate(
                abiertas=Count("pk", filter=abiertas),
                vencidas=Count("pk", filter=abiertas & Q(vence__lt=hoy)),
                altas=Count("pk", filter=abiertas & Q(prioridad=Observacion.ALTA)),
            )
        }
        for proyecto in proyectos:
            fila = cuentas.get(proyecto.pk, {})
            proyecto.abiertas = fila.get("abiertas", 0)
            proyecto.vencidas = fila.get("vencidas", 0)
            proyecto.altas = fila.get("altas", 0)


class AyudaView(LoginRequiredMixin, TemplateView):
    """El recorrido de cómo se usa AeroBim. `F11.7`.

    **Sin permiso de modelo y solo con sesión**, y eso es deliberado: la ayuda explica el producto,
    no da acceso a nada. Cada paso lleva a su pantalla y esa pantalla comprueba lo suyo; pedir aquí
    un permiso dejaría sin explicación a quien más la necesita —el rol más acotado— justo el día que
    entra por primera vez.

    El recorrido y el porqué de que sea generado están en `apps/accounts/ayuda.py`.
    """

    template_name = "accounts/ayuda.html"

    def get_context_data(self, **kwargs):
        from apps.accounts.ayuda import pasos_para

        contexto = super().get_context_data(**kwargs)
        contexto["pasos"] = pasos_para(self.request.user)
        # Cuántos no le tocan, para poder decirlo arriba en vez de que se descubra bajando.
        contexto["ajenos"] = sum(1 for uno in contexto["pasos"] if not uno.puedes)
        return contexto


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

    # Los trabajos que **corren solos** en esta maquina, y por eso hay que vigilar si corrieron.
    #
    # **Aqui habia dos comandos que no existen** —`avisar_vencimientos` y `verificar_respaldo`—,
    # escritos cuando esto se pensaba como una lista de intenciones: «se listan aunque no existan
    # todavia». El efecto era el contrario del que buscaba esta pantalla: dos filas eternas en
    # «nunca corrio» que no se pueden arreglar, y que enseñan a no mirar la lista. Un aviso que
    # nunca se apaga no es un aviso.
    #
    # Asi que aqui va **solo lo programado que existe**, y una prueba comprueba que cada nombre es
    # un comando de verdad (`test_trabajos.py`). `detectar_interferencias` no entra: pide dos UUID
    # de revision, se lanza a mano, y «nunca corrio» no seria un problema.
    ESPERADOS = ("enviar_resumen",)

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
