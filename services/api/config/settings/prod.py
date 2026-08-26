"""Produccion: HTTPS, HSTS, y las dos trampas que romperian el visor en silencio."""

from .base import *  # noqa: F403
from .base import config

DEBUG = False

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
# **Las dos cosas que romperian el visor sin dejar rastro.**
#
# 1. **Nunca servir `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`.**
#    Es una regla cerrada de `AGENTS.md`: activan el WASM multihilo de `web-ifc`,
#    que no funciona empaquetado, y el visor **se cuelga sin error**. Ya costo una
#    sesion encontrarlo, y la comprobacion de `crossOriginIsolated` que falla al
#    arrancar se queda puesta justamente para que no vuelva a costar otra.
#
#    Django no las sirve por su cuenta; esto esta escrito para que nadie las
#    añada "por seguridad" sin saber que rompe. Si alguna vez hicieran falta,
#    primero hay que resolver el WASM.
#
# 2. **El visor necesita WASM, y la CSP de AeroControl no lo permite.** Alli
#    `script-src` es un `'self'` pelado sin `unsafe-eval`, que se pudo conseguir
#    porque todo su JavaScript esta servido desde su propio origen. Aqui el visor
#    compila WebAssembly y arranca un worker, asi que hacen falta dos permisos
#    mas. Van declarados y con su motivo, no como un comodin.
# ─────────────────────────────────────────────────────────────────────────────
CSP_EXTRA_SCRIPT_SRC = ["'wasm-unsafe-eval'"]
CSP_EXTRA_WORKER_SRC = ["'self'", "blob:"]
