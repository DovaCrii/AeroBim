"""La pantalla de reportes y su exportación (`F15.5`): quién la ve, de qué organización, y el CSV.

Lo que cuentan las cifras está en `test_reportes.py`. Aquí se sujeta lo que hace falta de una
pantalla nueva en este repositorio: su 403 para quien está autenticado y no puede, su aislamiento
entre organizaciones, y que lo que se escribe en un título no pueda ser una fórmula de Excel.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone

from apps.accounts import roles
from apps.core.models import Membresia, Organizacion
from apps.documents.models import Observacion
from apps.documents.reportes import Grupo, Segmento
from apps.projects.models import Proyecto

pytestmark = pytest.mark.django_db

RUTA = "documents:reportes"
RUTA_CSV = "documents:reportes-csv"


def con_rol(usuario, rol):
    from django.core.management import call_command

    call_command("bootstrap_roles", verbosity=0)
    usuario.groups.add(Group.objects.get(name=rol))
    return get_user_model().objects.get(pk=usuario.pk)


@pytest.fixture
def abrir(organizacion, proyecto, revisor):
    def crear(titulo="Hallazgo", dias_de_atraso=None, **extra):
        return Observacion.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            titulo=titulo,
            autor=revisor,
            responsable=revisor,
            vence=(
                None
                if dias_de_atraso is None
                else timezone.localdate() - timedelta(days=dias_de_atraso)
            ),
            **extra,
        )

    return crear


# --- Quién la ve ----------------------------------------------------------------------------


@pytest.mark.parametrize("ruta", [RUTA, RUTA_CSV])
def test_sin_sesion_se_va_al_login(client, ruta):
    assert client.get(reverse(ruta)).status_code == 302


@pytest.mark.parametrize("ruta", [RUTA, RUTA_CSV])
@pytest.mark.parametrize("rol", [roles.MANDANTE, roles.PROYECTISTA])
def test_quien_no_reparte_no_la_ve_ni_la_exporta(client, revisor, rol, ruta):
    """Enseña cuánto lleva cada persona: el de lectura lo tiene hasta el mandante, y no basta."""
    client.force_login(con_rol(revisor, rol))

    assert client.get(reverse(ruta)).status_code == 403


@pytest.mark.parametrize("ruta", [RUTA, RUTA_CSV])
@pytest.mark.parametrize("rol", [roles.COORDINADOR, roles.REVISOR])
def test_quien_reparte_si(client, revisor, rol, ruta):
    client.force_login(con_rol(revisor, rol))

    assert client.get(reverse(ruta)).status_code == 200


# --- De qué organización --------------------------------------------------------------------


def test_no_se_cuentan_ni_se_listan_las_observaciones_de_otra_organizacion(client, revisor, abrir):
    abrir("De mi obra")
    otra = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    ajeno = get_user_model().objects.create_user("ajeno", password="x" * 14)
    Membresia.objects.create(organizacion=otra, usuario=ajeno)
    obra_ajena = Proyecto.objects.create(organizacion=otra, codigo="999-XX", nombre="Ajena")
    Observacion.objects.create(
        organizacion=otra,
        proyecto=obra_ajena,
        titulo="Hallazgo de otra empresa",
        autor=ajeno,
        responsable=ajeno,
    )
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    pantalla = client.get(reverse(RUTA))
    csv = client.get(reverse(RUTA_CSV)).content.decode()

    assert "Hallazgo de otra empresa" not in pantalla.content.decode()
    assert pantalla.context["total_filas"] == 1
    assert "Hallazgo de otra empresa" not in csv
    assert "De mi obra" in csv


@pytest.mark.parametrize(
    "consulta",
    [
        {"obra": "no-es-un-uuid"},
        {"circulo": "password", "barras": "<script>"},
        {"orden": "__class__", "sentido": "sideways"},
    ],
)
def test_una_url_mal_escrita_no_da_un_500(client, revisor, consulta):
    """Lo que no se conoce cae en el valor por defecto: un enlace mal copiado no la rompe."""
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    assert client.get(reverse(RUTA), consulta).status_code == 200
    assert client.get(reverse(RUTA_CSV), consulta).status_code == 200


# --- Qué enseña -----------------------------------------------------------------------------


def test_las_cifras_de_la_pantalla_son_las_que_se_esperan(client, revisor, abrir):
    abrir("Vencida", dias_de_atraso=5)
    abrir("En plazo", dias_de_atraso=-3)
    abrir("Ya cerrada", estado=Observacion.CERRADA)
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    cifras = {
        c.clave: c.valor for c, _rotulo, _definicion in client.get(reverse(RUTA)).context["cifras"]
    }

    assert cifras["open"] == 2
    assert cifras["overdue"] == 1
    assert cifras["closed"] == 1
    assert cifras["assigned_to_me"] == 2


def test_la_pantalla_dice_como_se_cuenta_cada_cifra(client, revisor):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA)).content.decode()

    assert "Observaciones abiertas con plazo anterior a hoy." in html


def test_los_gruesos_del_svg_llevan_punto_decimal_aunque_la_pantalla_este_en_espanol():
    """`floatformat` escribe coma en español y un SVG con `12,5` no se dibuja: por eso salen ya
    formateados desde Python."""
    segmento = Segmento(Grupo("A", 1, 0), porcentaje=33.3333333, desde=12.5)

    assert segmento.dasharray == "33.333 66.667"
    assert segmento.dashoffset == "-12.500"
    assert "," not in segmento.dasharray + segmento.dashoffset


def test_sin_observaciones_la_pantalla_lo_dice_y_no_falla(client, revisor):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    respuesta = client.get(reverse(RUTA))

    assert respuesta.status_code == 200
    assert respuesta.context["total_filas"] == 0
    assert "Todavía no hay observaciones para reportar." in respuesta.content.decode()


# --- La exportación -------------------------------------------------------------------------


def test_el_csv_lleva_bom_y_punto_y_coma_para_que_excel_lo_abra(client, revisor, abrir):
    abrir("Una observación")
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    respuesta = client.get(reverse(RUTA_CSV))
    cuerpo = respuesta.content.decode("utf-8")

    assert respuesta["Content-Type"].startswith("text/csv")
    assert "attachment" in respuesta["Content-Disposition"]
    assert cuerpo.startswith("﻿")
    assert ";" in cuerpo.splitlines()[0]
    assert "Una observación" in cuerpo


def test_un_titulo_que_empieza_por_igual_no_se_convierte_en_una_formula(client, revisor, abrir):
    """Lo escribe quien sea que abra una observación; en Excel `=cmd|...` se ejecuta."""
    abrir('=HYPERLINK("http://malo.example","clic")')
    abrir("+1+1")
    abrir("@SUM(1)")
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    cuerpo = client.get(reverse(RUTA_CSV)).content.decode("utf-8")

    for peligroso in ("=HYPERLINK", "+1+1", "@SUM"):
        assert f"'{peligroso}" in cuerpo  # el apóstrofo delante: texto, no fórmula
        assert f";{peligroso}" not in cuerpo and f"\n{peligroso}" not in cuerpo


def test_el_csv_lleva_todas_las_filas_aunque_la_pantalla_enseñe_menos(
    client, revisor, abrir, monkeypatch
):
    monkeypatch.setattr("apps.documents.reportes_views.FILAS_EN_PANTALLA", 2)
    for i in range(5):
        abrir(f"Obs {i}")
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    pantalla = client.get(reverse(RUTA))
    csv = client.get(reverse(RUTA_CSV)).content.decode("utf-8")

    assert len(pantalla.context["filas"]) == 2
    assert pantalla.context["total_filas"] == 5
    assert len(csv.strip().splitlines()) == 1 + 5  # la cabecera y las cinco
