"""Los formularios del proyecto. **Ninguno declara `fields = "__all__"`.**

Es una regla de `AGENTS.md`, y aca importa mas que en ningun otro sitio: `Proyecto` y `Disciplina`
llevan `organizacion` —directa o por su proyecto—, y con `"__all__"` ese campo entra al formulario
solo. Un desplegable con las organizaciones deja mover el proyecto de un cliente a otro desde el
navegador, que es la fuga que el acotado por organizacion existe para cerrar.

**La organizacion se pregunta solo cuando hay algo que preguntar**, y con la lista acotada a las
membresias de quien crea: con una sola membresia se pone sola y el campo no se dibuja.
"""

import re

from django import forms
from django.utils.translation import gettext_lazy as _

from apps.projects.models import Disciplina, Proyecto

#: `#rrggbb`, en minusculas o mayusculas. Tres digitos —`#abc`— no se acepta a proposito: el
#: color viaja al visor y a los informes, y media docena de sitios tendrian que saber expandirlo.
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class ProyectoForm(forms.ModelForm):
    """La obra. **El codigo es lo que despues se lee en cada plano y en cada transmittal.**"""

    class Meta:
        model = Proyecto
        fields = (
            "organizacion",
            "codigo",
            "nombre",
            "cliente",
            "naturaleza",
            "status",
            "inicio",
            "termino",
        )
        widgets = {
            "inicio": forms.DateInput(attrs={"type": "date"}),
            "termino": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, organizaciones=None, **kwargs):
        super().__init__(*args, **kwargs)

        # **La naturaleza no se exige, se presupone.** El modelo ya dice que una obra nace real, y
        # un envío que no la traiga —una integración, un formulario antiguo— no debería recibir un
        # 400 por no contestar algo que tiene respuesta por omisión. El desplegable sale con «obra
        # real» marcada, así que desde el navegador siempre viaja.
        self.fields["naturaleza"].required = False

        if organizaciones is None:
            return

        # **La lista se acota a las membresias de quien crea.** El campo existe —hay quien
        # trabaja para dos clientes— pero su `queryset` no es el de todas: sin acotarlo, el
        # desplegable seria una lista de los clientes de la oficina para cualquiera que pueda
        # crear un proyecto.
        self.fields["organizacion"].queryset = organizaciones

        # Con una sola no hay nada que preguntar: se pone y el campo no se dibuja. Preguntar lo
        # que solo tiene una respuesta es una casilla mas que alguien puede equivocar.
        unica = organizaciones.first() if organizaciones.count() == 1 else None
        if unica is not None:
            self.fields["organizacion"].initial = unica
            self.fields["organizacion"].widget = forms.HiddenInput()

    def clean(self):
        datos = super().clean()

        inicio, termino = datos.get("inicio"), datos.get("termino")
        # Un proyecto que termina antes de empezar no es un error de dedo que se arregle solo:
        # los plazos de los entregables se calculan contra estas dos fechas.
        if inicio is not None and termino is not None and termino < inicio:
            self.add_error("termino", _("The end date cannot be before the start date."))

        return datos

    def clean_codigo(self):
        # Se normaliza en mayusculas porque **es un identificador, no un texto**: `716-LCD` y
        # `716-lcd` son el mismo proyecto, y la restriccion de unicidad de la base distingue.
        return (self.cleaned_data["codigo"] or "").strip().upper()

    def clean_naturaleza(self):
        # Vacio significa «la de siempre», no vacio en la base: `naturaleza` es un campo cerrado y
        # guardarlo en blanco dejaria una obra que no es ni real ni de prueba.
        return self.cleaned_data.get("naturaleza") or Proyecto.REAL


class DisciplinaForm(forms.ModelForm):
    """Arquitectura, estructura, instalaciones... con su color.

    **El color se valida aca y no en el modelo**, y esa decision ya esta escrita en
    `Disciplina.color`: un color mal escrito no puede impedir que se guarde el registro de un
    entregable. Se comprueba donde alguien lo teclea.
    """

    class Meta:
        model = Disciplina
        fields = ("codigo", "nombre", "color")
        widgets = {"color": forms.TextInput(attrs={"type": "color"})}

    def clean_codigo(self):
        return (self.cleaned_data["codigo"] or "").strip().upper()

    def clean_color(self):
        color = (self.cleaned_data["color"] or "").strip()
        if not COLOR.match(color):
            raise forms.ValidationError(_("The colour must be in #rrggbb form, e.g. #5b3a9e."))
        return color.lower()
