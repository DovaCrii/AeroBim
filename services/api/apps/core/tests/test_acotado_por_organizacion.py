"""Acotar por organizacion: la mitad del control de acceso que el permiso no cubre.

`view_organizacion` dice "puede ver organizaciones", no "puede ver **estas**". Sin
acotar la consulta, pedir a mano el id de otra responde con el objeto.
"""

import pytest
from django.contrib.auth import get_user_model

from apps.core.models import Membresia, Organizacion
from apps.core.tenancy import scope_queryset_to_organizacion


@pytest.fixture
def escenario(db):
    una = Organizacion.objects.create(nombre="Constructora Uno", slug="uno")
    otra = Organizacion.objects.create(nombre="Constructora Dos", slug="dos")
    usuario = get_user_model().objects.create_user(username="alguien", password="clave-larga-99")
    Membresia.objects.create(organizacion=una, usuario=usuario)
    return una, otra, usuario


@pytest.mark.django_db
def test_solo_ve_lo_de_su_organizacion(escenario):
    una, otra, usuario = escenario

    # `Organizacion` no tiene el campo `organizacion`, asi que se prueba con `Membresia`,
    # que si lo tiene: es el caso real de un modelo de proyecto.
    visibles = scope_queryset_to_organizacion(Membresia.objects.all(), usuario)

    assert list(visibles.values_list("organizacion_id", flat=True)) == [una.id]
    assert otra.id not in visibles.values_list("organizacion_id", flat=True)


@pytest.mark.django_db
def test_sin_membresia_no_ve_nada(db):
    """**El contrario —"sin membresia, ve todo"— es el defecto clasico**: el primer
    usuario creado sin asignar queda con acceso completo y nadie se entera."""
    Organizacion.objects.create(nombre="Ajena", slug="ajena")
    suelto = get_user_model().objects.create_user(username="suelto", password="clave-larga-99")

    assert scope_queryset_to_organizacion(Membresia.objects.all(), suelto).count() == 0


@pytest.mark.django_db
def test_un_modelo_sin_el_campo_se_devuelve_intacto(escenario):
    """No todo pertenece a una organizacion, y obligar al campo por uniformidad crearia
    filas duplicadas por cada cliente."""
    _una, _otra, usuario = escenario

    assert scope_queryset_to_organizacion(Organizacion.objects.all(), usuario).count() == 2


@pytest.mark.django_db
def test_el_superusuario_ve_todo_porque_ya_puede(escenario):
    una, otra, _ = escenario
    jefe = get_user_model().objects.create_superuser(
        username="jefa", password="clave-larga-99", email=""
    )
    Membresia.objects.create(organizacion=otra, usuario=jefe)

    visibles = scope_queryset_to_organizacion(Membresia.objects.all(), jefe)
    assert visibles.count() == 2
    assert set(visibles.values_list("organizacion_id", flat=True)) == {una.id, otra.id}
