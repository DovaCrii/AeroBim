"""Las unidades de systemd y los guiones de `deploy/`, comprobados **como archivos**.

## Por qué existe esta prueba

**Dos veces ha pasado lo mismo: una unidad descrita en la documentación y nunca escrita.**

- El timer del resumen «hasta hoy no existía»: el comando `enviar_resumen` estaba escrito y nadie lo
  disparaba, así que el resumen no salía nunca.
- El par del respaldo estuvo descrito en prosa en `docs/DEPLOY.md` —`Type=oneshot`,
  `OnCalendar=*-*-* 02:00:00`, `Persistent=true`— durante semanas, sin existir como archivo.

Las dos veces el síntoma fue el mismo y es el peor posible: **la documentación decía la verdad sobre
lo que haría falta, y nadie podía notar que faltaba** hasta que alguien fue a copiarlas a la VM. Un
procedimiento que manda copiar un archivo que no está no falla en ningún gate; falla en el
despliegue, con alguien delante y sin margen.

Así que deja de ser una lección y pasa a ser una prueba: **lo que `DEPLOY.md` manda copiar tiene que
existir, y lo que existe tiene que estar mandado copiar.**

## Y lo que estas pruebas **no** comprueban

Que las unidades **funcionen**. Eso pide systemd, y se hizo aparte: `systemd-analyze verify` sobre
las diez, en un WSL con Ubuntu 24.04 —la misma distribución que la VM—, más gunicorn arrancando de
verdad sobre el socket. Está en el PR, no aquí: la suite corre en Windows y en la CI, y ninguno de
los dos tiene systemd.
"""

import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[3]
DEPLOY = RAIZ / "deploy"
DOCUMENTO = RAIZ.parents[1] / "docs" / "DEPLOY.md"

#: Las unidades y guiones que el despliegue instala. El nombre es el del archivo.
ARCHIVOS = sorted(
    p.name for p in DEPLOY.iterdir() if p.suffix in {".service", ".timer", ".sh", ".conf"}
)


def test_el_barrido_encuentra_de_verdad_los_archivos():
    """**Una prueba que no mira nada pasa siempre.** Si `deploy/` se mueve, el resto quedaría en
    verde sobre una lista vacía."""
    assert DEPLOY.is_dir()
    assert DOCUMENTO.is_file()
    assert len(ARCHIVOS) >= 10, ARCHIVOS


@pytest.mark.parametrize("nombre", ARCHIVOS)
def test_cada_archivo_de_deploy_esta_nombrado_en_el_procedimiento(nombre):
    """La otra mitad: **un archivo que nadie manda copiar no se copia.**

    Es el caso simétrico y ha pasado igual de fácil — se escribe la unidad, se prueba, y se olvida
    añadir las dos líneas que la instalan.
    """
    texto = DOCUMENTO.read_text(encoding="utf-8")

    # Se acepta la forma abreviada de bash: `aerobim-resumen.{service,timer}`.
    raiz = nombre.rsplit(".", 1)[0]
    esta = nombre in texto or f"{raiz}.{{service,timer}}" in texto

    assert esta, f"{nombre} existe en deploy/ y `docs/DEPLOY.md` no lo nombra: nadie lo instalará"


def test_todo_lo_que_el_procedimiento_manda_copiar_existe():
    """**El defecto que esto vigila, y que ya ocurrió dos veces.**

    El procedimiento mandaba `sudo cp services/api/deploy/…` de archivos que no estaban escritos.
    """
    texto = DOCUMENTO.read_text(encoding="utf-8")

    # `deploy/algo.service`, y también la forma `deploy/algo.{service,timer}`.
    sueltos = set(re.findall(r"deploy/([A-Za-z0-9_-]+\.(?:service|timer|sh|conf))", texto))
    for raiz in re.findall(r"deploy/([A-Za-z0-9_-]+)\.\{service,timer\}", texto):
        sueltos.update({f"{raiz}.service", f"{raiz}.timer"})

    faltan = sorted(uno for uno in sueltos if not (DEPLOY / uno).is_file())

    assert not faltan, (
        f"`docs/DEPLOY.md` manda copiar {faltan}, y no están en deploy/. "
        "Ya pasó dos veces: el timer del resumen y el par del respaldo"
    )


