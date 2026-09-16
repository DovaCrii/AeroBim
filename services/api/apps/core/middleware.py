"""Correlacion, auditoria, CSP y log estructurado: una pasada por peticion.

Portado de `AeroControl/apps/core/middleware.py`. La diferencia con el original
esta en `build_csp`, y es la que importa aqui: **el visor de AeroBim compila
WebAssembly y arranca un worker**, y la CSP de AeroControl —un `script-src 'self'`
pelado— lo bloquearia. Los dos permisos extra van declarados en `prod.py`, con su
motivo, en vez de relajar la politica entera.
"""

import json
import logging
import time
import uuid

logger = logging.getLogger("aerobim.request")


def build_csp(
    report_uri: str = "",
    frame_ancestors: str = "'none'",
    extra_script_src: list[str] | None = None,
    extra_worker_src: list[str] | None = None,
) -> str:
    """Arma la Content-Security-Policy de una respuesta.

    `script-src` arranca en `'self'` sin `'unsafe-inline'` y se le añade **solo** lo
    que un despliegue declare: para el visor, `'wasm-unsafe-eval'`. `'unsafe-inline'`
    se queda en `style-src`, para los atributos de estilo y el bloque de la pagina
    de ingreso.

    `frame_ancestors` es un parametro por una razon concreta: todo lo que sirve esta
    aplicacion se niega a ser enmarcado —eso es la proteccion contra clickjacking—,
    pero un PDF mostrado dentro de la ficha de su propio entregable tiene que ser
    enmarcado **por este mismo origen**, que no es ese ataque. La excepcion es por
    respuesta y nunca global.
    """
    script_src = " ".join(["'self'", *(extra_script_src or [])])
    worker_src = " ".join(extra_worker_src or ["'self'"])
    directives = [
        "default-src 'self'",
        f"script-src {script_src}",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        f"worker-src {worker_src}",
        # El visor descarga su WASM del propio origen; sin esto, `fetch` del `.wasm`
        # cae en `default-src` y queda igual, pero declararlo evita que un cambio en
        # `default-src` lo rompa de lado.
        #
        # ── Y `blob:`, que es lo que rompia subir una nube de puntos ──────────────────────
        #
        # **Un `blob:` no es un destino de red: es un dato que la propia pagina acaba de
        # crear.** Al abrir un archivo del disco, el visor lo envuelve en un `Blob`, saca su
        # URL y se la pasa al lector de COPC, que **lee por tramos con `fetch`** —es lo que
        # permite abrir un levantamiento de 130 MB sin cargarlo entero en memoria—. Sin
        # `blob:` aqui, ese `fetch` lo bloquea la politica.
        #
        # El sintoma, medido en `p340` el 2026-09-16: **«Failed to fetch»** arriba en la
        # cinta y dos errores en la consola —«Refused to connect because it violates the
        # document's Content Security Policy»—. Con la politica en modo informe, o sea en
        # desarrollo, la nube abre perfectamente: es la **tercera** vez en esta semana que un
        # fallo solo existe con la politica aplicada.
        #
        # **No afloja nada.** Un `blob:` solo lo puede crear codigo que ya corre en esta
        # pagina; permitirlo no abre ningun origen nuevo ni deja salir un solo byte. `img-src`
        # ya lo lleva por el mismo motivo, y `worker-src` tambien.
        "connect-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        f"frame-ancestors {frame_ancestors}",
        "form-action 'self'",
    ]
    if report_uri:
        directives.append("report-uri " + report_uri)
    return "; ".join(directives)


class RequestMetricsMiddleware:
    """Pone un id de correlacion, escribe la auditoria y emite un evento por peticion."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.request_id = request_id
        started = time.perf_counter()
        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                "request_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response["X-Request-ID"] = request_id

        from django.conf import settings

        politica = build_csp(
            getattr(settings, "CSP_REPORT_URI", ""),
            frame_ancestors=(
                "'self'" if getattr(response, "frame_ancestors_self", False) else "'none'"
            ),
            extra_script_src=getattr(settings, "CSP_EXTRA_SCRIPT_SRC", None),
            extra_worker_src=getattr(settings, "CSP_EXTRA_WORKER_SRC", None),
        )
        # **Una de las dos cabeceras esta siempre.** El original solo escribia la de
        # informe, asi que pedir el modo estricto quitaba la politica en silencio.
        cabecera = (
            "Content-Security-Policy-Report-Only"
            if getattr(settings, "CSP_REPORT_ONLY", True)
            else "Content-Security-Policy"
        )
        response[cabecera] = politica

        if (
            request.user.is_authenticated
            and request.method in {"POST", "PUT", "PATCH", "DELETE"}
            # `/accounts/` queda fuera: ahi el cuerpo lleva una contraseña.
            and not request.path.startswith("/accounts/")
        ):
            self._auditar(request, response, request_id)

        logger.info(
            "request_complete",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

    @staticmethod
    def _auditar(request, response, request_id):
        from apps.core.models import AuditEvent

        if response.status_code < 400:
            resultado = "success"
        elif response.status_code in {401, 403}:
            resultado = "denied"
        elif response.status_code < 500:
            resultado = "client_error"
        else:
            resultado = "server_error"

        contexto = getattr(request, "_audit_context", {})
        metadata = {"query_keys": sorted(request.GET.keys())}
        metadata.update(contexto.get("metadata", {}))
        try:
            AuditEvent.objects.create(
                actor=request.user,
                action=contexto.get("action") or f"{request.method.lower()}_{resultado}",
                method=request.method,
                path=request.path[:500],
                status_code=response.status_code,
                model_label=contexto.get("model_label", ""),
                object_id=contexto.get("object_id", ""),
                request_id=request_id,
                metadata=metadata,
            )
        except Exception:
            # Que falle la auditoria no puede tumbar la peticion, pero **si tiene que
            # dejar rastro**: en AeroControl este `except` se tragaba los "database is
            # locked" de SQLite y los eventos se perdian sin que nada lo dijera.
            logger.exception(
                "audit_write_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                },
            )


class JsonLogFormatter(logging.Formatter):
    """Un objeto JSON por linea, para que el log se pueda consultar."""

    CAMPOS = (
        "request_id",
        "method",
        "path",
        "status_code",
        "duration_ms",
        "job_command",
        "job_result",
        "job_duration_ms",
        "recipient",
        "item_count",
        "send_result",
    )

    def format(self, record):
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for clave in self.CAMPOS:
            if hasattr(record, clave):
                payload[clave] = getattr(record, clave)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)
