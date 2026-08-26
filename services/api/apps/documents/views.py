"""Las pantallas del registro documental.

**El expediente es la idea que ordena esto.** Copiado del `dossier.py` de AeroControl:
una pantalla que contesta *«¿esto está completo y documentado?»* nombrando cada fila que
falta con el atajo que la cierra — y **omitiendo los botones que el usuario no puede
ejecutar**, porque ofrecer un botón que termina en 403 es peor que no ofrecerlo: enseña
a probar puertas.
"""

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, TemplateView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import organizaciones_visibles, scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents import storage
from apps.documents.abribles import RUTA_POR_VISOR, visor_de
from apps.documents.forms import (
    ActividadForm,
    CierreForm,
    ComentarioForm,
    EntregableForm,
    IdoneidadForm,
    ObservacionForm,
    RequisitoIdsForm,
    RevisionForm,
    TransmittalForm,
)
from apps.documents.ids import validar as validar_ids
from apps.documents.ifc import extraer as extraer_ifc
from apps.documents.models import (
    IDONEIDADES_PUBLICADAS,
    Actividad,
    Comentario,
    Entregable,
    Idoneidad,
    Observacion,
    RequisitoIds,
    Revision,
    Transmittal,
    ValidacionIds,
)
from apps.documents.notify import avisar_asignacion, avisar_transmittal
from apps.projects.models import Proyecto


def solo_publicadas(queryset, user):
    """Un mandante ve **solo lo publicado**, y eso no lo puede decir un permiso.

    `view_revision` dice "puede ver revisiones"; no sabe distinguir una `S0` en curso de
    una `A1` autorizada. La diferencia es contractual —lo que está en curso no obliga a
    nadie y no se enseña— así que la pone la vista, con la regla escrita en un solo sitio.
    """
    if user.has_perm("documents.change_revision") or user.has_perm("documents.add_revision"):
        return queryset
    return queryset.filter(idoneidad__in=IDONEIDADES_PUBLICADAS)


def revisiones_visibles(user):
    """Las revisiones que este usuario puede leer, acotadas y filtradas.

    **Se acota a mano y no con `scope_queryset_to_organizacion`.** Una `Revision` no lleva el
    campo `organizacion` —cuelga de su entregable—, y ese ayudante devuelve intacto un modelo
    que no lo tiene: confiar en él dejaría el hueco abierto.

    Vive aquí, junto a {@link solo_publicadas}, porque la regla la necesitan **dos sitios**: la
    API que alimenta al visor y el desplegable de revisiones al armar un transmittal. Escrita
    una vez, no se puede olvidar en uno de los dos.
    """
    ids = organizaciones_visibles(user)
    consulta = Revision.objects.select_related("entregable__proyecto", "entregable__disciplina")
    if not user.is_superuser:
        if not ids:
            return consulta.none()
        consulta = consulta.filter(entregable__organizacion_id__in=ids)
    return solo_publicadas(consulta, user)


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
        # **Lo que el IFC declara se lee al subirlo** (`F3.3`), y solo si es un IFC. Medido: 1,1 s
        # para el modelo real de 23,6 MB, así que no hace falta un trabajo en segundo plano para el
        # tamaño que recibe un control documental. Si algún día llega un federado que tarde, esto es
        # lo que se mueve a `JobRun`, y el campo ya está.
        if storage.extension_de(revision.nombre_original) == "ifc":
            revision.metadatos = extraer_ifc(storage.ruta_de(clave))
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


class RequisitosIdsView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    """Los requisitos de información del proyecto, en IDS (`F3.5`)."""

    model = RequisitoIds
    template_name = "documents/requisitos_ids.html"
    context_object_name = "requisitos"
    paginate_by = 50

    def get_queryset(self):
        return super().get_queryset().select_related("proyecto", "subido_por")

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["puede_subir"] = self.request.user.has_perm("documents.add_requisitoids")
        return contexto


class NuevoRequisitoIdsView(ModelPermissionRequiredMixin, View):
    model = RequisitoIds
    permission_action = "add"
    template_name = "documents/nuevo_requisito_ids.html"

    def formulario(self, request, datos=None, archivos=None):
        # Los proyectos se acotan a la organización: subir el requisito de otro cliente sería
        # escribir en su proyecto.
        return RequisitoIdsForm(
            datos,
            archivos,
            proyectos=scope_queryset_to_organizacion(Proyecto.objects.all(), request.user),
        )

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, {"form": self.formulario(request)})

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        form = self.formulario(request, request.POST, request.FILES)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form}, status=400)

        proyecto = form.cleaned_data["proyecto"]
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo="ids",
            sha256=form.sha256,
            extension="ids",
        )
        storage.guardar(clave, form.contenido)

        requisito = form.save(commit=False)
        requisito.organizacion = proyecto.organizacion
        # El título del archivo gana si nadie escribió uno: el IDS ya lo trae.
        requisito.titulo = form.cleaned_data["titulo"] or form.titulo_del_archivo or _("Untitled")
        requisito.clave_archivo = clave
        requisito.nombre_original = form.cleaned_data["archivo"].name[:250]
        requisito.sha256 = form.sha256
        requisito.subido_por = request.user
        requisito.save()

        set_audit_context(request, requisito, action="subir_requisito_ids")
        messages.success(request, _("Information requirement uploaded."))
        return redirect("documents:requisitos-ids")


