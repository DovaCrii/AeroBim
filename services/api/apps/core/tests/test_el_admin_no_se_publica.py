"""**El `/admin/` técnico no se publica**, y esta prueba es lo que lo sujeta.

## De dónde sale

`p340` sirve AeroBim por Funnel, o sea **en internet**. No fue una preferencia: el nombre tiene que
resolver desde cualquier equipo del piloto, y dentro del tailnet no resuelve — los navegadores con
DNS-over-HTTPS resuelven por su cuenta y **nunca le preguntan al sistema**, así que MagicDNS no se
entera. El síntoma que lo destapó fue un `DNS_PROBE_FINISHED_NXDOMAIN` desde otro PC.

Eso deja la pantalla de entrar al alcance de cualquiera, y es aceptable: no hay auto-registro,
`axes` bloquea a los cinco intentos y las claves las pone un administrador.

Lo que **no** es proporcionado es dejar además el `/admin/` de Django: es la ruta más rastreada de
internet entera, y quien entre ahí tiene la base completa. Y no hace falta para trabajar — la
aplicación tiene sus propias pantallas para lo que se hace todos los días.

## Por qué una prueba y no solo el `if`

Porque el fallo sería **silencioso en la dirección peligrosa**. Un `/admin/` que sigue publicado no
rompe nada, no sale en ningún registro y nadie lo nota: sencillamente está ahí, esperando. La única
forma de enterarse es pedirlo y ver qué contesta, que es lo que hace esto.
"""

import importlib

import pytest
from django.test import override_settings
from django.urls import clear_url_caches


def recargar_rutas():
    """Vuelve a importar `config.urls` para que el `if` de arriba se evalúe otra vez.

    Las rutas se construyen **al importar el módulo**, así que cambiar el entorno con
    `override_settings` no basta: hay que rehacerlas. Sin esto la prueba mediría las rutas que
    cargó el primer test de la sesión, y pasaría diga lo que diga el ajuste.
    """
    import config.urls

    importlib.reload(config.urls)
    clear_url_caches()


@pytest.fixture(autouse=True)
def rutas_limpias():
    """Deja las rutas como estaban. **Sin esto una prueba de aquí rompe a las demás**: un
    `/admin/` desaparecido a mitad de la sesión hace fallar cualquier otra que lo use."""
    yield
    recargar_rutas()


@pytest.mark.django_db
@override_settings(DEBUG=False, ROOT_URLCONF="config.urls")
def test_en_produccion_el_admin_no_esta(client, monkeypatch):
    """**404, no 403.** Un 403 confirma que la ruta existe, que es la mitad del trabajo de quien
    rastrea; un 404 no dice nada."""
    monkeypatch.delenv("AEROBIM_ADMIN_DJANGO", raising=False)
    recargar_rutas()

    assert client.get("/admin/").status_code == 404


@pytest.mark.django_db
@override_settings(DEBUG=False, ROOT_URLCONF="config.urls")
def test_se_puede_encender_cuando_hace_falta(client, monkeypatch):
    """No es una puerta tapiada: es una que se abre a propósito y se vuelve a cerrar.

    Hay cosas sin pantalla propia —un arreglo raro, una fila a mano— y para eso está. Lo que no
    puede es estar abierta por omisión.
    """
    monkeypatch.setenv("AEROBIM_ADMIN_DJANGO", "1")
    recargar_rutas()

    # Redirige al login del propio admin: existe. Sin la variable ni eso.
    assert client.get("/admin/").status_code in {200, 302}


@pytest.mark.django_db
def test_en_desarrollo_sigue_estando_sin_pedir_nada(client):
    """En desarrollo no hay nada que proteger, y quitarlo sería una fricción diaria a cambio de
    ninguna seguridad. La suite corre con `DEBUG=True`, así que esto mide el caso normal."""
    assert client.get("/admin/").status_code in {200, 302}


@pytest.mark.django_db
@override_settings(DEBUG=False, ROOT_URLCONF="config.urls")
def test_apagar_el_admin_no_apaga_las_pantallas_de_la_aplicacion(client, monkeypatch):
    """**La otra mitad, y es la que hace aceptable apagarlo.**

    Si al quitar `/admin/` se fueran también las pantallas de administración del producto, esto no
    sería endurecer sino romper: quien administra se quedaría sin poder dar de alta a nadie.
    """
    monkeypatch.delenv("AEROBIM_ADMIN_DJANGO", raising=False)
    recargar_rutas()

    from django.urls import reverse

    for nombre in (
        "accounts:usuarios-roles",
        "accounts:nueva-cuenta",
        "accounts:auditoria",
        "accounts:trabajos",
        "core:organizaciones",
    ):
        # Sin sesión redirigen al login, que es lo correcto — lo que importa es que **existen**.
        assert client.get(reverse(nombre)).status_code in {302, 403}, nombre
