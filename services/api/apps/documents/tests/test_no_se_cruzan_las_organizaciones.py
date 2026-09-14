"""**La pregunta más crítica del producto: ¿puede una organización ver lo de otra?**

Un registro documental guarda expedientes de obra de varias empresas en la misma base. Que uno no
alcance lo del otro no es una funcionalidad: es la premisa. Y el control de acceso de AeroBim lo
contesta con **dos preguntas separadas** —el permiso dice *qué se puede hacer*, el acotado por
organización dice *sobre qué*— asi que hay dos formas de fallar y solo una da error.

## Por qué esta prueba existe

`scope_queryset_to_organizacion` **devuelve el queryset intacto si el modelo no tiene el campo
`organizacion`**. Es deliberado —un catálogo de tipos de documento no pertenece a nadie— y significa
que pasarle el modelo equivocado es una fuga **que no falla**.

Auditando qué modelos llevan el campo salieron dos que no: `Revision` y `Comentario`, los dos
porque cuelgan de otro que sí lo lleva. Sus vistas lo saben y acotan a mano… y ahí está lo que esta
prueba mide, porque las dos lo hacían con la misma forma:

```python
if not Entregable.objects.filter(pk=revision.entregable_id).exists():
    raise Http404
```

`Entregable.objects` y `Observacion.objects` son **managers normales de Django**: `BaseModel` no
declara ninguno propio. O sea que ese `.exists()` contesta «existe», no «esta persona puede verlo».

**Lo que sigue es la medida, no la lectura.** Se monta una segunda organización de verdad, con su
obra, su entregable y su revisión, y se intenta alcanzarla desde una cuenta de la primera **con el
permiso puesto**, que es el caso que importa: sin permiso no llegaría ni a la vista.
"""

import hashlib

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents import storage
from apps.documents.models import (
    Comentario,
    Entregable,
    Idoneidad,
    Observacion,
    Revision,
)
from apps.projects.models import Disciplina, Proyecto

PDF = b"%PDF-1.4\n% el plano de la otra empresa\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def dar(usuario, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=usuario.pk)


