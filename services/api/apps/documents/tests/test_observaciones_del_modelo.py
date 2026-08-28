"""Las observaciones ancladas al modelo, para el panel de coordinacion del visor: `F4.1`.

**Cierra la mitad que faltaba del ciclo.** La observacion se creaba desde el visor —desde la ficha
de un elemento, con su GUID y su camara— y para verla habia que salir a otra pantalla: quien
coordinaba tenia el hallazgo en un sitio y el modelo en otro.

Lo que se prueba, mas alla del contrato de permisos: que **solo salgan las que llevan a algun
sitio** —con GUID y abiertas— y que la camara viaje **sin convertir**, porque la vuelta al sistema
de la escena la hace el visor con la inversa exacta.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Observacion
from apps.projects.models import Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"

CAMARA = {
    "tipo": "perspectiva",
    "punto": [10.0, -10.0, 10.0],
    "direccion": [-0.57735, 0.57735, -0.57735],
    "arriba": [-0.408248, 0.408248, 0.816497],
    "campoVisual": 60.0,
}


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def ruta_de(proyecto):
    return reverse("documents_api:proyecto-observaciones-modelo", args=[proyecto.pk])


@pytest.fixture
def anclada(db, organizacion, proyecto, revisor, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga del eje C no trae su fase",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
        punto_de_vista=CAMARA,
    )


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_pide_view_observacion(client, proyectista, proyecto, anclada):
    ruta = ruta_de(proyecto)

    client.force_login(dar(proyectista, "documents.view_revision"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_no_se_leen_las_observaciones_de_otra_organizacion(client, proyectista, revisor):
    """El panel del visor es lo primero que se abre al coordinar: si aca se cuela una obra ajena,
    se cuelan sus hallazgos."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )
    Observacion.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        titulo="Hallazgo de otro cliente",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))

    assert client.get(ruta_de(proyecto_ajeno)).status_code == 404


# --- Que solo salga lo que lleva a algun sitio ---------------------------------------


@pytest.mark.django_db
def test_la_observacion_anclada_trae_su_guid_y_su_camara(client, proyectista, proyecto, anclada):
    """**La camara viaja tal como se guardo: en el sistema del IFC.** Convertirla aca pondria la
    misma regla en dos sitios, y la vuelta la hace `ifcAEscena` en el visor —la inversa exacta, con
    su prueba— de la que la escribio en el BCF."""
    client.force_login(dar(proyectista, "documents.view_observacion"))

    datos = client.get(ruta_de(proyecto)).json()

    [una] = datos["observaciones"]
    assert una["guid"] == GUID
    assert una["camara"] == CAMARA
    assert una["url"] == anclada.get_absolute_url()
    assert una["prioridad"] == "alta"


@pytest.mark.django_db
def test_una_observacion_sobre_un_documento_no_entra(
    client, proyectista, proyecto, organizacion, revisor
):
    """**No tiene elemento que seleccionar.** Mandarla aca pondria en la lista del visor una fila
    que no lleva a ninguna parte; se ve en su pantalla, que es donde se resuelve."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Falta la cota del vano",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
        pagina=2,
        ancla_x=0.4,
        ancla_y=0.3,
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = client.get(ruta_de(proyecto)).json()

    assert datos["observaciones"] == []


@pytest.mark.django_db
def test_una_cerrada_no_entra(client, proyectista, proyecto, anclada, revisor):
    """El panel contesta «que hay que resolver». Una cerrada solo seria ruido encima del modelo."""
    anclada.cerrar(revisor, "Corregido en la A2.")

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = client.get(ruta_de(proyecto)).json()

    assert datos["observaciones"] == []


@pytest.mark.django_db
def test_una_sin_camara_sale_igual_y_lo_dice(client, proyectista, proyecto, organizacion, revisor):
    """**Sin camara la observacion sigue valiendo**: el visor encuadra el elemento, que es lo que
    se puede afirmar sin inventar desde donde lo miraba quien lo encontro. Es el caso de las que
    nacen de una validacion IDS."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Sin punto de vista",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.BAJA,
        ifc_guid=GUID,
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = client.get(ruta_de(proyecto)).json()

    [una] = datos["observaciones"]
    assert una["camara"] is None
    assert una["guid"] == GUID


@pytest.mark.django_db
def test_las_altas_van_primero(client, proyectista, proyecto, organizacion, revisor, anclada):
    """Es como se reparte el trabajo de coordinacion: por prioridad, no por fecha de creacion."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Esta es baja",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.BAJA,
        ifc_guid=GUID,
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = client.get(ruta_de(proyecto)).json()

    assert [o["prioridad"] for o in datos["observaciones"]] == ["alta", "baja"]


@pytest.mark.django_db
def test_dice_si_este_usuario_puede_abrir_observaciones(client, proyectista, proyecto, anclada):
    """El visor decide con esto si ofrece «Observar este elemento», igual que con los metadatos de
    la revision. Lo contesta el servidor porque es el unico que puede."""
    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.get(ruta_de(proyecto)).json()["puedeObservar"] is False

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.get(ruta_de(proyecto)).json()["puedeObservar"] is True
