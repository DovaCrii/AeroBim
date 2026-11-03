"""La caché local de modelos se vacía al pulsar «Salir» (guion propio, compatible con la CSP)."""

from pathlib import Path

import pytest
from django.conf import settings
from django.urls import reverse

from apps.core.middleware import build_csp

GUION = "js/vaciar-cache-al-salir.js"


@pytest.mark.django_db
def test_la_pagina_con_salir_incluye_el_guion_y_marca_el_formulario(client, django_user_model):
    usuario = django_user_model.objects.create_user("persona", password="x-no-secreta")
    client.force_login(usuario)

    html = client.get(reverse("accounts:ayuda")).content.decode()

    assert GUION in html
    assert "data-vaciar-cache-local" in html
    assert reverse("logout") in html


def test_el_guion_es_un_archivo_y_la_csp_no_se_abre():
    guion = (Path(settings.BASE_DIR) / "static" / GUION).read_text(encoding="utf-8")
    assert "deleteDatabase" in guion
    assert "try" in guion  # nunca bloquea el cierre
    politica = build_csp()
    assert "script-src 'self'" in politica
    assert "unsafe-inline" not in politica.split("style-src")[0]
