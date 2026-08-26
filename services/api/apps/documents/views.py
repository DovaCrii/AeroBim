"""Las pantallas del registro documental.

**El expediente es la idea que ordena esto.** Copiado del `dossier.py` de AeroControl:
una pantalla que contesta *«¿esto está completo y documentado?»* nombrando cada fila que
falta con el atajo que la cierra — y **omitiendo los botones que el usuario no puede
ejecutar**, porque ofrecer un botón que termina en 403 es peor que no ofrecerlo: enseña
a probar puertas.
"""

from django.contrib import messages
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, TemplateView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents import storage
from apps.documents.abribles import es_abrible
from apps.documents.forms import (
    ActividadForm,
    CierreForm,
    ComentarioForm,
    EntregableForm,
    IdoneidadForm,
    ObservacionForm,
    RevisionForm,
)
from apps.documents.models import (
    IDONEIDADES_PUBLICADAS,
    Actividad,
    Comentario,
    Entregable,
    Idoneidad,
    Observacion,
    Revision,
    Transmittal,
)
from apps.documents.notify import avisar_asignacion


def solo_publicadas(queryset, user):
    """Un mandante ve **solo lo publicado**, y eso no lo puede decir un permiso.

    `view_revision` dice "puede ver revisiones"; no sabe distinguir una `S0` en curso de
    una `A1` autorizada. La diferencia es contractual —lo que está en curso no obliga a
    nadie y no se enseña— así que la pone la vista, con la regla escrita en un solo sitio.
    """
    if user.has_perm("documents.change_revision") or user.has_perm("documents.add_revision"):
        return queryset
    return queryset.filter(idoneidad__in=IDONEIDADES_PUBLICADAS)


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

        contexto["revisiones"] = solo_publicadas(
            entregable.revisiones.select_related("subida_por"), usuario
        )
        contexto["observaciones"] = entregable.revisiones.none()
        contexto["observaciones"] = Observacion.objects.filter(
            revision__entregable=entregable
        ).select_related("responsable", "autor")
        contexto["actividades"] = entregable.actividades.select_related("responsable")
        contexto["idoneidades"] = Idoneidad.choices
        # Cuáles se pueden abrir en el visor. **Se decide por la extensión**, que es la misma
        # regla que ya usa la aplicación al soltar un archivo, y se calcula aquí para que la
        # plantilla no tenga que saber de formatos.
        contexto["abribles"] = {r.pk for r in contexto["revisiones"] if es_abrible(r)}

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


