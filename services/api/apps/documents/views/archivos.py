"""El repositorio de archivos y la subida de revisiones."""

import hashlib
import logging

from django.contrib import messages
from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect
from django.utils.translation import gettext as _
from django.views.generic import ListView, View

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
)
from apps.documents import conversion, storage
from apps.documents.abribles import RUTA_POR_VISOR, visor_de
from apps.documents.forms import (
    RevisionForm,
)
from apps.documents.ifc import extraer as extraer_ifc
from apps.documents.models import (
    Entregable,
    Revision,
)
from apps.documents.views._comun import revisiones_visibles, solo_publicadas

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


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

    def vigentes_de_obras_abiertas(self):
        """Lo que el usuario puede ver, **sin las obras archivadas**.

        Una sola consulta para la lista y para sus contadores: con el filtro escrito solo en la
        lista, el contador de «Modelos» diría 12 y la pestaña enseñaría 9. Y va aquí y no en
        `revisiones_visibles`, que también alimenta al visor: abrir una revisión de una obra
        archivada desde su expediente tiene que seguir funcionando — el registro se conserva.
        """
        return solo_publicadas(revisiones_visibles(self.request.user), self.request.user).exclude(
            entregable__proyecto__is_active=False
        )

    def get_queryset(self):
        from apps.documents.categorias import categoria_de

        # **La misma consulta acotada que alimenta al visor.** `Revision` no lleva el campo
        # `organizacion` —cuelga de su entregable— así que `scope_queryset_to_organizacion` la
        # devolvería intacta: `revisiones_visibles` es la que sí acota, y `solo_publicadas` es la
        # que impide que un mandante vea lo que está en curso.
        consulta = self.vigentes_de_obras_abiertas()
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
        todas = self.vigentes_de_obras_abiertas()
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
        entregable = self._entregable()
        # **El entregable entra en el formulario para validar, no para guardar.** Sin él,
        # `clean_correlativo` no puede saber si el correlativo está tomado, y el choque no aparecía
        # hasta el `INSERT` —con el archivo ya en disco y el conversor ya ejecutado—.
        form = RevisionForm(request.POST, request.FILES, entregable=entregable)
        # **El temporal de un `.ifczip` se borra pase lo que pase**: con el formulario inválido
        # —un correlativo repetido se valida *antes*, pero el archivo se desempaqueta igual—, con
        # el guardado bien hecho y con un `IntegrityError` a mitad. Un giga de temporal
        # por cada intento fallido llena el disco sin avisar.
        try:
            return self._subir(request, entregable, form)
        finally:
            form.descartar_temporal()

    def _subir(self, request, entregable, form):
        from django.shortcuts import render

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
        if form.desempaquetado is not None:
            # Lo que se archiva de un `.ifczip` es el IFC de dentro: ver `ifczip.py`.
            with form.desempaquetado.ruta.open("rb") as dentro:
                storage.guardar_subida(clave, dentro)
        else:
            storage.guardar_subida(clave, form.cleaned_data["archivo"])

        revision = form.save(commit=False)
        revision.entregable = entregable
        revision.subida_por = request.user
        revision.clave_archivo = clave
        # El nombre que traía se guarda **en la base de datos**, no en el disco.
        revision.nombre_original = form.nombre_para_archivar[:250]
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
