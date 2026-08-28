"""`DB_ENGINE=postgresql` sin psycopg tiene que fallar **al cargar los ajustes**.

Es el hueco que se encontró preparando la VM. Sin la comprobación, Django arranca
igual y falla en la primera consulta con un `ImproperlyConfigured` que nombra
`psycopg2` —el paquete anterior—, o sea que manda a instalar el que no es. Y como
el fallo llega con la primera petición y no al arrancar, `systemctl start` informa
`active` sobre un servicio que no sirve.

**Se prueba en un proceso aparte** porque lo que se comprueba ocurre al **importar**
el módulo de ajustes, y el de esta sesión ya está importado.
"""

import os
import subprocess
import sys
from importlib.util import find_spec
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parents[3]

pytestmark = pytest.mark.skipif(
    find_spec("psycopg") is not None,
    reason="psycopg está instalado (grupo `deploy`): aquí no hay nada que delatar",
)


def _cargar_ajustes(entorno: dict[str, str]) -> subprocess.CompletedProcess[str]:
    # **Se hereda el entorno del sistema y se pisa lo que interesa.** Un entorno
    # vacio parece mas limpio y no lo es: en Windows, sin `SYSTEMROOT`, Python no
    # llega a inicializar los sockets y el proceso muere antes de leer un ajuste —o
    # sea, la prueba pasaria a verde por el motivo equivocado.
    base = {llave: valor for llave, valor in os.environ.items() if llave != "DB_ENGINE"}
    return subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=BASE_DIR,
        env={
            **base,
            "DJANGO_SETTINGS_MODULE": "config.settings.dev",
            "SECRET_KEY": "solo-para-la-prueba-nunca-en-produccion-xxxx",
            **entorno,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_sin_psycopg_falla_al_cargar_y_dice_el_comando():
    resultado = _cargar_ajustes(
        {"DB_ENGINE": "postgresql", "DB_NAME": "aerobim", "DB_USER": "aerobim"}
    )

    assert resultado.returncode != 0
    # Lo que tiene que decir: qué falta y **cómo se instala**. Un mensaje que solo
    # dice "falta un driver" deja al operador buscando cuál.
    assert "psycopg 3" in resultado.stderr
    assert "--group deploy" in resultado.stderr
    # Y lo que no puede decir: el nombre del paquete anterior, que es lo que mandaba
    # a instalar el que no es.
    assert "psycopg2" not in resultado.stderr


def test_el_alias_corto_del_motor_tambien_se_comprueba():
    """`.env.example` sugiere `postgres` y `base.py` acepta los dos nombres: si la
    comprobación mirara solo uno, la mitad de las instalaciones seguiría fallando
    tarde."""
    resultado = _cargar_ajustes(
        {"DB_ENGINE": "postgres", "DB_NAME": "aerobim", "DB_USER": "aerobim"}
    )

    assert resultado.returncode != 0
    assert "--group deploy" in resultado.stderr


def test_sqlite_no_pide_nada():
    """El camino de siempre no se toca: sin `DB_ENGINE`, la aplicación carga."""
    assert _cargar_ajustes({}).returncode == 0
