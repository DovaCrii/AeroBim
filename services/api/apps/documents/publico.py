"""**La única superficie de AeroBim que contesta sin sesión.** Todo lo de aquí es público.

Vive en su propio archivo por eso: en `views.py` estas tres vistas serían tres entre cuarenta, y
la que se olvidara de no heredar `LoginRequiredMixin` no se notaría. Aquí la regla es al revés y
está escrita una vez: **nada de este archivo pide cuenta, así que nada de este archivo puede
contestar más que lo que el testigo abre**.

## Las reglas que no se rompen aquí

1. **Todo sale de `EnlaceCompartido.vigente_por_testigo`.** Nunca de un `pk` de la URL, nunca de
   nada que mande el cliente. El testigo es lo único que decide qué se ve.
2. **Un testigo malo, caducado o revocado contestan igual**: 404, sin decir cuál de los tres. Decir
   «caducado» le confirma a quien prueba que acertó uno.
3. **Nada de identificadores internos en la respuesta.** El id de la obra, el del entregable y el
   de la revisión no salen: no abren nada —el resto de la API pide sesión— pero son la clase de
   dato que convierte una fuga pequeña en una grande el día que algo más se equivoque.
4. **`noindex` en todas.** Un enlace pegado en un correo web acaba en un rastreador, y de ahí en un
   buscador. Es la forma más tonta de que un modelo de obra acabe siendo público de verdad.
"""

import logging

from django.http import Http404, HttpResponse, JsonResponse
from django.utils.translation import gettext as _
from django.views.generic import View

from apps.documents import abribles, rangos, storage
from apps.documents.compartir import EnlaceCompartido

logger = logging.getLogger("aerobim.request")


