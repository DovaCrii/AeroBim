"""Las pantallas del registro documental.

**El expediente es la idea que ordena esto.** Copiado del `dossier.py` de AeroControl:
una pantalla que contesta *«¿esto está completo y documentado?»* nombrando cada fila que
falta con el atajo que la cierra — y **omitiendo los botones que el usuario no puede
ejecutar**, porque ofrecer un botón que termina en 403 es peor que no ofrecerlo: enseña
a probar puertas.
"""

import hashlib
import logging
import uuid
from io import BytesIO

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
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
from apps.documents import adjunto, conversion, storage
from apps.documents.abribles import RUTA_POR_VISOR, visor_de
from apps.documents.bcf import exportar as exportar_bcf
from apps.documents.forms import (
    ActividadForm,
    CierreForm,
    ComentarioForm,
    EntregableForm,
    EtiquetasForm,
    IdoneidadForm,
    ObservacionForm,
    RepartoForm,
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
from apps.documents.notify import avisar_asignacion, avisar_comentario, avisar_transmittal
from apps.projects.models import Proyecto

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


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


def observacion_visible(request, pk) -> Observacion:
    """La observación, **o 404 si es de otra organización**. Levanta `Http404`, como su nombre pide.

    ## Por qué esto existe en vez de `get_object_or_404(Observacion, pk=…)`

    Siete vistas usaban esa segunda forma. `ModelPermissionRequiredMixin` comprueba el **permiso** y
    nada más: `change_observacion` dice que esta persona puede cerrar hallazgos, no *cuáles*. Sin
    acotar, el `pk` de la URL alcanzaba cualquier fila de la tabla.

    **Medido antes de escribir esto** (`tests/test_no_se_cruzan_las_organizaciones.py`), con una
    cuenta de una organización actuando sobre un hallazgo de otra:

    | | |
    | --- | --- |
    | comentar | **escribió** en el hilo ajeno, y de paso lo pasó a «respondida» |
    | cerrar | **cerró** el hallazgo ajeno |
    | cambiar idoneidad | **aprobó** un documento de obra ajeno, de `A` a `B` |
    | repartir, etiquetar | 302 sin efecto: el formulario rechaza un valor de fuera de la obra |

    Los dos últimos no escribían **por casualidad**: lo impide la validación del formulario, que
    está ahí por otro motivo. Pasan por aquí igual — un acotado que depende de que otro control no
    cambie no es un acotado.

    `Observacion` **sí** lleva el campo `organizacion`, así que aquí el ayudante genérico sirve; es
    `Revision` y `Comentario` los que no, y por eso tienen su propio camino.
    """
    return get_object_or_404(
        scope_queryset_to_organizacion(Observacion.objects.all(), request.user), pk=pk
    )


class ArchivosView(ModelViewPermissionRequiredMixin, FiltrosEnLaPaginacionMixin, ListView):
    """**El repositorio: todo lo que está guardado en el servidor, por categoría.**

    ## Por qué existe

    Todo lo que enseña esta pantalla ya estaba guardado desde el primer día. Un IFC, un COPC, un
    DXF o un PDF subidos como revisión viven en `/var/lib/aerobim/documentos`, con su sha256, y el
    visor los abre desde «Del registro». Lo que no existía era **un sitio donde verlos todos**.

    El usuario lo dijo entero, y merece quedar escrito porque explica qué hace esta pantalla y qué
    no: «si no queda en el servidor no es solo un visor; debe almacenar la nube o el modelo, así ir
    teniendo un repositorio para ir abriendo, linkeando o revisando, pero que se busque del panel
    lateral, es lo más práctico».

    La necesidad era real y **media premisa era falsa**: sí queda en el servidor. Lo que no se
    podía era encontrarlo — para llegar a un archivo había que saber de qué entregable colgaba, y
    eso es precisamente lo que no sabe quien lo busca.

    ## Qué NO es

    **No es un sitio donde soltar archivos sueltos.** Todo lo que sale aquí llegó como revisión de
    un entregable, con su emisor, su fecha y su código de idoneidad — que es lo que separa un
    registro documental de una carpeta compartida, y lo que AeroBim existe para sostener. Esta
    pantalla es **otra forma de mirar lo mismo**, no otro almacén.

    Por eso el botón de subir lleva al camino de siempre en vez de abrir un formulario propio: dos
    puertas al mismo almacén se separan en cuanto una de las dos olvide pedir algo.

    ## Solo la revisión vigente de cada entregable

    Un entregable con seis revisiones tiene seis archivos guardados, y las cinco viejas **son
    historia, no repositorio**: quien busca «el modelo de estructura» quiere el vigente. Las
    anteriores siguen en el expediente del entregable, que es donde se consulta la historia.
    """

    template_name = "documents/archivos.html"
    context_object_name = "archivos"
    model = Revision
    paginate_by = 60

    def get_queryset(self):
        from apps.documents.categorias import categoria_de

        # **La misma consulta acotada que alimenta al visor.** `Revision` no lleva el campo
        # `organizacion` —cuelga de su entregable— así que `scope_queryset_to_organizacion` la
        # devolvería intacta: `revisiones_visibles` es la que sí acota, y `solo_publicadas` es la
        # que impide que un mandante vea lo que está en curso.
        consulta = solo_publicadas(revisiones_visibles(self.request.user), self.request.user)
        consulta = (
            consulta.select_related("entregable__proyecto", "entregable__disciplina", "subida_por")
            # **La precarga no es opcional aqui.** `revision_vigente()` recorre `entregable
            # .revisiones.all()`, asi que sin esto cada fila abre su propia consulta: sesenta
            # archivos son sesenta viajes a la base. Es el mismo defecto que ya se midio en el
            # listado de entregables —71 consultas para veinte filas— y su mismo arreglo.
            .prefetch_related("entregable__revisiones")
            .order_by("-emitida_en")
        )

        # **La vigente de cada entregable, resuelta en Python y no en SQL.** «Vigente» lo decide
        # `Entregable.revision_vigente`, que ordena por correlativo con su propia regla —no es el
        # máximo alfabético ni la más reciente—, y reescribir esa regla aquí en un `DISTINCT ON`
        # sería tenerla en dos sitios: el día que cambie, esta pantalla enseñaría otra cosa que el
        # expediente. Con las decenas de revisiones de un piloto, la lista cabe holgada en memoria.
        vigentes = []
        vistos = set()
        for revision in consulta:
            if revision.entregable_id in vistos:
                continue
            vigente = revision.entregable.revision_vigente
            if vigente is None or vigente.pk != revision.pk:
                continue
            vistos.add(revision.entregable_id)
            revision.categoria = categoria_de(revision)
            # **`visor_ruta` y no el visor a secas**, que es lo que ya usan el expediente y la
            # pantalla de la obra: la plantilla necesita el **nombre de la ruta** para `{% url %}`,
            # y elegirlo en el HTML con un `if` obligaría a repetir esa elección en cada pantalla
            # que enlace al visor. Son tres ya.
            revision.visor_ruta = RUTA_POR_VISOR.get(visor_de(revision) or "")
            vigentes.append(revision)

        cual = self.request.GET.get("categoria")
        if cual:
            vigentes = [r for r in vigentes if r.categoria == cual]
        return vigentes

    def get_context_data(self, **kwargs):
        from apps.documents.categorias import ICONOS, NOMBRES, ORDEN, categoria_de

        contexto = super().get_context_data(**kwargs)

        # Las cuentas se hacen sobre **todas** las vigentes, no sobre la página ni sobre lo
        # filtrado: un contador que cambia al pulsar el filtro no cuenta nada.
        todas = solo_publicadas(revisiones_visibles(self.request.user), self.request.user)
        cuantas: dict[str, int] = {}
        for revision in todas.select_related("entregable").prefetch_related(
            "entregable__revisiones"
        ):
            vigente = revision.entregable.revision_vigente
            if vigente is not None and vigente.pk == revision.pk:
                clave = categoria_de(revision)
                cuantas[clave] = cuantas.get(clave, 0) + 1

        activa = self.request.GET.get("categoria") or ""
        contexto["categorias"] = [
            {
                "clave": clave,
                "nombre": NOMBRES[clave],
                "icono": ICONOS[clave],
                "cuantas": cuantas.get(clave, 0),
                "activa": activa == clave,
            }
            for clave in ORDEN
        ]
        contexto["categoria_activa"] = activa
        contexto["hay_archivos"] = sum(cuantas.values())

        # **Partido por obra, y solo si hay más de una.** Con sesenta archivos de cuatro obras
        # ordenados por fecha, el repositorio deja de servir para lo único que sirve: encontrar
        # algo. Con una sola obra, un grupo plegable es un clic de más y un título que repite lo
        # que ya dice la página.
        from apps.documents.por_obra import por_obra

        grupos = por_obra(contexto["archivos"], lambda r: r.entregable.proyecto)
        contexto["grupos"] = grupos if len(grupos) > 1 else []
        contexto["puede_subir"] = self.request.user.has_perm("documents.add_revision")
        # ══════════════════════════════════════════════════════════════════════════════════
        #   **El mismo permiso que pide la puerta, y este ya se escribió mal una vez.**
        #
        #   La primera versión de esta línea comprobaba `change_revision`, que es la **regla**
        #   —compartir hacia fuera no es leer, y con el permiso de lectura hasta el mandante
        #   podría publicar el modelo—. Pero `EnlacesDeRevisionView` la **implementa** con
        #   `add_enlacecompartido`, y las dos cosas pueden separarse: a quien tuviera una y no
        #   la otra, la fila le ofrecía un enlace que terminaba en 403.
        #
        #   Es exactamente lo que la regla de la casa prohíbe —ofrecer una puerta que no abre
        #   enseña a probar puertas— y lo encontró la prueba de punta a punta, no leerlo: mi
        #   propia fixture daba `change_revision` y el POST contestaba 403.
        #
        #   La lección, que vale para la siguiente pantalla que ofrezca una acción: **se
        #   comprueba el permiso que exige la vista de destino**, no el que uno cree que
        #   debería exigir.
        # ══════════════════════════════════════════════════════════════════════════════════
        contexto["puede_compartir"] = self.request.user.has_perm("documents.add_enlacecompartido")
        return contexto


class EmpezarASubirView(ModelPermissionRequiredMixin, View):
    """**Subir un archivo al registro sin haber montado antes el andamio.**

    El camino era: crear la obra, abrirla, añadir una disciplina, volver a Entregables, Nuevo
    entregable, rellenar siete campos, entrar al expediente y Subir revisión. **Ocho pantallas**
    para poner un archivo en el servidor, y las cinco primeras son andamio — cosas que el registro
    necesita y que quien tiene una nube en el escritorio no sabe que hay que crear.

    **No crea un almacén paralelo**: sigue habiendo un entregable con su obra, su disciplina y su
    código, y una revisión con su emisor y su idoneidad. Lo que cambia es cuándo se rellena.

    **Y no guarda el archivo.** Crea lo que falta y manda a `SubirRevisionView`, que es donde está
    la parte delicada —la clave por `sha256`, el guardado por tramos, los metadatos del IFC, la
    conversión de DWG—. El porqué largo está en `apps/documents/empezar.py`.

    Pide `add_revision` y no `add_entregable`: lo que se viene a hacer aquí es **subir**, y crear el
    entregable es el medio. Quien puede emitir puede crear el sitio donde emitir.
    """

    model = Revision
    permission_action = "add"
    template_name = "documents/empezar_a_subir.html"

    def contexto(self, request, form=None):
        from apps.documents.empezar import EmpezarASubirForm

        form = form or EmpezarASubirForm(autor=request.user)
        return {
            "form": form,
            "hay_proyectos": form.fields["proyecto"].queryset.exists(),
            "puede_crear_proyecto": request.user.has_perm("projects.add_proyecto"),
        }

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, self.contexto(request))

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        from apps.documents.empezar import EmpezarASubirForm

        form = EmpezarASubirForm(request.POST, autor=request.user)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, form), status=400)

        entregable = form.crear(autor=request.user)
        set_audit_context(request, entregable, action="crear_entregable_para_subir")
        messages.success(
            request,
            _("«%(codigo)s» created. Now the file.") % {"codigo": entregable.codigo},
        )
        # **Al formulario de subir, que es a lo que venía.** Terminar en el expediente dejaría a
        # alguien mirando una ficha vacía con el archivo todavía en el escritorio.
        return redirect("documents:subir-revision", pk=entregable.pk)


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
        # **El entregable entra en el formulario para validar, no para guardar.** Sin él,
        # `clean_correlativo` no puede saber si el correlativo está tomado, y el choque no aparecía
        # hasta el `INSERT` —con el archivo ya en disco y el conversor ya ejecutado—.
        form = RevisionForm(request.POST, request.FILES, entregable=entregable)
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
        # **Se copia del archivo subido al disco, sin pasar por una variable.** Esto era
        # `storage.guardar(clave, form.contenido)` con los 200 MB en memoria; ahora va por tramos y
        # de una sola pieza —temporal más `os.replace`—, porque la clave lleva el `sha256` y un
        # archivo truncado con el nombre del completo no lo detecta nadie nunca.
        storage.guardar_subida(clave, form.cleaned_data["archivo"])

        revision = form.save(commit=False)
        revision.entregable = entregable
        revision.subida_por = request.user
        revision.clave_archivo = clave
        # El nombre que traía se guarda **en la base de datos**, no en el disco.
        revision.nombre_original = form.cleaned_data["archivo"].name[:250]
        revision.tamano_bytes = form.tamano
        revision.sha256 = form.sha256
        # **Lo que el IFC declara se lee al subirlo** (`F3.3`), y solo si es un IFC. Medido: 1,1 s
        # para el modelo real de 23,6 MB, así que no hace falta un trabajo en segundo plano para el
        # tamaño que recibe un control documental. Si algún día llega un federado que tarde, esto es
        # lo que se mueve a `JobRun`, y el campo ya está.
        if storage.extension_de(revision.nombre_original) == "ifc":
            revision.metadatos = extraer_ifc(storage.ruta_de(clave))

        # **Un DWG o un DGN se convierte a DXF al entrar**, que es la decision de
        # `docs/FORMATOS.md`: lo que entra al expediente se normaliza al entrar, y el visor lee un
        # solo formato 2D.
        #
        # **Y si no se puede, la subida no se pierde**: el original es el entregable y el DXF es
        # una comodidad. Se guarda el motivo para poder decirselo a quien subio.
        extension = storage.extension_de(revision.nombre_original)
        if conversion.se_puede_convertir(extension):
            # **Los bytes salen del archivo ya guardado y no del formulario.** El conversor los
            # necesita enteros —le pasa el contenido a un ejecutable— así que aquí no hay nada que
            # ahorrar; lo que sí se evita es tenerlos en memoria durante **toda** la subida cuando
            # el archivo no es convertible, que es el caso normal. Y un DWG o un DGN son planos:
            # órdenes de magnitud por debajo del IFC federado que motivó todo esto.
            dxf, motivo = conversion.dxf_para(storage.leer(clave), extension)
            if dxf is None:
                revision.motivo_sin_dxf = motivo[:300]
            else:
                clave_dxf = storage.clave_para(
                    proyecto_codigo=entregable.proyecto.codigo,
                    entregable_codigo=entregable.codigo,
                    # El sha del **DXF**, no el del original: son dos archivos distintos y cada uno
                    # se guarda bajo el suyo. Con el del original, volver a subir el mismo DWG
                    # sobrescribiria un DXF que podria venir de otra version del conversor.
                    sha256=hashlib.sha256(dxf).hexdigest(),
                    extension="dxf",
                )
                storage.guardar(clave_dxf, dxf)
                revision.clave_dxf = clave_dxf

        try:
            # **El `atomic` no es decoración: sin él esto no se puede ni probar.**
            #
            # Un `IntegrityError` deja la transacción en curso marcada como rota, y toda consulta
            # posterior lanza `TransactionManagementError` — o sea que atraparlo y dibujar el
            # formulario falla al primer `SELECT` de la plantilla. En producción no hay transacción
            # por petición y se colaba; dentro de una prueba, que sí la tiene, revienta.
            #
            # Con el bloque, el fallo solo deshace su punto de retorno y lo de fuera sigue vivo.
            with transaction.atomic():
                revision.save()
        except IntegrityError:
            # **La carrera que el formulario no puede cerrar.** `clean_correlativo` mira la base y
            # dos subidas simultáneas del mismo correlativo pasan las dos esa mirada; la única
            # comprobación que no se puede adelantar es la de la propia base.
            #
            # No deja nada roto: la clave del archivo es su `sha256`, así que lo que quedó en disco
            # es un blob sin fila que la subida siguiente de los mismos bytes reutiliza. Lo que
            # cambia es que quien sube ve su formulario con el motivo, y no una página de error.
            form.add_error(
                "correlativo",
                _("Somebody else just uploaded that correlative. Use another one."),
            )
            return render(
                request, self.template_name, {"entregable": entregable, "form": form}, status=409
            )

        set_audit_context(request, revision, action="subir_revision")
        messages.success(
            request,
            _("Revision %(rev)s uploaded (%(kb)s KB).")
            % {"rev": revision.correlativo, "kb": form.tamano // 1024},
        )
        return redirect("documents:expediente", pk=entregable.pk)


class DescargarRevisionView(ModelViewPermissionRequiredMixin, View):
    """Los bytes de una revisión, **acotados por organización de verdad**.

    ## Lo que había aquí, y por qué no protegía nada

    Esta vista acotaba así, con el comentario «el acotado por organización va por el entregable»:

    ```python
    if not Entregable.objects.filter(pk=revision.entregable_id).exists():
        raise Http404
    ```

    `Entregable.objects` es el manager normal de Django —`BaseModel` no declara ninguno propio—, así
    que esa línea pregunta «¿existe?», nunca «¿puede verlo esta persona?». Para un entregable que se
    acaba de leer por su clave ajena, **la respuesta es siempre sí**.

    **Medido, no leído** (`tests/test_no_se_cruzan_las_organizaciones.py`): una cuenta de la
    organización A con `view_revision` se descargaba el plano de la organización B sabiendo su UUID
    — y ese UUID viaja en los enlaces de los correos de transmittal. **200, con el archivo dentro.**

    Ahora pasa por `revisiones_visibles`, que ya existía a treinta líneas de aquí y lleva la regla
    escrita: filtra por `entregable__organizacion_id` porque sabe que `Revision` **no lleva el
    campo** y que `scope_queryset_to_organizacion` devuelve intacto lo que no lo lleva. Su propio
    docstring lo dice —«confiar en él dejaría el hueco abierto»— y el hueco estaba aquí.
    """

    model = Revision

    def get(self, request, *args, **kwargs):
        revision = get_object_or_404(revisiones_visibles(request.user), pk=kwargs["pk"])
        try:
            archivo = storage.abrir(revision.clave_archivo)
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        # **El archivo abierto, y no sus bytes.** Esto era `BytesIO(storage.leer(...))`, o sea que
        # **un IFC de 200 MB se materializaba entero en memoria para servirlo**; con nueve workers,
        # tres descargas grandes a la vez son uno o dos gigas de RSS y el OOM killer. `FileResponse`
        # sobre un archivo lo manda por tramos.
        #
        # **Lo que no cambia es por qué no un iterador**, que es la trampa que ya costó una vez:
        # `FileResponse` solo llama a `set_headers` cuando el contenido tiene `read`, así que con
        # `iter([bytes])` se tragaba `as_attachment` y `filename` **sin avisar**. Un archivo abierto
        # sí tiene `read`, así que cumple las dos cosas a la vez.
        return FileResponse(
            archivo,
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
            .filter(observaciones__isnull=False)
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
            .filter(observaciones__isnull=False)
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
        from apps.documents.por_obra import por_obra

        contexto = super().get_context_data(**kwargs)
        contexto["puede_crear"] = self.request.user.has_perm("documents.add_transmittal")
        # Partido por obra igual que el repositorio, y solo si hay más de una: un transmittal
        # pertenece a una obra y se busca por obra — «¿qué le mandamos al mandante del 716?».
        grupos = por_obra(contexto["transmittals"], lambda t: t.proyecto)
        contexto["grupos"] = grupos if len(grupos) > 1 else []
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
    """Lo que le toca a quien está mirando. **Es la pantalla que se abre cada mañana.**

    Se llama **«Todo lo pendiente»** desde el 2026-09-07, porque la portada pasó a llamarse «Mi
    trabajo» (`F12.7`): dos pantallas «mías» con nombres parecidos son dos sitios donde buscar lo
    mismo. La portada trae lo que arde —vencido y esta semana— y esta trae el mes entero.

    Y tiene **dos vistas de los mismos datos**: lista por tramo de fecha, y tablero por punto del
    trabajo. No son dos consultas: las dos salen de `pendientes_por_tramo`, y hay una prueba que
    exige que el conjunto de tareas sea idéntico — dos vistas que discrepan sobre qué está pendiente
    valen menos que una.
    """

    model = Observacion
    template_name = "documents/bandeja.html"

    #: Las vistas que existen. **Un valor que no esté aquí cae a la lista en silencio**, que es la
    #: misma regla que `orden.criterio`: una URL compartida por correo con un parámetro viejo tiene
    #: que seguir abriendo la pantalla, no dar un error.
    VISTAS = ("lista", "tablero")

    def get_context_data(self, **kwargs):
        from apps.documents.notify import TRAMOS, pendientes_por_tramo
        from apps.documents.tareas import COLUMNAS, como_tareas

        contexto = super().get_context_data(**kwargs)
        tramos = pendientes_por_tramo(self.request.user)

        pedida = self.request.GET.get("vista", "")
        contexto["vista"] = pedida if pedida in self.VISTAS else "lista"
        contexto["vistas"] = self.VISTAS

        # La etiqueta se arma acá y no en la plantilla: un diccionario recorrido en una
        # plantilla de Django no puede traducir su clave.
        #
        # **Y sale de `TRAMOS`, no escrita a mano.** Estaban los cuatro nombres enumerados aquí, y
        # el día que se añadió un quinto tramo esta pantalla **dejó de pintarlo en silencio**: la
        # consulta lo traía y la lista no lo nombraba. Con la suite entera en verde, porque ninguna
        # prueba tenía una tarea a más de treinta días. Es el mismo defecto que este bloque venía a
        # arreglar, un piso más arriba.
        contexto["tramos_etiquetados"] = [
            # Se pasa quién mira: las acciones de una fila dependen de sus permisos.
            (etiqueta, como_tareas(tramos[nombre], self.request.user), nombre == "vencido")
            for _d, _h, nombre, etiqueta in TRAMOS
        ]
        # **Los mismos tramos con su clave**, que es lo que necesita el resumen de arriba para
        # enlazar a cada sección. Se construye **de la lista de arriba** y no de otra consulta, por
        # lo mismo que el tablero: dos listas armadas por separado pueden discrepar.
        contexto["tramos_con_clave"] = [
            (nombre, etiqueta, tareas, urgente)
            for (_d, _h, nombre, _e), (etiqueta, tareas, urgente) in zip(
                TRAMOS, contexto["tramos_etiquetados"], strict=True
            )
        ]
        contexto["total_pendiente"] = sum(
            len(tareas) for _e, tareas, _u in contexto["tramos_etiquetados"]
        )

        # **El tablero se arma de la misma lista de tareas, no de otra consulta.** Es lo que hace
        # imposible que las dos vistas digan cosas distintas: si el reparto por columnas se hiciera
        # con su propio `filter`, un estado nuevo caería en una vista y no en la otra.
        todas = [tarea for _e, tareas, _u in contexto["tramos_etiquetados"] for tarea in tareas]
        contexto["columnas"] = [
            (clave, etiqueta, [t for t in todas if t.columna == clave])
            for clave, etiqueta in COLUMNAS
        ]

        contexto["entregables"] = (
            Entregable.objects.filter(responsable=self.request.user, is_active=True)
            .select_related("proyecto", "disciplina")
            .prefetch_related("revisiones")
        )
        return contexto


class SeguimientoView(ModelPermissionRequiredMixin, TemplateView):
    """**Quién va atrasado y con qué**, para quien reparte el trabajo. Ver `seguimiento.py`.

    ## Pide dos permisos, y ninguno de los dos basta solo

    Es una lectura, así que lleva su `view_observacion` —regla de la casa para toda superficie de
    lectura—. Pero **todos los roles tienen ese**, el mandante incluido: lo necesitan para leer el
    hallazgo que les toca. Y lo que esta pantalla enseña no es un hallazgo: es **cuánto va atrasada
    cada persona del equipo**, que es información interna. Un mandante mirando la carga de trabajo
    de la oficina es exactamente lo que no tiene que pasar.

    Así que además pide `change_observacion`, que es el de quien **reparte y replanifica**:
    Coordinador y Revisor. Es además el permiso que hace falta para actuar sobre lo que aquí se ve,
    así que la pantalla solo se enseña a quien puede hacer algo con ella.

    ## Acotada por organización, las dos clases de tarea

    Por la consulta y no solo por el permiso: `change_observacion` dice «puede repartir hallazgos»,
    no «puede ver los de otra empresa».
    """

    template_name = "documents/seguimiento.html"
    model = Observacion
    permission_action = "change"

    def get_permission_required(self):
        return ("documents.view_observacion", *super().get_permission_required())

    def get_context_data(self, **kwargs):
        from apps.documents.seguimiento import abiertos_con_fecha, del_equipo
        from apps.projects.models import Proyecto

        contexto = super().get_context_data(**kwargs)
        usuario = self.request.user
        observaciones = scope_queryset_to_organizacion(Observacion.objects.all(), usuario)
        actividades = scope_queryset_to_organizacion(Actividad.objects.all(), usuario)

        obras = scope_queryset_to_organizacion(Proyecto.objects.all(), usuario).filter(
            is_active=True
        )
        # **La obra se valida contra las visibles**, no se usa tal cual llega: un `?obra=` con el
        # identificador de otra organización devolvería vacío en vez de fallar, que es correcto,
        # pero dejaría el selector diciendo que hay un filtro puesto sobre algo que no existe.
        #
        # Y se parsea antes: la clave es un UUID, y `filter(pk="abc")` **lanza** en vez de devolver
        # vacío. Un enlace mal copiado daría un 500.
        pedida = self.request.GET.get("obra", "")
        try:
            obra = obras.filter(pk=uuid.UUID(pedida)).first() if pedida else None
        except ValueError:
            obra = None
        if obra is not None:
            observaciones = observaciones.filter(proyecto=obra)
            actividades = actividades.filter(proyecto=obra)

        contexto["seguimiento"] = del_equipo(
            abiertos_con_fecha(observaciones, actividades), timezone.localdate()
        )
        contexto["obras"] = obras.order_by("codigo")
        contexto["obra"] = obra
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
            cuantos_pares,
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

        # **Se mide antes de empezar.** Contar los modelos vigentes es una consulta; la alternativa
        # era descubrirlo a los dos minutos con un `SIGKILL` y media corrida escrita.
        pares = cuantos_pares(len(modelos_vigentes(proyecto)))
        if not cabe_en_una_peticion(pares):
            messages.warning(
                request,
                _(
                    "This project has %(models)s current models: %(pairs)s comparisons, about "
                    "%(minutes)s minutes. That does not fit in one request, so it was not started "
                    "— a half-finished run leaves findings without saying so. Run it from the "
                    "server with `manage.py detectar_interferencias`, which has no time limit."
                )
                % {
                    "models": len(modelos_vigentes(proyecto)),
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


class CambiarIdoneidadView(ModelPermissionRequiredMixin, View):
    """El trabajo del revisor: decir para qué sirve el documento.

    **Es la firma del registro**: la idoneidad dice si ese plano se puede usar para construir, y por
    eso el acotado por organización aquí no es una formalidad. Iba con `Revision.objects`, o sea sin
    acotar, y **medido salió que se podía aprobar un documento de otra empresa** —de `A` a `B`— con
    solo conocer el UUID de su revisión. Va por `revisiones_visibles`, que sabe que `Revision` no
    lleva el campo `organizacion` y filtra por el de su entregable.
    """

    model = Revision
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        revision = get_object_or_404(revisiones_visibles(request.user), pk=kwargs["pk"])
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

    def contexto(self, request, form=None):
        """El formulario **y si hay dónde colgar el entregable**.

        ## El callejón que esto cierra

        Un entregable necesita una disciplina, y las disciplinas **cuelgan de un proyecto**: en una
        instalación recién hecha no hay ninguna. El desplegable salía vacío, el formulario no podía
        validar nunca, y la pantalla no decía **qué faltaba ni dónde se conseguía**.

        Es el mismo callejón que tenía «Cuenta nueva» sin organizaciones, un piso más abajo — y la
        misma forma de fallo: una pantalla que exige algo correcto sin decir de dónde sale. Se
        arregla igual, porque la respuesta correcta es la misma: no ofrecer un formulario que no se
        va a poder enviar.

        ## Y por qué se nombra el proyecto

        Porque crear una disciplina se hace **dentro de una obra**, así que la salida no puede ser
        un enlace genérico: tiene que llevar a un proyecto concreto. Con una sola obra —el caso del
        piloto— se lleva directo a ella.
        """
        form = form or EntregableForm(autor=request.user)
        proyectos = scope_queryset_to_organizacion(Proyecto.objects.all(), request.user).filter(
            is_active=True
        )
        return {
            "form": form,
            "hay_disciplinas": form.fields["disciplina"].queryset.exists(),
            "proyectos": list(proyectos.order_by("codigo")[:6]),
            "hay_proyectos": proyectos.exists(),
            "puede_crear_proyecto": request.user.has_perm("projects.add_proyecto"),
        }

    def get(self, request, *args, **kwargs):
        from django.shortcuts import render

        return render(request, self.template_name, self.contexto(request))

    def post(self, request, *args, **kwargs):
        from django.shortcuts import render

        # **`autor` también en el POST, y esa es la mitad que protege.** El acotado del `GET` solo
        # decide qué se ofrece; sin repetirlo aquí, un `disciplina=<id ajeno>` enviado a mano
        # seguiría creando el entregable **dentro de la empresa de otro** —la vista hace
        # `entregable.organizacion = disciplina.proyecto.organizacion`—. Es la lección de las siete
        # fugas: lo que decide no es la pantalla, es la consulta.
        form = EntregableForm(request.POST, autor=request.user)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, form), status=400)

        entregable = form.save(commit=False)
        disciplina = form.cleaned_data["disciplina"]
        entregable.proyecto = disciplina.proyecto
        entregable.organizacion = disciplina.proyecto.organizacion
        entregable.save()
        set_audit_context(request, entregable, action="crear_entregable")
        messages.success(request, _("Deliverable created."))
        return redirect("documents:expediente", pk=entregable.pk)
