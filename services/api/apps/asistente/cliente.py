"""El cliente del proveedor de IA (`F17.3b`): chat completions compatible con OpenAI, sin streaming.

Solo `urllib` de la biblioteca estandar (ninguna dependencia nueva). Lecciones del uso real de
Academy con la misma cuenta de NVIDIA:

* un modelo puede dar 404 («Function not found for account») o 410 (fin de vida): **cadena de
  modelos** (`NIM_MODEL`, luego `NIM_MODEL_FALLBACKS`);
* los Nemotron 3/3.5 filtran su razonamiento: se pide `enable_thinking=false` y, si el modelo lo
  rechaza (400/422), se reintenta **una vez** sin la opcion y se recuerda por modelo; ademas se
  limpia `<think>…</think>` y los preambulos de razonamiento;
* 429 del proveedor: error de «ritmo» con mensaje amable, **sin reintento ciego**.

**La clave nunca sale de aqui**: ninguna excepcion, log o `repr` la contiene (solo modelo y estado).
"""

from __future__ import annotations

import json
import logging
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from django.conf import settings

logger = logging.getLogger(__name__)

TEMPERATURA = 0.3
MAXIMO_TOKENS = 600

# Modelos que rechazaron `enable_thinking`: en memoria del proceso, es solo una optimizacion.
_SIN_ENABLE_THINKING: set[str] = set()


class ErrorAsistente(Exception):
    """Base de los fallos del proveedor. Su texto nunca contiene la clave."""


class ErrorRitmo(ErrorAsistente):
    """El proveedor contesto 429."""


class ErrorAutenticacion(ErrorAsistente):
    """El proveedor rechazo la clave (401/403)."""


class ErrorTiempo(ErrorAsistente):
    """El proveedor no contesto dentro de `ASISTENTE_TIMEOUT_S`."""


class ErrorProveedor(ErrorAsistente):
    """Ningun modelo de la cadena dio una respuesta utilizable."""


@dataclass
class Respuesta:
    texto: str
    modelo: str
    tokens_entrada: int = 0
    tokens_salida: int = 0


@dataclass
class _Resultado:
    estado: int
    cuerpo: dict = field(default_factory=dict)


# --- limpieza del razonamiento ----------------------------------------------------------------

_BLOQUE_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_PREAMBULO = re.compile(
    r"^\s*(okay|ok,|let me|let's|the user|the question|first,|we need|we should|i need|i should|"
    r"hmm|alright|so,|thinking|reasoning)",
    re.IGNORECASE,
)


def limpiar_razonamiento(texto: str) -> str:
    """Deja solo la respuesta final; vacio si lo unico que habia era razonamiento."""
    if not texto:
        return ""
    texto = _BLOQUE_THINK.sub("", texto)
    if "</think>" in texto.lower():  # cierre suelto: lo anterior era razonamiento
        texto = re.split(r"</think>", texto, flags=re.IGNORECASE)[-1]
    if re.search(r"<think>", texto, re.IGNORECASE):  # sin cierre: todo es razonamiento
        texto = re.split(r"<think>", texto, flags=re.IGNORECASE)[0]
    parrafos = [p for p in re.split(r"\n\s*\n", texto.strip()) if p.strip()]
    while parrafos and _PREAMBULO.match(parrafos[0]):
        parrafos.pop(0)
    return "\n\n".join(parrafos).strip()


# --- la llamada --------------------------------------------------------------------------------


def _cadena_de_modelos() -> list[str]:
    cadena: list[str] = []
    for nombre in [settings.NIM_MODEL, *settings.NIM_MODEL_FALLBACKS]:
        if nombre and nombre not in cadena:
            cadena.append(nombre)
    return cadena


def _abrir(peticion):
    """`urlopen` solo para http/https: la URL viene de la configuracion, nunca de la persona."""
    if urllib.parse.urlsplit(peticion.full_url).scheme not in ("http", "https"):
        raise ErrorProveedor("bad scheme")
    return urllib.request.urlopen(peticion, timeout=settings.ASISTENTE_TIMEOUT_S)  # noqa: S310  # nosec B310


