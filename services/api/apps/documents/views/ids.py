"""Los requisitos de información (IDS): cobertura, generar, crear y validar."""

import logging

from django.contrib import messages
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.utils.translation import gettext as _
from django.views.generic import ListView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents import storage
from apps.documents.forms import (
    RequisitoIdsForm,
)
from apps.documents.ids import validar as validar_ids
from apps.documents.models import (
    RequisitoIds,
    Revision,
    ValidacionIds,
)
from apps.documents.views._comun import revisiones_visibles
from apps.projects.models import Proyecto

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


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
