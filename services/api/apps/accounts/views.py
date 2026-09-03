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
        contexto["modulos"] = [
            m for m in (self._modulo(*args) for args in self._definicion()) if m is not None
        ]
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

    #: El icono de cada entrada, por su ruta. **Va aparte de la definición a propósito**: la
    #: matriz de módulos se lee para saber quién ve qué, y meterle una sexta columna de dibujo
    #: haría más difícil leer lo que importa. Los símbolos viven en `generic/_iconos.html`.
    ICONOS = {
        "projects:proyectos": "i-proyecto",
        "core:organizaciones": "i-organizacion",
        "visor:visor": "i-modelo",
        "documents:bandeja": "i-bandeja",
        "documents:entregables": "i-entregable",
        "documents:transmittals": "i-transmittal",
        "documents:requisitos-ids": "i-requisito",
        "documents:observaciones": "i-observacion",
        "documents:actividades": "i-actividad",
        "accounts:usuarios-roles": "i-usuarios",
        "accounts:auditoria": "i-auditoria",
        "accounts:trabajos": "i-trabajos",
    }

    def _definicion(self):
        """(grupo, titulo, url, permiso, descripcion) de cada entrada.

        **Los nombres se revisaron enteros el 2026-09-02**, a peticion del usuario: «buscar los
        mejores nombres para cada seccion y mejorar las etiquetas de ayuda». Tres reglas salieron de
        ahi, y valen para lo que se añada despues:

        1. **El grupo dice de que trata, no que clase de objeto es.** «Proyecto», «Modelo» y
           «Documentos» son nombres de tablas; «Las obras», «El modelo» y «El registro documental»
           son sitios a los que se va. La lista se lee como una tabla de contenidos.
        2. **La linea de ayuda contesta «que encuentro ahi» y no repite el titulo.** «A quien
           pertenecen los datos del proyecto» describe un campo de la base; «De que oficina es cada
           obra y quien puede verla» describe lo que se va a mirar.
        3. **Ninguna promete lo que no hay.** El transmittal no dice «con acuse de recibo» porque no
           lo tiene todavia.

        Y **«Lo mio» cambia de grupo**: lista observaciones y actividades, o sea coordinacion, y
        estaba en documentos porque el permiso que pide es de observaciones. El permiso no es el
        sitio.
        """
        return [
            (
                _("The works"),
                _("Projects"),
                "projects:proyectos",
                "projects.view_proyecto",
                _("Each work with its progress, its calendar and what it has open."),
            ),
            (
                _("The works"),
                _("Organisations"),
                "core:organizaciones",
                "core.view_organizacion",
                _("Which office each work belongs to, and who can see it."),
            ),
            (
                _("The model"),
                _("BIM viewer"),
                "visor:visor",
                # Sin permiso: mirar un modelo es lo que cualquiera que pueda entrar viene a
                # hacer. Lo que **sí** está guardado es qué revisiones puede abrir, y eso lo
                # decide `view_revision` en la API.
                None,
                _("Open the IFC and DXF in force: measure, section and note on the model."),
            ),
            (
                _("The document register"),
                _("Deliverables"),
                "documents:entregables",
                "documents.view_entregable",
                _("What has to be delivered, which revision it is on and how far along."),
            ),
            (
                _("The document register"),
                _("Transmittals"),
                "documents:transmittals",
                "documents.view_transmittal",
                _("What was issued, to whom and on what date."),
            ),
            (
                _("The document register"),
                _("Information requirements"),
                "documents:requisitos-ids",
                "documents.view_requisitoids",
                _("What the client demands every model carry, checked against IDS."),
            ),
            (
                _("Coordination"),
                _("My plate"),
                "documents:bandeja",
                "documents.view_observacion",
                _("Yours alone, soonest due first: what you have to answer."),
            ),
            (
                _("Coordination"),
                _("Observations"),
                "documents:observaciones",
                "documents.view_observacion",
                _("Everything to be resolved, with an owner and a due date."),
            ),
            (
                _("Coordination"),
                _("Activities"),
                "documents:actividades",
                "documents.view_actividad",
                _("Planned work: who does what, and by when."),
            ),
            (
                _("Administration"),
                _("Users and roles"),
                "accounts:usuarios-roles",
                "auth.view_user",
                _("Who holds which role, and what that role can open. Read-only."),
            ),
            (
                _("Administration"),
                _("Audit trail"),
                "accounts:auditoria",
                "core.view_auditevent",
                _("Every change, in order and impossible to erase."),
            ),
            (
                _("Administration"),
                _("Scheduled jobs"),
                "accounts:trabajos",
                "core.view_jobrun",
                _("Whether last night's warnings and backup actually ran."),
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
            # Sin icono la tarjeta se dibuja igual: es un adorno con función, no un requisito.
            "icono": self.ICONOS.get(ruta, ""),
        }


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
