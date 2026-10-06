"""El buscador del registro (`F15.6`): cómo se parte la consulta y qué enseña a quién.

Lo que se sujeta es lo que exige una pantalla de lectura en este repositorio: su 403 para quien está
autenticado y no puede, que **no cruce organizaciones**, y que el grupo de observaciones dependa de
su
propio permiso y no del de los entregables.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import reverse

from apps.accounts import roles
from apps.core.models import Membresia, Organizacion
from apps.documents.busqueda import MAXIMO_DE_TERMINOS, terminos_de
from apps.documents.models import Entregable, Observacion
from apps.projects.models import Disciplina, Proyecto

RUTA = "documents:buscar"


def con_rol(usuario, rol):
    from django.core.management import call_command

    call_command("bootstrap_roles", verbosity=0)
    usuario.groups.add(Group.objects.get(name=rol))
    return get_user_model().objects.get(pk=usuario.pk)


# --- Cómo se parte lo que se escribe ---------------------------------------------------------


@pytest.mark.parametrize("vacia", [None, "", "   ", "a"])
def test_sin_nada_que_buscar_no_hay_terminos(vacia):
    """Una letra devolvería media obra: se pide algo más."""
    assert terminos_de(vacia) == []


def test_se_parte_por_espacios_y_se_ignora_lo_vacio():
    assert terminos_de("  cota   eje  C ") == ["cota", "eje", "C"]


def test_lo_que_sobra_se_recorta_y_no_es_un_error():
    muchos = " ".join(f"palabra{i}" for i in range(MAXIMO_DE_TERMINOS + 5))
    assert len(terminos_de(muchos)) == MAXIMO_DE_TERMINOS
    assert len(terminos_de("x" * 500)[0]) <= 80


# --- La pantalla ---------------------------------------------------------------------------


@pytest.fixture
def uno(db, organizacion, proyecto, revisor, entregable):
    """El entregable de los fixtures —`716-LCD-AR-P-001`, «Planta piso 5»— y una observación."""
    o = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Cota de la zapata Z-4",
        descripcion="Revisar el nivel de fundación contra el plano",
        autor=revisor,
        responsable=revisor,
    )
    return entregable, o


@pytest.mark.django_db
def test_sin_sesion_se_va_al_login(client):
    assert client.get(reverse(RUTA)).status_code == 302


@pytest.mark.django_db
def test_quien_no_ve_entregables_recibe_403_duro(client, revisor):
    """Autenticado sin `view_entregable`: 403, no una redirección al login (sería un bucle)."""
    client.force_login(revisor)

    assert client.get(reverse(RUTA)).status_code == 403


@pytest.mark.django_db
def test_encuentra_por_codigo_y_por_titulo_sin_distinguir_mayusculas(client, revisor, uno):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    por_codigo = client.get(reverse(RUTA), {"q": "ar-p-001"}).content.decode()
    por_titulo = client.get(reverse(RUTA), {"q": "PISO"}).content.decode()

    assert "716-LCD-AR-P-001" in por_codigo
    assert "Planta piso 5" in por_titulo


@pytest.mark.django_db
def test_todos_los_terminos_tienen_que_aparecer(client, revisor, uno):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    ambos = client.get(reverse(RUTA), {"q": "planta piso"})
    uno_ausente = client.get(reverse(RUTA), {"q": "planta losa"})

    assert ambos.context["entregables_total"] == 1
    assert uno_ausente.context["entregables_total"] == 0


@pytest.mark.django_db
def test_las_observaciones_se_buscan_en_titulo_y_descripcion(client, revisor, uno):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    por_titulo = client.get(reverse(RUTA), {"q": "zapata"})
    por_descripcion = client.get(reverse(RUTA), {"q": "nivel fundación"})

    assert por_titulo.context["observaciones_total"] == 1
    assert por_descripcion.context["observaciones_total"] == 1


@pytest.mark.django_db
def test_sin_permiso_de_observaciones_no_salen_aunque_coincidan(client, revisor, uno):
    """Son dos permisos: ver entregables no es poder abrir hallazgos."""
    from django.contrib.auth.models import Permission

    revisor.user_permissions.add(Permission.objects.get(codename="view_entregable"))
    client.force_login(get_user_model().objects.get(pk=revisor.pk))

    respuesta = client.get(reverse(RUTA), {"q": "zapata"})

    assert respuesta.status_code == 200
    assert respuesta.context["puede_ver_observaciones"] is False
    assert "observaciones" not in respuesta.context
    assert "Cota de la zapata" not in respuesta.content.decode()


@pytest.mark.django_db
def test_no_se_cruzan_las_organizaciones(client, revisor, uno):
    otra = Organizacion.objects.create(nombre="Ajena", slug="ajena-b")
    ajeno = get_user_model().objects.create_user("ajeno", password="x" * 14)
    Membresia.objects.create(organizacion=otra, usuario=ajeno)
    obra = Proyecto.objects.create(organizacion=otra, codigo="999-XX", nombre="Ajena")
    Entregable.objects.create(
        organizacion=otra,
        proyecto=obra,
        disciplina=Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura"),
        codigo="999-XX-ES-P-001",
        titulo="Planta piso 9 ajena",
        responsable=ajeno,
        peso=1,
    )
    Observacion.objects.create(
        organizacion=otra,
        proyecto=obra,
        titulo="Zapata ajena",
        autor=ajeno,
        responsable=ajeno,
    )
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    por_piso = client.get(reverse(RUTA), {"q": "piso"})
    por_zapata = client.get(reverse(RUTA), {"q": "zapata"})

    assert por_piso.context["entregables_total"] == 1  # el de mi obra, no el ajeno
    assert "999-XX" not in por_piso.content.decode()
    assert por_zapata.context["observaciones_total"] == 1
    assert "Zapata ajena" not in por_zapata.content.decode()


@pytest.mark.django_db
def test_una_consulta_demasiado_corta_lo_dice_y_no_busca(client, revisor, uno):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    respuesta = client.get(reverse(RUTA), {"q": "a"})

    assert respuesta.status_code == 200
    assert respuesta.context["demasiado_corta"] is True
    assert "entregables" not in respuesta.context


@pytest.mark.django_db
def test_la_pantalla_sale_en_espanol(client, revisor, uno):
    """Los textos reutilizan algunos ya traducidos («Deliverables», «Observations»): se mira que
    digan lo que tienen que decir y no el sentido de otro sitio del catálogo."""
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA), {"q": "piso"}).content.decode()

    for texto in ("Qué buscar", "Entregables", "Observaciones", "Buscar"):
        assert texto in html, texto


@pytest.mark.django_db
def test_lo_que_se_escribe_no_se_ejecuta(client, revisor, uno):
    """El término vuelve a la caja y a la pantalla: tiene que salir escapado."""
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA), {"q": "<script>alert(1)</script>"}).content.decode()

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


@pytest.mark.django_db
def test_la_pantalla_corta_cada_grupo_y_dice_cuantos_hay(
    client, revisor, organizacion, proyecto, disciplina, proyectista, uno, monkeypatch
):
    monkeypatch.setattr("apps.documents.busqueda_views.FILAS_POR_GRUPO", 2)
    for i in range(4):
        Entregable.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            disciplina=disciplina,
            codigo=f"716-LCD-AR-X-{i:03d}",
            titulo="Planta piso 5 repetida",
            responsable=proyectista,
            peso=1,
        )
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    respuesta = client.get(reverse(RUTA), {"q": "piso"})

    assert len(respuesta.context["entregables"]) == 2
    assert respuesta.context["entregables_total"] == 5