@pytest.fixture
def la_otra_empresa(db, tmp_path):
    """Una organización entera **ajena**: obra, entregable, revisión, observación y comentario.

    Nada de esto comparte nada con la organización de `conftest.py`. Es lo que una cuenta de la
    primera no puede alcanzar por ningún camino.
    """
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")
    suyo = get_user_model().objects.create_user(
        username="de-la-competencia", password="una-clave-larga-99", email="otro@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=suyo)

    obra = Proyecto.objects.create(organizacion=ajena, codigo="999-AJENA", nombre="Obra ajena")
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    entregable = Entregable.objects.create(
        organizacion=ajena,
        proyecto=obra,
        disciplina=disciplina,
        codigo="999-AJENA-ES-P-001",
        titulo="Planta de la competencia",
        responsable=suyo,
        peso=3,
    )

    with override_settings(DOCUMENTS_DIR=tmp_path):
        clave = storage.clave_para(
            proyecto_codigo=obra.codigo,
            entregable_codigo=entregable.codigo,
            sha256=hashlib.sha256(PDF).hexdigest(),
            extension="pdf",
        )
        storage.guardar(clave, PDF)
        clave_imagen = storage.clave_para(
            proyecto_codigo=obra.codigo,
            entregable_codigo=entregable.codigo,
            sha256=hashlib.sha256(PNG).hexdigest(),
            extension="png",
        )
        storage.guardar(clave_imagen, PNG)

        revision = Revision.objects.create(
            entregable=entregable,
            correlativo="A1",
            idoneidad=Idoneidad.A,
            subida_por=suyo,
            clave_archivo=clave,
            nombre_original="planta-de-la-competencia.pdf",
            sha256=hashlib.sha256(PDF).hexdigest(),
            es_vigente=True,
        )
        observacion = Observacion.objects.create(
            organizacion=ajena,
            proyecto=obra,
            revision=revision,
            titulo="Un hallazgo de la competencia",
            autor=suyo,
            responsable=suyo,
        )
        comentario = Comentario.objects.create(
            observacion=observacion, autor=suyo, texto="algo privado", imagen=clave_imagen
        )
        yield {
            "organizacion": ajena,
            "proyecto": obra,
            "entregable": entregable,
            "revision": revision,
            "observacion": observacion,
            "comentario": comentario,
        }


# --- Lo que ya estaba bien, y conviene que siga -------------------------------------


@pytest.mark.django_db
def test_no_se_ve_la_obra_de_otra_organizacion(client, proyectista, la_otra_empresa):
    client.force_login(dar(proyectista, "projects.view_proyecto"))

    respuesta = client.get(reverse("projects:proyecto", args=[la_otra_empresa["proyecto"].pk]))

    assert respuesta.status_code == 404


@pytest.mark.django_db
def test_no_se_ve_el_expediente_de_otra_organizacion(client, proyectista, la_otra_empresa):
    client.force_login(dar(proyectista, "documents.view_entregable"))

    respuesta = client.get(reverse("documents:expediente", args=[la_otra_empresa["entregable"].pk]))

    assert respuesta.status_code == 404


@pytest.mark.django_db
def test_no_se_ve_el_hallazgo_de_otra_organizacion(client, proyectista, la_otra_empresa):
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(
        reverse("documents:observacion", args=[la_otra_empresa["observacion"].pk])
    )

    assert respuesta.status_code == 404


# --- Los dos que acotan a mano, que son los que hay que medir ------------------------


@pytest.mark.django_db
def test_no_se_descarga_la_revision_de_otra_organizacion(
    client, proyectista, la_otra_empresa, tmp_path
):
    """**`Revision` no lleva el campo `organizacion`**: cuelga de su entregable.

    **Esta prueba salió en rojo la primera vez que corrió: `200`, con el PDF dentro.** La vista
    acotaba comprobando que el entregable existiera, y eso siempre es cierto para un entregable que
    se acaba de leer por su clave ajena. Cualquiera con `view_revision` se descargaba el plano de
    otra empresa **sabiendo su UUID** — y el UUID viaja en los enlaces de los correos, o sea que no
    hacía falta ni adivinarlo.

    El arreglo fue usar `revisiones_visibles`, que ya existía en el mismo archivo con la regla
    correcta escrita. Este `404` es la medida de que el hueco está cerrado.
    """
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(
            reverse("documents:descargar-revision", args=[la_otra_empresa["revision"].pk])
        )

    assert respuesta.status_code == 404, (
        "se descargó el archivo de otra organización: `Entregable.objects` no acota por sí solo"
    )


@pytest.mark.django_db
def test_no_se_ve_la_imagen_del_comentario_de_otra_organizacion(
    client, proyectista, la_otra_empresa, tmp_path
):
    """**`Comentario` tampoco lleva el campo**: cuelga de su observación.

    Mismo patrón, mismo resultado la primera vez —**`200`, la foto de obra de un hallazgo ajeno**— y
    aquí el comentario del código afirmaba explícitamente que `Observacion.objects` acotaba por
    organización. No lo hacía: quien acota es la vista, no el modelo.
    """
    client.force_login(dar(proyectista, "documents.view_observacion"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(
            reverse("documents:imagen-de-comentario", args=[la_otra_empresa["comentario"].pk])
        )

    assert respuesta.status_code == 404, (
        "se vio la imagen de otra organización: `Observacion.objects` no acota por sí solo"
    )


# --- Y las que **escriben**, que es lo mismo pero peor ------------------------------
#
# Las cinco tienen la forma `get_object_or_404(Observacion, pk=…)` bajo un mixin que solo comprueba
# el permiso. Un 200 aquí no es ver lo ajeno: es **escribir** en el expediente de otra empresa, y
# queda firmado con el nombre de quien escribe.


@pytest.mark.django_db
def test_no_se_comenta_el_hallazgo_de_otra_organizacion(client, proyectista, la_otra_empresa):
    """**Medido en rojo: escribía.** Un comentario en el hilo de un hallazgo de otra empresa, que
    aparecería en su pantalla con nombre y hora — y de paso pasaba el hallazgo a «respondida».
    """
    client.force_login(dar(proyectista, "documents.add_comentario"))
    observacion = la_otra_empresa["observacion"]
    antes = observacion.comentarios.count()

    respuesta = client.post(
        reverse("documents:comentar-observacion", args=[observacion.pk]),
        {"texto": "me metí en la obra de otra empresa"},
    )

    observacion.refresh_from_db()
    assert observacion.comentarios.count() == antes, "se escribió en el hilo de otra organización"
    assert observacion.estado == "abierta"
    assert respuesta.status_code == 404


@pytest.mark.django_db
def test_no_se_reparte_el_hallazgo_de_otra_organizacion(client, proyectista, la_otra_empresa):
    """Repartir un hallazgo ajeno **le manda un correo** a alguien de otra empresa.

    Medido, esta **no** escribía: el formulario no acepta un responsable de fuera de la obra. O sea
    que estaba a salvo por un control que existe para otra cosa. Se acota igual.
    """
    client.force_login(dar(proyectista, "documents.change_observacion"))

    respuesta = client.post(
        reverse("documents:repartir-observacion", args=[la_otra_empresa["observacion"].pk]),
        {"responsable": proyectista.pk},
    )

    la_otra_empresa["observacion"].refresh_from_db()
    assert respuesta.status_code == 404
    assert la_otra_empresa["observacion"].responsable_id != proyectista.pk


@pytest.mark.django_db
def test_no_se_cierra_el_hallazgo_de_otra_organizacion(client, proyectista, la_otra_empresa):
    """**El peor de los cinco**: cerrar un hallazgo ajeno lo saca de su lista de pendientes."""
    client.force_login(dar(proyectista, "documents.change_observacion"))

    respuesta = client.post(
        reverse("documents:cerrar-observacion", args=[la_otra_empresa["observacion"].pk]),
        {"resolucion": "cerrada por alguien de fuera"},
    )

    la_otra_empresa["observacion"].refresh_from_db()
    assert respuesta.status_code == 404
    assert la_otra_empresa["observacion"].estado == "abierta"


@pytest.mark.django_db
def test_no_se_etiqueta_el_hallazgo_de_otra_organizacion(client, proyectista, la_otra_empresa):
    client.force_login(dar(proyectista, "documents.change_observacion"))

    respuesta = client.post(
        reverse("documents:etiquetar-observacion", args=[la_otra_empresa["observacion"].pk]),
        {"etiquetas": []},
    )

    assert respuesta.status_code == 404


@pytest.mark.django_db
def test_no_se_cambia_la_idoneidad_de_una_revision_ajena(client, revisor, la_otra_empresa):
    """**Cambiar la idoneidad es aprobar o rechazar un documento de obra de otra empresa.**

    Es la firma del registro ISO 19650: la idoneidad dice si ese plano se puede usar para construir.
    """
    client.force_login(dar(revisor, "documents.change_revision"))

    respuesta = client.post(
        reverse("documents:cambiar-idoneidad", args=[la_otra_empresa["revision"].pk]),
        {"idoneidad": Idoneidad.B},
    )

    la_otra_empresa["revision"].refresh_from_db()
    assert la_otra_empresa["revision"].idoneidad == Idoneidad.A, (
        "se aprobó un documento de obra de otra empresa"
    )
    assert respuesta.status_code == 404


# --- Y la API, que es por donde entra el visor --------------------------------------


@pytest.mark.django_db
def test_la_api_no_entrega_la_revision_de_otra_organizacion(
    client, proyectista, la_otra_empresa, tmp_path
):
    """El visor pide los bytes por aquí, y es el camino que sirve el IFC entero."""
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))
    ajena = la_otra_empresa["revision"].pk

    with override_settings(DOCUMENTS_DIR=tmp_path):
        ficha = client.get(f"/api/revisiones/{ajena}/")
        bytes_ = client.get(f"/api/revisiones/{ajena}/contenido/")

    assert ficha.status_code == 404
    assert bytes_.status_code == 404


@pytest.mark.django_db
def test_sin_membresia_no_se_ve_nada_aunque_haya_permiso(client, la_otra_empresa, organizacion):
    """**El caso que más se da en el piloto**, y el que no avisa: la cuenta creada y sin asignar.

    `docs/PILOTO.md` lo tiene como trampa número uno — el login funciona y todas las listas salen
    vacías sin un solo mensaje. Aquí se fija que ese silencio sea **hacia el lado seguro**.
    """
    suelto = get_user_model().objects.create_user(
        username="sin-membresia", password="una-clave-larga-99", email="suelto@ejemplo.cl"
    )
    client.force_login(dar(suelto, "projects.view_proyecto", "documents.view_observacion"))

    assert client.get(reverse("projects:proyectos")).context["proyectos"].count() == 0
    assert (
        client.get(reverse("projects:proyecto", args=[la_otra_empresa["proyecto"].pk])).status_code
        == 404
    )
