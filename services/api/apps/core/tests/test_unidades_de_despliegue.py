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


def test_el_servidor_por_defecto_vive_en_su_propio_archivo():
    """**Un `default_server` en el sitio principal tumbaría a AeroConvert al instalar AeroBim.**

    Solo un bloque de toda la máquina puede declararlo para un puerto dado. Con dos, `nginx -t`
    falla con `a duplicate default server for 0.0.0.0:443` y **nginx entero no arranca**, así que
    el vecino se cae con nosotros — y el error no menciona a AeroBim por ninguna parte.

    Medido en un WSL con el mismo Ubuntu 24.04 y el mismo nginx 1.24: con el vecino y nuestro
    servidor por defecto, ese error exacto; sin él, `syntax is ok`.

    Por eso son dos archivos: el sitio se instala siempre y el servidor por defecto solo si nadie
    más lo tiene. Esta prueba impide que alguien los junte «para simplificar», que es justo lo que
    parece razonable hasta que se instala en una máquina compartida.
    """
    sitio = (DEPLOY / "nginx-aerobim.conf").read_text(encoding="utf-8")
    aparte = DEPLOY / "nginx-aerobim-default.conf"

    assert aparte.is_file(), "falta `nginx-aerobim-default.conf`"
    # Se miran las líneas de directiva, no el texto: los comentarios de los dos archivos hablan
    # largo de `default_server`, y buscarlo a secas daría un falso positivo en cada explicación.
    directivas = [
        linea.strip()
        for linea in sitio.splitlines()
        if linea.strip().startswith("listen") and "default_server" in linea
    ]
    assert not directivas, (
        "`nginx-aerobim.conf` declara un servidor por defecto: donde otro servicio ya tenga el "
        f"suyo, nginx no arranca y se caen los dos. Va en el archivo aparte. {directivas}"
    )
    assert "default_server" in aparte.read_text(encoding="utf-8")


def test_hay_dos_unidades_del_servicio_y_se_excluyen():
    """**Dos formas de servir, y instalar las dos deja a gunicorn atando un socket que nadie lee.**

    | Archivo | Cuándo | Cómo llega la petición |
    | --- | --- | --- |
    | `aerobim.service` + `aerobim.socket` | nginx es el proxy | socket de UNIX |
    | `aerobim-puerto.service` | el proxy es otro —`tailscale serve`— | `127.0.0.1:<puerto>` |

    La segunda existe porque en `p340` **`tailscaled` tiene atado el 443**: los vecinos se sirven
    con `tailscale serve` y nginx no puede escucharlo. Lo que esta prueba fija es que la del puerto
    **no** arrastre la dependencia del socket, que es la única diferencia real entre las dos y la
    que haría que instalar la equivocada fallara de una forma difícil de leer.
    """

    def directivas(nombre: str) -> list[str]:
        """Las líneas que systemd **ejecuta**, sin los comentarios.

        Mirar el texto entero no sirve aquí y fue el primer resultado de esta prueba: la cabecera de
        `aerobim-puerto.service` explica precisamente que **no** lleva `Requires=aerobim.socket`, y
        buscar la cadena a secas encuentra esa frase. Un comentario que explica una ausencia no es
        la ausencia.
        """
        texto = (DEPLOY / nombre).read_text(encoding="utf-8")
        return [
            linea.strip()
            for linea in texto.splitlines()
            if linea.strip() and not linea.strip().startswith("#")
        ]

    assert "Requires=aerobim.socket" in directivas("aerobim.service"), (
        "la unidad de nginx perdió su socket"
    )
    assert "Requires=aerobim.socket" not in directivas("aerobim-puerto.service"), (
        "la unidad del puerto exige el socket: gunicorn ataría uno que nadie lee"
    )


def test_la_unidad_del_puerto_no_bloquea_la_red_de_salida():
    """**El correo sale por la red, y estuvo a punto de quedarse dentro.**

    Esta unidad llevó un `IPAddressDeny=any` con `IPAddressAllow=localhost`, para que un fallo de
    configuración no pudiera exponer el puerto fuera de la máquina. La idea era buena y el efecto
    era el contrario del buscado: `IPAddress*` filtra **en las dos direcciones**, así que gunicorn
    no habría podido hablar con el servidor de correo.

    Y el síntoma sería el peor posible: la aplicación funciona, las cuentas se crean y **ni un solo
    aviso sale** — sin error en pantalla, porque el fallo ocurre al enviar. Nadie lo buscaría en una
    unidad de systemd.
    """
    puerto = (DEPLOY / "aerobim-puerto.service").read_text(encoding="utf-8")
    directivas = [
        linea.strip()
        for linea in puerto.splitlines()
        if linea.strip().startswith(("IPAddressDeny", "IPAddressAllow"))
    ]

    assert not directivas, f"esto deja al servicio sin poder mandar correo: {directivas}"


def test_las_zonas_del_limite_llevan_nuestro_nombre():
    """Las zonas de `limit_req` son **globales de la máquina**, igual que el servidor por defecto.

    Dos servicios que declaren una zona con el mismo nombre —`compartido`, por ejemplo— hacen que
    `nginx -t` falle con «zone is already declared» y no arranque ninguno. Es el mismo choque, y se
    evita igual: llamando a lo nuestro por su nombre.
    """
    sitio = (DEPLOY / "nginx-aerobim.conf").read_text(encoding="utf-8")
    zonas = re.findall(r"zone=([A-Za-z0-9_]+)[:\s]", sitio)

    ajenas = sorted({z for z in zonas if not z.startswith("aerobim_")})
    assert not ajenas, f"zonas de nginx sin el prefijo `aerobim_`: {ajenas}"
    assert zonas, "no se encontró ninguna zona: ¿se quitó el límite de los enlaces compartidos?"


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


#: Los dos servicios que **se quedan vivos**, y que por eso sí tienen que reiniciarse solos.
#:
#: Son dos formas de servir lo mismo y se instala una: `aerobim.service` habla por un socket de
#: UNIX detrás de nginx, y `aerobim-puerto.service` por `127.0.0.1` detrás de otro proxy. Ver
#: `test_hay_dos_unidades_del_servicio_y_se_excluyen`.
SERVIDORES = {"aerobim.service", "aerobim-puerto.service"}


@pytest.mark.parametrize(
    "nombre", [uno for uno in ARCHIVOS if uno.endswith(".service") and uno not in SERVIDORES]
)
def test_ningun_trabajo_periodico_se_reintenta_solo(nombre):
    """**Un `Restart=` en un `oneshot` manda el mismo correo cuatro veces.**

    El del resumen lo dice en su cabecera: con un SMTP caído, los reintentos no arreglan nada y la
    gente recibe el aviso repetido. Lo mismo vale para el respaldo contra un disco lleno.

    Los dos servidores quedan fuera: esos sí se quedan vivos y **tienen** que reiniciarse.
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
