"""Sin decirle sobre que fue la accion, la auditoria contesta «alguien guardo algo».

El middleware ya sabe quien, cuando, con que metodo y con que resultado. A que objeto
se refirio no lo puede deducir, y esa es justo la mitad que hace falta para responder
«quien cambio el estado de este entregable».
"""

import pytest

from apps.core.audit import set_audit_context
from apps.core.models import Organizacion


class _Peticion:
    pass


@pytest.mark.django_db
def test_el_contexto_lleva_el_modelo_y_el_id_del_objeto():
    organizacion = Organizacion.objects.create(nombre="Constructora", slug="constructora")
    peticion = _Peticion()

    set_audit_context(peticion, organizacion)

    assert peticion._audit_context["model_label"] == "core.Organizacion"
    assert peticion._audit_context["object_id"] == str(organizacion.pk)


@pytest.mark.django_db
def test_acepta_una_accion_y_metadatos_propios():
    organizacion = Organizacion.objects.create(nombre="Otra", slug="otra")
    peticion = _Peticion()

    set_audit_context(peticion, organizacion, action="publicar", metadata={"revision": "A1"})

    assert peticion._audit_context["action"] == "publicar"
    assert peticion._audit_context["metadata"] == {"revision": "A1"}


def test_sin_objeto_no_hace_nada():
    peticion = _Peticion()

    set_audit_context(peticion, None)

    assert not hasattr(peticion, "_audit_context")


@pytest.mark.django_db
def test_desenvuelve_la_peticion_de_drf():
    """DRF envuelve la peticion de Django en la suya, y el middleware lee el contexto de
    la de Django: sin desenvolver, el contexto se escribe en el envoltorio y se pierde."""
    organizacion = Organizacion.objects.create(nombre="Tercera", slug="tercera")
    interna = _Peticion()
    envoltorio = _Peticion()
    envoltorio._request = interna

    set_audit_context(envoltorio, organizacion)

    assert hasattr(interna, "_audit_context")
    assert not hasattr(envoltorio, "_audit_context")
