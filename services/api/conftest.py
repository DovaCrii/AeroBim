"""El escenario que comparte la suite: una organizacion, su gente, una obra y un entregable.

**Estaba en `apps/documents/tests/conftest.py` y ahi solo lo veia esa aplicacion**, con un archivo
en `apps/visor/tests` que reenviaba los siete nombres. Al aparecer las pantallas de proyecto
—`apps/projects`— habia que elegir entre un tercer reenvio, duplicarlo, o subirlo. Duplicarlo es
como dos escenarios parecidos se separan sin que nadie se entere: una prueba pasa con un usuario
que en el otro archivo ya no tiene membresia.

**El motivo que tenia escrito el reenvio era equivocado**: decia que «un fixture global lo carga
toda la suite», y no es asi — las fixturas de pytest son perezosas y solo se construyen cuando una
prueba las pide. Con ese motivo caido, viven aca.

`Entregable` y `Revision` son modelos de `documents` y aun asi estan aca, porque **las tres
aplicaciones los necesitan**: el visor abre una revision, la pantalla del proyecto las lista, y el
registro es su casa. Lo que use una sola aplicacion se queda en su propio `conftest.py`.
"""

import pytest
from django.contrib.auth import get_user_model

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Idoneidad, Revision
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
    return Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
    )
