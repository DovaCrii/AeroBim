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
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]

#: El prólogo que **esconde `psycopg` del subproceso**, esté instalado o no.
#:
#: Antes esto era un `skipif`: si `psycopg` estaba presente, la prueba se saltaba entera «porque
#: aquí no hay nada que delatar». Funcionaba mientras la CI instalara solo el grupo `dev` — y dejó
#: de funcionar el día que entró PostgreSQL al gate, porque entonces `psycopg` está siempre y esta
#: prueba **se habría saltado siempre**, quedando el mensaje sin vigilar justo cuando más gente lo
#: iba a leer.
#:
#: Con el buscador de módulos de abajo, el subproceso ve exactamente lo que ve una VM recién
#: instalada, y la prueba corre en los dos casos. Es la diferencia entre comprobar algo y comprobar
#: que hoy no se puede comprobar.
SIN_PSYCOPG = """
import sys

class NoHayPsycopg:
    def find_spec(self, nombre, ruta=None, destino=None):
        if nombre == "psycopg" or nombre.startswith("psycopg."):
            raise ModuleNotFoundError(f"No module named {nombre!r}", name=nombre)
        return None

sys.meta_path.insert(0, NoHayPsycopg())
import django
django.setup()
"""


def _cargar_ajustes(entorno: dict[str, str]) -> subprocess.CompletedProcess[str]:
    # **Se hereda el entorno del sistema y se pisa lo que interesa.** Un entorno
    # vacio parece mas limpio y no lo es: en Windows, sin `SYSTEMROOT`, Python no
    # llega a inicializar los sockets y el proceso muere antes de leer un ajuste —o
    # sea, la prueba pasaria a verde por el motivo equivocado.
    base = {llave: valor for llave, valor in os.environ.items() if llave != "DB_ENGINE"}
    return subprocess.run(
        [sys.executable, "-c", SIN_PSYCOPG],
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


def test_el_prologo_esconde_psycopg_de_verdad():
    """**La prueba de que estas pruebas no son ciegas.**

    Todo lo de arriba se apoya en que el subproceso no pueda importar `psycopg`. Si ese prólogo
    dejara de funcionar —un cambio en el mecanismo de importación, un error de escritura en el
    nombre— los tres casos seguirían en verde **por el motivo equivocado**: con `psycopg` presente,
    los ajustes cargarían y `returncode` sería 0… salvo que los dos primeros esperan lo contrario.

    O sea que los dos primeros ya lo delatarían **si `psycopg` está instalado**. Esto lo delata
    también cuando no lo está, que es el caso en el que el `skipif` de antes escondía todo.
    """
    resultado = subprocess.run(
        [
            sys.executable,
            "-c",
            SIN_PSYCOPG.replace("import django\ndjango.setup()", "import psycopg"),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert resultado.returncode != 0
    assert "psycopg" in resultado.stderr
