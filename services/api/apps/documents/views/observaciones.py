"""Las observaciones: lista, ficha, hilo, reparto, cierre y revisión de interferencias."""

import logging

from django.contrib import messages
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents import adjunto, storage
from apps.documents.forms import (
    CierreForm,
    ComentarioForm,
    EtiquetasForm,
    ObservacionForm,
    RepartoForm,
)
from apps.documents.models import (
    Comentario,
    Entregable,
    Observacion,
)
from apps.documents.notify import avisar_asignacion, avisar_comentario
from apps.documents.views._comun import crear_con_aviso, observacion_visible
from apps.projects.models import Proyecto

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


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
        from apps.documents.orden import anotaciones, criterio, nulos_al_final

        consulta = (
            super()
            .get_queryset()
            .select_related("proyecto", "responsable", "autor", "revision__entregable")
            # **La precarga es parte de dibujar la etiqueta, no una optimización aparte** — `F10.1`:
            # con cincuenta filas por página, sin ella son cincuenta consultas para pintar unos
            # chips. Medido: 56 consultas antes, 7 después, con 50 observaciones etiquetadas.
            .prefetch_related("etiquetas")
            .annotate(**anotaciones())
            # Lo de una obra archivada sale de los registros: se consulta desde la propia obra.
            .exclude(proyecto__is_active=False)
        )
        if self.request.GET.get("mias") == "1":
            consulta = consulta.filter(responsable=self.request.user)
        if self.request.GET.get("abiertas") == "1":
            consulta = consulta.exclude(estado__in=[Observacion.CERRADA, Observacion.DESCARTADA])
        entregable = self.request.GET.get("entregable")
        if entregable:
            consulta = consulta.filter(revision__entregable_id=entregable)
        # **Los filtros que pidió el usuario**: prioridad, estado y obra. Van por igualdad contra
        # el valor guardado, y un valor desconocido **no filtra** en vez de vaciar la lista: una
        # pantalla en blanco se lee como «no hay nada» y no como «ese filtro no existe».
        prioridad = self.request.GET.get("prioridad")
        if prioridad in dict(Observacion.PRIORIDADES):
            consulta = consulta.filter(prioridad=prioridad)
        estado = self.request.GET.get("estado")
        if estado in dict(Observacion.STATUS_CHOICES):
            consulta = consulta.filter(estado=estado)
        obra = self.request.GET.get("obra")
        if obra:
            consulta = consulta.filter(proyecto__codigo=obra)

        _columna, _desc, campos = criterio(self.request.GET.get("orden"))
        return nulos_al_final(consulta, campos)

    def get_context_data(self, **kwargs):
        from apps.documents.orden import COLUMNAS, criterio

        contexto = super().get_context_data(**kwargs)
        # **Los proyectos que tienen algo que exportar**, no todos: un enlace a un BCF vacío se abre
        # en Solibri y no muestra nada, que se lee como que la exportación falló.
        contexto["proyectos_exportables"] = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), self.request.user)
            .filter(is_active=True, observaciones__isnull=False)
            .distinct()
            .order_by("codigo")
        )

        # **Las cabeceras ya montadas, con su enlace y su flecha.** Se arman aquí y no en la
        # plantilla por dos cosas que la plantilla no puede hacer bien: decidir si el siguiente clic
        # invierte o empieza de nuevo —con dos sitios decidiéndolo, la flecha acaba diciendo una
        # cosa y la consulta otra— y buscar en un diccionario por una clave variable.
        columna, descendente, _campos = criterio(self.request.GET.get("orden"))

        # Todo menos el orden y la página: sin esto, ordenar por una columna se lleva por delante
        # el filtro que estaba puesto.
        resto = self.request.GET.copy()
        for fuera in ("orden", "page"):
            resto.pop(fuera, None)
        cola = f"&{resto.urlencode()}" if resto else ""

        # **Cuál de los tres filtros rápidos está puesto.** Se decide aquí y no en la plantilla:
        # allí habría que preguntar en cada uno por la ausencia de los otros dos, y esa condición se
        # queda mal el día que haya un cuarto.
        if self.request.GET.get("mias"):
            contexto["filtro_rapido"] = "mias"
        elif self.request.GET.get("abiertas"):
            contexto["filtro_rapido"] = "abiertas"
        else:
            contexto["filtro_rapido"] = "todas"

        # **El permiso, una vez para la lista entera y no una por fila.** `has_perm` consulta la
        # base la primera vez y luego cachea, así que treinta llamadas no son treinta consultas —
        # pero preguntarlo en la plantilla deja la decisión de qué se ofrece repartida en el HTML,
        # que es donde nadie la busca al revisar permisos.
        contexto["puede_responder"] = self.request.user.has_perm("documents.add_comentario")

        etiquetas = {
            "prioridad": _("Priority"),
            "hallazgo": _("Finding"),
            "obra": _("On"),
            "responsable": _("Owner"),
            "vence": _("Due"),
            "estado": _("State"),
        }
        contexto["columnas"] = [
            {
                "clave": clave,
                "texto": texto,
                "activa": clave == columna,
                "descendente": clave == columna and descendente,
                # Pinchar la columna que ya manda le da la vuelta; pinchar otra empieza ascendente.
                "enlace": (
                    f"?orden={'-' if clave == columna and not descendente else ''}{clave}{cola}"
                ),
            }
            for clave, texto in etiquetas.items()
            if clave in COLUMNAS
        ]
        contexto["orden_columna"] = columna
        contexto["orden_descendente"] = descendente

        # Y los valores por los que se puede filtrar, con lo que hay puesto ahora.
        #
        # **Se llama `filtro_actual` y no `filtros`** porque `FiltrosEnLaPaginacionMixin` ya usa
        # `filtros` para la cadena que conserva la paginación: pisarlo dejaba la lista perdiendo el
        # filtro al pasar de página, que es exactamente el defecto que ese mixin existe para evitar.
        contexto["filtro_actual"] = {
            "prioridad": self.request.GET.get("prioridad", ""),
            "estado": self.request.GET.get("estado", ""),
            "obra": self.request.GET.get("obra", ""),
        }
        contexto["prioridades"] = Observacion.PRIORIDADES
        contexto["estados"] = Observacion.STATUS_CHOICES
        contexto["obras"] = list(
            scope_queryset_to_organizacion(Proyecto.objects.all(), self.request.user)
            .filter(is_active=True, observaciones__isnull=False)
            .distinct()
            .order_by("codigo")
            .values_list("codigo", flat=True)
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
        # **El reparto: quien lo tiene, para cuando y cuanto corre** — `F12.10`. Sale relleno con
        # lo que ya lleva: en blanco, guardar sin mirar borraria el dueño y la fecha puestos.
        # Mismo permiso que cerrar (`change_observacion`), asi que se reusa la bandera.
        contexto["form_reparto"] = RepartoForm(instance=self.object)
        # **Las etiquetas, que es lo transversal** — `F10.1`. El formulario sale marcado con las
        # que ya lleva: un formulario en blanco haría que guardar sin mirar borrase las puestas.
        contexto["etiquetas"] = list(self.object.etiquetas.all())
        contexto["form_etiquetas"] = EtiquetasForm(
            proyecto=self.object.proyecto,
            initial={"etiquetas": contexto["etiquetas"]},
        )
        # Si la obra no definió vocabulario no hay nada que ofrecer, y una lista de casillas vacía
        # con un botón «Guardar» al lado es una pantalla que no hace nada.
        contexto["hay_etiquetas"] = bool(contexto["form_etiquetas"].fields["etiquetas"].queryset)
        return contexto


class ComentarObservacionView(ModelPermissionRequiredMixin, View):
    model = Comentario
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        observacion = observacion_visible(request, kwargs["pk"])
        # `request.FILES` hace falta desde `F12.11`: sin él el adjunto no llega y el formulario
        # valida igual, o sea que la imagen se perdería en silencio.
        form = ComentarioForm(request.POST, request.FILES)
        if form.is_valid():
            # **La imagen se guarda antes que el comentario, al contrario que la instantánea del
            # visor**, y la diferencia es quién eligió el archivo. Ahí lo genera el programa, así
            # que si falla se guarda el hallazgo sin foto; aquí lo eligió una persona a mano, y
            # guardar su comentario sin la imagen que adjuntó sería decirle que salió bien.
            try:
                clave = self._guardar_imagen(request, observacion, form.cleaned_data.get("imagen"))
            except adjunto.AdjuntoRechazado as rechazo:
                messages.error(request, rechazo.mensaje)
                return redirect("documents:observacion", pk=observacion.pk)

            comentario = Comentario.objects.create(
                observacion=observacion,
                autor=request.user,
                texto=form.cleaned_data["texto"],
                imagen=clave,
            )
            # Responder deja la observación **respondida**, no cerrada: cerrar es del que
            # la abrió.
            if observacion.estado == Observacion.ABIERTA:
                observacion.estado = Observacion.RESPONDIDA
                observacion.save(update_fields=["estado", "updated_at"])
            set_audit_context(request, comentario, action="comentar_observacion")

            # **El aviso del hilo, que era el que faltaba.** Un hallazgo se abre y se avisa, se
            # reparte y se avisa, y **se contestaba sin avisar a nadie**: quien lo había abierto no
            # se enteraba hasta volver a entrar, o sea hasta la siguiente reunión de coordinación —
            # que es exactamente lo que el hilo existe para evitar.
            #
            # **Va después de guardar y no puede tumbar lo guardado.** Con el SMTP caído, un
            # `send_mail` sin guarda deja un 500 con el comentario ya escrito: la persona lo
            # reintenta y lo duplica. Lo que se pierde aquí es el aviso, no el comentario, y se
            # dice en la pantalla en vez de callarlo.
            try:
                avisados = avisar_comentario(comentario)
            except Exception:
                logger.exception("aviso_de_comentario_fallo")
                messages.warning(
                    request,
                    _("Your reply was saved, but the notification could not be sent."),
                )
            else:
                if not avisados:
                    messages.warning(
                        request,
                        _("Reply saved. Nobody was notified: there is no other email on this one."),
                    )
        else:
            messages.error(request, _("The comment cannot be empty."))
        return redirect("documents:observacion", pk=observacion.pk)

    @staticmethod
    def _guardar_imagen(request, observacion, archivo) -> str:
        """Escribe el adjunto y devuelve su clave, o `""` si no se adjuntó ninguno.

        **Va al mismo almacén que los documentos**, con la clave construida a partir del proyecto,
        del código del entregable y del sha256 — nunca con un nombre que venga de fuera. El sha256
        hace además que la misma captura pegada dos veces no duplique el archivo.
        """
        if archivo is None:
            return ""

        contenido, extension, sha = adjunto.leer(archivo)
        # Una observación puede no tener revisión —las hay sobre el proyecto—, así que el código del
        # entregable puede faltar. La clave se construye igual: lo que la hace única es el sha.
        entregable = getattr(getattr(observacion, "revision", None), "entregable", None)
        try:
            clave = storage.clave_para(
                proyecto_codigo=observacion.proyecto.codigo,
                entregable_codigo=getattr(entregable, "codigo", "") or "comentarios",
                sha256=sha,
                extension=extension,
            )
            storage.guardar(clave, contenido)
        except (storage.CargaRechazada, OSError) as error:
            raise adjunto.AdjuntoRechazado(
                _("The image could not be saved. Try again."), "no-se-pudo-guardar"
            ) from error
        return clave


class ImagenDeComentarioView(ModelViewPermissionRequiredMixin, View):
    """Sirve la imagen adjunta a un comentario. `F12.11`.

    **Existe porque la imagen no se puede servir como estática.** Vive en el almacén de documentos,
    que está fuera del repositorio y fuera de lo que sirve el servidor web a cualquiera — y tiene
    que seguir estando fuera: es dato de obra. Así que pasa por una vista, y la vista comprueba.

    **Lo que comprueba es el acceso a la observación, no a la imagen.** Una clave de almacenamiento
    es adivinable si alguien conoce un sha256; lo que no es adivinable es el permiso. Se acota por
    organización a través de la observación, que es quien la lleva — el mismo camino que la descarga
    de una revisión.

    **Y ese acotado estaba escrito mal.** Decía `Observacion.objects.filter(pk=…).exists()`, con un
    comentario que afirmaba que «`Observacion` pasa por `scope_queryset_to_organizacion`, así que un
    id de otra organización no existe». Era falso: `.objects` es el manager normal de Django —quien
    acota es la **vista**, no el modelo— así que esa línea comprobaba que la fila existiera, que es
    justo lo que ya se sabía. Medido en `tests/test_no_se_cruzan_las_organizaciones.py`: la foto de
    obra adjunta a un hallazgo ajeno salía con **200**.

    **Y el permiso es `view_observacion`, no `view_comentario`**, aunque lo que se sirve cuelgue de
    un comentario. El motivo lo enseñó una prueba: la ficha del hallazgo dibuja el hilo entero a
    quien puede ver la observación, sin pedir `view_comentario` por separado. Con el permiso más
    estricto aquí, esa misma persona vería el hilo con **las imágenes roras** — una vista más
    severa que la pantalla que la usa no protege nada, solo rompe la pantalla.
    """

    model = Observacion

    def get(self, request, *args, **kwargs):
        comentario = get_object_or_404(
            Comentario.objects.select_related("observacion"), pk=kwargs["pk"]
        )
        if not comentario.imagen:
            raise Http404
        # El acotado por organización va por la observación, que es quien lleva el campo — y por eso
        # aquí sí sirve `scope_queryset_to_organizacion`: el ayudante devuelve intacto lo que no lo
        # lleva, y `Observacion` lo lleva. Es la línea que antes no acotaba nada.
        visibles = scope_queryset_to_organizacion(Observacion.objects.all(), request.user)
        if not visibles.filter(pk=comentario.observacion_id).exists():
            raise Http404

        try:
            archivo = storage.abrir(comentario.imagen)
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        # **En línea y no como descarga**: el punto de la imagen es verla en el hilo. Y con su tipo
        # declarado por la extensión de la clave, que la construimos nosotros — no por nada que
        # viniera en la petición.
        #
        # **El archivo abierto y no sus bytes**, igual que la descarga de una revisión: una imagen
        # llega hasta 8 MB, y con nueve workers eso son 72 MB de memoria que no hacen falta. Aquí no
        # hay `filename` que perder, así que la trampa del `set_headers` no aplica — pero conviene
        # que las dos descargas se sirvan igual, para que la próxima se copie de la buena.
        extension = storage.extension_de(comentario.imagen)
        return FileResponse(
            archivo,
            content_type="image/png" if extension == "png" else "image/jpeg",
        )


class EtiquetarObservacionView(ModelPermissionRequiredMixin, View):
    """Poner y quitar etiquetas a un hallazgo. `F10.1`.

    **Pide `change_observacion` y no `add_etiqueta`**, y la diferencia importa: esto no crea
    vocabulario —el vocabulario lo define el proyecto— sino que **cambia este hallazgo**. Quien
    coordina puede clasificar lo que ve sin poder inventar etiquetas nuevas, que es justo lo que
    evita que el vocabulario se fragmente por el camino.

    Y el formulario acota las opciones al proyecto del hallazgo, así que una etiqueta de otra obra
    mandada a mano no pasa la validación: se descarta y las demás se guardan.
    """

    model = Observacion
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        observacion = observacion_visible(request, kwargs["pk"])
        form = EtiquetasForm(request.POST, proyecto=observacion.proyecto)
        if not form.is_valid():
            messages.error(request, _("Those tags do not belong to this project."))
            return redirect("documents:observacion", pk=observacion.pk)

        observacion.etiquetas.set(form.cleaned_data["etiquetas"])
        set_audit_context(request, observacion, action="etiquetar_observacion")
        messages.success(request, _("Tags saved."))
        return redirect("documents:observacion", pk=observacion.pk)


class RepartirObservacionView(ModelPermissionRequiredMixin, View):
    """Cambiar dueño, fecha y prioridad de un hallazgo ya abierto: `F12.10`.

    **Es lo que convierte una nota en una tarea de alguien.** Una nota del visor nace con el autor
    como responsable y sin fecha; hasta hoy no habia forma de repartirla, asi que no aparecia en la
    bandeja de nadie ni en el resumen por correo.

    Se registra en la auditoria con **quien la tenia antes**: repartir es una decision de
    coordinacion, y dentro de un mes «¿por que es mia?» se contesta mirando la traza.
    """

    model = Observacion
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        observacion = observacion_visible(request, kwargs["pk"])
        # Quien la tenia, leido **antes** de que el formulario la modifique: `form.save()` escribe
        # sobre la misma instancia, asi que despues ya no se puede saber de donde venia.
        antes = observacion.responsable

        form = RepartoForm(request.POST, instance=observacion)
        if not form.is_valid():
            # El motivo se le enseña a quien reparte: es lo que le dice que arreglar. Se junta en
            # una linea porque el mensaje de Django no lleva formulario de vuelta.
            messages.error(request, "; ".join(form.errors.as_text().splitlines()).strip("; *"))
            return redirect("documents:observacion", pk=observacion.pk)

        form.save()
        set_audit_context(
            request,
            observacion,
            action="repartir_observacion",
            metadata={
                "antes": antes.get_username() if antes else "",
                "ahora": (
                    observacion.responsable.get_username() if observacion.responsable else ""
                ),
                "vence": observacion.vence.isoformat() if observacion.vence else "",
                "prioridad": observacion.prioridad,
            },
        )

        # **El aviso dice a quien le toca, y no solo que se guardo.** Repartir sin avisar deja al
        # nuevo dueño sin saberlo hasta el resumen del dia siguiente.
        if observacion.responsable is not None and observacion.responsable != antes:
            avisar_asignacion(observacion)
            messages.success(
                request,
                _("Assigned to %(quien)s.") % {"quien": observacion.responsable.get_username()},
            )
        else:
            messages.success(request, _("Observation updated."))
        return redirect("documents:observacion", pk=observacion.pk)


class CerrarObservacionView(ModelPermissionRequiredMixin, View):
    model = Observacion
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        observacion = observacion_visible(request, kwargs["pk"])
        form = CierreForm(request.POST)
        if not form.is_valid():
            messages.error(request, _("An observation is not closed without saying how."))
            return redirect("documents:observacion", pk=observacion.pk)

        observacion.cerrar(request.user, form.cleaned_data["resolucion"])
        set_audit_context(request, observacion, action="cerrar_observacion")
        messages.success(request, _("Observation closed."))
        return redirect("documents:observacion", pk=observacion.pk)


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

    def _forma_pedida(self, request) -> dict:
        """La forma de la marca (`?forma=…&x2=…&y2=…`), o `{}` si no es valida o esta incompleta."""
        forma = request.GET.get("forma")
        if forma not in {valor for valor, _texto in Observacion.FORMAS}:
            return {}
        try:
            x2 = float(request.GET.get("x2", ""))
            y2 = float(request.GET.get("y2", ""))
        except ValueError:
            return {}
        return {"ancla_forma": forma, "ancla_x2": x2, "ancla_y2": y2}

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
        # **La forma de la marca** (`F15.2`): `?forma=nube&x2=0.6&y2=0.4`. Mismo trato que el
        # resto: se pasa como valor inicial y el formulario decide. Una forma desconocida, o a la
        # que le falta una esquina, se ignora **entera**: la segunda esquina suelta sería una
        # marca de dos puntos que nadie definió.
        inicial.update(self._forma_pedida(request))
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


class RevisarInterferenciasView(ModelPermissionRequiredMixin, View):
    """Revisa las interferencias de la obra y abre las nuevas como observaciones. `F5.1`–`F5.5`.

    **No tiene pantalla propia a propósito, y eso es lo mejor que tiene.** El resultado cae donde ya
    vive la coordinación: las observaciones nuevas aparecen en el bloque de abiertas por prioridad
    de la propia pantalla del proyecto, y desde ahí el visor ya sabe abrirlas —aislando los dos
    elementos y dibujando el segmento entre ellos—. Una pantalla de resultados aparte sería una
    lista más que hay que sincronizar con el estado de las observaciones.

    **Pide `add_observacion`** porque es exactamente lo que hace: abrir observaciones. No un permiso
    nuevo — un rol que puede abrir un hallazgo a mano puede mandar buscarlos.

    **Y la petición espera, pero solo si cabe.** Son 20 s medidos **por par**, y la corrida hace
    todos los pares: con cuatro modelos son seis, o sea 120 s — justo el `timeout` de gunicorn. El
    worker moría al borde, y lo que quedaba no era un error limpio: **las observaciones de los
    primeros pares ya estaban escritas**, así que la pantalla daba un 502 y aun así aparecían
    hallazgos nuevos.

    Ahora se mide antes de empezar y, si no cabe, **no arranca**: se dice cuántos pares son y se
    manda al comando de gestión, que corre fuera de la petición y no tiene tope. Negarse antes es
    mejor que morir a mitad. Ver `apps/documents/revisar.py`.
    """

    model = Observacion
    permission_action = "add"

    def post(self, request, *args, **kwargs):
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.documents.interferencias import GrupoVacio
        from apps.documents.revisar import (
            cabe_en_una_peticion,
            corrida_en_curso,
            cuantos_pares,
            lanzar_en_segundo_plano,
            modelos_vigentes,
            revisar_proyecto,
            segundos_estimados,
        )
        from apps.projects.models import Proyecto

        proyecto = (
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user)
            .filter(pk=kwargs["pk"])
            .first()
        )
        if proyecto is None:
            raise Http404

        # **Una a la vez por obra.** Dos corridas simultáneas sobre los mismos modelos abrirían el
        # mismo problema dos veces: cada una comprueba «¿ya existe?» antes de que la otra escriba.
        en_curso = corrida_en_curso(proyecto)
        if en_curso is not None:
            messages.info(
                request,
                _(
                    "A clash review of this project is already running, since %(hora)s. The bell "
                    "will tell you when it finishes."
                )
                % {"hora": timezone.localtime(en_curso.started_at).strftime("%H:%M")},
            )
            return redirect("projects:proyecto", pk=proyecto.pk)

        # **Se mide antes de empezar.** Contar los modelos vigentes es una consulta; la alternativa
        # era descubrirlo a los dos minutos con un `SIGKILL` y media corrida escrita.
        cuantos = len(modelos_vigentes(proyecto))
        pares = cuantos_pares(cuantos)
        if not cabe_en_una_peticion(pares):
            # **Lo que no cabe se lanza aparte, en vez de negarse** (2026-09-28). Antes se negaba y
            # mandaba a `detectar_interferencias`, que cruza **un par** de revisiones por sus UUID:
            # con los modelos de un metro eran quince comandos a mano, o sea que no se hacía.
            #
            # **Y con un cerrojo de dos minutos**, porque la fila de `JobRun` la crea el proceso al
            # arrancar, un par de segundos después: sin esto, un doble clic lanzaba dos. `add` es
            # atómico en la caché compartida —la misma que ya sujeta el límite del token—.
            from django.core.cache import cache

            if not cache.add(f"revisar_obra:{proyecto.pk}", request.user.pk, timeout=120):
                messages.info(
                    request,
                    _(
                        "A clash review of this project was just started. The bell will tell "
                        "you when it finishes."
                    ),
                )
                return redirect("projects:proyecto", pk=proyecto.pk)
            lanzar_en_segundo_plano(proyecto, request.user)
            messages.success(
                request,
                _(
                    "Started in the background: %(models)s current models, %(pairs)s comparisons, "
                    "about %(minutes)s minutes. You can keep working; the bell will tell you when "
                    "it finishes, and the new findings will be in the open observations."
                )
                % {
                    "models": cuantos,
                    "pairs": pares,
                    "minutes": max(1, round(segundos_estimados(pares) / 60)),
                },
            )
            return redirect("projects:proyecto", pk=proyecto.pk)

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
