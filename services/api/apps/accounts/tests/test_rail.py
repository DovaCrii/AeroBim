"""La barra lateral: que esté en todas las páginas, que marque **una** entrada, y que no cueste.

Hasta hoy el portal **no tenía navegación persistente**: la barra de arriba llevaba marca, tema,
usuario, ayuda, clave y salir, y ni un enlace a un módulo. Para ir de una observación a un
entregable había que volver a `/` y elegir otra tarjeta — o sea que la portada *era* el menú.

Lo que se prueba aquí es lo que se rompería sin darse cuenta:

- **Que esté en todas.** Se pinta en `base.html`, que extienden treinta y tantas plantillas: la
  forma de que falte en una es que su vista no lo tenga en el contexto, y por eso va en un context
  processor y no en cada vista.
- **Que marque exactamente una.** Dos `aria-current` es peor que ninguno: un lector de pantalla
  anuncia dos «página actual» y quien mira ve dos entradas encendidas.
- **Que no aparezca sin sesión**, ni siquiera vacío.
- **Que no cueste en las respuestas que no pintan plantilla** — las de la API, las descargas.
"""

import re

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse


@pytest.fixture
def dentro(client, db, organizacion):
    """Alguien con sesión, permisos **y membresía**.

    La membresía no es decoración: sin ella `scope_queryset_to_organizacion` devuelve `none()` y la
    ficha de un entregable da **404**, no 403. Es la trampa que documenta `preparar_piloto`, y esta
    prueba la pisó al escribirla: el rail no marcaba nada porque la página era un 404.
    """
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("adentro", password="x")
    for codename in ("view_proyecto", "view_observacion", "view_entregable"):
        usuario.user_permissions.add(Permission.objects.get(codename=codename))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    return usuario


def cuerpo(respuesta) -> str:
    return respuesta.content.decode("utf-8")


# --- 1. Está, y en todas -------------------------------------------------------------


@pytest.mark.parametrize(
    "ruta",
    [
        "/",
        "accounts:ayuda",
        "projects:proyectos",
        "documents:observaciones",
        "documents:entregables",
        "documents:bandeja",
    ],
)
def test_el_rail_esta_en_todas_las_paginas_con_sesion(client, dentro, ruta):
    url = ruta if ruta.startswith("/") else reverse(ruta)

    html = cuerpo(client.get(url))

    assert '<nav class="rail"' in html, f"falta el rail en {url}"


def test_la_puerta_de_entrada_no_lleva_rail(client, db):
    """La pantalla de entrada no tiene módulos que ofrecer.

    **Y hoy lo consigue sin ayuda**: `registration/login.html` no extiende `base.html` —tiene su
    propio `<html>`, con su presentación al lado del formulario—, así que ni ve el rail.
    """
    html = cuerpo(client.get(reverse("login")))

    assert '<nav class="rail"' not in html


def test_base_html_con_un_anonimo_deja_el_marco_sin_columna():
    """La rama defensiva de `base.html`, probada **donde se puede probar**.

    Hoy es inalcanzable por URL: ninguna plantilla anónima extiende `base.html` —la entrada es
    independiente y no hay plantillas de 404 ni de 500—. Se queda de todas formas y se prueba
    renderizando la base a mano, porque el día que alguien añada una pantalla anónima que la
    extienda, sin esto tendría una columna de 248 px de nada al lado del contenido. Es una línea de
    plantilla y una clase de CSS: más barato que el fallo que evita.
    """
    from django.contrib.auth.models import AnonymousUser
    from django.template.loader import render_to_string

    html = render_to_string(
        "base.html",
        {
            "user": AnonymousUser(),
            "grupos_de_navegacion": (),
            "modulo_activo": None,
        },
    )

    assert '<nav class="rail"' not in html
    assert "marco-sin-rail" in html


def test_el_rail_solo_lista_lo_que_esta_persona_puede_abrir(client, dentro):
    """La misma regla que la portada: **se filtra, no se deshabilita.**"""
    html = cuerpo(client.get("/"))

    assert reverse("documents:entregables") in html
    # `view_auditevent` no se le dio: la entrada no existe, ni en gris.
    assert reverse("accounts:auditoria") not in html


# --- 2. Marca una, y la correcta ------------------------------------------------------


