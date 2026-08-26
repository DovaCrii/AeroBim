"""El portal de ingreso: bloqueo por intentos, y sin pistas sobre quien existe."""

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse


@pytest.fixture
def alguien(db):
    return get_user_model().objects.create_user(
        username="proyectista", password="una-clave-larga-99"
    )


@pytest.mark.django_db
def test_no_hay_auto_registro(client):
    """No existe una ruta de alta. Una aplicacion de control documental donde
    cualquiera se da de alta no controla nada."""
    assert client.get("/accounts/signup/").status_code == 404
    assert client.get("/accounts/register/").status_code == 404


@pytest.mark.django_db
def test_el_error_no_dice_si_el_usuario_existe(client, alguien):
    """**El mismo mensaje en los dos casos.** Distinguirlos le regala a quien prueba
    credenciales la mitad del trabajo: con el primer mensaje ya sabe que nombres hay."""
    inexistente = client.post(
        reverse("login"), {"username": "no-existe", "password": "lo-que-sea-99"}
    )
    mala_clave = client.post(
        reverse("login"), {"username": "proyectista", "password": "no-es-esta-99"}
    )

    assert inexistente.status_code == 200
    assert mala_clave.status_code == 200
    assert "Invalid username or password" in inexistente.content.decode()
    assert "Invalid username or password" in mala_clave.content.decode()


@pytest.mark.django_db
def test_entrar_con_la_clave_correcta_lleva_al_portal(client, alguien):
    respuesta = client.post(
        reverse("login"), {"username": "proyectista", "password": "una-clave-larga-99"}
    )

    assert respuesta.status_code == 302
    assert respuesta["Location"] == "/"


@override_settings(AXES_ENABLED=True, AXES_FAILURE_LIMIT=3)
@pytest.mark.django_db
def test_axes_bloquea_tras_los_intentos_configurados(client, alguien):
    """**axes va antes que el backend real**, asi que corta el intento bloqueado sin
    llegar a comprobar la contraseña. Se comprueba con la clave *buena* al final: si
    entrara, el bloqueo no estaria haciendo nada."""
    from axes.helpers import get_client_username  # noqa: F401  (importable = axes activo)

    for _ in range(3):
        client.post(reverse("login"), {"username": "proyectista", "password": "mala-99"})

    bloqueado = client.post(
        reverse("login"), {"username": "proyectista", "password": "una-clave-larga-99"}
    )

    # Bloqueado devuelve 403 (o 429 segun la version); lo que no puede es dejar entrar.
    assert bloqueado.status_code in {403, 429}
    assert not (bloqueado.status_code == 302 and bloqueado.get("Location") == "/")


@pytest.mark.django_db
def test_el_endpoint_de_token_tiene_su_propio_limite():
    """`ObtainAuthToken` de DRF viene con `throttle_classes = ()`, o sea que deja fuera
    del limite global al unico endpoint que acepta usuario y contraseña sin autenticar.
    Aqui se comprueba que la subclase se lo puso."""
    from rest_framework.throttling import AnonRateThrottle

    from config.urls import TokenConThrottle

    assert AnonRateThrottle in TokenConThrottle.throttle_classes
