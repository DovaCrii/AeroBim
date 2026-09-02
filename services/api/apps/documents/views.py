"""Las pantallas del registro documental.

**El expediente es la idea que ordena esto.** Copiado del `dossier.py` de AeroControl:
una pantalla que contesta *«¿esto está completo y documentado?»* nombrando cada fila que
falta con el atajo que la cierra — y **omitiendo los botones que el usuario no puede
ejecutar**, porque ofrecer un botón que termina en 403 es peor que no ofrecerlo: enseña
a probar puertas.
"""

from io import BytesIO

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
from apps.documents.bcf import exportar as exportar_bcf
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

        # **Va un `BytesIO`, no un iterador**, y no es estilo: `FileResponse` solo llama a
        # `set_headers` cuando el contenido tiene `read`, así que con `iter([bytes])` se tragaba
        # `as_attachment` y `filename` **sin avisar** — el nombre que este comentario promete no
        # llegaba al navegador. Es el mismo defecto que apareció en la exportación a BCF.
        return FileResponse(
            BytesIO(contenido),
            as_attachment=True,
            # Se le devuelve **el nombre que traía**, que es el que la persona reconoce,
            # aunque en el disco viva con otro.
            filename=revision.nombre_original or f"{revision.entregable.codigo}.bin",
        )


class ExportarBcfView(ModelViewPermissionRequiredMixin, View):
    """Las observaciones de un proyecto, en **BCF 2.1** (`F4.4`).

    **Es lo que hace que una observación valga fuera de AeroBim.** Un hallazgo anclado al GUID de
    una viga es exactamente lo que el mandante abre en Solibri o en Navisworks; guardado solo aquí,
    obliga a que todos entren a nuestra pantalla, y eso no pasa.

    **Pide `view_observacion` y nada más**, porque exportar es leer: se lleva lo que el usuario ya
    puede ver en la lista, ni un tema más. Y por eso la consulta se acota igual que la pantalla.
    """

    model = Observacion

    def get(self, request, *args, **kwargs):
        proyecto = get_object_or_404(
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user), pk=kwargs["pk"]
        )

        observaciones = (
            Observacion.objects.filter(proyecto=proyecto)
            .select_related("autor", "responsable", "cerrada_por")
            .prefetch_related("comentarios__autor")
            .order_by("created_at")
        )
        if not observaciones.exists():
            messages.error(request, _("This project has no observations to export."))
            return redirect("documents:observaciones")

        contenido = exportar_bcf(observaciones, str(proyecto))
        set_audit_context(
            request,
            proyecto,
            action="exportar_bcf",
            metadata={"temas": observaciones.count()},
        )

        # **Va un `BytesIO`, no un iterador.** `FileResponse._set_streaming_content` solo llama a
        # `set_headers` cuando el contenido tiene `read`: con `iter([bytes])` se traga
        # `as_attachment` y `filename` sin avisar, y el archivo sale sin `Content-Disposition`.
        return FileResponse(
            BytesIO(contenido),
            as_attachment=True,
            # El nombre lleva el código del proyecto: quien lo recibe por correo tiene que saber de
            # qué obra es sin abrirlo.
            filename=f"{proyecto.codigo}-observaciones.bcf",
            content_type="application/octet-stream",
        )


