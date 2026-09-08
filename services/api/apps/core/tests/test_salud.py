"""`/health/`: contesta sin login, dice la verdad, y no cuenta de mas.

Las tres cosas se prueban porque las tres se rompen distinto: un health que pide
login no sirve para arrancar la unidad, uno que devuelve 200 pase lo que pase no
sirve para nada, y uno que explica su fallo con la ruta que fallo le entrega el
mapa del disco a quien todavia no ha entrado.
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse

# Toda peticion pasa por la auditoria y por la comprobacion de la base, asi que
# todas necesitan base. La caida se simula a mano, no dejando la base fuera: un
# fallo que ocurre porque las pruebas lo prohiben no prueba nada del despliegue.
pytestmark = pytest.mark.django_db


@pytest.fixture
def documentos_montados(tmp_path):
    """Un directorio de documentos que existe y acepta escritura, como en la VM buena."""
    carpeta = tmp_path / "documentos"
    carpeta.mkdir()
    return carpeta


def test_contesta_sin_autenticar(client, documentos_montados):
    """Es el punto entero: systemd y el proxy preguntan antes de que exista una sesion."""
    with override_settings(DOCUMENTS_DIR=documentos_montados):
        respuesta = client.get(reverse("salud"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["estado"] in {"ok", "degradado"}
    assert cuerpo["comprobaciones"]["base"] == "ok"
    assert cuerpo["comprobaciones"]["documentos"] == "ok"


def test_no_se_guarda_en_cache(client, documentos_montados):
    """Una respuesta cacheada convierte el aviso en una mentira con retraso."""
    with override_settings(DOCUMENTS_DIR=documentos_montados):
        respuesta = client.get(reverse("salud"))

    assert respuesta["Cache-Control"] == "no-store"


def test_el_directorio_de_documentos_sin_montar_saca_de_servicio(client, tmp_path):
    """**El fallo que destruye datos en silencio.** Sin el montaje, Django no falla:
    escribe en el disco local y lo subido se pierde al reiniciar."""
    with override_settings(DOCUMENTS_DIR=tmp_path / "no-montado"):
        respuesta = client.get(reverse("salud"))

    assert respuesta.status_code == 503
    assert respuesta.json()["estado"] == "fallo"
    assert respuesta.json()["comprobaciones"]["documentos"] == "fallo"


def test_la_base_caida_saca_de_servicio(client, documentos_montados):
    """Y se comprueba con una consulta de verdad: con `CONN_MAX_AGE` puesto, la
    conexion puede seguir abierta contra un servidor que ya se fue."""
    with (
        override_settings(DOCUMENTS_DIR=documentos_montados),
        patch("apps.core.health.connection.cursor", side_effect=OSError("sin servidor")),
    ):
        respuesta = client.get(reverse("salud"))

    assert respuesta.status_code == 503
    assert respuesta.json()["comprobaciones"]["base"] == "fallo"


def test_el_visor_sin_construir_degrada_pero_no_saca_de_servicio(
    client, documentos_montados, tmp_path
):
    """El portal, el registro y la API siguen funcionando sin el SPA: lo unico roto
    seria `/visor/`. Un 503 aqui sacaria de servicio la aplicacion entera por una
    mitad que no lo esta."""
    with override_settings(DOCUMENTS_DIR=documentos_montados, VISOR_DIST=tmp_path / "sin-build"):
        respuesta = client.get(reverse("salud"))

    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "degradado"
    assert respuesta.json()["comprobaciones"]["visor"] == "degradado"


def test_una_carpeta_de_visor_vacia_no_cuenta_como_construido(
    client, documentos_montados, tmp_path
):
    """`dist` existe en cuanto alguien corrio un build a medias, y una carpeta vacia
    servia un 404 sin explicacion."""
    vacia = tmp_path / "dist"
    vacia.mkdir()

    with override_settings(DOCUMENTS_DIR=documentos_montados, VISOR_DIST=vacia):
        respuesta = client.get(reverse("salud"))

    assert respuesta.json()["comprobaciones"]["visor"] == "degradado"


def test_no_filtra_rutas_ni_trazas(client, tmp_path):
    """Sin autenticar, la respuesta dice **que** fallo, nunca **donde** ni con que
    error. El detalle va al log, que es donde ya hay alguien autorizado mirando."""
    ausente = tmp_path / "un-nombre-de-carpeta-reconocible"

    with override_settings(DOCUMENTS_DIR=ausente):
        respuesta = client.get(reverse("salud"))

    texto = respuesta.content.decode()
    assert "un-nombre-de-carpeta-reconocible" not in texto
    assert str(Path(ausente)) not in texto
    assert "Traceback" not in texto


def test_no_acepta_metodos_que_muten(client, documentos_montados):
    """Es una pregunta, no una accion: un `POST` a `/health/` no es nada."""
    with override_settings(DOCUMENTS_DIR=documentos_montados):
        assert client.post(reverse("salud")).status_code == 405
        assert client.delete(reverse("salud")).status_code == 405