@pytest.mark.parametrize("nombre", [uno for uno in ARCHIVOS if uno.endswith(".timer")])
def test_cada_timer_tiene_su_service_y_lo_nombra(nombre):
    """Un `.timer` sin su `.service` no arranca nada, y systemd no se queja al instalarlo."""
    servicio = nombre.replace(".timer", ".service")

    assert (DEPLOY / servicio).is_file(), f"{nombre} no tiene {servicio}"
    assert servicio in (DEPLOY / nombre).read_text(encoding="utf-8"), (
        f"{nombre} no nombra a {servicio} en `Unit=`"
    )


@pytest.mark.parametrize("nombre", [uno for uno in ARCHIVOS if uno.endswith(".timer")])
def test_cada_timer_sobrevive_a_la_maquina_apagada(nombre):
    """**`Persistent=true` o el trabajo se pierde sin dejar rastro.**

    Sin él, un reinicio nocturno se lleva el respaldo del día o el resumen, y en la pantalla de
    trabajos se ve como «no corrió» sin motivo. Es la clase de ausencia que se descubre el día que
    hace falta la copia.
    """
    assert "Persistent=true" in (DEPLOY / nombre).read_text(encoding="utf-8")


@pytest.mark.parametrize(
    "nombre", [uno for uno in ARCHIVOS if uno.endswith(".service") and uno != "aerobim.service"]
)
def test_ningun_trabajo_periodico_se_reintenta_solo(nombre):
    """**Un `Restart=` en un `oneshot` manda el mismo correo cuatro veces.**

    El del resumen lo dice en su cabecera: con un SMTP caído, los reintentos no arreglan nada y la
    gente recibe el aviso repetido. Lo mismo vale para el respaldo contra un disco lleno.

    `aerobim.service` queda fuera: ese sí es un servicio que se queda vivo y **tiene** que
    reiniciarse.
    """
    texto = (DEPLOY / nombre).read_text(encoding="utf-8")
    activas = [uno for uno in texto.splitlines() if uno.strip().startswith("Restart=")]

    assert activas == [], f"{nombre} lleva {activas}: un trabajo periódico no se reintenta solo"


def test_el_respaldo_puede_correr_fuera_de_la_vm():
    """**Lo que hizo ensayable `--verificar`, que es la puerta del piloto.**

    `respaldo.sh` llevaba `/opt/aerobim/services/api` y `.venv/bin/python` escritos a mano, así que
    solo corría en la VM — y `docs/DEPLOY.md` dice que hasta que `--verificar` pase una vez el
    piloto no arranca. O sea que el primero de la historia iba a ser el de producción.
    """
    texto = (DEPLOY / "respaldo.sh").read_text(encoding="utf-8")

    assert 'AEROBIM_HOME="${AEROBIM_HOME:-/opt/aerobim/services/api}"' in texto, (
        "tiene que haber una variable con la ruta de la VM **como valor por omisión**"
    )

    # La ruta puede aparecer **una sola vez**: la de arriba, que es el valor por omisión y está
    # bien que sea el de la VM. Cualquier otro uso vuelve a atar el guion a esa máquina.
    #
    # Los comentarios sí la citan —es donde se explica de dónde viene— y por eso se descartan.
    usos = [
        uno
        for uno in texto.splitlines()
        if "/opt/aerobim" in uno
        and not uno.lstrip().startswith("#")
        and "AEROBIM_HOME:-" not in uno
    ]

    assert usos == [], f"vuelve a haber rutas fijas y solo correría en la VM: {usos}"
