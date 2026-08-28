"""Dejar una nota sobre un elemento **sin salir del visor**: `F4.9`.

**El formulario de pagina completa era el problema, no una molestia.** Con las palabras del usuario:
«al salir de lo que veo pierdo vision de lo que estoy haciendo». Se anota mirando el modelo, y si
hay que dejar de mirarlo para escribir, se anota peor o no se anota.

Lo que se prueba, mas alla del contrato de permisos: que **el responsable por defecto sea el autor**
—lo que permite dejar la nota ahora y repartirla despues—, que **un id de responsable no se crea sin
comprobar**, y que una camara mala no impida guardar el hallazgo.
"""

import json

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Idoneidad, Observacion, Revision
from apps.projects.models import Disciplina, Proyecto

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


@pytest.fixture
def revision_ifc(db, entregable, proyectista):
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/abc.ifc",
        nombre_original="Estructura.ifc",
        sha256="d" * 64,
        es_vigente=True,
    )


def ruta_de(revision):
    return reverse("documents_api:revision-observaciones", args=[revision.pk])


def nota(**extra):
    return {"titulo": "La viga del eje C choca con el ducto", "guid": GUID, **extra}


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_dejar_una_nota_pide_add_observacion(client, proyectista, revision_ifc):
    """Leer y escribir son dos permisos. `ViewModelPermissions` mapea `POST` a `add_*`."""
    ruta = ruta_de(revision_ifc)

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.post(ruta, nota(), content_type="application/json").status_code == 403

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.post(ruta, nota(), content_type="application/json").status_code == 201


@pytest.mark.django_db
def test_no_se_anota_sobre_la_revision_de_otra_organizacion(client, proyectista, revisor):
    """La revision se busca por `revisiones_visibles`, que acota. Sin eso, se puede dejar una nota
    en la obra de otro cliente escribiendo su id."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Obra de otro")
    disciplina = Disciplina.objects.create(proyecto=proyecto, codigo="AR", nombre="Arq")
    from apps.documents.models import Entregable

    entregable = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="OTRO-AR-M-001",
        titulo="Modelo de otro",
        responsable=proyectista,
        peso=1,
    )
    suya = Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=revisor,
        clave_archivo="p/x/y.ifc",
        nombre_original="otro.ifc",
        sha256="e" * 64,
        es_vigente=True,
    )

    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.post(ruta_de(suya), nota(), content_type="application/json")

    assert respuesta.status_code == 404
    assert not Observacion.objects.filter(proyecto=proyecto).exists()


# --- El reparto: ahora la nota, despues el dueno -------------------------------------


@pytest.mark.django_db
def test_sin_responsable_la_nota_queda_a_nombre_de_quien_la_escribe(
    client, proyectista, revision_ifc
):
    """**Es lo que permite «dejar la nota y luego en otra etapa pasarlo».** `responsable` no acepta
    vacio —cada observacion tiene dueno, que es una regla del producto— asi que el dueno es el autor
    hasta que alguien la asigne. Y eso **es cierto**: es suya mientras nadie mas la tome."""
    usuario = dar(proyectista, "documents.add_observacion")
    client.force_login(usuario)

    respuesta = client.post(ruta_de(revision_ifc), nota(), content_type="application/json")

    assert respuesta.status_code == 201
    assert respuesta.json()["esMia"] is True
    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.responsable_id == usuario.pk
    assert guardada.autor_id == usuario.pk


@pytest.mark.django_db
def test_un_responsable_de_otra_organizacion_no_se_asigna(
    client, proyectista, revision_ifc, revisor
):
    """**El id que llegue se comprueba, no se cree.** Sin eso se puede asignar una observacion a un
    usuario de otro cliente escribiendo su id, y le llega un correo con el enlace a una obra que no
    es suya."""
    forastero = get_user_model().objects.create_user(
        username="forastero", password="clave-larga-99", email="fuera@ejemplo.cl"
    )
    otra = Organizacion.objects.create(nombre="Otra", slug="otra")
    Membresia.objects.create(organizacion=otra, usuario=forastero)

    usuario = dar(proyectista, "documents.add_observacion")
    client.force_login(usuario)

    respuesta = client.post(
        ruta_de(revision_ifc),
        nota(responsable=str(forastero.pk)),
        content_type="application/json",
    )

    # Se guarda, y **a nombre del autor**: se descarta el responsable imposible en vez de rechazar
    # el hallazgo entero, que es lo que de verdad hay que conservar.
    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).responsable_id == usuario.pk


@pytest.mark.django_db
def test_un_responsable_de_la_misma_organizacion_si_se_asigna(
    client, proyectista, revision_ifc, revisor
):
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc),
        nota(responsable=str(revisor.pk)),
        content_type="application/json",
    )

    assert respuesta.json()["esMia"] is False
    assert Observacion.objects.get(pk=respuesta.json()["id"]).responsable_id == revisor.pk


# --- El ancla y la camara ------------------------------------------------------------


@pytest.mark.django_db
def test_el_guid_y_la_camara_quedan_guardados(client, proyectista, revision_ifc):
    """Es lo que hace que la nota sirva fuera del visor: el GUID selecciona la viga en Solibri y la
    camara abre mirandola."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc),
        nota(camara=json.dumps(CAMARA)),
        content_type="application/json",
    )

    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.ifc_guid == GUID
    assert guardada.punto_de_vista == CAMARA
    assert guardada.revision_id == revision_ifc.pk