def _solo_el_rail(html: str) -> str:
    """El trozo del `<nav class="rail">`, y solo ese.

    **Se acota al rail a propósito.** Hay pantallas con migas —la ficha de un hallazgo— y una miga
    marca su último salto con `aria-current="page"`: eso es correcto y esperado. Contar en toda la
    página mezclaría las dos cosas y esta prueba fallaría por algo que está bien.
    """
    return html[html.index('<nav class="rail"') : html.index("</nav>")]


def _cuantos_current(html: str) -> int:
    return len(re.findall(r'aria-current="page"', _solo_el_rail(html)))


@pytest.mark.parametrize(
    "ruta", ["projects:proyectos", "documents:observaciones", "documents:entregables"]
)
def test_exactamente_una_entrada_marcada(client, dentro, ruta):
    """**Dos `aria-current` es peor que ninguno.**

    Un lector de pantalla anunciaría dos «página actual», y quien mira vería dos entradas
    encendidas sin saber en cuál está.
    """
    html = cuerpo(client.get(reverse(ruta)))

    assert _cuantos_current(html) == 1


def test_la_marcada_es_la_del_modulo_en_el_que_se_esta(client, dentro):
    html = cuerpo(client.get(reverse("documents:observaciones")))

    marcada = re.search(r'href="([^"]+)"\s+aria-current="page"', html)
    assert marcada is not None
    assert marcada.group(1) == reverse("documents:observaciones")


def test_una_pantalla_de_detalle_marca_su_modulo(client, dentro, entregable):
    """**El caso que justifica comparar por prefijo de URL.**

    En la ficha de un entregable no hay ninguna entrada del catálogo que coincida por nombre de
    ruta, así que el rail dejaría de decir dónde se está justo en las pantallas donde se trabaja.
    """
    url = reverse("documents:expediente", kwargs={"pk": entregable.pk})

    respuesta = client.get(url)
    assert respuesta.status_code == 200, f"la ficha respondió {respuesta.status_code}"
    html = cuerpo(respuesta)

    marcada = re.search(r'href="([^"]+)"\s+aria-current="page"', html)
    assert marcada is not None
    assert marcada.group(1) == reverse("documents:entregables")


def test_la_ayuda_no_marca_ningun_modulo(client, dentro):
    """La ayuda y el cambio de contraseña no son módulos: **cero marcas es correcto.**"""
    html = cuerpo(client.get(reverse("accounts:ayuda")))

    assert _cuantos_current(html) == 0


def test_la_portada_se_marca_a_si_misma(client, dentro):
    """«Mi trabajo» es una entrada del rail y tiene que encenderse como las demás."""
    html = cuerpo(client.get("/"))

    marcada = re.search(r'href="([^"]+)"\s+aria-current="page"', html)
    assert marcada is not None
    assert marcada.group(1) == "/"


# --- 3. Lo que tiene que estar dibujado ----------------------------------------------


def test_el_sprite_de_iconos_va_una_sola_vez(client, dentro):
    """**Incluirlo dos veces funcionaría, y por eso hay que probarlo.**

    Subió de `portal.html` a `base.html`; si el `include` viejo se hubiera quedado, los `id` de los
    símbolos estarían repetidos y `<use href="#...">` tomaría el primero — sin ningún síntoma hasta
    que alguien editara uno de los dos.
    """
    html = cuerpo(client.get("/"))

    assert html.count('id="i-proyecto"') == 1


def test_cada_entrada_del_rail_lleva_su_icono_y_su_rotulo(client, dentro):
    """A 64 px el icono es lo único que queda; el rótulo tiene que seguir escrito de todas formas.

    Es lo que se lee con un lector de pantalla, y `title` no sirve para eso.
    """
    html = cuerpo(client.get("/"))
    rail = html[html.index('<nav class="rail"') : html.index("</nav>")]

    assert rail.count('class="rail-icono"') == rail.count('class="rail-rotulo"')
    assert rail.count('class="rail-icono"') >= 6


def test_los_dos_iconos_nuevos_existen_en_el_sprite(client, dentro):
    """`i-mi-trabajo` e `i-ayuda`. Un `<use>` a un `id` que no existe **no da error: no dibuja.**"""
    html = cuerpo(client.get("/"))

    for icono in ("i-mi-trabajo", "i-ayuda"):
        assert f'id="{icono}"' in html, f"falta el símbolo {icono}"
        assert f'href="#{icono}"' in html, f"nadie usa {icono}"


