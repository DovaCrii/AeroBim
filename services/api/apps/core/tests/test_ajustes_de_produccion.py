"""Los ajustes de produccion, **importados de verdad**.

## Por que esta prueba existe

`pyproject.toml:109` excluia `config/settings/prod.py` de cobertura con el motivo escrito:
**«ninguna prueba los importa»**. Era cierto, y por eso el defecto mas caro del despliegue vivio ahi
sin que nada lo viera: `SECURE_SSL_REDIRECT = True` **sin `SECURE_PROXY_SSL_HEADER`**.

nginx termina TLS y proxea al socket en claro. Django ve `http`, `SecurityMiddleware` —el primero de
la lista— contesta 301 a `https`, nginx vuelve a proxear, Django vuelve a redirigir:
`ERR_TOO_MANY_REDIRECTS` en **todo**, incluido `/health/`, que es lo que uno mira para saber que
pasa. El sitio entero inservible, y ninguna prueba en rojo.

**El agujero era de oraculo y no de codigo.** La suite corre con `config.settings.dev` sobre un solo
proceso y sin proxy delante (`pyproject.toml:85`), y `manage.py check --deploy` no comprueba nada de
esto: pasa en verde. Un ajuste que nadie importa es un ajuste que nadie prueba.

## Las dos mitades

1. **Que el modulo lo declare** — se importa `config.settings.prod` de verdad, con el entorno
   minimo, y se leen sus valores.
2. **Que el mecanismo funcione** — una peticion con `X-Forwarded-Proto: https` no se redirige, y una
   sin ella si. Esa segunda mitad es la que demuestra que la cabecera sirve para algo; sin ella,
   esto solo comprobaria que una constante esta escrita.
"""

import importlib
import os
import sys
from pathlib import Path

import pytest
from django.test import override_settings

#: El nombre real de la cabecera que pone nginx (`DEPLOY.md`, bloque de `proxy_set_header`).
CABECERA = "HTTP_X_FORWARDED_PROTO"


@pytest.fixture
def produccion(tmp_path, monkeypatch):
    """El modulo `config.settings.prod` importado, con el entorno minimo que necesita.

    `SECRET_KEY` no tiene valor por omision a proposito (`base.py:23`), y los dos directorios se
    apuntan a `tmp_path` para no crear nada dentro del repositorio al importar.
    """
    monkeypatch.setenv("SECRET_KEY", "solo-para-esta-prueba-no-es-un-secreto")
    monkeypatch.setenv("LOGS_DIR", str(tmp_path / "logs"))
    monkeypatch.setenv("DOCUMENTS_DIR", str(tmp_path / "documentos"))
    # Se descarta de `sys.modules` para que la importacion corra de verdad y no devuelva una copia
    # que otra prueba dejo cargada con otro entorno.
    for nombre in ("config.settings.prod", "config.settings.base"):
        sys.modules.pop(nombre, None)
    modulo = importlib.import_module("config.settings.prod")
    yield modulo
    for nombre in ("config.settings.prod", "config.settings.base"):
        sys.modules.pop(nombre, None)


# --- Lo que el modulo declara --------------------------------------------------------


def test_declara_la_cabecera_del_proxy_que_evita_el_bucle(produccion):
    """**Sin esto el sitio entero da `ERR_TOO_MANY_REDIRECTS`.** Ver el encabezado."""
    assert produccion.SECURE_PROXY_SSL_HEADER == (CABECERA, "https")


def test_la_redireccion_a_https_sigue_encendida(produccion):
    """La cabecera no esta para apagar la redireccion sino para que funcione.

    Si alguien "arreglara" el bucle poniendo `SECURE_SSL_REDIRECT=False`, el sitio atenderia por
    `http` sin decirlo — y las cookies `Secure` no se pondrian, que es peor que el bucle porque no
    se ve.
    """
    assert produccion.SECURE_SSL_REDIRECT is True
    assert produccion.SESSION_COOKIE_SECURE is True
    assert produccion.CSRF_COOKIE_SECURE is True


def test_no_depura_y_aplica_la_politica_en_vez_de_solo_informarla(produccion):
    assert produccion.DEBUG is False
    assert produccion.CSP_REPORT_ONLY is False


