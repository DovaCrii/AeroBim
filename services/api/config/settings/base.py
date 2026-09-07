"""Ajustes comunes de AeroBim.

**Copiados en su forma de AeroControl, no en su dominio.** Esa aplicacion lleva
1440 pruebas en produccion con datos reales de la DGAC, y su fuerza no esta en
codigo ingenioso sino en un puñado de decisiones que ya costaron encontrarse:
axes delante del backend real, la sesion con tope y expiracion deslizante, el
throttle propio del endpoint de token, SQLite en WAL porque la auditoria escribe
en cada peticion que muta, y la CSP armada por respuesta.

Lo que **no** se copia es su dominio: aqui no hay aeronaves ni permisos de vuelo.
Y la base de datos es propia -- la regla de la familia es que ninguna aplicacion
comparte base con otra.
"""

from datetime import timedelta
from pathlib import Path

from decouple import config
from django.utils.translation import gettext_lazy as _

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=lambda v: [s.strip() for s in v.split(",")]
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "axes",
    "apps.core",
    "apps.accounts",
    "apps.projects",
    "apps.documents",
    "apps.visor",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.RequestMetricsMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # axes va al final para que vea la peticion y el usuario ya resueltos y pueda
    # convertir un intento bloqueado en su respuesta de bloqueo.
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                # La barra lateral se pinta en `base.html`, que extienden treinta y tantas
                # plantillas de siete aplicaciones: sin esto habria que meter los modulos en el
                # contexto de cada vista, y el sintoma de olvidarse en una seria un rail que
                # desaparece en una pantalla suelta. Es diferido, asi que una respuesta sin
                # plantilla no paga los permisos.
                "apps.accounts.context_processors.navegacion",
            ]
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DB_ENGINE = config("DB_ENGINE", default="sqlite3")
if DB_ENGINE in {"postgres", "postgresql"}:
    # **El driver se comprueba aqui y no se descubre en la primera consulta.**
    # Sin `psycopg`, Django arranca igual y falla al abrir la conexion con un
    # `ImproperlyConfigured` que nombra **`psycopg2`** —el paquete anterior—, o sea
    # que manda a instalar el que no es. Y como pasa en la primera peticion y no al
    # arrancar, `systemctl start` informa "active" sobre un servicio que no sirve.
    try:
        import psycopg  # noqa: F401
    except ModuleNotFoundError as falta:
        raise ImportError(
            "DB_ENGINE=postgresql necesita psycopg 3, que va en el grupo `deploy`: "
            "`uv sync --no-default-groups --group deploy`."
        ) from falta

    _db_options = {}
    _sslmode = config("DB_SSLMODE", default="")
    if _sslmode:
        _db_options["sslmode"] = _sslmode
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME"),
            "USER": config("DB_USER"),
            "PASSWORD": config("DB_PASSWORD", default=""),
            "HOST": config("DB_HOST", default="127.0.0.1"),
            "PORT": config("DB_PORT", default="5432"),
            "CONN_MAX_AGE": config("DB_CONN_MAX_AGE", default=60, cast=int),
            "OPTIONS": _db_options,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": config("DB_PATH", default=str(BASE_DIR / "aerobim.sqlite3")),
            # **WAL, y no es un adorno.** SQLite serializa a los escritores, y la
            # auditoria escribe en **cada peticion que muta**: con los 5 s por
            # defecto, AeroControl tuvo "database is locked" intermitentes que su
            # propio `except` se tragaba, o sea eventos de auditoria perdidos en
            # silencio. WAL deja leer mientras se escribe y NORMAL es el nivel
            # seguro documentado bajo WAL.
            "OPTIONS": {
                "timeout": 20,
                "init_command": (
                    "PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;PRAGMA busy_timeout=20000;"
                ),
            },
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es"
LANGUAGES = [("es", _("Spanish")), ("en", _("English"))]
LOCALE_PATHS = [BASE_DIR / "locale"]
TIME_ZONE = config("TIME_ZONE", default="America/Santiago")
USE_I18N = True
USE_TZ = True