class ImportarBcfView(ModelPermissionRequiredMixin, View):
    """Un BCF que llega de otra oficina, dentro. `F4.6`.

    **Es la vuelta del ciclo, y sin ella la coordinación es un altavoz.** `F4.4` cerró la ida: las
    observaciones salen en un ZIP que Solibri y Navisworks abren. Pero coordinar es de ida y
    vuelta: el mandante revisa, contesta y **manda otro BCF**. Sin importar, esa respuesta se lee
    en un correo y se teclea a mano, o —lo que pasa de verdad— no se teclea.

    **Pide `add_observacion`** porque es exactamente lo que hace: crear observaciones. Y la consulta
    se acota por organización, porque el permiso dice «puede crear observaciones», no «puede
    crearlas **en esta obra**».

    **No tiene pantalla de resultados.** Lo que entra cae donde ya vive la coordinación —el bloque
    de observaciones abiertas de la propia pantalla del proyecto—, y lo que hizo la importación se
    cuenta en un mensaje. Una pantalla más que sincronizar con el estado de las observaciones no
    aporta nada.
    """

    model = Observacion
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.bcf_importar import BcfInvalido, importar
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        archivo = request.FILES.get("archivo")
        if archivo is None:
            messages.error(request, _("Choose a BCF file to import."))
            return redirect("projects:proyecto", pk=proyecto.pk)

        try:
            resultado = importar(proyecto, archivo.read(), request.user)
        except BcfInvalido as invalido:
            # **El motivo se enseña tal cual.** `BcfInvalido` se escribe para que se pueda leer:
            # dice qué le pasa al archivo y nunca una ruta ni una traza. Quien lo recibió por
            # correo necesita saber qué pedir de vuelta.
            messages.error(request, str(invalido))
            return redirect("projects:proyecto", pk=proyecto.pk)

        messages.success(request, resultado.resumen)
        for aviso in resultado.avisos:
            # **Lo que se saltó se dice.** Una importación que deja temas fuera en silencio hace
            # creer que llegó todo, y eso se descubre cuando alguien pregunta por un hallazgo que
            # nadie miró.
            messages.warning(request, aviso)

        set_audit_context(
            request,
            proyecto,
            action="importar_bcf",
            metadata={
                "temas": resultado.temas,
                "creadas": resultado.creadas,
                "actualizadas": resultado.actualizadas,
            },
        )
        return redirect("projects:proyecto", pk=proyecto.pk)


class CoberturaView(ModelViewPermissionRequiredMixin, View):
    """Qué trae de verdad el modelo, clase por clase, **antes de exigirle algo**. `F3.10`.

    Subir un IDS y validar contra él funciona desde `F3.5`, y lo que faltaba era **el archivo**:
    nadie tiene un IDS escrito para su obra, y escribirlo a ciegas produce un requisito que el
    modelo ya cumple entero —que no dice nada— o uno que no cumple en absoluto, que se ignora desde
    el primer día. Los dos enseñan a no mirar el informe de validación.

    Así que primero se mide, y la pantalla muestra los números: cuántos elementos de cada clase, qué
    psets aparecen y en cuántos. **El requisito lo decide alguien mirando datos.**
    """

    model = Revision
    template_name = "documents/cobertura.html"

    def revision(self, request, pk):
        revision = revisiones_visibles(request.user).filter(pk=pk).first()
        if revision is None:
            raise Http404
        return revision

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        from apps.documents import cobertura

        revision = self.revision(request, kwargs["pk"])
        if storage.extension_de(revision.nombre_original) != "ifc":
            messages.error(request, _("Coverage can only be measured on an IFC model."))
            return redirect("documents:expediente", pk=revision.entregable_id)

        try:
            medicion = cobertura.medir(storage.ruta_de(revision.clave_archivo))
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        return render(
            request,
            self.template_name,
            {
                "revision": revision,
                "medicion": medicion,
                # **Cuántos hay que proponer**, para no ofrecer generar un IDS vacío: un archivo sin
                # especificaciones es inválido y ninguna herramienta lo acepta.
                "candidatos": sum(
                    1
                    for clase in medicion.get("clases", [])
                    for pset in clase.get("psets", [])
                    if pset.get("candidato")
                ),
                "puede_crear": request.user.has_perm("documents.add_requisitoids"),
            },
        )


