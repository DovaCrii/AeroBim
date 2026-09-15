"""**Lo que le llega a quien abre un enlace, con los ajustes de producción puestos.**

## Por qué esto no lo cubre `test_enlace_compartido.py`

Esa prueba mide qué se puede alcanzar con el testigo y qué no, y corre con `settings.dev`. Esta mide
otra cosa: **las cabeceras de la respuesta**, que dependen de `prod.py` y del middleware, y que son
las que deciden si la página se dibuja o sale en blanco.

La diferencia importa porque la página compartida **es el visor**. Carga Three.js, compila el
WebAssembly de `web-ifc` y arranca un worker, y las tres cosas las puede matar una cabecera:

| Cabecera | Si falta o sobra |
| --- | --- |
| `Content-Security-Policy` sin `'wasm-unsafe-eval'` | el WASM no compila: **pantalla en blanco** |
| sin `worker-src 'self' blob:` | el worker no arranca: la conversión no empieza nunca |
| **con** `Cross-Origin-Embedder-Policy` | toma el WASM multihilo y **se cuelga sin error** |

Las dos últimas son la trampa más cara del proyecto y están escritas tres veces en el repositorio.
Lo que faltaba es comprobarlas **en la ruta pública**, que es la única que abre alguien de fuera —
es decir, la única donde el fallo lo descubre una persona que no puede contárnoslo bien, desde una
máquina que no controlamos, sobre un modelo que le acabamos de mandar.

## Y la que es propia de esta ruta

`SECURE_SSL_REDIRECT` está activo en producción. Si la redirección a `https` se comiera una petición
del visor —que pide la ficha y el contenido por `fetch`— el enlace fallaría solo detrás del proxy y
nunca en desarrollo. Se comprueba con y sin `X-Forwarded-Proto`, que es el mismo mecanismo que ya
dejó el sitio entero inservible una vez.
"""

import hashlib
from datetime import timedelta

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.documents import storage
from apps.documents.compartir import EnlaceCompartido
from apps.documents.models import Entregable, Idoneidad, Revision

IFC = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"


@pytest.fixture
def enlace(db, organizacion, proyecto, disciplina, proyectista, tmp_path):
    entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-ES-M-900",
        titulo="Modelo compartido",
        responsable=proyectista,
        peso=5,
    )
    with override_settings(DOCUMENTS_DIR=tmp_path):
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=hashlib.sha256(IFC).hexdigest(),
            extension="ifc",
        )
        storage.guardar(clave, IFC)
        revision = Revision.objects.create(
            entregable=entregable,
            correlativo="A1",
            idoneidad=Idoneidad.A,
            subida_por=proyectista,
            clave_archivo=clave,
            nombre_original="compartido.ifc",
            sha256=hashlib.sha256(IFC).hexdigest(),
            tamano_bytes=len(IFC),
            es_vigente=True,
        )
        yield EnlaceCompartido.objects.create(
            revision=revision,
            para="prueba de producción",
            expira_en=timezone.now() + timedelta(days=7),
            creado_por=proyectista,
        )


def pagina(client, enlace):
    return client.get(reverse("compartido", args=[enlace.testigo]))


# --- La CSP, que es lo que decide si el visor se dibuja ---------------------------------


@override_settings(CSP_REPORT_ONLY=False)
def test_la_pagina_compartida_lleva_la_csp_estricta(client, enlace):
    """**`Content-Security-Policy`, no `-Report-Only`.**

    La de informe no bloquea nada, así que una ruta que solo llevara esa estaría sin política y
    parecería protegida. En producción `CSP_REPORT_ONLY` es `False` por omisión (`prod.py:43`).
    """
    respuesta = pagina(client, enlace)

    assert "Content-Security-Policy" in respuesta
    assert "Content-Security-Policy-Report-Only" not in respuesta


@override_settings(CSP_REPORT_ONLY=False)
def test_la_pagina_compartida_permite_el_wasm_y_el_worker(client, enlace):
    """Los dos permisos sin los cuales el visor no arranca, **en la ruta pública**.

    Están en `base.py` y los hereda producción, así que hoy llegan. Lo que esta prueba impide es que
    alguien afine la política «solo para lo público, que es lo que ve gente de fuera» — que es
    exactamente el razonamiento que la rompería, y el resultado sería una pantalla en blanco para el
    mandante y ninguna señal en los registros.
    """
    politica = pagina(client, enlace)["Content-Security-Policy"]

    assert "'wasm-unsafe-eval'" in politica, f"sin esto el WASM no compila: {politica}"
    assert "worker-src 'self' blob:" in politica, f"sin esto el worker no arranca: {politica}"