def _enviar(url: str, carga: dict) -> _Resultado:
    """Un POST. Devuelve el estado HTTP y el JSON (vacio si no lo hay); lanza `ErrorTiempo`."""
    peticion = urllib.request.Request(  # noqa: S310 (URL de configuracion, https)
        url,
        data=json.dumps(carga).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.NIM_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with _abrir(peticion) as r:
            crudo, estado = r.read(), r.status
    except urllib.error.HTTPError as exc:
        crudo, estado = exc.read(), exc.code
    except TimeoutError:
        raise ErrorTiempo("timeout") from None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            raise ErrorTiempo("timeout") from None
        return _Resultado(0)
    except OSError:
        return _Resultado(0)
    try:
        cuerpo = json.loads(crudo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        cuerpo = {}
    return _Resultado(estado, cuerpo if isinstance(cuerpo, dict) else {})


def _carga(modelo: str, mensajes: list[dict], con_thinking_off: bool) -> dict:
    carga = {
        "model": modelo,
        "messages": mensajes,
        "temperature": TEMPERATURA,
        "max_tokens": MAXIMO_TOKENS,
        "stream": False,
    }
    if con_thinking_off:
        carga["chat_template_kwargs"] = {"enable_thinking": False}
    return carga


def _texto_de(cuerpo: dict) -> str:
    try:
        contenido = cuerpo["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""
    return contenido if isinstance(contenido, str) else ""


def _tokens(cuerpo: dict) -> tuple[int, int]:
    uso = cuerpo.get("usage")
    if not isinstance(uso, dict):
        return 0, 0
    entrada, salida = uso.get("prompt_tokens"), uso.get("completion_tokens")
    return (entrada if isinstance(entrada, int) else 0, salida if isinstance(salida, int) else 0)


def completar(mensajes: list[dict]) -> Respuesta:
    """Recorre la cadena de modelos y devuelve la primera respuesta util."""
    url = settings.NIM_BASE_URL.rstrip("/") + "/chat/completions"
    for modelo in _cadena_de_modelos():
        pide_thinking_off = "nemotron" in modelo.lower() and modelo not in _SIN_ENABLE_THINKING
        resultado = _enviar(url, _carga(modelo, mensajes, pide_thinking_off))
        if pide_thinking_off and resultado.estado in (400, 422):
            _SIN_ENABLE_THINKING.add(modelo)
            resultado = _enviar(url, _carga(modelo, mensajes, False))
        estado = resultado.estado
        if estado == 429:
            raise ErrorRitmo("rate")
        if estado in (401, 403):
            raise ErrorAutenticacion("auth")
        if estado != 200:
            logger.warning(
                "asistente: modelo %s respondio %s, se prueba el siguiente", modelo, estado
            )
            continue
        texto = limpiar_razonamiento(_texto_de(resultado.cuerpo))
        if not texto:
            logger.warning(
                "asistente: modelo %s sin respuesta util, se prueba el siguiente", modelo
            )
            continue
        entrada, salida = _tokens(resultado.cuerpo)
        return Respuesta(texto, modelo, entrada, salida)
    raise ErrorProveedor("exhausted")


# --- diagnostico (lo usa `asistente_probar`) -------------------------------------------------


def listar_modelos() -> list[str]:
    """Los ids de `{base}/models`. Lanza `ErrorAsistente` si el proveedor no contesta bien."""
    url = settings.NIM_BASE_URL.rstrip("/") + "/models"
    peticion = urllib.request.Request(  # noqa: S310
        url,
        headers={"Authorization": f"Bearer {settings.NIM_API_KEY}", "Accept": "application/json"},
    )
    try:
        with _abrir(peticion) as r:
            cuerpo = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise ErrorAutenticacion("auth") from None
        raise ErrorProveedor(f"http {exc.code}") from None
    except TimeoutError:
        raise ErrorTiempo("timeout") from None
    except (OSError, ValueError):
        raise ErrorProveedor("unreachable") from None
    datos = cuerpo.get("data") if isinstance(cuerpo, dict) else None
    if not isinstance(datos, list):
        raise ErrorProveedor("bad list")
    return sorted({m["id"] for m in datos if isinstance(m, dict) and isinstance(m.get("id"), str)})


def probar_modelo(modelo: str) -> tuple[bool, str]:
    """Una pregunta corta a un solo modelo: `(ok, detalle)`. El detalle nunca lleva la clave."""
    url = settings.NIM_BASE_URL.rstrip("/") + "/chat/completions"
    mensajes = [{"role": "user", "content": "Responde solo con la palabra: listo"}]
    try:
        pide = "nemotron" in modelo.lower()
        resultado = _enviar(url, _carga(modelo, mensajes, pide))
        if pide and resultado.estado in (400, 422):
            resultado = _enviar(url, _carga(modelo, mensajes, False))
    except ErrorTiempo:
        return False, "timeout"
    if resultado.estado != 200:
        return False, f"HTTP {resultado.estado}"
    texto = limpiar_razonamiento(_texto_de(resultado.cuerpo))
    return (True, texto[:60]) if texto else (False, "empty answer")
