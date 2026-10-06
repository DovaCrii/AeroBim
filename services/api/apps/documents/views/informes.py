"""Lo que sale del registro: BCF, informe de coordinación, resumen y lámina en PDF."""

import logging
from io import BytesIO

from django.contrib import messages
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.generic import View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
)
from apps.documents import storage
from apps.documents.bcf import exportar as exportar_bcf
from apps.documents.models import (
    Observacion,
    Revision,
)
from apps.projects.models import Proyecto

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


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

    #: Donde se guarda en la sesión el BCF que se está revisando. `F4.11`.
    #:
    #: **En la sesión y no en la URL**, y no es indiferente: una clave de almacenamiento en un
    #: parámetro la escribe cualquiera, y aunque `storage` la normalice, exponerla invita a probar
    #: rutas. En la sesión es del navegador de quien la subió y no se puede teclear.
    SESION = "bcf_entrante"

    def post(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.bcf_importar import BcfInvalido, leer, vistazo
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        # **Tres caminos por la misma puerta**: mirar lo que trae un archivo nuevo, confirmar lo que
        # se estaba mirando, y dejarlo. Van juntos porque comparten el proyecto y su comprobación.
        if request.POST.get("dejarlo"):
            self._olvidar(request)
            messages.info(request, _("The BCF was left without importing anything."))
            return redirect("projects:proyecto", pk=proyecto.pk)

        if request.POST.get("confirmar"):
            return self._confirmar(request, proyecto)

        archivo = request.FILES.get("archivo")
        if archivo is None:
            messages.error(request, _("Choose a BCF file to import."))
            return redirect("projects:proyecto", pk=proyecto.pk)

        contenido = archivo.read()
        try:
            temas = leer(contenido)
        except BcfInvalido as invalido:
            messages.error(request, str(invalido))
            return redirect("projects:proyecto", pk=proyecto.pk)

        # **Se guarda para poder confirmarlo**: entre mirar y aceptar hay una petición nueva, y el
        # archivo ya no viaja en ella. Va al mismo almacén que los documentos, con su clave
        # construida y nunca con un nombre que venga de fuera.
        import hashlib

        sha = hashlib.sha256(contenido).hexdigest()
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo="bcf-entrante",
            sha256=sha,
            extension="bcf",
        )
        storage.guardar(clave, contenido)
        request.session[self.SESION] = {
            "clave": clave,
            "proyecto": str(proyecto.pk),
            "nombre": archivo.name,
        }

        return self.render_to_response(
            {
                "proyecto": proyecto,
                "nombre": archivo.name,
                "vistazos": vistazo(proyecto, temas),
            }
        )

    def render_to_response(self, contexto):
        from django.shortcuts import render

        return render(self.request, "documents/bcf_vistazo.html", contexto)

    def _olvidar(self, request) -> None:
        """Borra el archivo que se estaba revisando, del disco y de la sesión.

        **Un temporal que nadie borra es un temporal que crece.** Y si el borrado falla —permisos,
        un montaje de solo lectura— se sigue: lo que importa es que la sesión lo suelte, porque un
        archivo huérfano ocupa disco y una sesión que apunta a algo que ya no está da un error a
        quien no hizo nada.
        """
        guardado = request.session.pop(self.SESION, None)
        if not guardado:
            return
        try:
            storage.ruta_de(guardado["clave"]).unlink(missing_ok=True)
        except OSError:
            pass

    def _confirmar(self, request, proyecto):
        """Importa lo que se estaba mirando, y solo si es de esta obra."""
        from apps.documents.bcf_importar import BcfInvalido, aplicar, leer

        guardado = request.session.get(self.SESION)
        # **Se comprueba que sea de esta obra**, y no es paranoia: la clave vive en la sesión, así
        # que con dos pestañas abiertas en dos proyectos el «confirmar» de una podría escribir en la
        # otra. La sesión guarda a qué obra pertenece y aquí se compara.
        if not guardado or guardado.get("proyecto") != str(proyecto.pk):
            messages.error(request, _("That BCF is no longer available. Upload it again."))
            return redirect("projects:proyecto", pk=proyecto.pk)

        try:
            contenido = storage.leer(guardado["clave"])
            resultado = aplicar(proyecto, leer(contenido), request.user)
        except (OSError, storage.CargaRechazada):
            self._olvidar(request)
            messages.error(request, _("That BCF is no longer available. Upload it again."))
            return redirect("projects:proyecto", pk=proyecto.pk)
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


