"""Un proyecto con un entregable, que es el escenario de casi toda prueba de aqui."""

import pytest
from django.contrib.auth import get_user_model

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Revision
from apps.projects.models import Disciplina, Proyecto


@pytest.fixture
def organizacion(db):
    return Organizacion.objects.create(nombre="Constructora de prueba", slug="prueba")


@pytest.fixture
def proyectista(db, organizacion):
    usuario = get_user_model().objects.create_user(
        username="proyectista", password="una-clave-larga-99", email="proyectista@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.fixture
def revisor(db, organizacion):
    usuario = get_user_model().objects.create_user(
        username="revisor", password="una-clave-larga-99", email="revisor@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.fixture
def proyecto(db, organizacion):
    return Proyecto.objects.create(
        organizacion=organizacion, codigo="716-LCD", nombre="Edificio corporativo"
    )


@pytest.fixture
def disciplina(db, proyecto):
    return Disciplina.objects.create(proyecto=proyecto, codigo="AR", nombre="Arquitectura")


@pytest.fixture
def entregable(db, organizacion, proyecto, disciplina, proyectista):
    return Entregable.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-AR-P-001",
        titulo="Planta piso 5",
        responsable=proyectista,
        peso=3,
    )


@pytest.fixture
def revision(db, entregable, proyectista):
    from apps.documents.models import Idoneidad

    return Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
    )
