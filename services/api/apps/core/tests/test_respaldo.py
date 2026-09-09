"""`deploy/respaldo.sh`, ejecutado por primera vez.

**El guion del respaldo llevaba desde que se escribio sin correr una sola vez**, y estaba dicho:
necesita `pg_dump`, `pg_restore` y `createdb`, que no estan en la maquina de desarrollo. Es tambien
la razon de que no lleve temporizador -- un respaldo automatico que nadie vio funcionar es peor que
ninguno, porque se confia en el.

Esta prueba separa dos preguntas que juntas bloqueaban las dos:

* **Si PostgreSQL vuelve de un volcado.** Eso pide PostgreSQL y sigue sin comprobarse. No se
  simula, porque una respuesta simulada a esa pregunta no vale nada.
* **Si el guion hace lo que dice.** El orden, las comillas, la rotacion que **borra**, el `trap` que
  limpia, el `sha256sum` que compara, el aviso cuando no hay nada que comprobar. Eso es bash, y bash
  si esta -- y ahi habia un defecto.

Los programas de PostgreSQL se sustituyen por otros de mentira que anotan como se los llamo. Queda
claro lo que eso comprueba y lo que no: que el guion los llama bien, no que ellos respondan bien.

**Y encontro esto, medido el 2026-09-09:** el nombre de la base de prueba estaba en una variable
`local` de la funcion, y el `trap EXIT` que la borra **no la veia** -- bash deshace el alcance de la
funcion antes de correr el trap de salida, y por los dos caminos, el bueno y el malo. El
`dropdb --if-exists ""` que salia de ahi no borraba nada, y el `|| true` se tragaba la queja. Con la
comprobacion diaria que el propio guion propone, eso deja una copia entera de la base por dia, para
siempre, en el mismo disco que protege -- y cada una con los correos y los hashes de contraseña que
el guion se cuida de no dejar legibles.
"""

import os
import shutil
import subprocess  # nosec B404 -- bash del sistema y un guion del repositorio, nada de fuera
from pathlib import Path

import pytest

GUION = Path(__file__).resolve().parents[3] / "deploy" / "respaldo.sh"

BASH = shutil.which("bash")

# En Windows `bash` existe pero es el de WSL, y ve otro sistema de archivos: las rutas temporales de
# pytest no le llegan. Se salta ahi y corre en CI, que es Linux -- que es ademas el sistema del
# servidor, o sea donde esta prueba dice algo.
solo_en_linux = pytest.mark.skipif(
    BASH is None or os.name != "posix",
    reason="el guion es de la VM: se ejercita en Linux, que es donde va a correr",
)

#: Los programas de mentira. Cada uno anota su nombre y sus argumentos en `$LLAMADAS`; `pg_dump`
#: escribe algo en el archivo que le pidan, para que el `sha256sum` de despues tenga que comparar.
DOBLES = """#!/bin/sh
echo "$(basename "$0") $*" >> "$LLAMADAS"
if [ "$(basename "$0")" = "pg_dump" ]; then
  for a in "$@"; do
    case "$a" in --file=*) echo "un volcado de mentira" > "${a#--file=}" ;; esac
  done
fi
exit 0
"""


def _preparar(tmp_path: Path) -> dict[str, str]:
    """Un entorno con los dobles delante del `PATH` y un `DOCUMENTS_DIR` con algo dentro."""
    falsos = tmp_path / "bin"
    falsos.mkdir()
    for nombre in ("pg_dump", "pg_restore", "createdb", "dropdb"):
        doble = falsos / nombre
        doble.write_text(DOBLES, encoding="utf-8")
        doble.chmod(0o755)

    documentos = tmp_path / "documentos"
    documentos.mkdir()
    (documentos / "una-revision.ifc").write_text("no es un IFC, y aqui da igual", encoding="utf-8")

    entorno = dict(os.environ)
    entorno.update(
        {
            "PATH": f"{falsos}:{entorno.get('PATH', '')}",
            "AEROBIM_RESPALDOS": str(tmp_path / "respaldos"),
            "DOCUMENTS_DIR": str(documentos),
            "DB_NAME": "aerobim_de_prueba",
            "LLAMADAS": str(tmp_path / "llamadas.txt"),
        }
    )
    return entorno


def _correr(entorno: dict[str, str], *argumentos: str) -> subprocess.CompletedProcess[str]:
    assert BASH is not None
    return subprocess.run(  # nosec B603 -- bash del sistema, guion del repositorio
        [BASH, str(GUION), *argumentos],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
        env=entorno,
    )


def _llamadas(entorno: dict[str, str]) -> list[str]:
    archivo = Path(entorno["LLAMADAS"])
    return archivo.read_text(encoding="utf-8").splitlines() if archivo.exists() else []