def sin_rastreadores(respuesta):
    """`noindex, nofollow` — y también `noarchive`, que es el que evita la copia en caché."""
    respuesta["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    return respuesta


class VistaCompartida(View):
    """Lo común: resolver el testigo, o 404 sin dar explicaciones."""

    def enlace(self, kwargs) -> EnlaceCompartido:
        encontrado = EnlaceCompartido.vigente_por_testigo(kwargs.get("testigo", ""))
        if encontrado is None:
            raise Http404
        return encontrado


class PaginaCompartidaView(VistaCompartida):
    """La página que abre quien recibe el enlace: **el visor, sin nada alrededor**.

    Sirve el mismo `index.html` del build que la vista con sesión —es el mismo visor— y el testigo
    viaja en la URL, que es de donde el visor lo lee para pedir el contenido.

    **Si el archivo no se abre en el visor, esto no debería existir**, y por eso el enlace solo se
    puede crear sobre algo abrible: mandar a alguien de fuera a una pantalla que le dice «este
    formato no se puede ver» es peor que no mandarle nada.
    """

    def get(self, request, *args, **kwargs):
        from pathlib import Path

        from django.conf import settings

        enlace = self.enlace(kwargs)
        cual = abribles.visor_de(enlace.revision)
        pagina = "documento.html" if cual == abribles.VISOR_DOCUMENTO else "index.html"

        archivo = Path(settings.VISOR_DIST) / pagina
        if not archivo.is_file():
            # Sin build no hay visor. A quien viene de fuera no se le enseña la página con las
            # instrucciones de `npm run build`: no es su problema y le diría que esto es un equipo
            # de desarrollo.
            return sin_rastreadores(
                HttpResponse(
                    "<!doctype html><meta charset='utf-8'>"
                    f"<title>{_('Not available')} · AeroBim</title>"
                    '<body style="font:15px/1.6 system-ui;max-width:34em;margin:64px auto;'
                    'padding:0 20px">'
                    f"<h1>{_('This link is not available right now')}</h1>"
                    f"<p>{_('Ask whoever sent it to you to try again later.')}</p></body>",
                    status=503,
                )
            )
        return sin_rastreadores(HttpResponse(archivo.read_text(encoding="utf-8")))


class FichaCompartidaAPI(VistaCompartida):
    """Qué se está mirando. **Con la idoneidad, que es lo que evita el malentendido caro.**

    Un plano en `S2` es trabajo compartido para coordinar; uno en `A` está aprobado para construir.
    Quien mira desde fuera es justo quien puede confundirlos, así que el código y su texto van en la
    respuesta y la pantalla los enseña.

    **Lo que no lleva**: ningún identificador interno, nada del expediente, ninguna otra revisión,
    ningún hallazgo y nada de quién trabaja en la obra.
    """

    def get(self, request, *args, **kwargs):
        enlace = self.enlace(kwargs)
        revision = enlace.revision
        entregable = revision.entregable

        return sin_rastreadores(
            JsonResponse(
                {
                    "compartido": True,
                    "para": enlace.para,
                    "expiraEn": enlace.expira_en.isoformat(),
                    "nombre": revision.nombre_original,
                    "extension": storage.extension_de(revision.nombre_original),
                    "visor": abribles.visor_de(revision),
                    "correlativo": revision.correlativo,
                    "idoneidad": revision.idoneidad,
                    "idoneidadTexto": revision.get_idoneidad_display(),
                    "emitidaEn": revision.emitida_en.isoformat(),
                    "tamanoBytes": revision.tamano_bytes,
                    # El sha permite a quien recibe comprobar que mira exactamente lo que le
                    # dijeron que mira. Es la mitad util de la trazabilidad para quien esta fuera.
                    "sha256": revision.sha256,
                    "entregable": {
                        "codigo": entregable.codigo,
                        "titulo": entregable.titulo,
                        "disciplina": entregable.disciplina.codigo,
                    },
                    "proyecto": {
                        "codigo": entregable.proyecto.codigo,
                        "nombre": entregable.proyecto.nombre,
                    },
                    # **Explícitamente falso y no ausente.** El visor pregunta por estas dos para
                    # decidir si dibuja los botones; ausentes serían `undefined`, que es falso por
                    # accidente. Dicho, es una decisión.
                    "puedeObservar": False,
                    "puedeDescargar": False,
                    "contenido": f"/compartido/{enlace.testigo}/contenido/",
                }
            )
        )


class ContenidoCompartidoAPI(VistaCompartida):
    """Los bytes, por tramos. **Es la vista que de verdad entrega el archivo.**

    ## Por qué se sirve el archivo entero y no se puede evitar

    El visor dibuja el IFC en la máquina de quien mira. Para eso necesita el archivo, así que el
    archivo sale. No hay manera de enseñar un modelo en el navegador sin mandarlo, y llamar a esto
    «solo ver» y no decirlo sería mentir en la pantalla. Ver el docstring de `compartir.py`.

    Lo que sí se hace es no ponerlo fácil ni dejar rastro raro: `inline` y no `attachment`, sin
    nombre de archivo sugerido, y `noindex`.

    ## Y por qué sí acepta `Range`

    Porque el COPC del levantamiento son ~130 MB y el visor pide solo los nodos que caen en
    pantalla. Sin tramos, quien abre el enlace espera la descarga entera para ver el primer punto —
    y el servidor la tiene entera en memoria. Es la misma razón que en la API con sesión.
    """

    def get(self, request, *args, **kwargs):
        enlace = self.enlace(kwargs)
        revision = enlace.revision
        if not revision.clave_archivo:
            raise Http404

        clave = abribles.clave_para_el_visor(revision)
        try:
            respuesta = rangos.respuesta_de_archivo(
                storage.ruta_de(clave),
                request.headers.get("Range"),
                tipo="application/octet-stream",
            )
        except (OSError, storage.CargaRechazada) as error:
            raise Http404 from error

        # **La visita se anota aquí y no en la página**, y son dos cosas distintas: la página la
        # pide también un previsualizador de enlaces de WhatsApp o de Slack, así que contarla ahí
        # inflaría el número que sirve para notar que un enlace se reenvió. Los bytes los pide el
        # visor cuando alguien está mirando de verdad.
        #
        # Con `Range` se pide varias veces por sesión, así que **solo se cuenta el primer tramo**:
        # el COPC haría cientos de peticiones y el contador no diría nada.
        rango = request.headers.get("Range")
        if not rango or rango.replace(" ", "").startswith("bytes=0-"):
            enlace.anotar_visita()
            logger.info(
                "enlace_compartido_abierto",
                extra={"recipient": enlace.para[:80], "item_count": enlace.visitas + 1},
            )

        respuesta["X-Aerobim-Sha256"] = revision.sha256
        if clave != revision.clave_archivo:
            respuesta["X-Aerobim-Convertido"] = "dxf"
        return sin_rastreadores(respuesta)
