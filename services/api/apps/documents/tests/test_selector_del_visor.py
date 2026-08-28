"""El selector del visor: lo que puede abrir, **agrupado por obra**.

Devolvia doscientas revisiones de todas las organizaciones visibles en una sola lista plana. Con un
proyecto real de cientos de entregables eso es una lista inservible, y el tope de doscientas
cortaba **en silencio**: un modelo que no aparece se lee como que no esta subido, no como que no
cupo.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.api import RevisionesAbriblesAPI
from apps.documents.models import Entregable, Idoneidad, Revision
from apps.projects.models import Disciplina, Proyecto

RUTA = "documents_api:abribles"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def con_ifc(entregable, usuario, correlativo="A1"):
    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=Idoneidad.A,
        subida_por=usuario,
        clave_archivo=f"p/{entregable.codigo}/{correlativo}.ifc",
        nombre_original=f"{entregable.codigo}.ifc",
        sha256="f" * 64,
        es_vigente=True,
    )


@pytest.fixture
def lector(client, db, proyectista):
    usuario = dar(proyectista, "documents.view_revision", "documents.add_revision")
    client.force_login(usuario)
    return usuario


@pytest.mark.django_db
def test_las_revisiones_vienen_agrupadas_por_obra(client, lector, organizacion, entregable):
    """**Es lo que hace usable el selector**: en una oficina con seis obras abiertas, una lista
    plana obliga a leer el codigo del proyecto en cada fila para saber de cual es."""
    con_ifc(entregable, lector)

    segunda = Proyecto.objects.create(
        organizacion=organizacion, codigo="802-MEJ", nombre="Mejoramiento"
    )
    disciplina = Disciplina.objects.create(proyecto=segunda, codigo="ES", nombre="Estructura")
    otro = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=segunda,
        disciplina=disciplina,
        codigo="802-MEJ-ES-M-001",
        titulo="Modelo de estructura",
        responsable=lector,
        peso=1,
    )
    con_ifc(otro, lector)

    datos = client.get(reverse(RUTA)).json()

    assert [p["codigo"] for p in datos["proyectos"]] == ["716-LCD", "802-MEJ"]
    assert [len(p["revisiones"]) for p in datos["proyectos"]] == [1, 1]
    # Cada grupo trae el id de su obra: es lo que permite enlazar de vuelta a ella.
    assert all(p["id"] for p in datos["proyectos"])


@pytest.mark.django_db
def test_la_lista_plana_sigue_estando(client, lector, entregable):
    """**Cambiar el contrato y el visor en el mismo paso deja el visor roto entre los dos.** La
    lista plana se mantiene mientras el selector actual la consuma."""
    con_ifc(entregable, lector)

    datos = client.get(reverse(RUTA)).json()

    assert len(datos["revisiones"]) == 1


@pytest.mark.django_db
def test_el_recorte_se_dice_en_vez_de_pasar_en_silencio(client, lector, entregable, monkeypatch):
    """Un recorte callado hace que alguien concluya que su modelo no esta subido."""
    monkeypatch.setattr(RevisionesAbriblesAPI, "TOPE_POR_PROYECTO", 1)
    con_ifc(entregable, lector, correlativo="A1")

    # Un segundo entregable de la misma obra, tambien con IFC vigente.
    otro = Entregable.objects.create(
        organizacion=entregable.organizacion,
        proyecto=entregable.proyecto,
        disciplina=entregable.disciplina,
        codigo="716-LCD-ES-M-002",
        titulo="Segundo modelo",
        responsable=lector,
        peso=1,
    )
    con_ifc(otro, lector, correlativo="A1")

    datos = client.get(reverse(RUTA)).json()

    [grupo] = datos["proyectos"]
    assert len(grupo["revisiones"]) == 1
    assert datos["recortados"] == 1


@pytest.mark.django_db
def test_un_pdf_no_entra_en_el_selector_del_visor_de_modelos(client, lector, entregable):
    """Desde `F8.6` un PDF tambien se abre —en otra pantalla—. Con el predicado general entraban
    aca, y el visor 3D los habria cargado como geometria: pantalla en blanco."""
    Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=lector,
        clave_archivo="p/e/abc.pdf",
        nombre_original="Planta piso 5.pdf",
        sha256="c" * 64,
        es_vigente=True,
    )

    datos = client.get(reverse(RUTA)).json()

    assert datos["proyectos"] == []
    assert datos["revisiones"] == []


@pytest.mark.django_db
def test_no_se_ofrece_el_modelo_de_otra_organizacion(client, lector, entregable):
    """El selector es lo primero que ve el visor: si aca se cuela una obra ajena, se cuela su
    modelo entero, que es el archivo del cliente."""
    con_ifc(entregable, lector)

    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )
    disciplina = Disciplina.objects.create(proyecto=proyecto_ajeno, codigo="AR", nombre="Arq")
    suyo = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        disciplina=disciplina,
        codigo="999-XXX-AR-M-001",
        titulo="Modelo de otro cliente",
        responsable=lector,
        peso=1,
    )
    con_ifc(suyo, lector)

    datos = client.get(reverse(RUTA)).json()

    assert [p["codigo"] for p in datos["proyectos"]] == ["716-LCD"]


@pytest.mark.django_db
def test_el_selector_pide_su_permiso_de_lectura(client, proyectista, entregable):
    ruta = reverse(RUTA)

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_revision"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_una_revision_en_curso_no_se_ofrece_a_quien_solo_lee(client, proyectista, entregable):
    """`view_revision` no distingue una `S0` en curso de una `A1` autorizada, y lo que esta en
    curso no obliga a nadie."""
    Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S0,
        subida_por=proyectista,
        clave_archivo="p/e/wip.ifc",
        nombre_original="borrador.ifc",
        sha256="e" * 64,
        es_vigente=True,
    )
    # Solo lectura: sin `add_revision` ni `change_revision`.
    client.force_login(dar(proyectista, "documents.view_revision"))

    datos = client.get(reverse(RUTA)).json()

    assert datos["proyectos"] == []


@pytest.fixture
def _con_membresia(db, organizacion, proyectista):
    """El fixture de la raiz ya deja la membresia puesta; esto lo deja dicho."""
    assert Membresia.objects.filter(organizacion=organizacion, usuario=proyectista).exists()
