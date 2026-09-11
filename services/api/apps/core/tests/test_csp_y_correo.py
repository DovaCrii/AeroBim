"""Las dos trampas del despliegue, comprobadas.

Ninguna de las dos da error cuando esta mal: el visor se cuelga sin mensaje, y el
correo informa "enviado" mientras se imprime. Por eso se prueban.
"""

import pytest
from django.test import override_settings

from apps.core.mail import mail_is_delivered, send_verb, undelivered_reason
from apps.core.middleware import build_csp


def test_la_csp_no_permite_scripts_en_linea_por_defecto():
    politica = build_csp()

    assert "script-src 'self'" in politica
    assert "unsafe-inline" not in politica.split("style-src")[0]
    assert "frame-ancestors 'none'" in politica


def test_el_visor_necesita_wasm_y_se_declara_sin_abrir_la_politica():
    """El visor compila WebAssembly y arranca un worker. Con el `script-src 'self'`
    pelado de AeroControl no arrancaria, y la respuesta no es un comodin: son dos
    permisos nombrados."""
    politica = build_csp(
        extra_script_src=["'wasm-unsafe-eval'"], extra_worker_src=["'self'", "blob:"]
    )

    assert "script-src 'self' 'wasm-unsafe-eval'" in politica
    assert "worker-src 'self' blob:" in politica
    # Y lo que no se pidio sigue cerrado.
    assert "'unsafe-eval'" not in politica.replace("'wasm-unsafe-eval'", "")
    assert "object-src 'none'" in politica


def test_el_pdf_puede_enmarcarse_en_su_propia_ficha_y_nada_mas():
    """Todo se niega a ser enmarcado —eso es la proteccion contra clickjacking— salvo un
    documento mostrado dentro de su propia ficha, que no es ese ataque."""
    assert "frame-ancestors 'self'" in build_csp(frame_ancestors="'self'")
    assert "frame-ancestors 'none'" in build_csp()


def test_las_cabeceras_coop_y_coep_no_estan_en_la_politica():
    """**Regla cerrada de `AGENTS.md`.** Activan el WASM multihilo de `web-ifc`, que no
    funciona empaquetado, y el visor se cuelga **sin error**."""
    politica = build_csp()

    assert "Cross-Origin-Opener-Policy" not in politica
    assert "Cross-Origin-Embedder-Policy" not in politica


@pytest.mark.django_db
def test_la_respuesta_de_verdad_nunca_lleva_coep(client):
    """**Esta prueba mide la respuesta, y la de arriba solo medía una cadena.**

    La de arriba comprueba que la CSP no *nombre* esas cabeceras, que es otra pregunta: la CSP nunca
    las llevaría, porque no son directivas suyas. El aislamiento de origen se activa con **cabeceras
    HTTP**, así que el sitio donde hay que mirarlo es la respuesta.

    Y mirándola sale lo que el comentario de `prod.py` decía al revés. Decía «Django no las sirve
    por su cuenta», y **sí lo hace**: desde la versión 4.0, `SECURE_CROSS_ORIGIN_OPENER_POLICY` vale
    `"same-origin"` por omisión y `SecurityMiddleware` la escribe en cada respuesta. Comprobado
    contra el servidor: `Cross-Origin-Opener-Policy: same-origin`.

    **No es un defecto, y por eso nadie lo vio: el aislamiento de origen pide las dos.**
    `crossOriginIsolated` solo es cierto con COOP `same-origin` **y** COEP `require-corp`. Sin la
    segunda, `web-ifc` sigue eligiendo su WASM de un hilo y el visor funciona — que es justo lo que
    se ha estado midiendo todo este tiempo.

    Lo que sí era un defecto es que **la protección era un comentario y no una prueba**, y encima un
    comentario equivocado. Esto lo convierte en algo que se rompe en rojo: el día que alguien añada
    COEP «por seguridad» —para usar `SharedArrayBuffer`, por ejemplo—, COOP ya está puesta y el
    aislamiento se enciende entero.
    """
    respuesta = client.get("/health/")

    assert respuesta.headers.get("Cross-Origin-Embedder-Policy") is None, (
        "con COEP y la COOP que Django pone por omisión, el origen queda aislado y la conversión "
        "de un IFC se cuelga sin emitir ningún error"
    )
    # **Y la mitad que demuestra que esta prueba no es ciega.** Una comprobación que solo dice «esta
    # cabecera no está» pasaría igual si estuviera leyendo el sitio equivocado. Esto fija lo que sí
    # se midió —la COOP que Django pone por omisión— y deja el hallazgo escrito: si algún día deja
    # de salir, es que alguien cambió esa decisión y conviene enterarse.
    assert respuesta.headers.get("Cross-Origin-Opener-Policy") == "same-origin"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend", EMAIL_HOST="")
def test_el_backend_de_consola_no_entrega_y_lo_dice_nombrando_la_variable():
    assert mail_is_delivered() is False
    assert "EMAIL_HOST" in undelivered_reason()
    # **El verbo no miente.** El idioma viejo imprimia "Enviado" igual con el backend
    # de consola.
    assert send_verb() == "IMPRESO, NO ENVIADO:"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend", EMAIL_HOST="smtp")
def test_con_smtp_configurado_si_entrega():
    assert mail_is_delivered() is True
    assert undelivered_reason() == ""
    assert send_verb() == "Enviado"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_locmem_no_cuenta_como_no_entregado():
    """Django lo instala el mismo durante los tests. Incluirlo en la lista haria que
    toda la suite corriera con la advertencia encendida, que es la forma mas rapida de
    que un aviso deje de significar algo."""
    assert mail_is_delivered() is True


@pytest.mark.django_db
def test_la_auditoria_registra_una_peticion_que_muta(client):
    from django.contrib.auth import get_user_model

    from apps.core.models import AuditEvent

    usuario = get_user_model().objects.create_user(username="alguien", password="clave-larga-99")
    client.force_login(usuario)
    # Una ruta que muta y a la que este usuario no tiene acceso: el registro tiene que
    # existir igual, y decir que se le nego.
    client.post("/proyecto/organizaciones/")

    evento = AuditEvent.objects.first()
    assert evento is not None
    assert evento.actor == usuario
    assert evento.method == "POST"
    assert evento.action.endswith("denied")


@pytest.mark.django_db
def test_la_auditoria_no_registra_el_formulario_de_ingreso(client):
    """Ahi el cuerpo lleva una contraseña."""
    from apps.core.models import AuditEvent

    client.post("/accounts/login/", {"username": "x", "password": "y"})

    assert AuditEvent.objects.count() == 0