class SubirRevisionView(ModelPermissionRequiredMixin, View):
    model = Revision
    permission_action = "add"
    template_name = "documents/subir_revision.html"

    def _entregable(self):
        # Acotado por organización a mano: esta vista no es una `DetailView`, así que no
        # hereda el mixin. **La consulta se acota igual** — es la regla, no una cortesía
        # de las vistas genéricas.
        return get_object_or_404(
            scope_queryset_to_organizacion(Entregable.objects.all(), self.request.user),
            pk=self.kwargs["pk"],
        )

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = self._entregable()
        return render(
            request, self.template_name, {"entregable": entregable, "form": RevisionForm()}
        )

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = self._entregable()
        form = RevisionForm(request.POST, request.FILES)
        if not form.is_valid():
            return render(
                request, self.template_name, {"entregable": entregable, "form": form}, status=400
            )

        clave = storage.clave_para(
            proyecto_codigo=entregable.proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=form.sha256,
            extension=form.extension,
        )
        storage.guardar(clave, form.contenido)

        revision = form.save(commit=False)
        revision.entregable = entregable
        revision.subida_por = request.user
        revision.clave_archivo = clave
        # El nombre que traía se guarda **en la base de datos**, no en el disco.
        revision.nombre_original = form.cleaned_data["archivo"].name[:250]
        revision.tamano_bytes = len(form.contenido)
        revision.sha256 = form.sha256
        revision.save()

        set_audit_context(request, revision, action="subir_revision")
        messages.success(
            request,
            _("Revision %(rev)s uploaded (%(kb)s KB).")
            % {"rev": revision.correlativo, "kb": len(form.contenido) // 1024},
        )
        return redirect("documents:expediente", pk=entregable.pk)


class DescargarRevisionView(ModelViewPermissionRequiredMixin, View):
    model = Revision

    def get(self, request, *args, **kwargs):
        revision = get_object_or_404(
            solo_publicadas(Revision.objects.select_related("entregable"), request.user),
            pk=kwargs["pk"],
        )
        # El acotado por organización va por el entregable, que es quien lo lleva.
        if not Entregable.objects.filter(pk=revision.entregable_id).exists():
            raise Http404
        try:
            contenido = storage.leer(revision.clave_archivo)
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        respuesta = FileResponse(
            iter([contenido]),
            as_attachment=True,
            # Se le devuelve **el nombre que traía**, que es el que la persona reconoce,
            # aunque en el disco viva con otro.
            filename=revision.nombre_original or f"{revision.entregable.codigo}.bin",
        )
        return respuesta


class ObservacionesView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    model = Observacion
    template_name = "documents/observaciones.html"
    context_object_name = "observaciones"
    paginate_by = 50

    def get_queryset(self):
        consulta = (
            super()
            .get_queryset()
            .select_related("proyecto", "responsable", "autor", "revision__entregable")
        )
        if self.request.GET.get("mias") == "1":
            consulta = consulta.filter(responsable=self.request.user)
        if self.request.GET.get("abiertas") == "1":
            consulta = consulta.exclude(estado__in=[Observacion.CERRADA, Observacion.DESCARTADA])
        entregable = self.request.GET.get("entregable")
        if entregable:
            consulta = consulta.filter(revision__entregable_id=entregable)
        return consulta


class ObservacionView(
    ModelViewPermissionRequiredMixin, OrganizacionScopedQuerysetMixin, DetailView
):
    model = Observacion
    template_name = "documents/observacion.html"
    context_object_name = "observacion"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["comentarios"] = self.object.comentarios.select_related("autor")
        contexto["form_comentario"] = ComentarioForm()
        contexto["form_cierre"] = CierreForm()
        # **El botón solo si se puede ejecutar.**
        contexto["puede_comentar"] = self.request.user.has_perm("documents.add_comentario")
        contexto["puede_cerrar"] = self.request.user.has_perm("documents.change_observacion")
        return contexto


class ComentarObservacionView(ModelPermissionRequiredMixin, View):
    model = Comentario
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        observacion = get_object_or_404(Observacion, pk=kwargs["pk"])
        form = ComentarioForm(request.POST)
        if form.is_valid():
            comentario = Comentario.objects.create(
                observacion=observacion, autor=request.user, texto=form.cleaned_data["texto"]
            )
            # Responder deja la observación **respondida**, no cerrada: cerrar es del que
            # la abrió.
            if observacion.estado == Observacion.ABIERTA:
                observacion.estado = Observacion.RESPONDIDA
                observacion.save(update_fields=["estado", "updated_at"])
            set_audit_context(request, comentario, action="comentar_observacion")
        else:
            messages.error(request, _("The comment cannot be empty."))
        return redirect("documents:observacion", pk=observacion.pk)


class CerrarObservacionView(ModelPermissionRequiredMixin, View):
    model = Observacion
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        observacion = get_object_or_404(Observacion, pk=kwargs["pk"])
        form = CierreForm(request.POST)
        if not form.is_valid():
            messages.error(request, _("An observation is not closed without saying how."))
            return redirect("documents:observacion", pk=observacion.pk)

        observacion.cerrar(request.user, form.cleaned_data["resolucion"])
        set_audit_context(request, observacion, action="cerrar_observacion")
        messages.success(request, _("Observation closed."))
        return redirect("documents:observacion", pk=observacion.pk)


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
        consulta = super().get_queryset().select_related("proyecto", "responsable", "entregable")
        if self.request.GET.get("mias") == "1":
            consulta = consulta.filter(responsable=self.request.user)
        return consulta


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
        )


