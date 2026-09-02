"""La marca: que exista, que esté en las dos mitades del producto y que no se separen.

**El portal no tenía icono de pestaña y el visor sí desde el primer día.** Con cuatro pestañas
abiertas —el expediente, el tablero, una observación y el modelo— la única reconocible era la del
visor, y la palabra «AeroBim» de la cabecera del portal iba sin el dibujo que sí lleva la cinta.

El archivo vive **dos veces** porque las dos mitades sirven sus estáticos desde raíces distintas:
`apps/web/public/` para el visor y `services/api/static/` para el portal. No hay un directorio
compartido, así que en vez de prometer que las copias se mantendrán iguales, se comprueba.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.urls import reverse

MARCA_DEL_VISOR = Path(settings.REPO_DIR) / "apps" / "web" / "public" / "aerobim-mark.svg"
MARCA_DEL_PORTAL = Path(settings.BASE_DIR) / "static" / "img" / "aerobim-mark.svg"


def test_las_dos_copias_de_la_marca_son_el_mismo_archivo():
    """**Sin esto, la marca se separa y nadie se entera hasta que alguien mira las dos pantallas.**

    Es el precio de no tener un directorio de activos compartido, y se paga con una comparación de
    bytes en vez de con una promesa en un comentario.
    """
    assert MARCA_DEL_VISOR.is_file(), "falta la marca del visor"
    assert MARCA_DEL_PORTAL.is_file(), "falta la marca del portal"
    assert MARCA_DEL_PORTAL.read_bytes() == MARCA_DEL_VISOR.read_bytes()


def test_la_marca_no_trae_script_ni_referencias_de_fuera():
    """Un SVG servido como estático **se puede abrir directo en el navegador**, y ahí un `<script>`
    corre en nuestro origen. Es un archivo dibujado a mano y así se queda."""
    texto = MARCA_DEL_PORTAL.read_text(encoding="utf-8").lower()

    for prohibido in ("<script", "onload", 'href="http', "xlink:href", "<foreignobject"):
        assert prohibido not in texto


@pytest.mark.django_db
def test_el_portal_lleva_su_icono_de_pestana_y_su_marca(client, proyectista):
    """Las dos cosas en la misma prueba porque salen del mismo archivo y del mismo `base.html`."""
    client.force_login(proyectista)

    html = client.get(reverse("portal")).content.decode("utf-8")

    assert 'rel="icon"' in html
    assert "aerobim-mark.svg" in html
    # Y el dibujo va con `alt=""`: el nombre está escrito al lado, así que leerlo dos veces sobra.
    assert 'alt=""' in html