class ValidarIdsView(ModelPermissionRequiredMixin, View):
    """Corre **todos los requisitos del proyecto** contra una revisión.

    **Todos y no uno.** La pregunta que trae a alguien aquí es «¿este modelo cumple?», y contestarla
    requisito por requisito obliga a repetir el gesto tantas veces como requisitos haya, y a sumar a
    mano. Cada corrida deja su propia fila, así que el detalle no se pierde.
    """

    model = ValidacionIds
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        revision = get_object_or_404(
            revisiones_visibles(request.user).filter(pk=kwargs["pk"]),
        )
        if storage.extension_de(revision.nombre_original) != "ifc":
            messages.error(request, _("Only an IFC can be validated against an IDS."))
            return redirect("documents:expediente", pk=revision.entregable_id)

        entregable = revision.entregable
        requisitos = list(entregable.proyecto.requisitos_ids.filter(is_active=True))
        if not requisitos:
            messages.error(
                request,
                _("This project has no information requirement yet: upload an IDS first."),
            )
            return redirect("documents:expediente", pk=entregable.pk)

        cumplen = 0
        for requisito in requisitos:
            resumen = validar_ids(
                storage.ruta_de(requisito.clave_archivo),
                storage.ruta_de(revision.clave_archivo),
            )
            validacion = ValidacionIds.objects.create(
                organizacion=entregable.organizacion,
                requisito=requisito,
                revision=revision,
                corrida_por=request.user,
                cumple=bool(resumen.get("cumple")),
                resumen=resumen,
            )
            if validacion.cumple:
                cumplen += 1
            set_audit_context(request, validacion, action="validar_ids")

        messages.success(
            request,
            _("Validated against %(total)s requirements: %(ok)s comply.")
            % {"total": len(requisitos), "ok": cumplen},
        )
        return redirect("documents:expediente", pk=entregable.pk)


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

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["puede_crear"] = self.request.user.has_perm("documents.add_transmittal")
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
            destinatarios=get_user_model().objects.filter(is_active=True).order_by("username"),
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

    def entregable(self, request, pk):
        """**Acotado por organización.** `add_observacion` dice que puede abrir observaciones,
        no que pueda abrirlas sobre el entregable de otro cliente."""
        return get_object_or_404(
            scope_queryset_to_organizacion(Entregable.objects.all(), request.user), pk=pk
        )

    def ancla_pedida(self, request) -> dict:
        """El ancla que trae el visor del documento en la URL, si la trae.

        Llega como `?revision=<uuid>&pagina=3&x=0.42&y=0.18` desde un clic sobre el PDF. **Se
        pasa como valor inicial y no se guarda desde aquí**: entra por el formulario, que es
        quien comprueba el rango y que las tres partes vengan juntas. Un valor con mala forma se
        ignora en silencio a propósito — el formulario se abre igual, sin ancla, y quien lo usa
        no tiene por qué ver un error sobre un parámetro que no escribió.
        """
        inicial = {}
        for campo, clave in (("pagina", "pagina"), ("ancla_x", "x"), ("ancla_y", "y")):
            crudo = request.GET.get(clave)
            if crudo is None:
                continue
            try:
                inicial[campo] = int(crudo) if campo == "pagina" else float(crudo)
            except ValueError:
                return {}
        revision = request.GET.get("revision")
        if revision:
            inicial["revision"] = revision

        # **El ancla en el modelo llega de un fallo de validación IDS** (`F3.5`): el GUID del
        # elemento que no cumple, más la etiqueta del requisito como título propuesto. Es lo que
        # convierte «702 vigas sin su fase» en una observación sobre **una** viga, con responsable.
        guid = (request.GET.get("guid") or "").strip()
        # Se comprueba la forma: un GUID de IFC son 22 caracteres del alfabeto base64 propio del
        # formato, y guardar cualquier cosa dejaría un ancla que no apunta a nada.
        if len(guid) == 22 and all(c.isalnum() or c in "_$" for c in guid):
            inicial["ifc_guid"] = guid
        titulo = (request.GET.get("titulo") or "").strip()
        if titulo:
            inicial["titulo"] = titulo[:250]
        return inicial

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = self.entregable(request, kwargs["pk"])
        return render(
            request,
            self.template_name,
            {
                "entregable": entregable,
                "form": ObservacionForm(
                    proyecto=entregable.proyecto, initial=self.ancla_pedida(request)
                ),
            },
        )

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        entregable = self.entregable(request, kwargs["pk"])
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
