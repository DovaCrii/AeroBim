"""**`desplegar.sh` no se podía correr, y su guardián llevaba apagado desde que existe.**

## Lo que pasó, medido

`p340`, 2026-09-15. El procedimiento dice, literalmente, `sudo -u aerobim
/opt/aerobim/services/api/deploy/desplegar.sh`. Lo que contestó la VM:

    env: '/opt/aerobim/services/api/deploy/desplegar.sh': Permiso denegado

El archivo estaba en el repositorio con modo `100644` — **sin el bit de ejecución**, que git sí
guarda y que `respaldo.sh` sí tenía. Un guion de despliegue que el propio documento manda ejecutar y
que no se puede ejecutar.

## Y lo de debajo, que es peor

`desplegar.sh` empieza llamando a `comprobar-vecinos.sh` —la comprobación que existe para no tumbar
a AeroControl y a AeroConvert, que comparten la máquina— **detrás de un `[ -x ]`**. Ese archivo
tenía el mismo modo `100644`, así que la condición daba falso y la comprobación **no se corrió
nunca, ni una vez, sin decir una palabra**.

Es el modo de fallo que este repositorio ya conoce con otro nombre: una guarda que, cuando su
premisa no se cumple, **no protege y tampoco avisa**. Un `[ -x ]` alrededor de una comprobación de
seguridad convierte un bit de permiso en un interruptor silencioso.

## Por qué esto es una prueba y no solo un `chmod`

Porque el `chmod` arregla hoy y no mañana. El modo se pierde en cuanto alguien recrea el archivo
desde Windows —donde no hay bit de ejecución que preservar—, y el síntoma vuelve a ser el mismo:
nada falla, el despliegue se hace igual, y la comprobación de los vecinos deja de correr otra vez.

**No vale con mirar el disco**: en Windows `os.access(..., X_OK)` devuelve verdad para cualquier
archivo. Lo que hay que mirar es **lo que git guarda**, que es lo que llega a la VM.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[3]
DEPLOY = RAIZ / "deploy"

#: Los guiones que alguien escribe a mano en una terminal. Los `.conf` y las unidades de systemd no
#: se ejecutan —se copian— así que no entran.
EJECUTABLES = ("desplegar.sh", "respaldo.sh", "comprobar-vecinos.sh")


def _codigo() -> str:
    """`desplegar.sh` **sin sus comentarios**, que es lo único que se ejecuta.

    **No es una comodidad: sin esto las pruebas se leen a sí mismas.** El porqué de cada arreglo
    está escrito en el guion y nombra justo lo que se quitó —el `[ -x ]`, la cabecera del `curl`—,
    así que midiendo el archivo entero una prueba pasa por su propia explicación. Medido el
    2026-09-15: quitando la cabecera del `curl` de verdad, la prueba seguía en verde.
    """
    guion = (DEPLOY / "desplegar.sh").read_text(encoding="utf-8")
    return "\n".join(linea for linea in guion.splitlines() if not linea.lstrip().startswith("#"))


def _modo_en_git(ruta: Path) -> str:
    salida = subprocess.run(
        ["git", "ls-files", "-s", "--", str(ruta)],
        capture_output=True,
        text=True,
        cwd=RAIZ,
        check=True,
    ).stdout
    assert salida.strip(), f"{ruta} no está en el índice de git"
    return salida.split()[0]


@pytest.mark.skipif(shutil.which("git") is None, reason="hace falta git para leer el modo")
@pytest.mark.parametrize("nombre", EJECUTABLES)
def test_lo_que_el_procedimiento_manda_ejecutar_es_ejecutable(nombre):
    """**El modo que git guarda, no el que tenga el disco.**

    En Windows no hay bit de ejecución: cualquier comprobación contra el sistema de archivos local
    pasaría siempre, y el defecto llegaría igual a la VM. Lo que viaja es el índice.
    """
    assert (DEPLOY / nombre).exists(), f"{nombre} ya no está en deploy/"
    modo = _modo_en_git(DEPLOY / nombre)
    assert modo == "100755", (
        f"{nombre} está en git como {modo}: en la VM dará «Permiso denegado». "
        f"Arréglalo con: git update-index --chmod=+x services/api/deploy/{nombre}"
    )


def test_la_comprobacion_de_los_vecinos_no_depende_de_un_bit_de_permiso():
    """La guarda que la apagaba en silencio, y que no puede volver.

    Con `[ -x ]`, un archivo sin el bit hace que la comprobación **se salte sin ningún mensaje**.
    Con `[ -f ]` y `bash` explícito, el permiso deja de decidir si se corre; y si el archivo no
    está, se dice.
    """
    codigo = _codigo()

    assert "-x " not in codigo.split('paso "1/7')[0], (
        "el paso 0 vuelve a depender del bit de ejecución: un permiso perdido apagaría la "
        "comprobación que protege a AeroControl y AeroConvert, y en silencio"
    )
    assert 'bash "$AEROBIM_HOME/deploy/comprobar-vecinos.sh"' in codigo


def test_la_comprobacion_de_salud_no_la_tumba_la_redireccion_a_https():
    """**Sin la cabecera, `/health/` no puede contestar `ok` nunca.**

    `prod.py` sirve `SECURE_SSL_REDIRECT=True`: a una petición en claro Django contesta 301, y un
    `curl -s` de un 301 imprime **vacío**. El guion terminaba diciendo que el servicio no contesta
    sobre uno que estaba sano. `X-Forwarded-Proto: https` es lo que pone nginx delante y lo que lee
    `SECURE_PROXY_SSL_HEADER`: se pregunta igual que se pregunta de verdad.
    """
    # **Sin los comentarios, por lo mismo que la de arriba.** La primera versión de esta prueba
    # miraba el archivo entero y **no fallaba al quitar la cabecera del `curl`**: la explicación de
    # por qué hace falta la nombra, así que la prueba se estaba leyendo a sí misma. Medido.
    codigo = _codigo()

    assert "curl" in codigo
    assert "X-Forwarded-Proto: https" in codigo, (
        "la comprobación final pregunta en claro: `SECURE_SSL_REDIRECT` la contesta con un 301 "
        "y el guion lo lee como «no contesta»"
    )


def test_si_no_se_puede_reiniciar_se_sabe_antes_de_empezar():
    """**Tres minutos de trabajo para morir en la última línea.**

    Medido en `p340`: el guion corre como `aerobim` —así lo manda el procedimiento—, hizo los seis
    pasos, y el séptimo contestó `sudo: I'm sorry aerobim. I'm afraid I can't do that`. O sea que
    reconstruyó el visor, migró y recogió los estáticos, y **dejó corriendo la versión anterior**.

    `sudo -n` no pide contraseña ni se queda esperándola, así que se puede preguntar al principio.
    No aborta: los seis pasos sirven igual y rehacerlos después es peor que hacerlos.
    """
    codigo = _codigo()

    assert "sudo -n -l" in codigo, "el guion no comprueba al principio si podrá reiniciar"
    assert codigo.index("sudo -n -l") < codigo.index('paso "1/7'), (
        "la comprobación está después de empezar a trabajar: el aviso llega tarde"
    )


def test_se_pregunta_por_el_comando_exacto_y_no_por_sudo_entero():
    """**Un guardián que empuja hacia el permiso ancho está al revés.**

    La primera versión probaba `sudo -n true`: «¿puedes ejecutar cualquier cosa como root?».
    Medido en `p340` el 2026-09-16, y en el caso que la propia guía recomienda: se instaló el
    permiso **acotado** —solo `systemctl restart aerobim.service`, que es lo correcto y lo que pedía
    el mensaje de este mismo guion— y la comprobación **siguió diciendo que no se podía reiniciar**.

    O sea que castigaba a quien hace lo seguro y solo aprobaba a quien le da sudo entero al usuario
    del servicio. `sudo -l <comando>` contesta por el comando exacto, que es la pregunta de verdad.

    **Y el comando que se comprueba tiene que ser el que se ejecuta, carácter por carácter**: con
    `sudo systemctl restart aerobim` —sin ruta y sin `.service`— la comprobación diría que sí y el
    reinicio pediría la contraseña igual.
    """
    codigo = _codigo()

    assert "sudo -n true" not in codigo, (
        "vuelve a preguntar «¿puedes sudo?» en vez de «¿puedes este comando?»: eso rechaza el "
        "permiso acotado que la guía recomienda"
    )
    assert "REINICIO=(/usr/bin/systemctl restart aerobim.service)" in codigo
    # Lo que se comprueba y lo que se ejecuta salen de la misma variable: si alguien cambia uno de
    # los dos a mano, vuelven a poder decir cosas distintas.
    assert codigo.count('"${REINICIO[@]}"') == 2


def test_sin_reiniciar_no_se_comprueba_la_salud():
    """**Un oráculo que confirma lo que no ha pasado es peor que no tenerlo.**

    Si no se pudo reiniciar, `/health/` contesta `ok` igual —el proceso viejo está sano— y el guion
    terminaría con «OK: desplegado y sirviendo» sobre una versión que no es la que se acaba de
    construir. Así que la comprobación no llega a correr: se para antes, diciendo qué escribir.
    """
    codigo = _codigo()

    corte = codigo.index('PUEDE_REINICIAR" = "0"')
    assert corte < codigo.index("curl -s --max-time"), (
        "la comprobación de salud corre aunque no se haya reiniciado: diría que todo fue bien"
    )
    assert "exit 1" in codigo[corte : codigo.index("curl -s --max-time")]
    assert "sudo systemctl restart aerobim.service" in codigo, (
        "no le dice a la persona el comando exacto que le falta"
    )


def test_no_reiniciar_se_anuncia_como_una_averia_y_no_como_un_paso_pendiente():
    """**Parar en el paso 7 no deja el sistema viejo: lo deja roto.**

    Django lee las plantillas **del disco en cada petición**, así que los seis pasos anteriores ya
    pusieron las nuevas delante del proceso viejo. Una plantilla que nombra una ruta que ese proceso
    todavía no tiene revienta con `NoReverseMatch`.

    Medido en `p340` el 2026-09-16: `usuarios_roles.html` pasó a enlazar `accounts:editar-cuenta`,
    el servicio no se reinició, y la pantalla devolvió **500** a quien ya estaba dentro. El guion
    había terminado con «el código, el visor, la base y los estáticos están al día. Falta
    reiniciar» — que suena a tarea pendiente y era una avería en curso.

    El tono del mensaje es la funcionalidad aquí: quien lo lee decide en ese momento si sale a
    escribir el comando o si lo deja para después de comer.
    """
    guion = (DEPLOY / "desplegar.sh").read_text(encoding="utf-8")

    assert "ROTO" in guion, (
        "el mensaje de «no se pudo reiniciar» no dice que el sitio esté caído: se va a leer como "
        "un paso pendiente, que es lo que ya pasó una vez"
    )
    # Y lo dice **antes** de las instrucciones: enterrado bajo el comando, se lee después de haber
    # decidido que no corría prisa.
    assert guion.index("ROTO") < guion.index("Sal de este guion y escribe")


def test_una_respuesta_vacia_manda_a_mirar_la_direccion_y_no_el_journal():
    """Vacío y enfermo son dos cosas, y el mensaje era el mismo.

    Si nadie contesta en `$AEROBIM_SALUD`, lo primero que falla es la dirección —el puerto de nginx
    es de cada instalación: 443 en el `.conf` versionado, 8002 en `p340`, donde AeroControl tiene
    el 443—. Mandar a `journalctl` en ese caso es mandar a buscar donde no es.
    """
    guion = (DEPLOY / "desplegar.sh").read_text(encoding="utf-8")

    assert "AEROBIM_SALUD=http://127.0.0.1:PUERTO/health/" in guion, (
        "el error de «nadie contesta» tiene que nombrar la variable que lo arregla"
    )
