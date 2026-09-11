"""Produccion: HTTPS, HSTS, y las dos trampas que romperian el visor en silencio."""

from .base import *  # noqa: F403
from .base import config

DEBUG = False

# ─────────────────────────────────────────────────────────────────────────────
# **Sin esta linea, `SECURE_SSL_REDIRECT` deja el sitio entero inservible.**
#
# nginx termina TLS y proxea al socket de UNIX **en claro**. Django ve
# `wsgi.url_scheme == "http"`, `request.is_secure()` devuelve `False`, y
# `SecurityMiddleware` —que es el primero de la lista— contesta **301 a https**.
# nginx vuelve a proxear, Django vuelve a redirigir: `ERR_TOO_MANY_REDIRECTS` en
# todo, **incluido `/health/`**, que es justo lo que uno mira para saber que pasa.
#
# La cabecera se acepta **solo porque gunicorn no deja que se forje**:
# `forwarded_allow_ips = 127.0.0.1` (`config/gunicorn.conf.py:54`) descarta la
# `X-Forwarded-*` de cualquiera que no sea el proxy local. Si algun dia el proxy
# dejara de ser local, esto hay que revisarlo el mismo dia.
#
# **Por que no se veia:** la suite corre con `config.settings.dev` sobre un solo
# proceso y sin proxy (`pyproject.toml:85`), `check --deploy` no comprueba esto, y
# `pyproject.toml:109` excluia este archivo de cobertura con el motivo escrito
# —«ninguna prueba los importa»—. Ahora lo importa `test_ajustes_de_produccion.py`.
# ─────────────────────────────────────────────────────────────────────────────
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "same-origin"
CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="",
    cast=lambda v: [s.strip() for s in v.split(",") if s.strip()],
)

# La CSP deja de ser solo un informe: en produccion se aplica.
CSP_REPORT_ONLY = config("CSP_REPORT_ONLY", default=False, cast=bool)

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ─────────────────────────────────────────────────────────────────────────────
# **La cosa que romperia el visor sin dejar rastro.**
#
# **Nunca servir `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`.**
# Es una regla cerrada de `AGENTS.md`: activan el WASM multihilo de `web-ifc`, que
# no funciona empaquetado, y el visor **se cuelga sin error**. Ya costo una sesion
# encontrarlo, y la comprobacion de `crossOriginIsolated` que falla al arrancar se
# queda puesta justamente para que no vuelva a costar otra.
#
# **Correccion del 2026-09-11, medida contra el servidor.** Aqui ponia «Django no las
# sirve por su cuenta», y es falso: desde la version 4.0,
# `SECURE_CROSS_ORIGIN_OPENER_POLICY` vale `"same-origin"` por omision y
# `SecurityMiddleware` la escribe en **cada respuesta**. Comprobado pidiendo `/visor/`:
# `Cross-Origin-Opener-Policy: same-origin`.
#
# **No rompe nada, y por eso nadie lo vio: el aislamiento de origen pide las dos.**
# `crossOriginIsolated` solo es cierto con COOP `same-origin` **y** COEP `require-corp`.
# Sin la segunda, `web-ifc` sigue eligiendo su WASM de un hilo. COOP sola, ademas, es una
# proteccion real contra fugas entre ventanas y no cuesta nada aqui, asi que se queda.
#
# Lo que era un defecto es que **la proteccion fuera un comentario y encima equivocado**.
# Ahora hay una prueba que mira la respuesta de verdad y exige que **COEP no este nunca**:
# `apps/core/tests/test_csp_y_correo.py`. El dia que alguien la añada "por seguridad"
# —para usar `SharedArrayBuffer`, por ejemplo—, COOP ya esta puesta y el aislamiento se
# enciende entero. Si alguna vez hiciera falta de verdad, primero hay que resolver el WASM.
#
# **Los permisos de la CSP que el WASM necesita estan en `base.py`**, no aqui: los
# necesitan los dos entornos por igual, y tenerlos solo en produccion hacia que
# desarrollo avisara de una violacion en cada carga —inofensiva, porque alli la
# politica es solo un informe, pero indistinguible de una de verdad—.
# ─────────────────────────────────────────────────────────────────────────────
