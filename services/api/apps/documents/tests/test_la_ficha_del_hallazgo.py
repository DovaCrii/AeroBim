"""**La ficha de un hallazgo, medida** (2026-09-28).

A 1600 px la ficha lateral medía 1 379 px —2,5 veces la conversación— y «Cerrarlo» empezaba a 1 298,
fuera de la pantalla: delante tenía el formulario de reparto abierto (348 px, repitiendo los tres
datos de encima) y diez casillas de etiquetas en columna (375 px). Y el desplegable del responsable
abría con «---------», una opción que el modelo no admite.

Lo que se sujeta aquí es lo que la plantilla puede perder sin que nada falle: que el reparto siga
plegado **y siga siendo un formulario que envía**, y que el responsable no ofrezca vaciarse.
"""

import re

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.urls import reverse

from apps.accounts import roles
from apps.documents.forms import RepartoForm
from apps.documents.models import Observacion

pytestmark = pytest.mark.django_db


@pytest.fixture
def ficha(client, organizacion, proyecto, revisor):
    observacion = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Ducto atraviesa viga",
        autor=revisor,
        responsable=revisor,
    )
    call_command("bootstrap_roles", verbosity=0)
    revisor.groups.add(Group.objects.get(name=roles.COORDINADOR))
    client.force_login(type(revisor).objects.get(pk=revisor.pk))
    return observacion, client.get(reverse("documents:observacion", args=[observacion.pk]))


def test_el_responsable_no_ofrece_quedarse_sin_nadie(ficha):
    observacion, _ = ficha
    opciones = [
        valor for valor, _ in RepartoForm(instance=observacion).fields["responsable"].choices
    ]

    assert "" not in opciones


def test_el_reparto_va_plegado_y_sigue_enviando(ficha):
    observacion, respuesta = ficha
    html = respuesta.content.decode()

    plegado = re.search(r'<details class="lado-plegable">(.*?)</details>', html, re.S)
    assert plegado is not None, "el reparto dejó de ir plegado"
    formulario = plegado.group(1)
    assert reverse("documents:repartir-observacion", args=[observacion.pk]) in formulario
    for campo in ("responsable", "vence", "prioridad"):
        assert f'name="{campo}"' in formulario


def test_cerrar_sigue_siendo_lo_ultimo_de_la_ficha(ficha):
    """El orden es una decisión escrita en la plantilla: cerrar va al final y en tono menor."""
    _, respuesta = ficha
    lado = respuesta.content.decode().split('class="hallazgo-lado"', 1)[1]

    assert lado.index("lado-plegable") < lado.index("lado-cierre")