@pytest.mark.parametrize(
    "camino",
    ["compartido", "compartido-ficha", "compartido-contenido"],
)
def test_ninguna_ruta_publica_sirve_aislamiento_de_origen(client, enlace, tmp_path, camino):
    """**La trampa que cuesta una sesión entera encontrar, comprobada donde más duele.**

    Con COOP **y** COEP a la vez el navegador marca `crossOriginIsolated`, `web-ifc` elige su WASM
    multihilo —que no funciona empaquetado— y la conversión **se queda esperando para siempre sin
    emitir ningún error**: la barra quieta y nada en los registros.

    Django sirve `Cross-Origin-Opener-Policy: same-origin` **por su cuenta desde la 4.0**, o sea que
    esa mitad ya está puesta sin que nadie la escriba. La otra no puede aparecer nunca.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(reverse(camino, args=[enlace.testigo]))

    assert "Cross-Origin-Embedder-Policy" not in respuesta, (
        f"{camino} sirve COEP: con la COOP que Django pone sola, el visor se cuelga sin dar error"
    )


# --- El proxy, que ya dejó el sitio entero inservible una vez ---------------------------


@override_settings(
    SECURE_SSL_REDIRECT=True, SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https")
)
def test_detras_del_proxy_el_enlace_contesta_y_no_redirige(client, enlace, tmp_path):
    """Con la cabecera que pone nginx, las tres rutas contestan **sin redirigir**.

    Sin `SECURE_PROXY_SSL_HEADER` esto sería un bucle de redirección — y en el visor no se vería
    como un bucle sino como «no se pudo cargar», porque quien pide la ficha es un `fetch`.

    **Lo que se mide es que no haya redirección, no que sea un 200**, y esa diferencia la enseñó el
    gate: aquí decía `== {200}` y fallaba en CI con un `503` en la página. No era un defecto del
    producto sino de la prueba — en CI **no hay build del visor**, así que `PaginaCompartidaView`
    devuelve su 503 con el aviso, que es el comportamiento correcto y escrito. Atar la prueba al
    200 la ataba a que alguien hubiera corrido `npm run build` en esa máquina.

    Y `3xx` es exactamente lo que este mecanismo puede romper, así que es lo que se comprueba.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        codigos = {
            nombre: client.get(
                reverse(nombre, args=[enlace.testigo]), HTTP_X_FORWARDED_PROTO="https"
            ).status_code
            for nombre in ("compartido", "compartido-ficha", "compartido-contenido")
        }

    redirigidas = {nombre: c for nombre, c in codigos.items() if 300 <= c < 400}
    assert not redirigidas, f"detrás del proxy siguen redirigiendo: {redirigidas}"
    # Las dos que no dependen del build sí tienen que contestar: si estas dieran 503, el fallo sería
    # del producto y no del entorno.
    assert codigos["compartido-ficha"] == 200
    assert codigos["compartido-contenido"] == 200


@override_settings(
    SECURE_SSL_REDIRECT=True, SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https")
)
def test_sin_la_cabecera_del_proxy_redirige_a_https(client, enlace):
    """La otra mitad: **que el mecanismo de verdad esté haciendo algo.**

    Sin esta comprobación, la de arriba pasaría igual con `SECURE_SSL_REDIRECT` apagado, y entonces
    no estaría midiendo nada.
    """
    respuesta = pagina(client, enlace)

    assert respuesta.status_code == 301
    assert respuesta["Location"].startswith("https://")


# --- Y lo que no debe salir de aquí -----------------------------------------------------


@override_settings(CSP_REPORT_ONLY=False)
def test_la_pagina_compartida_no_se_deja_enmarcar(client, enlace):
    """Un enlace público es lo primero que alguien pondría dentro de un `iframe` ajeno.

    `frame-ancestors 'none'` lo impide. La excepción a `'self'` existe para el PDF dentro de su
    propio expediente (`middleware.py`), y esta ruta no es ese caso.
    """
    politica = pagina(client, enlace)["Content-Security-Policy"]

    assert "frame-ancestors 'none'" in politica


def test_la_pagina_compartida_no_lleva_cookie_de_sesion(client, enlace):
    """**Abrir un enlace no empieza una sesión.**

    Si la respuesta trajera un `sessionid`, quien abre el enlace quedaría con una sesión anónima
    persistente en el servidor — filas en `django_session` por cada apertura, creciendo sin que
    nadie las mire, y una cookie que el navegador devolvería en cada petición siguiente.
    """
    respuesta = pagina(client, enlace)

    assert "sessionid" not in respuesta.cookies
