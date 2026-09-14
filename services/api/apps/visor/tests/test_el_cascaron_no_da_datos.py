"""El HTML del visor se alcanza sin sesión, y por eso lo que importa es que **la API no**.

## De dónde sale esta prueba

El docstring de `apps/visor/views.py` explicaba por qué el `index.html` lo sirve una vista y no
whitenoise —«un archivo estático no se puede poner detrás de `LoginRequiredMixin`»—, y leyéndolo se
entendía que el HTML **solo** se alcanza por ahí.

No es así, y se vio midiendo contra el servidor. `dist/` entra a `STATICFILES_DIRS` con el prefijo
`visor`, así que `collectstatic` copia también el `index.html` y whitenoise lo sirve en
`/static/visor/index.html` **sin pedir sesión**:

| Sin cookie de sesión | |
| --- | --- |
| `/visor/` | redirige al login |
| `/static/visor/index.html` | **200** |
| `/api/revisiones/abribles/` | **401** |

**No es una fuga, y el motivo es exactamente el que esta prueba fija:** ese HTML es un cascarón
vacío. Todo lo que carga sale de la API, y la API pide permiso. La protección no está en esconder el
HTML sino en que los datos no salgan sin sesión — que es la regla de `AGENTS.md`.

Lo que esta prueba impide es que esa afirmación siga siendo una lectura del código. Si algún día
alguien mete algo dentro del HTML —una lista de obras, un nombre, una URL con un identificador—
estará publicándolo sin darse cuenta, porque el docstring que leyó decía que iba detrás del login.
"""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_la_vista_del_visor_si_pide_sesion(client):
    """La puerta que se enlaza sigue siendo la de siempre."""
    respuesta = client.get(reverse("visor:visor"))

    assert respuesta.status_code == 302
    assert "/accounts/login/" in respuesta["Location"]


def test_y_el_documento_tambien(client):
    respuesta = client.get(reverse("visor:documento"))

    assert respuesta.status_code == 302


def test_la_api_no_entrega_nada_sin_sesion(client):
    """**Es la mitad que de verdad protege**, y la que hace aceptable que el cascarón sea público.

    Se piden los tres caminos por los que el visor trae datos: la lista de lo que se puede abrir, la
    ficha de una revisión y sus bytes. Ninguno puede contestar a quien no ha entrado.
    """
    from uuid import uuid4

    inventado = uuid4()
    caminos = [
        "/api/revisiones/abribles/",
        f"/api/revisiones/{inventado}/",
        f"/api/revisiones/{inventado}/contenido/",
    ]

    for camino in caminos:
        respuesta = client.get(camino)
        assert respuesta.status_code in {401, 403}, (
            f"{camino} contestó {respuesta.status_code} sin sesión: el cascarón dejaría de estar "
            "vacío y pasaría a ser una puerta"
        )


def test_el_html_del_visor_no_lleva_datos_dentro(settings, tmp_path):
    """**El cascarón tiene que seguir siendo un cascarón.**

    Es lo que hace inofensivo que whitenoise lo sirva sin sesión. Se comprueba sobre el `index.html`
    construido —el que de verdad se publica— y solo si está: en un equipo sin `npm run build` no hay
    nada que mirar, y decirlo es mejor que fingir que se comprobó.
    """
    from pathlib import Path

    indice = Path(settings.VISOR_DIST) / "index.html"
    if not indice.is_file():
        pytest.skip("no hay build del visor: `npm run build` desde la raíz")

    texto = indice.read_text(encoding="utf-8")

    # Un cascarón son etiquetas y referencias a archivos. Lo que no puede llevar es nada del
    # dominio: si aparece, es que alguien empezó a renderizar datos en el HTML.
    for sospechoso in ("716-LCD", "csrfmiddlewaretoken", "sessionid", "@ejemplo", "@jej"):
        assert sospechoso not in texto, (
            f"el HTML del visor lleva «{sospechoso}» dentro, y whitenoise lo sirve sin sesión"
        )
