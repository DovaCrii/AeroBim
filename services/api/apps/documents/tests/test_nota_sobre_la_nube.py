"""Dejar una nota **sobre el levantamiento**, sin modelo: `F12.14`.

**Lo trajo el usuario el 2026-09-08**, y con el argumento que decide la tarea: «la nube de puntos
nos servirá o se podrá realizar el tema de coordinación, dejar notas y hacer todo el flujo, también
la nube de puntos, debido que el IFC o el avance siempre es un paso más adelante».

O sea: **en obra el levantamiento llega antes que el modelo.** Se vuela y se mide lo construido
semanas antes de que exista el IFC de esa etapa, y hasta que exista no hay ningún elemento del que
colgar una nota. Sin esto, la coordinación sobre la nube no empieza hasta que aparece el modelo.

Lo que se prueba aquí es que **una nota con punto vale lo mismo que una nota con GUID**: se guarda,
se ancla, conserva su cámara y su visibilidad, y el punto sale en el BCF aunque el formato no sepa
decirlo.
"""

import json

import pytest
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.models import Idoneidad, Observacion, Revision

#: Un punto real de la obra, en UTM 19S: lo que declara el COPC del CC 741.
PUNTO = [345678.9, 6298123.45, 412.3]

CAMARA = {
    "tipo": "perspectiva",
    "punto": [10.0, -10.0, 10.0],
    "direccion": [-0.57735, 0.57735, -0.57735],
    "arriba": [-0.408248, 0.408248, 0.816497],
    "campoVisual": 60.0,
}


@pytest.fixture
def revision_nube(db, entregable, proyectista):
    """La nube **es una revisión de un entregable** desde `F12.13`, no un archivo aparte."""
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/camino-agricola.copc.laz",
        nombre_original="camino-agricola.copc.laz",
        sha256="e" * 64,
        es_vigente=True,
    )


@pytest.fixture
def quien_anota(proyectista):
    from django.contrib.auth import get_user_model

    for etiqueta in ("documents.view_observacion", "documents.add_observacion"):
        app_label, codename = etiqueta.split(".")
        proyectista.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=proyectista.pk)


def ruta_de(revision):
    return reverse("documents_api:revision-observaciones", args=[revision.pk])


def nota(**extra):
    return {"titulo": "El talud del km 1,2 está desplomado", **extra}


@pytest.mark.django_db
def test_una_nota_con_punto_y_sin_guid_se_guarda(client, quien_anota, revision_nube):
    client.force_login(quien_anota)

    respuesta = client.post(
        ruta_de(revision_nube),
        nota(punto=json.dumps(PUNTO)),
        content_type="application/json",
    )

    assert respuesta.status_code == 201, respuesta.content
    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.ifc_guid == ""
    assert guardada.punto_de_la_nube == tuple(PUNTO)


@pytest.mark.django_db
def test_queda_anclada_a_la_nube_y_no_al_documento(client, quien_anota, revision_nube):
    """**Es la diferencia que hace que la nota sirva.** Sin punto quedaba «sobre la revisión», que
    es como decir «en algún sitio de este levantamiento de 130 MB»."""
    client.force_login(quien_anota)

    respuesta = client.post(
        ruta_de(revision_nube),
        nota(punto=json.dumps(PUNTO)),
        content_type="application/json",
    )

    assert Observacion.objects.get(pk=respuesta.json()["id"]).ancla == "nube"


@pytest.mark.django_db
def test_el_guid_gana_al_punto_cuando_hay_los_dos(client, quien_anota, revision_nube):
    """Una observación de desviación nace sobre un elemento **y** tiene un punto medido.

    Lo que la identifica es el elemento: es lo que la selecciona en Solibri y lo que sobrevive a la
    versión siguiente del modelo. El punto es dónde se midió.
    """
    client.force_login(quien_anota)

    respuesta = client.post(
        ruta_de(revision_nube),
        nota(guid="2x9ibDgrvAu8y4Yd$Ug4Qu", punto=json.dumps(PUNTO)),
        content_type="application/json",
    )

    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.ancla == "modelo"
    assert guardada.punto_de_la_nube == tuple(PUNTO)


@pytest.mark.django_db
def test_conserva_su_camara_sin_tener_guid(client, quien_anota, revision_nube):
    """**Era la guarda que dejaba la nota de la nube sin punto de vista.**

    La cámara, la visibilidad y las cotas se guardaban solo `if guid`, así que una nota sin elemento
    salía en el BCF sin viewpoint: se abría mirando a donde el lector quisiera. Ahora la condición
    es «tiene sitio en la escena», y un punto lo es igual que un GUID.
    """
    client.force_login(quien_anota)

    respuesta = client.post(
        ruta_de(revision_nube),
        nota(punto=json.dumps(PUNTO), camara=json.dumps(CAMARA)),
        content_type="application/json",
    )

    assert Observacion.objects.get(pk=respuesta.json()["id"]).punto_de_vista == CAMARA


@pytest.mark.django_db
def test_un_punto_absurdo_no_impide_guardar_el_hallazgo(client, quien_anota, revision_nube):
    """Mismo criterio que la cámara: lo que hay que conservar es el hallazgo.

    Quien escribió la nota no redactó ese parámetro y no tiene por qué ver un error sobre él.
    """
    client.force_login(quien_anota)

    respuesta = client.post(
        ruta_de(revision_nube),
        nota(punto='["arriba", "a la izquierda", 0]'),
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    guardada = Observacion.objects.get(pk=respuesta.json()["id"])
    assert guardada.punto_de_la_nube is None
    assert guardada.ancla == "documento"


@pytest.mark.django_db
def test_el_punto_sale_en_el_bcf_como_texto(db, quien_anota, revision_nube):
    """**Porque el BCF no sabe decir «este punto de esta nube».**

    Un `Viewpoint` dice una cámara, una foto y unos GUID seleccionados; para un punto de una nube no
    hay elemento al que apuntar. Si la coordenada se quedara solo en nuestras tres columnas, la
    observación llegaría a Solibri como «hay un desplome aquí» sin el aquí.
    """
    from apps.documents.bcf import exportar

    observacion = Observacion.objects.create(
        organizacion=revision_nube.entregable.organizacion,
        proyecto=revision_nube.entregable.proyecto,
        revision=revision_nube,
        titulo="El talud del km 1,2 está desplomado",
        descripcion="Se aparta 12 cm de la línea de proyecto.",
        autor=quien_anota,
        responsable=quien_anota,
        ancla_nube_x=PUNTO[0],
        ancla_nube_y=PUNTO[1],
        ancla_nube_z=PUNTO[2],
    )

    contenido = exportar([observacion], "CC 741")

    import zipfile
    from io import BytesIO

    with zipfile.ZipFile(BytesIO(contenido)) as bcf:
        markup = next(n for n in bcf.namelist() if n.endswith("markup.bcf"))
        texto = bcf.read(markup).decode("utf-8")

    # El texto de la persona sigue entero, y la coordenada se añade detrás.
    assert "Se aparta 12 cm de la línea de proyecto." in texto
    assert "E 345.678,90 · N 6.298.123,45 · Z 412,30" in texto
