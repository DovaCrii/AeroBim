"""**A una persona se la nombra por su nombre, no por el identificador que le inventó la máquina.**

## Lo que se veía

El desplegable de «Responsable» en «Nuevo entregable», tal cual:

    rafel.bombardiere
    luis.mosquera
    bernardine.vonirmer
    aerobim

Es lo que Django pinta por defecto —`User.__str__` devuelve el `username`— y ese `username` **lo
genera AeroBim** al crear la cuenta. O sea: la aplicación le inventa un identificador a cada persona
y después se lo enseña a quien tiene que reconocerla.

## Por qué importa más de lo que parece

Funciona mientras el equipo son cuatro y los apellidos no chocan. Con dos Muñoz, o con alguien que
entró hace un mes, elegir responsable pasa a ser adivinar — y **el error no se ve**: la observación
queda a nombre de quien no era, el aviso le llega a esa persona, y cuando se descubre se achaca al
despiste de quien la asignó.

## Por qué la prueba recorre todos los formularios

Porque el arreglo son cinco formularios hoy y el sexto que alguien escriba va a volver a salir con
nombres de usuario. Una prueba por formulario comprueba los cinco que ya sabemos; esta comprueba
**los que haya**, y por eso es la que evita que vuelva.
"""

import importlib
import inspect
import pkgutil

import pytest
from django import forms
from django.contrib.auth import get_user_model

import apps
from apps.core.personas import como_se_llama


def formularios_del_proyecto():
    """Todas las clases de formulario declaradas en `apps/*/forms.py`."""
    encontrados = []
    for modulo in pkgutil.walk_packages(apps.__path__, prefix="apps."):
        if not modulo.name.endswith(".forms"):
            continue
        importado = importlib.import_module(modulo.name)
        for _, clase in inspect.getmembers(importado, inspect.isclass):
            if issubclass(clase, forms.BaseForm) and clase.__module__ == modulo.name:
                encontrados.append(clase)
    return encontrados


@pytest.mark.django_db
def test_el_barrido_encuentra_formularios_de_verdad():
    """**Una prueba que recorre una lista vacía pasa siempre.** Si `forms.py` se mueve de sitio, la
    de abajo quedaría en verde sin haber mirado nada."""
    assert len(formularios_del_proyecto()) >= 8


@pytest.mark.django_db
def test_ningun_desplegable_de_personas_enseña_el_nombre_de_usuario():
    """El barrido. Construye cada formulario y mira **los campos que apuntan a `User`**.

    Se instancian con `autor=None` o sin argumentos según lo que pidan: lo que se comprueba es el
    campo ya construido, así que da igual con qué datos se arme.
    """
    usuario = get_user_model()
    culpables = []

    for clase in formularios_del_proyecto():
        parametros = inspect.signature(clase.__init__).parameters
        extra = {}
        for nombre in ("autor", "cuenta", "usuario"):
            if nombre in parametros:
                extra[nombre] = None
        try:
            formulario = clase(**extra)
        except Exception:
            # Un formulario que no se puede construir sin datos reales no se mide aquí; lo que no
            # puede es *no medirse ninguno*, y de eso se ocupa la prueba de arriba.
            continue

        for nombre, campo in formulario.fields.items():
            if not isinstance(campo, forms.ModelChoiceField):
                continue
            if campo.queryset is None or campo.queryset.model is not usuario:
                continue
            if campo.label_from_instance is not como_se_llama:
                culpables.append(f"{clase.__module__}.{clase.__name__}.{nombre}")

    assert not culpables, (
        "estos desplegables enseñan el nombre de usuario en vez del nombre de la persona: "
        f"{culpables}. Añade `PersonasConNombre` a la clase — ver `apps/core/personas.py`."
    )


@pytest.mark.django_db
def test_una_cuenta_sin_nombre_no_sale_en_blanco():
    """**`createsuperuser` no pide nombre ni apellido**, así que la primera cuenta de toda
    instalación no los tiene. Sin el respaldo, el desplegable enseñaría una línea vacía — que es
    peor que el nombre de usuario, porque no se puede ni elegir a tientas."""
    sin_nombre = get_user_model().objects.create_user(username="admin", password="x" * 14)
    con_nombre = get_user_model().objects.create_user(
        username="ana.lopez", password="x" * 14, first_name="Ana", last_name="López"
    )

    assert como_se_llama(sin_nombre) == "admin"
    assert como_se_llama(con_nombre) == "Ana López"