def test_mi_trabajo_no_comparte_icono_con_lo_mio(client, dentro):
    """**Plegado a 64 px, dos filas con el mismo dibujo son dos filas idénticas.**

    «Mi trabajo» y «Lo mío» hablan las dos de lo pendiente, y ahí está el riesgo de reusar el icono.
    """
    html = cuerpo(client.get("/"))
    rail = html[html.index('<nav class="rail"') : html.index("</nav>")]

    usados = re.findall(r'href="#(i-[a-z-]+)"', rail)

    assert len(usados) == len(set(usados)), f"iconos repetidos en el rail: {usados}"


# --- 4. La cabecera vacía no se ve ---------------------------------------------------


def test_la_cabecera_sin_llenar_queda_literalmente_vacia():
    """El defecto vacío, probado **renderizando la base a pelo**.

    Sirvió para migrar las treinta plantillas de una en una: mientras una no se había tocado, su
    cabecera salía sin contenido y `.cabecera-pagina:empty` la escondía. Hoy todas tienen título
    —lo exige `test_toda_pantalla_tiene_titulo_de_alguna_forma`—, así que ya no hay ninguna página
    donde comprobarlo por URL.

    Se queda porque protege a **la siguiente** plantilla que alguien escriba: sin el
    `{% spaceless %}`, la cabecera saldría con saltos de línea dentro, `:empty` no la reconocería
    como vacía, y quedaría una franja de margen en blanco encima del contenido.
    """
    from django.contrib.auth.models import AnonymousUser
    from django.template.loader import render_to_string

    html = render_to_string(
        "base.html",
        {"user": AnonymousUser(), "grupos_de_navegacion": (), "modulo_activo": None},
    )

    assert '<header class="cabecera-pagina"></header>' in html


# --- 5. Que no cueste donde no se usa ------------------------------------------------


def test_construir_el_contexto_no_toca_la_base(dentro, rf, django_assert_num_queries):
    """**El motivo del `SimpleLazyObject`, medido en consultas.**

    El context processor corre en *cada* respuesta, incluidas las que no pintan ninguna plantilla:
    las de la API en DRF, las descargas, los redirects. Calcular ahí los permisos de doce módulos
    es trabajo tirado en cada petición que hace el visor.

    Cero consultas al construirlo es la comprobación: los permisos se leen de la base, así que si
    el cálculo pasara aquí se verían.
    """
    from apps.accounts.context_processors import navegacion

    peticion = rf.get("/")
    peticion.user = dentro

    with django_assert_num_queries(0):
        navegacion(peticion)


def test_el_contexto_sigue_sin_evaluar_hasta_que_alguien_lo_nombra(dentro, rf):
    """La otra mitad: que sea diferido **de verdad** y no diferido por accidente.

    `SimpleLazyObject` guarda su valor en `_wrapped`, y mientras nadie lo use vale el centinela
    `empty`. Comprobarlo así y no por el número de consultas distingue «no costó» de «no se hizo»,
    que en una base con caché de consultas serían lo mismo.
    """
    from django.utils.functional import empty

    from apps.accounts.context_processors import navegacion

    peticion = rf.get("/")
    peticion.user = dentro
    contexto = navegacion(peticion)

    assert contexto["grupos_de_navegacion"]._wrapped is empty
    assert contexto["modulo_activo"]._wrapped is empty

    # Y al nombrarlo, se resuelve: si no, esto no sería diferido sino roto.
    assert len(contexto["grupos_de_navegacion"]) > 0
    assert contexto["grupos_de_navegacion"]._wrapped is not empty


def test_sin_sesion_el_contexto_no_es_ni_diferido(rf, db):
    """Con un anónimo se devuelve una tupla vacía directamente: no hay nada que calcular.

    Envolver un valor constante en un `SimpleLazyObject` sería ceremonia sin ganancia, y además
    `AnonymousUser.has_perm` no toca la base.
    """
    from django.contrib.auth.models import AnonymousUser

    from apps.accounts.context_processors import navegacion

    peticion = rf.get("/")
    peticion.user = AnonymousUser()

    contexto = navegacion(peticion)

    assert contexto == {"grupos_de_navegacion": (), "modulo_activo": None}
