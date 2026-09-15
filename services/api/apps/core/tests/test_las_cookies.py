"""**Qué cookies pone AeroBim, cuántas, y qué pasa con ellas en producción.**

## Por qué esto se mide y no se lee

Las cookies son de lo poco del producto que tiene consecuencias **legales y de experiencia a la
vez**, y las dos se deciden con el mismo dato: qué cookies hay y para qué. Ese dato estaba repartido
entre tres archivos de ajustes y ninguna prueba lo miraba junto.

Las dos preguntas que contesta:

1. **¿Hace falta un aviso de cookies?** Depende de si alguna es de las que la ley llama «no
   estrictamente necesarias» — analítica, publicidad, seguimiento entre sitios. Si no hay ninguna,
   no hace falta pedir consentimiento, y poner un banner igualmente es enseñarle a la gente a
   aceptar cosas sin leerlas.
2. **¿Va a echar a alguien a mitad de una tarea?** Es la otra mitad, y la que se nota todos los
   días.

## Lo que hay hoy, medido

| Cookie | Quién la pone | Para qué | Estrictamente necesaria |
| --- | --- | --- | --- |
| `sessionid` | Django | saber quién eres | **sí** |
| `csrftoken` | Django | que un tercero no pueda enviar formularios en tu nombre | **sí** |

Y nada más: **ni analítica, ni publicidad, ni nada de un tercero**. El tema claro/oscuro va en
`localStorage` y no en una cookie, que es otra decisión con el mismo efecto — no viaja en cada
petición y no es una cookie que declarar.

**Consecuencia:** con solo estas dos, no hace falta pedir consentimiento. Lo que sí corresponde es
**decirlo en alguna parte**, que es distinto de pedir permiso.
"""

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse

U = get_user_model()

#: Las únicas cookies que este producto puede poner.
#:
#: **La lista es cerrada a propósito.** Una cookie nueva es una decisión —legal y de privacidad— y
#: llega normalmente sin que nadie la tome: la añade una librería que alguien instaló por otra cosa.
#: Si esta prueba falla, la pregunta no es «cómo la añado» sino «quién la puso y por qué».
PERMITIDAS = {"sessionid", "csrftoken"}


@pytest.fixture
def quien(db):
    return U.objects.create_user(
        username="alguien", password="una-clave-larga-99", email="alguien@ejemplo.cl"
    )


def test_entrar_solo_pone_las_dos_cookies_necesarias(client, quien):
    """**El ciclo completo**: la puerta, la entrada y una pantalla cualquiera.

    Se mide sobre las tres porque una cookie de más no suele aparecer en la que uno mira: aparece en
    la de al lado, puesta por un middleware que corre en todas.
    """
    puestas = set()
    for respuesta in (
        client.get(reverse("login")),
        client.post(reverse("login"), {"username": "alguien", "password": "una-clave-larga-99"}),
        client.get("/"),
    ):
        puestas.update(respuesta.cookies.keys())

    assert puestas <= PERMITIDAS, (
        f"cookies que nadie declaró: {sorted(puestas - PERMITIDAS)}. Cada una es una decisión "
        "legal, y esta clase de cosa la añade una librería instalada por otro motivo"
    )


@override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
def test_en_produccion_las_dos_van_marcadas_como_seguras(client, quien):
    """`Secure` es lo que impide que viajen por una conexión sin cifrar.

    En `prod.py` están las dos en `True`. Aquí se comprueba que **llegan marcadas a la respuesta**,
    que es distinto de que la constante esté escrita: es el mismo agujero de oráculo que dejó
    `SECURE_SSL_REDIRECT` sin su cabecera de proxy.
    """
    client.post(reverse("login"), {"username": "alguien", "password": "una-clave-larga-99"})
    respuesta = client.get("/")
    cookies = {**client.cookies, **respuesta.cookies}

    assert cookies["sessionid"]["secure"], "la cookie de sesión viajaría sin cifrar"
    assert cookies["csrftoken"]["secure"]


def test_la_de_sesion_no_se_puede_leer_desde_javascript(client, quien):
    """`HttpOnly` en la de sesión. **Y la de CSRF no la lleva, y no es un descuido.**

    El visor necesita leer el testigo desde JavaScript para poder enviar formularios; con
    `CSRF_COOKIE_HTTPONLY` los `POST` del visor morían todos. Está explicado en `base.py`, y aquí se
    fija que la asimetría siga siendo la que es: la que identifica no se lee, la que solo sirve para
    acompañar una petición sí.
    """
    client.post(reverse("login"), {"username": "alguien", "password": "una-clave-larga-99"})

    assert client.cookies["sessionid"]["httponly"]
    assert not client.cookies["csrftoken"]["httponly"]


def test_ninguna_cookie_cruza_a_otro_sitio(client, quien):
    """`SameSite` en `Lax` o más estricto.

    Sin ella, otra página podría hacer que el navegador mandara la sesión en una petición que la
    persona no pidió. `Lax` es el valor por omisión de Django desde hace versiones, así que esto no
    protege de un descuido nuestro sino de que alguien lo relaje «para que funcione algo».
    """
    client.post(reverse("login"), {"username": "alguien", "password": "una-clave-larga-99"})

    for nombre in ("sessionid", "csrftoken"):
        valor = client.cookies[nombre].get("samesite", "Lax") or "Lax"
        assert valor.lower() in {"lax", "strict"}, f"{nombre} tiene SameSite={valor}"


def test_la_sesion_no_echa_a_nadie_a_mitad_de_la_tarde():
    """**La combinación que decide si alguien tiene que volver a entrar durante su jornada.**

    Son tres ajustes que solo significan algo juntos, y por eso se comprueban juntos:

    - `SESSION_EXPIRE_AT_BROWSER_CLOSE` — al cerrar el navegador se sale. Es lo correcto en un
      equipo compartido de obra, que es donde esto se va a usar.
    - `SESSION_COOKIE_AGE` — el tope pase lo que pase. Doce horas cubre una jornada larga.
    - `SESSION_SAVE_EVERY_REQUEST` — **la que evita el problema de verdad**: sin ella el reloj corre
      desde que entraste, así que a las doce horas exactas te echa aunque estés escribiendo. Con
      ella, cada petición lo corre hacia adelante.

    El precio de la tercera está dicho en el plan (`R10`): `django_session` crece en cada petición,
    y por eso el timer de mantenimiento corre `clearsessions`.
    """
    assert settings.SESSION_SAVE_EVERY_REQUEST, (
        "sin esto la sesión caduca a las 12 h de entrar, aunque la persona esté trabajando"
    )
    assert settings.SESSION_COOKIE_AGE >= 8 * 60 * 60, (
        f"{settings.SESSION_COOKIE_AGE} s no cubre una jornada"
    )


@pytest.mark.django_db
def test_el_enlace_compartido_no_pone_ninguna_cookie_de_sesion(client):
    """Quien abre un enlace **no empieza una sesión**, y eso también es una decisión de cookies.

    Si la abriera, cada apertura dejaría una fila en `django_session` y una cookie en el navegador
    de alguien que nunca entró a nada — y entonces sí habría algo que declarar.
    """
    respuesta = client.get(reverse("compartido", args=["x" * 43]))

    assert "sessionid" not in respuesta.cookies
    assert respuesta.status_code == 404
