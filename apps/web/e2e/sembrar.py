"""Siembra la base efímera del e2e: una organización, una cuenta con su membresía y una obra.

Es **solo de prueba** y de uso local/CI: la clave está escrita aquí a propósito y la base es un
archivo temporal que `servidor.mjs` crea y borra. Nunca se corre contra una base real.
"""

import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group  # noqa: E402

from apps.accounts.roles import ADMINISTRADOR  # noqa: E402
from apps.core.models import Membresia, Organizacion  # noqa: E402
from apps.projects.models import Proyecto  # noqa: E402

organizacion, _ = Organizacion.objects.get_or_create(
    slug="e2e", defaults={"nombre": "Organización e2e"}
)
usuario, _ = get_user_model().objects.get_or_create(
    username="e2e", defaults={"email": "e2e@ejemplo.cl"}
)
usuario.set_password("clave-e2e-solo-para-pruebas-77")
usuario.save()
Membresia.objects.get_or_create(organizacion=organizacion, usuario=usuario)
grupo = Group.objects.filter(name=ADMINISTRADOR).first()
if grupo is None:
    sys.exit("Falta el rol Administrador: corre `manage.py bootstrap_roles` antes.")
usuario.groups.add(grupo)
Proyecto.objects.get_or_create(
    organizacion=organizacion, codigo="E2E-001", defaults={"nombre": "Obra de humo e2e"}
)
print("e2e sembrado")
