"""Los formularios del registro. **Ninguno declara `fields = "__all__"`.**

Es una regla de `AGENTS.md` y no una preferencia: con `"__all__"`, un campo nuevo en el
modelo entra al formulario sin que nadie lo decida, y basta que ese campo sea
`organizacion` para que alguien pueda mover un entregable a otra organizacion desde el
navegador.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from apps.core.personas import PersonasConNombre
from apps.documents import codificacion
from apps.documents.camara import leer as leer_camara
from apps.documents.ids import titulo_de_ids
from apps.documents.models import (
    Actividad,
    Entregable,
    Idoneidad,
    Observacion,
    RequisitoIds,
    Revision,
    TipoEntregable,
    Transmittal,
)
from apps.documents.storage import (
    EXTENSIONES_ACEPTADAS,
    CargaRechazada,
    validar,
    validar_subida,
)


class EntregableForm(PersonasConNombre, forms.ModelForm):
    #: Si el código tecleado no sigue la estructura ISO 19650. **Es un aviso, no un error**: se
    #: guarda igual y la pantalla lo dice. Ver `clean_codigo`.
    codigo_fuera_de_norma = False

    class Meta:
        model = Entregable
        fields = (
            "codigo",
            "titulo",
            "tipo",
            "disciplina",
            "paquete",
            "responsable",
            "fecha_planificada",
            "peso",
        )
        widgets = {"fecha_planificada": forms.DateInput(attrs={"type": "date"})}

    def __init__(self, *args, proyecto=None, autor=None, **kwargs):
        super().__init__(*args, **kwargs)
        # **Las opciones se acotan al proyecto.** Un desplegable con las disciplinas de
        # todos los proyectos no es solo incomodo: deja elegir una que no le pertenece.
        if proyecto is not None:
            self.fields["disciplina"].queryset = proyecto.disciplinas.filter(is_active=True)
            self.fields["paquete"].queryset = proyecto.paquetes.filter(is_active=True)
            self._explica_el_codigo(proyecto)
            return

        # ══════════════════════════════════════════════════════════════════════════════════
        #   **Sin proyecto, se acota por quien mira — y antes no se acotaba por nada.**
        #
        #   `NuevoEntregableView` construye este formulario **sin `proyecto`**, así que hasta
        #   hoy el desplegable de disciplina salía con `Disciplina.objects.all()`: **todas las
        #   disciplinas de todos los proyectos de todas las empresas**.
        #
        #   No era solo una fuga de lectura —que ya es una: la lista dice qué obras hay y cómo
        #   las organiza cada oficina—. La vista hace después:
        #
        #       entregable.organizacion = disciplina.proyecto.organizacion
        #
        #   o sea que eligiendo una disciplina ajena se **escribe un entregable dentro de la
        #   empresa de otro**. Es la misma familia de las siete fugas de `PR #23`, y otra vez
        #   por el mismo motivo: un acotado que depende de que quien llame se acuerde de pasar
        #   el argumento.
        #
        #   Por eso `autor` no es opcional de verdad: sin ninguno de los dos, el formulario se
        #   queda **vacío** en vez de abierto. Un desplegable vacío se nota; uno que enseña de
        #   más, no.
        # ══════════════════════════════════════════════════════════════════════════════════
        from apps.core.tenancy import scope_queryset_to_organizacion
        from apps.projects.models import Disciplina, PaqueteWBS, Proyecto

        if autor is None:
            self.fields["disciplina"].queryset = Disciplina.objects.none()
            self.fields["paquete"].queryset = PaqueteWBS.objects.none()
            self._explica_el_codigo(None)
            return

        proyectos = scope_queryset_to_organizacion(Proyecto.objects.all(), autor).filter(
            is_active=True
        )
        self.fields["disciplina"].queryset = (
            Disciplina.objects.filter(proyecto__in=proyectos, is_active=True)
            .select_related("proyecto")
            .order_by("proyecto__codigo", "codigo")
        )
        self.fields["paquete"].queryset = PaqueteWBS.objects.filter(
            proyecto__in=proyectos, is_active=True
        ).select_related("proyecto")

        # **Con varias obras, el nombre de la disciplina no identifica.** «Estructura» existe en
        # todas, así que el desplegable saldría con la misma palabra repetida y no habría forma
        # de saber a qué obra va el entregable — que es lo que esta pantalla decide.
        self.fields["disciplina"].label_from_instance = lambda d: (
            f"{d.proyecto.codigo} · {d.codigo} — {d.nombre}"
        )
        self.fields["paquete"].label_from_instance = lambda p: f"{p.proyecto.codigo} · {p.codigo}"
        # Sin obra fija no hay número que proponer —la disciplina decide la obra— pero la
        # estructura se explica igual.
        self._explica_el_codigo(None)

    def _explica_el_codigo(self, proyecto):
        """La estructura del código, dicha donde se teclea.

        **Una nomenclatura que solo vive en un documento no la sigue nadie.** El sitio donde hace
        falta saberla es el campo, no `docs/CODIFICACION.md`.
        """
        campo = self.fields["codigo"]
        campo.help_text = _(
            "Structure: work-originator-volume-level-type-discipline-number "
            "(e.g. 716LCD-JEJ-ZZ-XX-M3-ME-0001). A code from a third party is accepted as is."
        )
        # **`self.instance.pk` no sirve para saber si es nuevo, y aquí es una trampa.** `BaseModel`
        # usa `UUIDField(primary_key=True, default=uuid.uuid4)`, así que una instancia **sin
        # guardar ya trae pk** y la comprobación de siempre es verdadera siempre. `_state.adding`
        # es la que mira si la fila existe en la base.
        if proyecto is None or not self.instance._state.adding or self.is_bound:
            return
        # Solo al registrar uno nuevo: en una edición el código ya está decidido, y sobrescribirlo
        # con una propuesta sería cambiar un identificador por el que otros ya preguntan.
        disciplina = self.fields["disciplina"].queryset.first()
        if disciplina is not None:
            campo.initial = codificacion.propuesta(
                proyecto, self.initial.get("tipo") or TipoEntregable.PLANO, disciplina
            )

    def clean_codigo(self):
        """Normaliza, **y avisa sin bloquear** si el código no sigue la estructura.

        Que no bloquee no es dejadez: `Revision.correlativo` lleva escrito desde el primer día el
        motivo, y vale igual aquí — *«cada mandante impone el suyo, y forzar un formato rechaza
        documentos válidos»*. Un plano que llega de un tercero con su codificación es un documento
        válido, y rechazarlo no hace la aplicación más rigurosa: la hace inservible.

        Lo que sí se arregla es la normalización, que **faltaba y era el defecto de verdad**:
        `Proyecto` y `Disciplina` pasaban su código a mayúsculas y `Entregable` no, siendo el que
        más códigos tiene. `716-lcd-…` y `716-LCD-…` son el mismo documento y la restricción de
        unicidad de la base los daba por distintos.
        """
        codigo = codificacion.normaliza(self.cleaned_data.get("codigo", ""))
        self.codigo_fuera_de_norma = bool(codigo) and not codificacion.sigue_la_norma(codigo)
        return codigo


class RevisionForm(forms.ModelForm):
    """Subir una revision. El archivo se valida aqui, antes de tocar el disco."""

    archivo = forms.FileField(
        label=_("File"),
        help_text=_("Accepted: %(exts)s") % {"exts": ", ".join(sorted(EXTENSIONES_ACEPTADAS))},
    )

    class Meta:
        model = Revision
        fields = ("correlativo", "idoneidad")

    def __init__(self, *args, entregable=None, **kwargs):
        """`entregable` hace falta **para validar**, no para guardar.

        Lo asigna la vista despues de `save(commit=False)`, y por eso no es un campo del formulario.
        Pero sin el aqui, el `UniqueConstraint` de `(entregable, correlativo)` **no se puede
        comprobar**: Django excluye de `_post_clean` toda restriccion que toque un campo ausente del
        formulario, asi que el choque no aparecia hasta el `INSERT`. Ver `clean_correlativo`.
        """
        super().__init__(*args, **kwargs)
        self.entregable = entregable

    def clean_correlativo(self):
        """**El correlativo se normaliza y se comprueba antes de tocar el disco.**

        Dos defectos, y los dos salian a la cara de quien sube:

        1. **Un correlativo repetido daba un 500 con el archivo ya guardado.** La vista escribia el
           archivo —y para un DWG llamaba ademas al conversor, hasta cinco minutos— y solo despues
           llamaba a `revision.save()`, donde el `UniqueConstraint` reventaba con un
           `IntegrityError`. Quien subia veia una pagina de error, y en el disco quedaba un archivo
           que ninguna fila nombraba.
        2. **`p01` y `P01` convivian.** El codigo de un proyecto y el de una disciplina ya se
           normalizan con `.strip().upper()`; el correlativo no, asi que el mismo expediente podia
           acabar con dos revisiones que se leen igual.

        La comparacion es **insensible a mayusculas** a proposito: la restriccion de la base no lo
        es, pero lo que importa no es lo que la base admita sino que nadie vea dos revisiones con el
        mismo nombre. Asi se caza tambien el `p01` que se subio antes de que esto existiera.
        """
        correlativo = (self.cleaned_data["correlativo"] or "").strip().upper()
        if not correlativo or self.entregable is None:
            return correlativo

        ya = Revision.objects.filter(entregable=self.entregable, correlativo__iexact=correlativo)
        if self.instance.pk is not None:
            ya = ya.exclude(pk=self.instance.pk)
        if ya.exists():
            raise forms.ValidationError(
                _("This deliverable already has a revision «%(rev)s».")
                % {"rev": ya.first().correlativo}
            )
        return correlativo

    def clean_archivo(self):
        """Valida **sin traer el archivo a memoria**.

        Esto era `contenido = subido.read()` y despues `validar(nombre, contenido)`: un IFC de
        200 MB —el tope del registro, y los archivos de obra lo alcanzan— quedaba entero en la
        memoria del worker, y el tope ni siquiera se miraba hasta despues de cargarlo. Con
        `workers = cpu*2+1`, dos o tres subidas a la vez son el OOM killer.

        `validar_subida` hace las mismas cuatro comprobaciones —vacio, tamaño, extension y que el
        contenido sea lo que la extension promete— recorriendo el archivo por tramos, y el `sha256`
        se acumula por el camino. Lo que se guarda aqui es **el tamaño y el hash**, no los bytes: la
        vista copia del archivo subido al disco con `storage.guardar_subida`.
        """
        subido = self.cleaned_data["archivo"]
        try:
            extension, sha = validar_subida(subido)
        except CargaRechazada as rechazo:
            # El motivo se le muestra a quien sube: es lo que le dice que arreglar.
            raise forms.ValidationError(str(rechazo)) from rechazo

        self.extension = extension
        self.sha256 = sha
        self.tamano = subido.size
        return subido


class ObservacionForm(PersonasConNombre, forms.ModelForm):
    """Abrir una observación, con o sin ancla en el documento.

    **El ancla va oculta y no la teclea nadie.** Llega desde el visor del documento cuando
    alguien hace clic sobre la página: página, y la posición como **fracción de la página** —no
    en píxeles—. El PDF se dibuja a la escala que quepa y a la densidad de pantalla de cada
    equipo, así que un píxel guardado hoy apunta a otro sitio mañana.
    """

    class Meta:
        model = Observacion
        fields = (
            "titulo",
            "descripcion",
            "prioridad",
            "responsable",
            "vence",
            "revision",
            "pagina",
            "ancla_x",
            "ancla_y",
            "ifc_guid",
        )
        widgets = {
            "vence": forms.DateInput(attrs={"type": "date"}),
            "descripcion": forms.Textarea(attrs={"rows": 4}),
            "pagina": forms.HiddenInput,
            "ancla_x": forms.HiddenInput,
            "ancla_y": forms.HiddenInput,
            # **El ancla en el modelo también va oculta**, y llega de dos sitios: de un fallo de
            # validación IDS —que trae el GUID del elemento que no cumple— y, más adelante, de un
            # clic sobre el modelo en el visor. Es la identidad estable, y la que viaja en un BCF.
            "ifc_guid": forms.HiddenInput,
        }

    #: El punto de vista desde el que se vio el problema, si el visor lo mandó: `F4.1`.
    #:
    #: **Va como texto y se valida a mano**, no como el `JSONField` del modelo. Un `JSONField` en un
    #: formulario acepta cualquier JSON bien formado —un diccionario vacío, una lista, un número— y
    #: lo guarda: lo que hay que comprobar no es la sintaxis sino que sea una cámara reproducible.
    #: Eso lo hace {@link apps.documents.camara.leer}, que además vive donde se puede probar sola.
    camara = forms.CharField(required=False, widget=forms.HiddenInput)

    def __init__(self, *args, proyecto=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["revision"].required = False
        if proyecto is not None:
            self.fields["revision"].queryset = Revision.objects.filter(
                entregable__proyecto=proyecto
            ).select_related("entregable")

    def clean(self):
        datos = super().clean()

        # **Las tres van juntas o no va ninguna.** Media ancla —la página sin la posición— deja
        # una marca que no se puede dibujar, y el visor la descartaría en silencio: mejor
        # decirlo aquí.
        ancla = [datos.get("pagina"), datos.get("ancla_x"), datos.get("ancla_y")]
        puestas = [uno for uno in ancla if uno is not None]
        if puestas and len(puestas) != 3:
            raise forms.ValidationError(
                _("An anchor on the document needs the page and both coordinates.")
            )

        for campo in ("ancla_x", "ancla_y"):
            valor = datos.get(campo)
            # Fuera de [0, 1] la marca cae fuera de la página. Pasa si alguien edita la URL, y
            # guardarlo produce una observación que existe y no se ve.
            if valor is not None and not 0 <= valor <= 1:
                self.add_error(campo, _("The position must be a fraction of the page, 0 to 1."))

        # Un ancla en el documento sin documento no ancla en nada.
        if datos.get("pagina") is not None and datos.get("revision") is None:
            raise forms.ValidationError(
                _("An anchor on the document needs the revision it points at.")
            )

        # **La cámara mala se descarta y no da error.** Quien abre la observación no escribió ese
        # parámetro: llega del visor por la URL. Un error sobre él haría que el formulario se
        # negara a guardar un hallazgo real por un dato accesorio, y sin cámara el BCF sale con el
        # elemento seleccionado, que es lo que hacía antes de que esto existiera.
        #
        # Y **una cámara sin GUID no se guarda**. El punto de vista es la mitad del ancla en el
        # modelo; sin el elemento al que apunta, un viewpoint dice «mira hacia acá» sin decir qué
        # hay que mirar, y BCF lo escribiría como una vista sin componentes.
        self.instance.punto_de_vista = (
            leer_camara(datos.get("camara")) if datos.get("ifc_guid") else {}
        )

        return datos


class RepartoForm(PersonasConNombre, forms.ModelForm):
    """Repartir un hallazgo ya abierto: **quien lo tiene, para cuando y cuanto corre**. `F12.10`.

    ## El hueco que cierra

    Hasta hoy dueño, fecha y prioridad **solo se podian fijar al crear** la observacion, en
    `entregables/<pk>/observar/`. Una nota abierta desde el visor se guarda con el autor como
    responsable —y su propio texto lo dice: «Repartela desde la pantalla de observaciones cuando
    toque»— pero esa pantalla era **solo una lista**: no habia ningun `editar/`.

    O sea que el reparto, que es lo que convierte un hallazgo en una tarea de alguien, no existia.
    Sin dueño y sin fecha un hallazgo no aparece en la bandeja de nadie (`pendientes_por_tramo`
    filtra por `responsable` y `vence`), no entra en el resumen por correo, y el ciclo de
    coordinacion se queda en «alguien deberia mirar esto».

    ## Por que estos tres campos y no mas

    El titulo y la descripcion **no se editan**: son lo que se vio, y reescribirlos despues cambia
    el hallazgo en vez de repartirlo — y el hilo de comentarios, que es donde vive la conversacion,
    quedaria hablando de otra cosa. El estado tiene sus propias puertas (`cerrar`, `descartar`), que
    piden motivo. Las etiquetas ya tienen su formulario.
    """

    class Meta:
        model = Observacion
        fields = ("responsable", "vence", "prioridad")
        widgets = {"vence": forms.DateInput(attrs={"type": "date"})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # **La fecha si es opcional; el dueño no.**
        #
        # `Observacion.responsable` es `NOT NULL` (`models.py:445`), asi que un hallazgo **siempre**
        # tiene dueño: no existe «sin repartir». Se escribio este formulario dandolo por opcional y
        # el resultado fue un `IntegrityError` —un 500— al intentar vaciarlo; lo cazo la prueba.
        # Repartir es cambiar de dueño, nunca quitarlo.
        #
        # `vence` si admite nulo (`models.py:451`), y la ficha ya sabe decir «sin fecha · abierta
        # hace N»: un hallazgo puede estar repartido y todavia sin plazo.
        self.fields["vence"].required = False


class CierreForm(forms.Form):
    """Cerrar una observacion **diciendo como**. Sin esto, «cerrada» no dice nada."""

    resolucion = forms.CharField(
        label=_("How it was resolved"),
        widget=forms.Textarea(attrs={"rows": 3}),
        # No se acepta un espacio: el modelo tambien lo rechaza, y aqui se dice antes.
        strip=True,
    )


class ComentarioForm(forms.Form):
    """Una respuesta en el hilo, con una imagen opcional. `F12.11`.

    **El texto sigue siendo obligatorio y la imagen no**, y ese reparto es la decision: un
    comentario es un mensaje, y la imagen es la prueba de lo que dice. Una captura sola en el hilo
    obliga a quien la lea a adivinar que se le queria enseñar.

    **Y es `FileField`, no `ImageField`.** `ImageField` pide Pillow y valida abriendo la imagen;
    aqui la validacion es la firma del archivo —`apps/documents/adjunto.py`, que reutiliza la de
    `storage`— que es la regla de la casa y ademas la que caza un ejecutable renombrado. Una
    dependencia mas para una comprobacion mas debil no se paga.
    """

    texto = forms.CharField(label=_("Comment"), widget=forms.Textarea(attrs={"rows": 3}))
    imagen = forms.FileField(
        label=_("Attach an image (optional)"),
        required=False,
        # `accept` es una ayuda del navegador al elegir, **no una validacion**: filtra el dialogo y
        # se puede saltar. Lo que decide es la firma, en el servidor.
        widget=forms.ClearableFileInput(attrs={"accept": "image/png,image/jpeg"}),
    )


class EtiquetasForm(forms.Form):
    """Que etiquetas lleva un hallazgo. `F10.1`.

    **Casillas y no un campo de texto**, que es la decision entera de la tarea: un texto libre se
    fragmenta a la tercera semana —«estructura», «Estructura», «estruct»— y entonces filtrar por
    etiqueta deja de encontrar lo que hay.

    Y las opciones **son las del proyecto del hallazgo**, calculadas aqui y no en la plantilla:
    asi el formulario tampoco acepta una etiqueta de otra obra aunque alguien la mande a mano.
    """

    etiquetas = forms.ModelMultipleChoiceField(
        queryset=None,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label=_("Tags"),
    )

    def __init__(self, *args, proyecto=None, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.projects.models import Etiqueta

        consulta = Etiqueta.objects.none()
        if proyecto is not None:
            consulta = Etiqueta.objects.filter(proyecto=proyecto, is_active=True)
        self.fields["etiquetas"].queryset = consulta


class ActividadForm(PersonasConNombre, forms.ModelForm):
    class Meta:
        model = Actividad
        fields = ("titulo", "descripcion", "responsable", "vence", "entregable", "status")
        widgets = {
            "vence": forms.DateInput(attrs={"type": "date"}),
            "descripcion": forms.Textarea(attrs={"rows": 4}),
        }

    def __init__(self, *args, proyecto=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["entregable"].required = False
        if proyecto is not None:
            self.fields["entregable"].queryset = proyecto.entregables.filter(is_active=True)


class IdoneidadForm(forms.Form):
    """Cambiar el codigo de idoneidad de una revision: es el trabajo del revisor."""

    idoneidad = forms.ChoiceField(label=_("Suitability"), choices=Idoneidad.choices)


class RequisitoIdsForm(forms.ModelForm):
    """Subir el requisito de informacion del proyecto: un IDS.

    **El titulo no se teclea si el archivo lo trae.** Un IDS lleva su propio `<title>`, y pedirlo
    aparte deja dos nombres para la misma cosa que se separan en cuanto alguien edita uno.
    """

    archivo = forms.FileField(label=_("IDS file"), help_text=_("buildingSMART IDS, .ids"))

    class Meta:
        model = RequisitoIds
        fields = ("proyecto", "titulo")

    def __init__(self, *args, proyectos=None, **kwargs):
        super().__init__(*args, **kwargs)
        # El titulo es opcional: si el IDS lo declara, se toma de ahi.
        self.fields["titulo"].required = False
        self.fields["titulo"].help_text = _("Optional: taken from the IDS if left empty.")
        if proyectos is not None:
            self.fields["proyecto"].queryset = proyectos

    def clean_archivo(self):
        subido = self.cleaned_data["archivo"]
        contenido = subido.read()
        subido.seek(0)
        try:
            extension, sha = validar(subido.name, contenido)
        except CargaRechazada as rechazo:
            raise forms.ValidationError(str(rechazo)) from rechazo
        if extension != "ids":
            raise forms.ValidationError(_("The information requirement must be an .ids file."))

        # **Se comprueba que el IDS se pueda leer antes de guardarlo.** Un requisito que no se puede
        # abrir no rechaza nada ni aprueba nada: se queda en el proyecto dando error en cada
        # validacion, y eso se lee como que el sistema esta roto.
        titulo = titulo_de_ids(contenido)
        if titulo is None:
            raise forms.ValidationError(_("This file is not a readable IDS."))

        self.contenido = contenido
        self.sha256 = sha
        self.titulo_del_archivo = titulo
        return subido


class TransmittalForm(PersonasConNombre, forms.ModelForm):
    """El borrador del transmittal: que revisiones van y a quien.

    **El proyecto no se elige: lo dicen las revisiones.** Pedirlo aparte abre la puerta a
    un transmittal cuyo proyecto no es el de los documentos que lleva, y ese registro
    contesta mal la pregunta que el transmittal existe para contestar.
    """

    class Meta:
        model = Transmittal
        fields = ("folio", "asunto", "revisiones", "destinatarios")
        widgets = {
            "revisiones": forms.CheckboxSelectMultiple,
            "destinatarios": forms.CheckboxSelectMultiple,
        }

    def __init__(self, *args, revisiones=None, destinatarios=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Los dos son obligatorios **en el formulario** aunque el modelo los deje en blanco:
        # el modelo admite el borrador a medio armar, la pantalla de emision no.
        self.fields["revisiones"].required = True
        self.fields["destinatarios"].required = True
        if revisiones is not None:
            self.fields["revisiones"].queryset = revisiones
        if destinatarios is not None:
            self.fields["destinatarios"].queryset = destinatarios

    def clean_revisiones(self):
        elegidas = self.cleaned_data["revisiones"]
        proyectos = {revision.entregable.proyecto_id for revision in elegidas}
        if len(proyectos) > 1:
            raise forms.ValidationError(
                _("All revisions in one transmittal must belong to the same project.")
            )
        return elegidas

    @property
    def proyecto(self):
        """El proyecto deducido de las revisiones. Solo tiene sentido tras validar."""
        return self.cleaned_data["revisiones"][0].entregable.proyecto
