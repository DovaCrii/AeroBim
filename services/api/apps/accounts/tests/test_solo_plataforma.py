"""La auditoría y los trabajos son de la instalación, no de una organización (hallazgo M1, F14.2).

No llevan organización: con una segunda, el permiso de modelo dejaría a un administrador leer lo
que hicieron las otras. Con una sola organización se conserva el comportamiento de siempre.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion

pytestmark = pytest.mark.django_db

VISTAS = [
    ("accounts:auditoria", "core.view_auditevent"),
    ("accounts:trabajos", "core.view_jobrun"),
]


def _con_permiso(etiqueta, **extra):
    user = get_user_model().objects.create_user(
        username=extra.pop("username", "admin-a"), password="una-clave-larga-99", **extra
    )
    app_label, codename = etiqueta.split(".")
    user.user_permissions.add(
        Permission.objects.get(content_type__app_label=app_label, codename=codename)
    )
    return get_user_model().objects.get(pk=user.pk)


@pytest.mark.parametrize(("nombre", "permiso"), VISTAS)
def test_con_una_sola_organizacion_el_permiso_basta(client, nombre, permiso):
    Organizacion.objects.create(nombre="Una", slug="una")
    client.force_login(_con_permiso(permiso))

    assert client.get(reverse(nombre)).status_code == 200


@pytest.mark.parametrize(("nombre", "permiso"), VISTAS)
def test_con_dos_organizaciones_el_permiso_ya_no_basta(client, nombre, permiso):
    Organizacion.objects.create(nombre="Una", slug="una")
    Organizacion.objects.create(nombre="Otra", slug="otra")
    client.force_login(_con_permiso(permiso))

    assert client.get(reverse(nombre)).status_code == 403


@pytest.mark.parametrize(("nombre", "permiso"), VISTAS)
def test_el_superusuario_pasa_con_varias_organizaciones(client, nombre, permiso):
    Organizacion.objects.create(nombre="Una", slug="una")
    Organizacion.objects.create(nombre="Otra", slug="otra")
    root = get_user_model().objects.create_superuser("root", password="una-clave-larga-99")
    client.force_login(root)

    assert client.get(reverse(nombre)).status_code == 200