# La raíz del monorepo, dos niveles arriba de `services/api`. Es donde vive el SPA.
REPO_DIR = BASE_DIR.parent.parent

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# **El SPA se sirve desde donde lo construye Vite**, con el prefijo `visor/`. La alternativa
# —hacer que Vite escriba dentro del árbol de Django— acoplaría el build de JavaScript a la
# estructura del backend; así cada uno se queda en su sitio y Django solo lo publica.
VISOR_DIST = Path(config("VISOR_DIST", default=str(REPO_DIR / "apps" / "web" / "dist")))
STATICFILES_DIRS = [BASE_DIR / "static", ("visor", VISOR_DIST)]
# Mientras se trabaja en el SPA, el servidor de Vite. Vacío en producción: ahí se sirve lo
# construido, y si no está, `/visor/` lo dice en vez de fallar con un traceback.
VISOR_DEV_URL = config("VISOR_DEV_URL", default="")

# Los documentos viven **fuera del repositorio**, bajo el control del operador,
# igual que los IFC y los planos del visor.
DOCUMENTS_DIR = Path(config("DOCUMENTS_DIR", default=str(BASE_DIR / "documents")))

# **El conversor de DWG y DGN a DXF, que se instala aparte y a mano.**
#
# `ODA File Converter` es un ejecutable gratuito de la Open Design Alliance, con su propia
# licencia: no se distribuye con AeroBim ni se descarga solo. Sin él, subir un DWG o un DGN
# **sigue funcionando** —el archivo se guarda, que es lo que un registro tiene que hacer— y la
# revision queda sin su DXF, diciendo por que. Ver `apps/documents/conversion.py`.
#
# Vacio por omision, y no una ruta adivinada: una ruta que no existe da el mismo resultado que
# no configurar nada, pero cuesta media hora entender por que.
ODA_CONVERTER = config("ODA_CONVERTER", default="")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # El limite anonimo existe por **un** endpoint: `/api-token/` acepta pares
    # usuario/contraseña sin autenticar y sin throttle es un oraculo de
    # contraseñas fuera de linea.
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": config("API_THROTTLE_ANON", default="10/min"),
        "user": config("API_THROTTLE_USER", default="300/min"),
    },
}

LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = LOGIN_URL

SESSION_COOKIE_HTTPONLY = True
# **La cookie de sesion es `HttpOnly`; la de CSRF no puede serlo, y esto no es un descuido.**
#
# Con `CSRF_COOKIE_HTTPONLY = True` el testigo era ilegible desde JavaScript, asi que
# `testigoCsrf()` del visor devolvia siempre cadena vacia y **todo `POST` del visor moria con
# `403 CSRF Failed: CSRF token missing`**: dejar una nota sobre un elemento, descartar un conflicto,
# marcar la coordinacion como vista y guardar una vista compartida. Cuatro capacidades enteras que
# solo funcionaban desde las pruebas, porque el cliente de pruebas de Django no comprueba CSRF.
#
# Lo destapo el usuario intentando anotar un elemento con un rol que **si** tiene
# `add_observacion`, y el mensaje del visor le decia «tu sesion caduco o tu rol no puede abrir
# observaciones»: ni una cosa ni la otra.
#
# `HttpOnly` en la cookie de CSRF **no aporta proteccion real** —lo dice la propia documentacion de
# Django— porque el ataque que evita el testigo es que otro sitio envie la peticion, y para eso no
# necesita leerlo: le basta con no tenerlo. Lo que si protege de verdad es que la **sesion** sea
# `HttpOnly`, y esa lo sigue siendo. La alternativa —un endpoint que devuelva el testigo— deja el
# mismo valor al alcance del mismo JavaScript, con un endpoint mas que mantener.
CSRF_COOKIE_HTTPONLY = False
SECURE_CONTENT_TYPE_NOSNIFF = True
# La cookie muere al cerrar el navegador, la sesion tiene tope pase lo que pase, y
# cada peticion corre la expiracion hacia adelante para no echar a nadie a mitad
# de una tarea. Los tres son ajustables por entorno.
SESSION_EXPIRE_AT_BROWSER_CLOSE = config("SESSION_EXPIRE_AT_BROWSER_CLOSE", default=True, cast=bool)
SESSION_COOKIE_AGE = config("SESSION_COOKIE_AGE", default=12 * 60 * 60, cast=int)
SESSION_SAVE_EVERY_REQUEST = config("SESSION_SAVE_EVERY_REQUEST", default=True, cast=bool)