class MiBandejaView(ModelViewPermissionRequiredMixin, TemplateView):
    """Lo que le toca a quien está mirando. **Es la pantalla que se abre cada mañana.**"""

    model = Observacion
    template_name = "documents/bandeja.html"

    def get_context_data(self, **kwargs):
        from apps.documents.notify import pendientes_por_tramo

        contexto = super().get_context_data(**kwargs)
        tramos = pendientes_por_tramo(self.request.user)
        # La etiqueta se arma acá y no en la plantilla: un diccionario recorrido en una
        # plantilla de Django no puede traducir su clave, y una lista de `if` con los
        # cuatro nombres es la lista que se separa del código en el primer cambio.
        contexto["tramos_etiquetados"] = [
            (tramos["vencido"], _("Overdue")),
            (tramos["en_7"], _("Next 7 days")),
            (tramos["en_15"], _("Next 15 days")),
            (tramos["en_30"], _("Next 30 days")),
        ]
        contexto["entregables"] = (
            Entregable.objects.filter(responsable=self.request.user, is_active=True)
            .select_related("proyecto", "disciplina")
            .prefetch_related("revisiones")
        )
        return contexto


def crear_con_aviso(objeto, request, accion: str):
    """Guarda y **avisa al responsable**, que es la mitad de lo que se vino a hacer."""
    objeto.save()
    set_audit_context(request, objeto, action=accion)
    if not avisar_asignacion(objeto):
        messages.warning(
            request,
            _("Saved, but %(quien)s has no email address: nobody was notified.")
            % {"quien": objeto.responsable},
        )
    return objeto


class NuevaObservacionView(ModelPermissionRequiredMixin, View):
    model = Observacion
    permission_action = "add"
    template_name = "documents/nueva_observacion.html"

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = get_object_or_404(Entregable, pk=kwargs["pk"])
        return render(
            request,
            self.template_name,
            {
                "entregable": entregable,
                "form": ObservacionForm(proyecto=entregable.proyecto),
            },
        )

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = get_object_or_404(Entregable, pk=kwargs["pk"])
        form = ObservacionForm(request.POST, proyecto=entregable.proyecto)
        if not form.is_valid():
            return render(
                request,
                self.template_name,
                {"entregable": entregable, "form": form},
                status=400,
            )
        observacion = form.save(commit=False)
        observacion.organizacion = entregable.organizacion
        observacion.proyecto = entregable.proyecto
        observacion.autor = request.user
        crear_con_aviso(observacion, request, "abrir_observacion")
        messages.success(request, _("Observation opened and the owner notified."))
        return redirect("documents:observacion", pk=observacion.pk)


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


class CambiarIdoneidadView(ModelPermissionRequiredMixin, View):
    """El trabajo del revisor: decir para qué sirve el documento."""

    model = Revision
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        revision = get_object_or_404(Revision.objects.select_related("entregable"), pk=kwargs["pk"])
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


class NuevoEntregableView(ModelPermissionRequiredMixin, View):
    model = Entregable
    permission_action = "add"
    template_name = "documents/nuevo_entregable.html"

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, {"form": EntregableForm()})

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        form = EntregableForm(request.POST)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form}, status=400)

        entregable = form.save(commit=False)
        disciplina = form.cleaned_data["disciplina"]
        entregable.proyecto = disciplina.proyecto
        entregable.organizacion = disciplina.proyecto.organizacion
        entregable.save()
        set_audit_context(request, entregable, action="crear_entregable")
        messages.success(request, _("Deliverable created."))
        return redirect("documents:expediente", pk=entregable.pk)
