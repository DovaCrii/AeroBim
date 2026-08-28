"""`/health/`: lo unico que contesta cuando nadie ha entrado todavia.

**Por que esta vista no pide permiso, y por que eso no rompe el contrato.**
`AGENTS.md` exige un `view_*` explicito en **toda superficie de lectura**, y esa
regla se sostiene porque una superficie de lectura entrega **datos de alguien**.
Esta no entrega ninguno: no toca un modelo, no nombra un proyecto, no dice quien
esta conectado. Contesta una sola pregunta —¿este proceso puede atender?— y la
tiene que poder hacer quien todavia no puede autenticarse: systemd al arrancar la
unidad, el proxy antes de mandar la primera peticion, el operador por SSH.

**Y por eso mismo no dice nada mas de lo que se le pregunta.** Sin autenticar, la
respuesta no lleva rutas, ni versiones, ni el texto de una excepcion: solo el
nombre de cada comprobacion y si paso. El detalle —que ruta fallo, con que
error— va al log, que es donde ya hay alguien autorizado mirando.

**Las tres comprobaciones son las tres formas en que esta VM se rompe callada.**

1. **La base de datos.** Es fatal y no admite matices: sin ella no hay nada.
2. **El directorio de documentos.** Vive **fuera del repositorio**, montado por el
   operador. Si el montaje no esta, Django no falla: escribe en el disco local y
   los archivos se pierden en el siguiente reinicio. Un fallo silencioso que
   destruye datos es peor que una caida, asi que tambien es fatal.
3. **El SPA del visor construido.** No es fatal: el portal, el registro documental
   y la API siguen funcionando sin el; lo unico roto seria `/visor/`. Sale como
   `degradado` con un 200, porque un 503 aqui sacaria de servicio la aplicacion
   entera por una mitad que no lo esta.
"""

from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.views import View

logger = logging.getLogger("aerobim.jobs")

#: Lo que responde cada comprobacion. `fallo` en una fatal saca la aplicacion de servicio.
ESTADO_OK = "ok"
ESTADO_DEGRADADO = "degradado"
ESTADO_FALLO = "fallo"


def _revisar_base_de_datos() -> str:
    """Una consulta de verdad, no `connection.connection is not None`.

    Con `CONN_MAX_AGE` puesto, la conexion se reutiliza entre peticiones y puede
    estar abierta contra un servidor que ya se fue: preguntar por el objeto
    contesta que si mientras la primera consulta real falla.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        logger.exception("salud: la base de datos no contesta")
        return ESTADO_FALLO
    return ESTADO_OK


def _revisar_directorio(ruta: Path) -> str:
    """Existe, es un directorio, y **se puede escribir en el**.

    Los tres, porque los tres fallan distinto: sin montar no existe, mal montado
    puede ser un archivo, y montado de solo lectura existe y acepta todo hasta que
    alguien sube el primer documento.
    """
    try:
        if not ruta.is_dir():
            logger.error("salud: %s no es un directorio", ruta)
            return ESTADO_FALLO
        testigo = ruta / ".aerobim-salud"
        testigo.write_bytes(b"")
        testigo.unlink()
    except OSError:
        logger.exception("salud: no se puede escribir en %s", ruta)
        return ESTADO_FALLO
    return ESTADO_OK


def _revisar_visor() -> str:
    """El SPA construido, con su `index.html` dentro.

    Se mira el archivo y no la carpeta: `apps/web/dist` existe en cuanto alguien
    corrio un build a medias, y una carpeta vacia serviria un 404 sin explicacion.
    """
    indice = Path(settings.VISOR_DIST) / "index.html"
    if not indice.is_file():
        logger.warning("salud: el visor no esta construido en %s", settings.VISOR_DIST)
        return ESTADO_DEGRADADO
    return ESTADO_OK


class SaludView(View):
    """¿Puede atender este proceso? Un 200 dice que si; un 503, que no.

    Sin sesion, sin cookies y sin cache: la respuesta vale para el instante en que
    se pidio y guardarla convierte el aviso en una mentira con retraso.
    """

    http_method_names = ["get", "head"]

    def get(self, request):
        comprobaciones = {
            "base": _revisar_base_de_datos(),
            "documentos": _revisar_directorio(Path(settings.DOCUMENTS_DIR)),
            "visor": _revisar_visor(),
        }

        # El visor degradado no saca de servicio; una comprobacion fatal en fallo, si.
        fatales = ("base", "documentos")
        hay_fallo = any(comprobaciones[cual] == ESTADO_FALLO for cual in fatales)
        estado = (
            ESTADO_FALLO
            if hay_fallo
            else (ESTADO_DEGRADADO if ESTADO_DEGRADADO in comprobaciones.values() else ESTADO_OK)
        )

        respuesta = JsonResponse(
            {"estado": estado, "comprobaciones": comprobaciones},
            status=503 if hay_fallo else 200,
        )
        respuesta["Cache-Control"] = "no-store"
        return respuesta