AUTHENTICATION_BACKENDS = [
    # **axes va primero**: corta un intento bloqueado antes de que el backend real
    # llegue a comprobar la contraseña.
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]
AXES_ENABLED = config("AXES_ENABLED", default=True, cast=bool)
AXES_FAILURE_LIMIT = config("AXES_FAILURE_LIMIT", default=5, cast=int)
AXES_COOLOFF_TIME = timedelta(minutes=config("AXES_COOLOFF_MINUTES", default=15, cast=int))
AXES_RESET_ON_SUCCESS = True
# Bloqueo por nombre de usuario, no por IP. Detras de un proxy toda peticion llega
# de la misma direccion, asi que una clave por IP seria o inutil o falsificable con
# una cabecera forjada; y por usuario protege ademas de una fuerza bruta
# distribuida que rota direcciones.
AXES_LOCKOUT_PARAMETERS = ["username"]
AXES_IPWARE_META_PRECEDENCE_ORDER = ["HTTP_X_FORWARDED_FOR", "REMOTE_ADDR"]
# `axes.W006` avisa de que una clave sin IP es mas debil. Es la decision de arriba,
# tomada a proposito y explicada; silenciada para que `check --deploy` quede limpio.
SILENCED_SYSTEM_CHECKS = ["axes.W006"]

X_FRAME_OPTIONS = "DENY"

EMAIL_BACKEND = config("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="aerobim@localhost")
# Base absoluta de los enlaces que van dentro de un correo: ahi no hay peticion
# de la que deducir el dominio.
SITE_BASE_URL = config("SITE_BASE_URL", default="http://localhost:8000").rstrip("/")

CSP_REPORT_ONLY = config("CSP_REPORT_ONLY", default=True, cast=bool)
CSP_REPORT_URI = config("CSP_REPORT_URI", default="")

# **Los dos permisos que el visor necesita, y van en los dos entornos.**
#
# La CSP de AeroControl es un `script-src 'self'` pelado sin `unsafe-eval`, que alli
# se pudo conseguir porque todo su JavaScript sale de su propio origen. Aqui hay dos
# consumidores de WebAssembly —`web-ifc` para el modelo y PDFium para el documento—
# y uno de ellos arranca un worker, asi que hacen falta dos permisos mas. Van
# declarados y con su motivo, nunca como un comodin: `'unsafe-eval'` a secas
# permitiria tambien `eval()`, y lo que hace falta es solo compilar WASM.
#
# **Estan aqui y no solo en `prod.py`** porque los necesitan los dos entornos por
# igual: con el permiso solo en produccion, desarrollo avisaba de una violacion de
# CSP en cada carga del visor. Inofensiva —alli la politica es solo un informe— pero
# indistinguible de una de verdad, que es la peor clase de aviso: el que se aprende
# a ignorar.
CSP_EXTRA_SCRIPT_SRC = ["'wasm-unsafe-eval'"]
CSP_EXTRA_WORKER_SRC = ["'self'", "blob:"]

LOG_DIR = Path(config("LOGS_DIR", default=str(BASE_DIR / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(LOG_DIR / "aerobim.log"),
            "level": "INFO",
            "formatter": "json",
            "when": "midnight",
            "backupCount": 30,
            "encoding": "utf-8",
        },
        "console": {"class": "logging.StreamHandler", "level": "INFO"},
    },
    "formatters": {"json": {"()": "apps.core.middleware.JsonLogFormatter"}},
    "loggers": {
        "aerobim.request": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "aerobim.jobs": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {"handlers": ["file", "console"], "level": "INFO"},
}