def test_el_modulo_no_nombra_coop_ni_coep_mas_que_para_prohibirlas(produccion):
    """**Regla cerrada de `AGENTS.md`.** Activan el WASM multihilo de `web-ifc`, que no funciona
    empaquetado, y el visor **se cuelga sin error**.

    Se comprueba que no existan como ajuste, no que no aparezca el texto: el archivo habla de ellas
    largamente, y esa explicacion es justamente lo que evita que alguien las añada.
    """
    for prohibida in ("CROSS_ORIGIN_OPENER_POLICY", "CROSS_ORIGIN_EMBEDDER_POLICY"):
        assert not hasattr(produccion, prohibida)


def test_con_la_carpeta_disponible_se_registra_en_archivo(produccion, tmp_path):
    """El caso normal: si se puede escribir, se escribe, y el manejador de archivo esta."""
    assert Path(produccion.LOG_DIR) == tmp_path / "logs"
    assert produccion.LOG_DIR_MOTIVO is None
    assert "file" in produccion.LOGGING["handlers"]
    assert produccion.LOGGING["handlers"]["file"]["class"] == (
        "logging.handlers.WatchedFileHandler"
    )


def test_una_carpeta_de_registro_imposible_no_tumba_el_arranque(tmp_path, monkeypatch):
    """**El defecto de arranque, fijado.** `base.py` hacia `LOG_DIR.mkdir()` al importar; con
    `ProtectSystem=strict` y un `LOGS_DIR` fuera de `ReadWritePaths` —que es lo que sale de copiar
    `.env.example`, cuya ruta es relativa— el `OSError` subia **al importar los ajustes**: los
    workers morian antes de servir nada, `manage.py` entero dejaba de funcionar, y el traceback
    hablaba de `pathlib` sin nombrar `LOGS_DIR`.

    Aqui la carpeta es imposible de crear porque su padre **es un archivo**, que es un `OSError` en
    Windows y en Linux por igual. Lo que se exige: que el modulo **se importe igual**, que el motivo
    nombre la variable, y que el registro siga saliendo por consola —que en la VM es el journal—.
    """
    estorbo = tmp_path / "soy-un-archivo"
    estorbo.write_text("no soy una carpeta")

    monkeypatch.setenv("SECRET_KEY", "solo-para-esta-prueba-no-es-un-secreto")
    monkeypatch.setenv("LOGS_DIR", str(estorbo / "logs"))
    monkeypatch.setenv("DOCUMENTS_DIR", str(tmp_path / "documentos"))
    for nombre in ("config.settings.prod", "config.settings.base"):
        sys.modules.pop(nombre, None)
    try:
        modulo = importlib.import_module("config.settings.prod")

        assert modulo.LOG_DIR_MOTIVO is not None
        assert "LOGS_DIR" in modulo.LOG_DIR_MOTIVO, "el motivo tiene que nombrar la variable"
        # Sin archivo, pero **con consola**: un servicio que atiende sin registro en disco es
        # mucho mejor que uno que no arranca.
        assert "file" not in modulo.LOGGING["handlers"]
        assert modulo.LOGGING["root"]["handlers"] == ["console"]
    finally:
        for nombre in ("config.settings.prod", "config.settings.base"):
            sys.modules.pop(nombre, None)


def test_el_cuerpo_que_se_acepta_da_para_el_mayor_envio_legitimo(produccion):
    """**Los dos topes del producto y el de Django estaban descoordinados, y nadie los sumo.**

    Django corta el cuerpo en 2,5 MB por omision y `DATA_UPLOAD_MAX_MEMORY_SIZE` no estaba escrito
    en ningun sitio. La lamina PDF acepta `MAXIMO_SEGMENTOS` trazos y los recorta si llegan mas —
    pero `HttpRequest.body` levantaba `RequestDataTooBig` **antes de que corriera la vista**, asi
    que el recorte no se ejecutaba nunca y salia un 400 sin explicacion.

    Esta prueba no mide un numero bonito: **calcula el peor cuerpo legitimo a partir de las dos
    constantes del producto** y exige que el ajuste lo cubra. Subir `MAXIMO_SEGMENTOS` o
    `LARGO_MAXIMO` sin subir el ajuste pone esto en rojo, que es justo lo que no pasaba antes.
    """
    from apps.documents.instantanea import LARGO_MAXIMO
    from apps.documents.lamina import MAXIMO_SEGMENTOS

    # Un segmento en JSON es `[x,y,x,y],`. Con coordenadas de hasta diez caracteres y los
    # separadores son unos 45 bytes; se toman 48 para no quedarse justo.
    lamina = MAXIMO_SEGMENTOS * 48
    # Y la observacion del visor: la instantanea en base64 mas el marcado, la camara y el texto.
    observacion = LARGO_MAXIMO + 512 * 1024

    assert produccion.DATA_UPLOAD_MAX_MEMORY_SIZE > lamina, (
        f"la lamina mas grande que el producto acepta son ~{lamina // 1024} KB y el tope no da"
    )
    assert produccion.DATA_UPLOAD_MAX_MEMORY_SIZE > observacion


