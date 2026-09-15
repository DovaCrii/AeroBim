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

import os
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
    # **Despues de `Message`, y no antes.** Cuando manda a cambiar la clave deja un aviso
    # explicando por que, y `messages` tiene que estar montado o el `add_message` revienta con
    # `MessageFailure`. Y despues de `Authentication`, obviamente: sin `request.user` no mira nada.
    "apps.accounts.middleware.ExigirCambioDeClave",
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

# ─────────────────────────────────────────────────────────────────────────────
# **Cuanto cuerpo de peticion se acepta, y por que el valor de fabrica no daba.**
#
# Django corta el cuerpo de una peticion en **2,5 MB** por omision, y este ajuste no estaba escrito
# en ningun sitio. Dos cosas del producto pasan de ahi o se quedan al borde:
#
# - **La lamina PDF.** `apps/documents/lamina.py` acepta hasta `MAXIMO_SEGMENTOS` trazos y los
#   recorta si llegan mas. Con sesenta mil segmentos `[x1,y1,x2,y2]` el JSON ronda los 3 MB, asi que
#   `HttpRequest.body` levantaba `RequestDataTooBig` **antes de que la vista corriera** y el recorte
#   no llegaba a ejecutarse nunca: un `400` sin explicacion en cuanto la planta es densa.
# - **La observacion desde el visor.** Lleva la instantanea en base64 —`instantanea.LARGO_MAXIMO`,
#   1,8 MB— **mas** el marcado, la visibilidad, la camara y el texto. El comentario de
#   `instantanea.py` dice que 1,8 MB esta «por debajo del limite de Django»; lo esta, pero el margen
#   que queda para todo lo demas es de 0,7 MB y nadie lo habia sumado.
#
# **Ocho megas, y el numero sale de la suma y no del gusto**: el peor cuerpo legitimo es del orden
# de 5 MB, y el doble deja sitio a que un plano crezca sin volver aqui. La prueba
# `test_ajustes_de_produccion.py` comprueba esa coherencia contra las dos constantes, asi que subir
# una de ellas sin subir esto pone el gate en rojo.
#
# **No afecta a los 200 MB del registro.** Los archivos de un `multipart` no cuentan para este tope
# —Django los mide aparte—, asi que subir un IFC sigue funcionando igual.
DATA_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024

# **Se deja el valor de fabrica (2,5 MB) a proposito.** No es un tope sino el umbral a partir del
# cual un archivo subido deja de vivir en memoria y pasa a un temporal en disco. Bajo es lo que se
# quiere: con `workers = cpu*2+1` y archivos de obra de 200 MB, cuanto antes toque disco, mejor.
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─────────────────────────────────────────────────────────────────────────────
# **La cache compartida, y por que el limite del token no lo era.**
#
# Sin `CACHES` escrito, Django usa `LocMemCache`: **una cache por proceso**. En desarrollo hay uno y
# no se nota; en la VM hay `workers = cpu*2+1` de gunicorn, cada uno con la suya.
#
# Y ahi es donde duele, porque el contador del throttle de DRF vive en la cache. `/api-token/` toma
# pares usuario/contrasena **sin autenticar**, y su limite de `10/min` existe para que no sea un
# oraculo de contrasenas fuera de linea (`config/urls.py`). Con nueve workers ese limite son en
# realidad **hasta noventa por minuto**, y ademas **no es determinista**: depende de a que worker
# caiga cada intento. Un limite que no se puede predecir tampoco se puede razonar.
#
# **`DatabaseCache` y no Redis**, aunque Redis sea mas rapido: PostgreSQL ya esta ahi y Redis seria
# otro servicio que instalar, vigilar y respaldar. El coste es dos consultas por peticion con
# throttle; con un piloto de cinco personas eso no se mide, y el dia que se mida, cambiar de backend
# es cambiar estas cinco lineas.
#
# La tabla la crea la migracion `core.0003`, y no un paso mas del despliegue: un paso que hay que
# acordarse de correr es un paso que se olvida — ya paso con `bootstrap_roles`.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "core_cache",
    }
}

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
    # **Y el nuestro sustituye a `ModelBackend`, no se suma a él.** Hereda de él y solo cambia como
    # encuentra a la persona —acepta el correo ademas del nombre de usuario—, asi que poner los dos
    # significaria comprobar la contraseña dos veces contra el mismo hash en cada intento fallido.
    # Ver `apps/accounts/autenticacion.py`.
    "apps.accounts.autenticacion.CorreoOUsuario",
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
# **Diez segundos, porque el valor de fabrica es «ninguno».**
#
# Sin esto, el backend de Django pasa `timeout=None` a `smtplib` y el socket espera para siempre. Un
# SMTP que acepta la conexion TCP y no contesta —un cortafuegos a medias, un servidor saturado, un
# DNS que resuelve a una IP muerta— deja el worker **bloqueado hasta que gunicorn lo mata a los
# 120 s**. Y los avisos se mandan dentro de la peticion: con nueve workers y un reparto de
# hallazgos, el sitio entero se queda sin atender por un servidor de correo lento.
#
# Diez segundos son de sobra para un SMTP sano y poco para que se note: quien reparte un hallazgo
# espera diez segundos en el peor caso, no dos minutos.
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=10, cast=int)
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