class GenerarIdsView(ModelPermissionRequiredMixin, View):
    """Genera el IDS de partida desde el modelo y lo deja como requisito del proyecto.

    **Pide `add_requisitoids`**, el mismo permiso que subirlo a mano: es la misma acción —poner el
    requisito de información del proyecto— y quien puede una puede la otra.
    """

    model = RequisitoIds
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        from apps.documents import cobertura, ids_de_partida
        from apps.documents.ids import titulo_de_ids

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404

        proyecto = revision.entregable.proyecto
        try:
            medicion = cobertura.medir(storage.ruta_de(revision.clave_archivo))
            contenido = ids_de_partida.generar(
                medicion,
                titulo=_("Information requirement of %(codigo)s") % {"codigo": proyecto.codigo},
                autor=(request.user.email or request.user.get_username()),
            )
        except ValueError as fallo:
            # No hay nada que proponer: se dice, en vez de guardar un archivo inválido.
            messages.error(request, str(fallo))
            return redirect("documents:cobertura", pk=revision.pk)
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        nombre = f"{proyecto.codigo}-partida.ids"
        # **Se pasa por la misma validación que un archivo subido a mano.** No es ceremonia: es lo
        # que calcula el sha con el que se guarda —la clave es el contenido— y así un IDS generado
        # dos veces desde el mismo modelo no crea dos archivos en el disco.
        extension, sha = storage.validar(nombre, contenido)
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo=proyecto.codigo,
            sha256=sha,
            extension=extension,
        )
        storage.guardar(clave, contenido)

        requisito = RequisitoIds.objects.create(
            organizacion=proyecto.organizacion,
            proyecto=proyecto,
            titulo=titulo_de_ids(contenido) or nombre,
            clave_archivo=clave,
            nombre_original=nombre,
            sha256=sha,
            subido_por=request.user,
        )
        set_audit_context(request, requisito, action="generar_ids_de_partida")
        messages.success(
            request,
            _("Starting IDS generated. Review it before agreeing it with the client."),
        )
        return redirect("documents:requisitos-ids")


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

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        # **Los proyectos que tienen algo que exportar**, no todos: un enlace a un BCF vacío se abre
        # en Solibri y no muestra nada, que se lee como que la exportación falló.
        contexto["proyectos_exportables"] = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), self.request.user)
            .filter(observaciones__isnull=False)
            .distinct()
            .order_by("codigo")
        )
        return contexto


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

        # **El punto de vista, si el visor lo mandó** (`F4.1`). Llega ya convertido al sistema del
        # IFC —la escena del visor tiene el eje Y hacia arriba y el IFC la cota en Z— y se pasa tal
        # cual: quien comprueba que sea una cámara reproducible es el formulario, con
        # `camara.leer`. Acá solo se traslada, igual que el resto del ancla.
        camara = (request.GET.get("camara") or "").strip()
        if camara:
            inicial["camara"] = camara
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


class RevisarInterferenciasView(ModelPermissionRequiredMixin, View):
    """Revisa las interferencias de la obra y abre las nuevas como observaciones. `F5.1`–`F5.5`.

    **No tiene pantalla propia a propósito, y eso es lo mejor que tiene.** El resultado cae donde ya
    vive la coordinación: las observaciones nuevas aparecen en el bloque de abiertas por prioridad
    de la propia pantalla del proyecto, y desde ahí el visor ya sabe abrirlas —aislando los dos
    elementos y dibujando el segmento entre ellos—. Una pantalla de resultados aparte sería una
    lista más que hay que sincronizar con el estado de las observaciones.

    **Pide `add_observacion`** porque es exactamente lo que hace: abrir observaciones. No un permiso
    nuevo — un rol que puede abrir un hallazgo a mano puede mandar buscarlos.

    **Y la petición espera.** Son 20 s medidos por par de modelos, decisión del usuario del
    2026-09-02: caben de sobra en los 120 s del servidor, y una cola traería una forma nueva de
    fallar en silencio que todavía no hace falta pagar. La corrida deja su fila en `JobRun`.
    """

    model = Observacion
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.interferencias import GrupoVacio
        from apps.documents.revisar import revisar_proyecto
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        try:
            resultado = revisar_proyecto(proyecto, request.user)
        except GrupoVacio as vacio:
            # Es un error de lo que se pidió comparar, no de la corrida: se dice y se vuelve.
            messages.error(request, str(vacio))
            return redirect("projects:proyecto", pk=proyecto.pk)

        if resultado.pares == 0:
            messages.info(
                request,
                _("There is only one model in this project: nothing to compare it against."),
            )
        elif resultado.abiertas == 0:
            messages.success(
                request,
                _("Checked %(resumen)s. Nothing new.") % {"resumen": resultado.resumen},
            )
        else:
            messages.success(
                request,
                _("Checked %(resumen)s. The new ones are in the open observations below.")
                % {"resumen": resultado.resumen},
            )

        if resultado.sin_archivo:
            # **Se dice cuáles se quedaron fuera.** Una corrida que compara menos modelos de los que
            # hay y no lo dice deja creer que la obra está limpia.
            messages.warning(
                request,
                _("Left out, their file is not on disk: %(cuales)s")
                % {"cuales": ", ".join(resultado.sin_archivo)},
            )

        set_audit_context(
            request,
            proyecto,
            action="revisar_interferencias",
            metadata={"pares": resultado.pares, "abiertas": resultado.abiertas},
        )
        return redirect("projects:proyecto", pk=proyecto.pk)


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
