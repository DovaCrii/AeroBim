"""**Los modelos viajan comprimidos** (2026-09-28, por un proyecto de metro).

La API servía todo como `application/octet-stream`, que nginx no comprime: un IFC de 800 MB —texto
STEP, que comprime cinco o diez veces— cruzaba la red entero cada vez que alguien lo abría.

Lo que falla aquí sin que nada lo diga es **la costura**: la API elige el tipo y nginx comprime por
tipo, en dos archivos distintos. Si alguien cambia uno sin el otro, los modelos vuelven a viajar
enteros y todo sigue funcionando — solo que lento. Por eso se comprueban los dos a la vez.
"""

import re
from pathlib import Path

from django.conf import settings

from apps.documents.api import TIPOS_DE_TEXTO, tipo_para_el_visor

NGINX = Path(settings.BASE_DIR) / "deploy" / "nginx-aerobim.conf"


def tipos_que_comprime_nginx() -> set[str]:
    texto = NGINX.read_text(encoding="utf-8")
    bloque = re.search(r"^\s*gzip_types\s+([^;]+);", texto, re.M)
    assert bloque is not None, "nginx-aerobim.conf ya no declara gzip_types"
    return set(bloque.group(1).split())


def test_el_ifc_y_el_dxf_se_sirven_como_texto():
    assert tipo_para_el_visor("OBRA/E-01/abc.ifc") == "application/x-step"
    assert tipo_para_el_visor("OBRA/E-01/abc.dxf") == "image/vnd.dxf"


def test_lo_binario_sigue_como_estaba():
    """El COPC se pide por tramos y tiene que llegar con sus bytes exactos; el PDF ya viene
    comprimido. Ninguno gana nada con pasar por gzip."""
    for clave in ("OBRA/N-01/abc.laz", "OBRA/P-01/abc.pdf", "OBRA/P-01/abc.png"):
        assert tipo_para_el_visor(clave) == "application/octet-stream"


def test_nginx_comprime_justo_los_tipos_que_sirve_la_api():
    assert set(TIPOS_DE_TEXTO.values()) <= tipos_que_comprime_nginx()


def test_nginx_no_comprime_lo_que_se_pide_por_tramos():
    assert "application/octet-stream" not in tipos_que_comprime_nginx()


def test_la_compresion_esta_encendida_y_alcanza_a_lo_que_viene_de_django():
    """`gzip_proxied any` es la mitad que se olvida: sin ella nginx comprime lo que sirve él y
    **no** lo que le llega de gunicorn, que es todo lo del visor."""
    texto = NGINX.read_text(encoding="utf-8")

    assert re.search(r"^\s*gzip\s+on;", texto, re.M)
    assert re.search(r"^\s*gzip_proxied\s+any;", texto, re.M)
