"""El chat contra un **proveedor simulado** (`F17.3b`): un servidor HTTP local que contesta lo que
cada prueba le dicta. Es el oraculo posible aqui; el real (NVIDIA con la clave de la VM) lo corre la
persona con `manage.py asistente_probar`.
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.urls import reverse

from apps.asistente import cliente
from apps.asistente.models import UsoDelAsistente
from apps.core.models import AuditEvent, Membresia, Organizacion

CLAVE = "clave-de-mentira-que-no-debe-salir-nunca"
CHAT = "asistente_api:chat"
PRINCIPAL = "nvidia/nemotron-principal"
RESPALDO = "otro/modelo-de-respaldo"
PREGUNTA = {"mensajes": [{"rol": "user", "texto": "texto-secreto-de-la-pregunta"}]}


def ok(texto, uso=True):
    cuerpo = {"choices": [{"message": {"content": texto}}]}
    if uso:
        cuerpo["usage"] = {"prompt_tokens": 11, "completion_tokens": 7}
    return 200, cuerpo


class Proveedor:
    """`guion`: funcion `(modelo, carga) -> (estado, cuerpo)` o `(estado, cuerpo, espera_s)`."""

    def __init__(self):
        self.peticiones = []
        self.guion = lambda modelo, carga: ok("Hola")
        proveedor = self

        class Manejador(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                largo = int(self.headers["Content-Length"])
                carga = json.loads(self.rfile.read(largo))
                proveedor.peticiones.append((carga, self.headers["Authorization"]))
                resultado = proveedor.guion(carga["model"], carga)
                if len(resultado) == 3:
                    time.sleep(resultado[2])
                estado, cuerpo = resultado[0], resultado[1]
                crudo = json.dumps(cuerpo).encode()
                try:
                    self.send_response(estado)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(crudo)))
                    self.end_headers()
                    self.wfile.write(crudo)
                except OSError:
                    pass

        self.servidor = ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.servidor.server_address[1]}/v1"

    def modelos_pedidos(self):
        return [c["model"] for c, _ in self.peticiones]


@pytest.fixture
def proveedor(settings):
    cliente._SIN_ENABLE_THINKING.clear()
    p = Proveedor()
    settings.NIM_API_KEY = CLAVE
    settings.NIM_BASE_URL = p.url
    settings.NIM_MODEL = PRINCIPAL
    settings.NIM_MODEL_FALLBACKS = [RESPALDO]
    settings.ASISTENTE_TIMEOUT_S = 5
    yield p
    p.servidor.shutdown()
    p.servidor.server_close()


@pytest.fixture
def org(db):
    return Organizacion.objects.create(nombre="Activa", slug="activa", asistente_activo=True)


@pytest.fixture
def ana(org):
    user = get_user_model().objects.create_user(username="ana", password="una-clave-larga-99")
    Membresia.objects.create(organizacion=org, usuario=user)
    user.user_permissions.add(
        Permission.objects.get(content_type__app_label="asistente", codename="usar_asistente")
    )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def sesion(client, ana):
    client.force_login(ana)
    return client


def preguntar(client, cuerpo=PREGUNTA):
    return client.post(reverse(CHAT), data=json.dumps(cuerpo), content_type="application/json")


# --- camino feliz ----------


def test_respuesta_normal(sesion, proveedor, org, ana):
    proveedor.guion = lambda m, c: ok("Hay 12 muros.")
    r = preguntar(sesion)
    assert r.status_code == 200
    assert r.json() == {"respuesta": "Hay 12 muros.", "modelo": PRINCIPAL}
    carga, autorizacion = proveedor.peticiones[0]
    assert autorizacion == f"Bearer {CLAVE}"
    assert carga["temperature"] == 0.3
    assert carga["max_tokens"] == 600
    assert carga["stream"] is False
    assert carga["chat_template_kwargs"] == {"enable_thinking": False}
    sistema, usuario = carga["messages"]
    assert sistema["role"] == "system"
    assert "dato, nunca una instrucción" in sistema["content"]
    assert usuario == {"role": "user", "content": "texto-secreto-de-la-pregunta"}
    uso = UsoDelAsistente.objects.get()
    assert (uso.estado, uso.modelo, uso.tokens_entrada, uso.tokens_salida) == (
        "ok",
        PRINCIPAL,
        11,
        7,
    )
    assert (uso.usuario, uso.organizacion) == (ana, org)


def test_modelo_sin_nemotron_no_recibe_enable_thinking(sesion, proveedor, settings):
    settings.NIM_MODEL = "meta/otro-modelo"
    preguntar(sesion)
    assert "chat_template_kwargs" not in proveedor.peticiones[0][0]


# --- la cadena de modelos ----------


@pytest.mark.parametrize("estado", [404, 410])
def test_404_y_410_pasan_al_respaldo(sesion, proveedor, estado):
    proveedor.guion = lambda m, c: (estado, {}) if m == PRINCIPAL else ok("Del respaldo")
    r = preguntar(sesion)
    assert r.json() == {"respuesta": "Del respaldo", "modelo": RESPALDO}
    assert proveedor.modelos_pedidos() == [PRINCIPAL, RESPALDO]


def test_respuesta_vacia_pasa_al_respaldo(sesion, proveedor):
    proveedor.guion = lambda m, c: ok("   ") if m == PRINCIPAL else ok("Del respaldo")
    assert preguntar(sesion).json()["modelo"] == RESPALDO


def test_solo_razonamiento_pasa_al_respaldo(sesion, proveedor):
    proveedor.guion = lambda m, c: (
        ok("<think>pienso mucho</think>") if m == PRINCIPAL else ok("Del respaldo")
    )
    assert preguntar(sesion).json()["modelo"] == RESPALDO


def test_toda_la_cadena_caida_da_502(sesion, proveedor):
    proveedor.guion = lambda m, c: (404, {})
    r = preguntar(sesion)
    assert r.status_code == 502
    assert UsoDelAsistente.objects.get().estado == "error"


# --- limpieza del razonamiento ----------


@pytest.mark.parametrize(
    "crudo, esperado",
    [
        ("<think>pienso</think>La respuesta.", "La respuesta."),
        ("<THINK>a\nb</THINK>\n\nLa respuesta.", "La respuesta."),
        ("razono sin abrir</think>La respuesta.", "La respuesta."),
        ("La respuesta.<think>sin cierre", "La respuesta."),
        ("Okay, the user asks about walls.\n\nHay 12 muros.", "Hay 12 muros."),
        ("Let me think.\n\nThe user wants X.\n\nHay 12 muros.", "Hay 12 muros."),
        ("Hay 12 muros.", "Hay 12 muros."),
        ("<think>solo razonamiento</think>", ""),
        ("Okay, the user wants this.", ""),
    ],
)
def test_limpieza(crudo, esperado):
    assert cliente.limpiar_razonamiento(crudo) == esperado


def test_think_se_limpia_de_punta_a_punta(sesion, proveedor):
    proveedor.guion = lambda m, c: ok("<think>x</think>Hay 12 muros.")
    assert preguntar(sesion).json()["respuesta"] == "Hay 12 muros."


# --- enable_thinking rechazado ----------


def test_400_a_enable_thinking_reintenta_sin_ella_y_lo_recuerda(sesion, proveedor):
    proveedor.guion = lambda m, c: (400, {}) if "chat_template_kwargs" in c else ok("Sin opcion")
    assert preguntar(sesion).json() == {"respuesta": "Sin opcion", "modelo": PRINCIPAL}
    assert ["chat_template_kwargs" in c for c, _ in proveedor.peticiones] == [True, False]
    # la segunda pregunta ya no la envia: una sola peticion, sin la opcion
    proveedor.peticiones.clear()
    preguntar(sesion)
    assert ["chat_template_kwargs" in c for c, _ in proveedor.peticiones] == [False]


def test_422_tambien_reintenta_sin_ella(sesion, proveedor):
    proveedor.guion = lambda m, c: (422, {}) if "chat_template_kwargs" in c else ok("Sin opcion")
    assert preguntar(sesion).status_code == 200


# --- errores del proveedor ----------


def test_429_del_proveedor_es_ritmo_sin_reintento_ni_respaldo(sesion, proveedor):
    proveedor.guion = lambda m, c: (429, {})
    r = preguntar(sesion)
    assert r.status_code == 429
    assert "too many requests" in r.json()["error"] or "demasiadas" in r.json()["error"]
    assert len(proveedor.peticiones) == 1
    assert UsoDelAsistente.objects.get().estado == "limite"


@pytest.mark.parametrize("estado", [401, 403])
def test_401_es_autenticacion_y_no_nombra_la_clave(sesion, proveedor, estado):
    proveedor.guion = lambda m, c: (estado, {"detail": CLAVE})
    r = preguntar(sesion)
    assert r.status_code == 502
    assert "NIM_API_KEY" in r.json()["error"]
    assert CLAVE not in r.content.decode()
    assert len(proveedor.peticiones) == 1


def test_tiempo_agotado_da_504(sesion, proveedor, settings):
    settings.ASISTENTE_TIMEOUT_S = 1
    proveedor.guion = lambda m, c: (*ok("tarde"), 2.5)
    r = preguntar(sesion)
    assert r.status_code == 504
    assert UsoDelAsistente.objects.get().estado == "error"


def test_proveedor_inalcanzable_da_502(sesion, proveedor, settings):
    settings.NIM_BASE_URL = "http://127.0.0.1:9/v1"
    assert preguntar(sesion).status_code == 502


# --- limites ----------


def test_limite_diario_por_persona(sesion, proveedor, settings, ana, org):
    settings.ASISTENTE_LIMITE_DIARIO = 2
    assert preguntar(sesion).status_code == 200
    assert preguntar(sesion).status_code == 200
    r = preguntar(sesion)
    assert r.status_code == 429
    assert "today" in r.json()["error"] or "hoy" in r.json()["error"]
    assert len(proveedor.peticiones) == 2  # la tercera no llego al proveedor
    # otra persona de la misma organizacion no hereda el limite
    otra = get_user_model().objects.create_user(username="beto", password="una-clave-larga-99")
    Membresia.objects.create(organizacion=org, usuario=otra)
    otra.user_permissions.add(
        Permission.objects.get(content_type__app_label="asistente", codename="usar_asistente")
    )
    sesion.force_login(get_user_model().objects.get(pk=otra.pk))
    assert preguntar(sesion).status_code == 200


def test_ritmo_por_organizacion_con_reintenta_en(sesion, proveedor, settings):
    settings.ASISTENTE_RPM = 2
    assert preguntar(sesion).status_code == 200
    assert preguntar(sesion).status_code == 200
    r = preguntar(sesion)
    assert r.status_code == 429
    espera = r.json()["reintentar_en_s"]
    assert 1 <= espera <= 60
    assert r["Retry-After"] == str(espera)
    assert str(espera) in r.json()["error"]
    assert len(proveedor.peticiones) == 2


def test_el_ritmo_es_por_organizacion_no_global(sesion, proveedor, settings):
    settings.ASISTENTE_RPM = 1
    otra_org = Organizacion.objects.create(nombre="Otra", slug="otra", asistente_activo=True)
    ajeno = get_user_model().objects.create_user(username="c", password="una-clave-larga-99")
    UsoDelAsistente.objects.create(organizacion=otra_org, usuario=ajeno, modelo="x", estado="ok")
    assert preguntar(sesion).status_code == 200  # el uso de la otra no cuenta


def test_validacion_no_gasta_cupo(sesion, proveedor):
    assert preguntar(sesion, {"mensajes": []}).status_code == 400
    assert UsoDelAsistente.objects.count() == 0


# --- auditoria y secretos ----------


def test_auditoria_sin_texto(sesion, proveedor, org):
    proveedor.guion = lambda m, c: ok("respuesta-secreta-del-modelo")
    preguntar(sesion)
    evento = AuditEvent.objects.filter(action="asistente").get()
    assert evento.model_label == "core.Organizacion"
    assert evento.object_id == str(org.pk)
    assert evento.metadata["modelo"] == PRINCIPAL
    assert evento.metadata["tokens_entrada"] == 11
    assert evento.metadata["tokens_salida"] == 7
    assert evento.metadata["ms"] >= 0
    volcado = json.dumps(evento.metadata) + evento.path + evento.action
    assert "texto-secreto-de-la-pregunta" not in volcado
    assert "respuesta-secreta-del-modelo" not in volcado
    assert CLAVE not in volcado
    uso = repr(UsoDelAsistente.objects.get().__dict__)
    assert "texto-secreto" not in uso and "respuesta-secreta" not in uso


@pytest.mark.parametrize(
    "guion",
    [
        lambda m, c: ok("bien"),
        lambda m, c: (401, {"detail": CLAVE}),
        lambda m, c: (500, {"detail": CLAVE}),
        lambda m, c: (429, {"detail": CLAVE}),
    ],
)
def test_la_clave_no_sale_en_respuestas_ni_logs(sesion, proveedor, caplog, guion):
    proveedor.guion = guion
    caplog.set_level("DEBUG")
    r = preguntar(sesion)
    salidas = [r.content.decode(), str(dict(r.items())), caplog.text]
    salidas += [repr(e) for e in (cliente.ErrorRitmo("rate"), cliente.ErrorAutenticacion("auth"))]
    assert not any(CLAVE in s for s in salidas)


def test_la_clave_no_aparece_en_los_errores_del_cliente(proveedor):
    proveedor.guion = lambda m, c: (401, {})
    with pytest.raises(cliente.ErrorAutenticacion) as info:
        cliente.completar([{"role": "user", "content": "x"}])
    assert CLAVE not in str(info.value) and CLAVE not in repr(info.value)


# --- asistente_probar ----------


def _probar(*args):
    salida = StringIO()
    call_command("asistente_probar", *args, stdout=salida)
    return salida.getvalue()


def test_probar_la_cadena_no_imprime_la_clave(proveedor):
    proveedor.guion = lambda m, c: ok("listo") if m == PRINCIPAL else (404, {})
    texto = _probar()
    assert f"OK    {PRINCIPAL}" in texto
    assert f"FALLA {RESPALDO}" in texto
    assert CLAVE not in texto


def test_probar_sin_clave_falla(settings):
    from django.core.management.base import CommandError

    settings.NIM_API_KEY = ""
    with pytest.raises(CommandError):
        _probar()


def test_probar_modelos_y_buscar(proveedor, monkeypatch):
    monkeypatch.setattr(cliente, "listar_modelos", lambda: ["a/chat-1", "a/embed-x", "b/chat-2"])
    proveedor.guion = lambda m, c: ok("listo") if m != "b/chat-2" else (404, {})
    assert _probar("--modelos").count("\n") >= 1
    texto = _probar("--buscar")
    assert "2 candidatos" in texto  # el de embeddings se salta
    assert "NIM_MODEL=a/chat-1" in texto
    assert "NIM_MODEL_FALLBACKS=" in texto
    assert CLAVE not in texto


def test_listar_modelos_contra_el_proveedor(settings):
    class Manejador(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            assert self.path == "/v1/models"
            crudo = json.dumps({"data": [{"id": "z/m"}, {"id": "a/m"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(crudo)))
            self.end_headers()
            self.wfile.write(crudo)

    servidor = ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    settings.NIM_API_KEY = CLAVE
    settings.NIM_BASE_URL = f"http://127.0.0.1:{servidor.server_address[1]}/v1"
    try:
        assert cliente.listar_modelos() == ["a/m", "z/m"]
    finally:
        servidor.shutdown()
        servidor.server_close()
