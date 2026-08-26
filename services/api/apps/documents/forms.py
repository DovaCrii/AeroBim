"""Los formularios del registro. **Ninguno declara `fields = "__all__"`.**

Es una regla de `AGENTS.md` y no una preferencia: con `"__all__"`, un campo nuevo en el
modelo entra al formulario sin que nadie lo decida, y basta que ese campo sea
`organizacion` para que alguien pueda mover un entregable a otra organizacion desde el
navegador.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from apps.documents.models import Actividad, Entregable, Idoneidad, Observacion, Revision
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
    class Meta:
        model = Observacion
        fields = ("titulo", "descripcion", "prioridad", "responsable", "vence", "revision")
        widgets = {
            "vence": forms.DateInput(attrs={"type": "date"}),
            "descripcion": forms.Textarea(attrs={"rows": 4}),
        }

    def __init__(self, *args, proyecto=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["revision"].required = False
        if proyecto is not None:
            self.fields["revision"].queryset = Revision.objects.filter(
                entregable__proyecto=proyecto
            ).select_related("entregable")


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