@solo_en_linux
def test_el_respaldo_deja_las_dos_mitades_y_sus_sumas(tmp_path: Path):
    """Base y documentos **en el mismo juego**, que es el motivo de que el guion exista."""
    entorno = _preparar(tmp_path)
    salida = _correr(entorno)
    assert salida.returncode == 0, salida.stderr

    juegos = sorted((tmp_path / "respaldos").iterdir())
    assert len(juegos) == 1
    juego = juegos[0]
    # El sello es la fecha, y ese formato es lo que hace que ordenar por nombre sea ordenar por
    # fecha -- de lo que depende la rotacion de mas abajo.
    assert len(juego.name) == len("20260909-120000")

    assert (juego / "base.dump").exists()
    assert (juego / "documentos.tar").exists()
    # El `sha256sum --check` del guion ya paso -- si no, el `set -e` habria cortado. Aqui se
    # comprueba que el archivo de sumas nombra **las dos** cosas, que es lo que lo hace util.
    sumas = (juego / "sha256sums.txt").read_text(encoding="utf-8")
    assert "base.dump" in sumas
    assert "documentos.tar" in sumas


@solo_en_linux
def test_el_volcado_se_pide_en_formato_custom(tmp_path: Path):
    """No es un detalle: de un `.sql` plano no se puede restaurar una tabla sola."""
    entorno = _preparar(tmp_path)
    assert _correr(entorno).returncode == 0

    llamadas = _llamadas(entorno)
    volcado = next(una for una in llamadas if una.startswith("pg_dump"))
    assert "--format=custom" in volcado
    assert "aerobim_de_prueba" in volcado


@solo_en_linux
def test_el_tar_de_documentos_trae_los_archivos(tmp_path: Path):
    """Un `tar` que se abre y esta vacio es la clase de respaldo que se descubre al necesitarlo."""
    entorno = _preparar(tmp_path)
    assert _correr(entorno).returncode == 0

    juego = next(iter((tmp_path / "respaldos").iterdir()))
    listado = subprocess.run(  # nosec B603, B607 -- `tar` del sistema sobre un archivo temporal
        ["tar", "--list", "--file", str(juego / "documentos.tar")],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert "una-revision.ifc" in listado


@solo_en_linux
def test_la_rotacion_guarda_catorce_y_borra_los_viejos(tmp_path: Path):
    """Es la parte que **borra**, asi que conviene verla borrar y verla parar."""
    entorno = _preparar(tmp_path)
    destino = tmp_path / "respaldos"
    destino.mkdir()
    # Dieciseis juegos viejos con el sello del guion: el mas viejo el dia 1.
    for dia in range(1, 17):
        (destino / f"202608{dia:02d}-120000").mkdir()

    assert _correr(entorno).returncode == 0

    quedan = sorted(uno.name for uno in destino.iterdir())
    # Catorce, y el nuevo entre ellos: o sea que se quitaron tres de los diecisiete que hubo.
    assert len(quedan) == 14
    # Y los que se fueron son **los mas antiguos**, no unos cualesquiera.
    assert "20260801-120000" not in quedan
    assert "20260816-120000" in quedan


@solo_en_linux
def test_sin_ningun_respaldo_la_comprobacion_lo_dice(tmp_path: Path):
    """Y no muere con un «no such file», que hace pensar que el guion se rompio."""
    entorno = _preparar(tmp_path)
    salida = _correr(entorno, "--verificar")

    assert salida.returncode == 1
    assert "no hay ningun respaldo" in salida.stderr


@solo_en_linux
def test_la_base_de_prueba_se_borra_al_terminar(tmp_path: Path):
    """**Este es el defecto que esta prueba encontro.**

    La comprobacion restaura sobre una base aparte -- nunca sobre la de produccion -- y tiene que
    borrarla al salir. Con el nombre en una variable `local`, el `trap EXIT` la veia vacia y no
    borraba nada: una copia entera de la base por comprobacion, acumulandose.
    """
    entorno = _preparar(tmp_path)
    assert _correr(entorno).returncode == 0

    # La comprobacion llega hasta Django, que aqui no existe -- `cd /opt/aerobim` falla. Da igual
    # para lo que se mide: el `trap` corre igual, y de hecho el camino del fallo es el que menos se
    # mira. Lo que importa es que la base de prueba no sobreviva a ninguno de los dos.
    _correr(entorno, "--verificar")

    llamadas = _llamadas(entorno)
    creadas = [una for una in llamadas if una.startswith("createdb ")]
    borradas = [una for una in llamadas if una.startswith("dropdb ")]
    assert len(creadas) == 1, llamadas
    assert len(borradas) == 1, llamadas

    # Y con el **mismo nombre**: un `dropdb --if-exists ""` cuenta como llamada y no borra nada.
    nombre = creadas[0].removeprefix("createdb ").strip()
    assert nombre.startswith("aerobim_prueba_")
    assert nombre in borradas[0]