def _motivo_para_no_escribir_en(carpeta: Path) -> str | None:
    """`None` si se puede registrar ahi; si no, la frase que lo explica.

    **Esto era un `mkdir()` pelado al importar los ajustes, y mataba el proceso.** Con
    `ProtectSystem=strict` y un `LOGS_DIR` fuera de `ReadWritePaths` —que es lo que sale de copiar
    `.env.example`, porque su ruta es relativa y se resuelve contra el `WorkingDirectory` de la
    unidad— el `OSError` subia **al importar `settings`**: los workers morian antes de servir nada,
    `manage.py` entero dejaba de funcionar —incluido el `check` que usa `respaldo.sh --verificar`
    como oraculo— y el traceback hablaba de `pathlib`, sin nombrar `LOGS_DIR` ni `ReadWritePaths`.

    Ahora no se levanta: se registra por consola, que en la VM va al journal, y **el motivo dice que
    variable mirar**. Un servicio que atiende sin archivo de registro es mucho mejor que uno que no
    arranca.

    Se comprueba **escribiendo**, no solo con `mkdir`: una carpeta montada de solo lectura existe y
    no admite nada, que es el caso que de verdad pasa. El testigo lleva el PID porque cada worker de
    gunicorn importa los ajustes por su cuenta y dos nombres iguales se pisan — el mismo defecto que
    `/health/` tiene con su propio testigo.
    """
    testigo = carpeta / f".aerobim-escritura-{os.getpid()}"
    try:
        carpeta.mkdir(parents=True, exist_ok=True)
        testigo.write_bytes(b"")
    except OSError as error:
        return f"no se puede escribir en LOGS_DIR={carpeta}: {error}"
    finally:
        try:
            testigo.unlink(missing_ok=True)
        except OSError:  # pragma: no cover - si no se puede borrar, tampoco se pudo crear
            pass
    return None


#: `None` cuando el registro en archivo esta disponible. Lo lee `/health/` y lo dice `apps.core`.
LOG_DIR_MOTIVO = _motivo_para_no_escribir_en(LOG_DIR)

#: **`WatchedFileHandler` y no `TimedRotatingFileHandler`.** El segundo rota el mismo archivo desde
#: cada proceso, y con `workers = cpu*2+1` a medianoche varios hacen `os.rename` a la vez: uno
#: renombra y los demas siguen escribiendo en un inodo ya desligado, asi que se pierden lineas y se
#: pisan los archivos del dia. `TimedRotatingFileHandler` **no es multiproceso**, y esto lo es: mira
#: si el archivo cambio de inodo y lo reabre. La rotacion la hace `logrotate` desde fuera —vive en
#: `deploy/logrotate-aerobim`—, que es la unica forma correcta con varios procesos.
_MANEJADORES = ["console"] if LOG_DIR_MOTIVO else ["file", "console"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler", "level": "INFO"},
    },
    "formatters": {"json": {"()": "apps.core.middleware.JsonLogFormatter"}},
    "loggers": {
        "aerobim.request": {
            "handlers": _MANEJADORES,
            "level": "INFO",
            "propagate": False,
        },
        "aerobim.jobs": {
            "handlers": _MANEJADORES,
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {"handlers": _MANEJADORES, "level": "INFO"},
}

if LOG_DIR_MOTIVO is None:
    LOGGING["handlers"]["file"] = {
        "class": "logging.handlers.WatchedFileHandler",
        "filename": str(LOG_DIR / "aerobim.log"),
        "level": "INFO",
        "formatter": "json",
        "encoding": "utf-8",
    }