class InformeCoordinacionView(ModelViewPermissionRequiredMixin, View):
    """El informe de coordinación, en PDF o en CSV. `F10.3`.

    **Es la primera salida en papel que tiene el producto.** Hasta hoy lo único que salía era el
    BCF, y un BCF no se lleva a una reunión de obra: se abre en otro software.

    **Pide `view_observacion` y nada más, porque un informe es leer**: se lleva lo que quien lo pide
    ya puede ver en la lista, ni un hallazgo más. Y la consulta se acota por organización igual que
    la pantalla.

    Dos formatos por la misma puerta, y no es indecisión:

    - **PDF** es lo que se imprime, se firma y se archiva. Se arma en el servidor —decisión del
      usuario del 2026-09-02: «la meta es desde el servidor, así buscamos que sea interno»— así que
      controla los saltos de página y no depende del navegador de quien lo pide.
    - **CSV** es la mitad editable. Un PDF no se retoca antes de mandarlo y una hoja de cálculo sí,
      y así no hace falta LibreOffice en el servidor para conseguirlo.
    """

    model = Observacion

    def get(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.informe import Opciones, csv_de, pdf_de
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        opciones = Opciones.desde(request.GET, usuario=request.user, proyecto=proyecto)
        formato = "csv" if request.GET.get("formato") == "csv" else "pdf"

        set_audit_context(
            request,
            proyecto,
            action="informe_coordinacion",
            metadata={
                "formato": formato,
                "estado": opciones.estado,
                "orden": opciones.orden,
                # **La etiqueta va a la bitácora**, porque es lo que explica por qué dos informes
                # de la misma obra y del mismo día traen distinto número de hallazgos.
                "etiqueta": str(opciones.etiqueta) if opciones.etiqueta else "",
            },
        )

        if formato == "csv":
            contenido = csv_de(proyecto, opciones).encode("utf-8")
            tipo = "text/csv; charset=utf-8"
        else:
            contenido = pdf_de(proyecto, opciones, pedido_por=request.user.get_username())
            tipo = "application/pdf"

        # El nombre lleva el código de la obra y la fecha: quien lo recibe por correo tiene que
        # saber de qué obra es y de cuándo sin abrirlo.
        nombre = f"{proyecto.codigo}-coordinacion-{timezone.localdate().isoformat()}.{formato}"

        # **Va un `BytesIO`, no un iterador.** `FileResponse` solo llama a `set_headers` cuando el
        # contenido tiene `read`: con `iter([bytes])` se traga `as_attachment` y `filename` sin
        # avisar. Es la tercera vez que este defecto aparece en este archivo.
        return FileResponse(
            BytesIO(contenido), as_attachment=True, filename=nombre, content_type=tipo
        )


class ResumenEjecutivoView(ModelViewPermissionRequiredMixin, View):
    """El resumen ejecutivo: **una hoja para decidir**, con la misma base de la casa.

    **No es el informe de coordinación con menos cosas.** Contesta otra pregunta. El de coordinación
    dice *«qué hay»* —una tabla con cada hallazgo, su hilo y su foto, seis o siete folios con una
    obra de verdad— y es el papel de la reunión técnica. Éste dice *«cómo va y qué decido esta
    semana»*, que es lo que pregunta quien no va a esa reunión.

    Mismo permiso y mismo acotado que el otro, y por el mismo motivo: **un informe es leer**, así
    que se lleva lo que quien lo pide ya puede ver en la lista y ni un hallazgo más.

    Sin opciones a propósito: un resumen ejecutivo configurable deja de ser comparable entre dos
    meses, que es justo para lo que sirve.
    """

    model = Observacion

    def get(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.ejecutivo import pdf_de
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        set_audit_context(request, proyecto, action="resumen_ejecutivo")

        contenido = pdf_de(proyecto, pedido_por=request.user.get_username())
        nombre = f"{proyecto.codigo}-resumen-{timezone.localdate().isoformat()}.pdf"
        return FileResponse(
            BytesIO(contenido),
            as_attachment=True,
            filename=nombre,
            content_type="application/pdf",
        )


class LaminaPdfView(ModelViewPermissionRequiredMixin, View):
    """La lámina de un plano, en PDF y con el sello de la casa. `F7.5`.

    **Un DXF se abre en un CAD y un PDF se manda por correo, se firma y se cuelga.** El visor ya
    sacaba el DXF; esto cubre el caso más común de todos, que es mandarle la planta a alguien que no
    tiene AutoCAD.

    **El navegador proyecta y el servidor compone el papel**, y ese reparto no es casual: proyectar
    aristas necesita un renderizador —en un servidor sin pantalla es justo lo que no hay— y el
    membrete de J.E.J. ya vive aquí, medido del formato de la oficina. Es además la decisión que el
    usuario tomó para el informe: «la meta es desde el servidor, así buscamos que sea interno».

    **Pide `view_revision` y no `add_*`**: dibujar un plano de lo que ya se puede ver es leer. No
    crea nada en la base —la lámina se manda y no se guarda— y por eso tampoco lleva permiso de
    escritura. Y va acotada por organización a través del proyecto, como todo lo demás.
    """

    model = Revision

    def post(self, request, *args, **kwargs):
        import json

        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.lamina import Lamina, pdf_de
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        try:
            datos = json.loads(request.body or b"{}")
        except ValueError:
            return JsonResponse({"error": _("The sheet did not arrive as JSON.")}, status=400)
        if not isinstance(datos, dict):
            return JsonResponse({"error": _("The sheet did not arrive as JSON.")}, status=400)

        # El nombre de la vista lo pone el visor —«Planta», «Alzado frontal»— y se recorta: va al
        # sello de la hoja, no a una consulta.
        vista = str(datos.get("nombre") or _("Drawing"))[:60]
        lamina = Lamina.desde(datos, titulo=f"{proyecto.codigo} · {vista}")
        if not lamina.segmentos and not lamina.textos:
            return JsonResponse({"error": _("The sheet arrived with nothing to draw.")}, status=400)

        set_audit_context(
            request,
            proyecto,
            action="lamina_pdf",
            metadata={
                "vista": vista,
                "segmentos": len(lamina.segmentos),
                "textos": len(lamina.textos),
                "recortada": lamina.recortada,
            },
        )

        contenido = pdf_de(lamina, pedido_por=request.user.get_username())
        nombre = f"{proyecto.codigo}-{vista}-{timezone.localdate().isoformat()}.pdf"
        return FileResponse(
            BytesIO(contenido),
            as_attachment=True,
            filename=nombre,
            content_type="application/pdf",
        )
