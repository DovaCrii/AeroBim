"""Los formularios del registro. **Ninguno declara `fields = "__all__"`.**

Es una regla de `AGENTS.md` y no una preferencia: con `"__all__"`, un campo nuevo en el
modelo entra al formulario sin que nadie lo decida, y basta que ese campo sea
`organizacion` para que alguien pueda mover un entregable a otra organizacion desde el
navegador.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from apps.documents.models import (
    Actividad,
    Entregable,
    Idoneidad,
    Observacion,
    Revision,
    Transmittal,
)
from apps.documents.storage import EXTENSIONES_ACEPTADAS, CargaRechazada, validar


class EntregableForm(forms.ModelForm):
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

    def __init__(self, *args, proyecto=None, **kwargs):
        super().__init__(*args, **kwargs)
        # **Las opciones se acotan al proyecto.** Un desplegable con las disciplinas de
        # todos los proyectos no es solo incomodo: deja elegir una que no le pertenece.
        if proyecto is not None:
            self.fields["disciplina"].queryset = proyecto.disciplinas.filter(is_active=True)
            self.fields["paquete"].queryset = proyecto.paquetes.filter(is_active=True)


class RevisionForm(forms.ModelForm):
    """Subir una revision. El archivo se valida aqui, antes de tocar el disco."""

    archivo = forms.FileField(
        label=_("File"),
        help_text=_("Accepted: %(exts)s") % {"exts": ", ".join(sorted(EXTENSIONES_ACEPTADAS))},
    )

    class Meta:
        model = Revision
        fields = ("correlativo", "idoneidad")

    def clean_archivo(self):
        subido = self.cleaned_data["archivo"]
        contenido = subido.read()
        # Se rebobina: la vista lo vuelve a leer para guardarlo.
        subido.seek(0)
        try:
            extension, sha = validar(subido.name, contenido)
        except CargaRechazada as rechazo:
            # El motivo se le muestra a quien sube: es lo que le dice que arreglar.
            raise forms.ValidationError(str(rechazo)) from rechazo

        self.contenido = contenido
        self.extension = extension
        self.sha256 = sha
        return subido


class ObservacionForm(forms.ModelForm):
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
        )
        widgets = {
            "vence": forms.DateInput(attrs={"type": "date"}),
            "descripcion": forms.Textarea(attrs={"rows": 4}),
            "pagina": forms.HiddenInput,
            "ancla_x": forms.HiddenInput,
            "ancla_y": forms.HiddenInput,
        }

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

        return datos


class CierreForm(forms.Form):
    """Cerrar una observacion **diciendo como**. Sin esto, «cerrada» no dice nada."""

    resolucion = forms.CharField(
        label=_("How it was resolved"),
        widget=forms.Textarea(attrs={"rows": 3}),
        # No se acepta un espacio: el modelo tambien lo rechaza, y aqui se dice antes.
        strip=True,
    )


class ComentarioForm(forms.Form):
    texto = forms.CharField(label=_("Comment"), widget=forms.Textarea(attrs={"rows": 3}))


class ActividadForm(forms.ModelForm):
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


class TransmittalForm(forms.ModelForm):
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
