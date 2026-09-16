"""Cómo se nombra a una persona en la pantalla. **Nombre y apellido, no el nombre de usuario.**

## De dónde sale

De abrir «Nuevo entregable» y mirar el desplegable de responsable:

    rafel.bombardiere
    luis.mosquera
    bernardine.vonirmer
    aerobim

Eso es lo que Django pinta por defecto —`User.__str__` devuelve el `username`— y el `username` lo
**genera AeroBim** al crear la cuenta, a partir del nombre. O sea que la aplicación le inventa un
identificador a cada persona y luego se lo enseña a quien tiene que reconocerla.

Funciona mientras el equipo son cuatro y los apellidos no se repiten. Con dos Muñoz o con alguien
que entró hace un mes, elegir responsable pasa a ser adivinar. Y es la clase de detalle que nadie
reporta: se elige mal una vez, el aviso le llega a quien no era, y se achaca al despiste.

## Por qué un mixin y no cinco líneas repetidas

Porque hay **cinco formularios** que eligen personas —el entregable, la observación, el reparto, la
actividad y los destinatarios de un transmittal— y el sexto que alguien escriba va a volver a salir
con nombres de usuario. El mixin lo resuelve para cualquier campo que apunte a `User`, y
`test_las_personas_se_nombran_bien.py` recorre **todos** los formularios del proyecto para que el
sexto no se olvide.

## Por qué no se toca `User.__str__`

Porque `auth.User` es de Django y aquí no hay modelo propio: cambiarlo sería un parche a una clase
ajena, y afectaría también a sitios donde el `username` **es** lo correcto — la auditoría, que tiene
que decir qué cuenta hizo qué, y la lista de usuarios y roles, donde el nombre de usuario es el dato
que esa persona escribe para entrar.
"""

from django import forms
from django.contrib.auth import get_user_model


def como_se_llama(persona) -> str:
    """«Ana López», o el nombre de usuario si la cuenta no tiene nombre todavía.

    **El respaldo no es adorno**: `createsuperuser` no pide nombre ni apellido, así que la primera
    cuenta de toda instalación no los tiene. Sin el respaldo, el desplegable enseñaría una línea en
    blanco — que es peor que el nombre de usuario, porque no se puede ni elegir a tientas.
    """
    completo = persona.get_full_name().strip()
    return completo or persona.get_username()


class PersonasConNombre:
    """Mixin de formulario: los desplegables de personas se pintan con nombre y apellido.

    Recorre los campos ya construidos —así vale igual para un `ModelForm` que genera el campo solo
    que para uno declarado a mano— y solo toca los que apuntan a `User`. Los demás no se rozan.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        usuario = get_user_model()
        for campo in self.fields.values():
            if isinstance(campo, forms.ModelChoiceField) and campo.queryset is not None:
                if campo.queryset.model is usuario:
                    campo.label_from_instance = como_se_llama