@pytest.mark.django_db
def test_una_camara_mala_no_impide_guardar_el_hallazgo(client, proyectista, revision_ifc):
    """**Lo que hay que conservar es el hallazgo.** Quien escribe la nota no compuso esa cadena: la
    manda el visor, y perder la nota por ella seria el peor de los dos errores."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc),
        nota(camara="{no es json"),
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).punto_de_vista == {}


@pytest.mark.django_db
def test_un_guid_con_mala_forma_se_rechaza(client, proyectista, revision_ifc):
    """Guardar cualquier cosa dejaria un ancla que no apunta a nada, y el BCF saldria
    seleccionando un elemento que no existe."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc),
        nota(guid="demasiado-corto"),
        content_type="application/json",
    )

    assert respuesta.status_code == 400
    assert not Observacion.objects.exists()


@pytest.mark.django_db
def test_sin_titulo_no_hay_nota(client, proyectista, revision_ifc):
    """Una nota sin titulo es una fila que nadie puede leer en la lista."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc), nota(titulo="   "), content_type="application/json"
    )

    assert respuesta.status_code == 400
    assert not Observacion.objects.exists()


@pytest.mark.django_db
def test_una_prioridad_que_no_existe_cae_en_media(client, proyectista, revision_ifc):
    """Quien escribe elige entre tres botones; un valor raro solo puede venir de una peticion a
    mano, y perder la nota por eso seria peor que ponerle la prioridad del medio."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        ruta_de(revision_ifc), nota(prioridad="urgentisima"), content_type="application/json"
    )

    assert Observacion.objects.get(pk=respuesta.json()["id"]).prioridad == Observacion.MEDIA


# --- El aviso ------------------------------------------------------------------------


@pytest.mark.django_db
def test_no_se_manda_un_correo_por_asignarse_algo_a_uno_mismo(
    client, proyectista, revision_ifc, mailoutbox
):
    """Un correo diciendote que te asignaste algo a ti mismo hace que la gente filtre el remitente,
    y entonces el aviso que importa tampoco se lee. Es la leccion que ya trae `mail.py`."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(ruta_de(revision_ifc), nota(), content_type="application/json")

    assert respuesta.json()["avisada"] is False
    assert mailoutbox == []


@pytest.mark.django_db
def test_al_asignarla_a_otro_si_se_avisa(client, proyectista, revision_ifc, revisor, mailoutbox):
    client.force_login(dar(proyectista, "documents.add_observacion"))

    client.post(
        ruta_de(revision_ifc),
        nota(responsable=str(revisor.pk)),
        content_type="application/json",
    )

    assert len(mailoutbox) == 1
    assert revisor.email in mailoutbox[0].to