def test_el_correo_no_puede_bloquear_un_worker_para_siempre(produccion):
    """Sin `EMAIL_TIMEOUT`, Django pasa `timeout=None` a `smtplib` y el socket espera sin fin.

    Los avisos se mandan **dentro de la peticion**: un SMTP que acepta la conexion y no contesta
    deja el worker bloqueado hasta que gunicorn lo mata a los 120 s, y con varios workers eso es el
    sitio entero sin atender por un servidor de correo lento.
    """
    assert produccion.EMAIL_TIMEOUT is not None
    assert 0 < produccion.EMAIL_TIMEOUT <= 30


def test_el_registro_en_archivo_no_rota_desde_varios_procesos(produccion):
    """**`TimedRotatingFileHandler` no es multiproceso**, y con `workers = cpu*2+1` hay varios.

    A medianoche cada uno hacia `os.rename` sobre el mismo archivo: uno renombra y los demas siguen
    escribiendo en un inodo ya desligado, asi que se pierden lineas y se pisan los archivos del dia.
    `WatchedFileHandler` mira si el archivo cambio de inodo y lo reabre; la rotacion la hace
    `logrotate` desde fuera, que es la unica forma correcta con varios procesos.
    """
    manejador = produccion.LOGGING["handlers"]["file"]

    assert "Rotating" not in manejador["class"]
    assert "when" not in manejador and "backupCount" not in manejador


# --- Que el mecanismo funcione -------------------------------------------------------


@pytest.mark.django_db
@override_settings(
    SECURE_SSL_REDIRECT=True,
    SECURE_PROXY_SSL_HEADER=(CABECERA, "https"),
)
def test_detras_del_proxy_no_hay_bucle_de_redireccion(client):
    """**Esta es la prueba que reproduce el fallo.** Con la cabecera declarada, una peticion que el
    proxy marca como segura no se redirige; sin ella, el mismo caso devolvia 301 para siempre.

    Se usa `/health/` porque es la unica ruta sin login y la primera que alguien prueba.
    """
    respuesta = client.get("/health/", secure=False, **{CABECERA: "https"})

    assert respuesta.status_code != 301, "el proxy dijo https y Django redirige: es el bucle"
    assert respuesta.status_code in {200, 503}


@pytest.mark.django_db
@override_settings(
    SECURE_SSL_REDIRECT=True,
    SECURE_PROXY_SSL_HEADER=(CABECERA, "https"),
)
def test_y_una_peticion_de_verdad_insegura_si_se_redirige(client):
    """La otra mitad: la redireccion tiene que seguir haciendo su trabajo.

    Sin este caso, la prueba de arriba pasaria igual con la redireccion apagada del todo.
    """
    respuesta = client.get("/health/", secure=False, **{CABECERA: "http"})

    assert respuesta.status_code == 301
    assert respuesta["Location"].startswith("https://")


@pytest.mark.django_db
@override_settings(SECURE_SSL_REDIRECT=True, SECURE_PROXY_SSL_HEADER=None)
def test_sin_la_cabecera_declarada_el_bucle_vuelve(client):
    """**La mutacion, escrita como prueba.** Quitar `SECURE_PROXY_SSL_HEADER` devuelve el defecto:
    el proxy dice https y Django redirige igual. Si algun dia alguien borra la linea de `prod.py`,
    esto es lo que explica que pasaba."""
    respuesta = client.get("/health/", secure=False, **{CABECERA: "https"})

    assert respuesta.status_code == 301


def test_el_entorno_de_la_prueba_no_deja_la_clave_puesta():
    """Higiene: `SECRET_KEY` la pone la fixture con `monkeypatch` y se retira al terminar."""
    assert os.environ.get("SECRET_KEY") != "solo-para-esta-prueba-no-es-un-secreto"
