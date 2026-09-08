"""Las pantallas de `F3.10`: que trae el modelo, y el IDS de partida que sale de ahi.

Ademas del contrato de siempre —403 por vista y aislamiento entre organizaciones— se prueba lo que
hace util la pantalla: que **no ofrezca generar un IDS vacio**, porque un archivo sin
especificaciones es invalido y ninguna herramienta lo acepta.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents import storage
from apps.documents.models import Entregable, Idoneidad, RequisitoIds, Revision
from apps.documents.tests.test_ids_de_partida import modelo
from apps.projects.models import Disciplina, Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def subir(entregable, usuario, texto: str, nombre="Estructura.ifc") -> Revision:
    """Una revision con un IFC de verdad en el disco: la pantalla lo lee, no lo simula."""
    contenido = texto.encode("utf-8")
    extension, sha = storage.validar(nombre, contenido)
    clave = storage.clave_para(
        proyecto_codigo=entregable.proyecto.codigo,
        entregable_codigo=entregable.codigo,
        sha256=sha,
        extension=extension,
    )
    storage.guardar(clave, contenido)
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=usuario,
        clave_archivo=clave,
        nombre_original=nombre,
        sha256=sha,
        es_vigente=True,
    )


@pytest.fixture
def con_brecha(db, entregable, proyectista, settings, tmp_path):
    """Un modelo con cuatro de cinco vigas con su pset: la franja que merece exigirse."""
    settings.DOCUMENTS_ROOT = tmp_path
    return subir(entregable, proyectista, modelo(cuantas=5, con_pset=4))


@pytest.fixture
def sin_brecha(db, entregable, proyectista, settings, tmp_path):
    """Todas las vigas traen su pset: no hay nada que proponer."""
    settings.DOCUMENTS_ROOT = tmp_path
    return subir(entregable, proyectista, modelo(cuantas=5, con_pset=5))


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_la_pantalla_pide_ver_revisiones(client, proyectista, con_brecha):
    ruta = reverse("documents:cobertura", args=[con_brecha.pk])

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_revision"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_generar_pide_el_permiso_de_poner_el_requisito(client, proyectista, con_brecha):
    """**Es el mismo permiso que subirlo a mano**: es la misma accion —poner el requisito de
    informacion del proyecto— y quien puede una puede la otra."""
    ruta = reverse("documents:generar-ids", args=[con_brecha.pk])

    client.force_login(dar(proyectista, "documents.view_revision"))
    assert client.post(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.add_requisitoids"))
    assert client.post(ruta).status_code == 302


@pytest.mark.django_db
def test_no_se_mide_el_modelo_de_otra_organizacion(
    client, proyectista, revisor, settings, tmp_path
):
    """La revision se busca por `revisiones_visibles`, que acota. Sin eso se puede medir —y generar
    un requisito desde— el modelo de otro cliente."""
    settings.DOCUMENTS_ROOT = tmp_path
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Obra de otro")
    disciplina = Disciplina.objects.create(proyecto=proyecto, codigo="ES", nombre="Est")
    entregable = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="OTRO-ES-M-001",
        titulo="Modelo de otro",
        responsable=revisor,
        peso=1,
    )
    suya = subir(entregable, revisor, modelo(cuantas=5, con_pset=4))

    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_requisitoids"))

    assert client.get(reverse("documents:cobertura", args=[suya.pk])).status_code == 404
    assert client.post(reverse("documents:generar-ids", args=[suya.pk])).status_code == 404
    assert not RequisitoIds.objects.filter(proyecto=proyecto).exists()


# --- Que la pantalla sirva de algo ---------------------------------------------------


@pytest.mark.django_db
def test_la_pantalla_muestra_la_cobertura_y_marca_la_brecha(client, proyectista, con_brecha):
    """**El requisito lo decide alguien mirando datos**, asi que los numeros tienen que estar."""
    client.force_login(dar(proyectista, "documents.view_revision"))

    respuesta = client.get(reverse("documents:cobertura", args=[con_brecha.pk]))
    cuerpo = respuesta.content.decode()

    assert respuesta.context["candidatos"] == 1
    assert "Pset_BeamCommon" in cuerpo
    assert "IFCBEAM" in cuerpo


@pytest.mark.django_db
def test_sin_brecha_no_se_ofrece_generar_nada(client, proyectista, sin_brecha):
    """**Un IDS sin especificaciones es invalido.** Ofrecer el boton y fallar al pulsarlo es peor
    que no ofrecerlo: la pantalla dice por que no hay nada que proponer."""
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_requisitoids"))

    respuesta = client.get(reverse("documents:cobertura", args=[sin_brecha.pk]))

    assert respuesta.context["candidatos"] == 0
    assert reverse("documents:generar-ids", args=[sin_brecha.pk]) not in respuesta.content.decode()


@pytest.mark.django_db
def test_generar_sin_brecha_lo_dice_en_vez_de_guardar_un_archivo_invalido(
    client, proyectista, sin_brecha
):
    """El `POST` no pasa por el boton: se puede pedir a mano."""
    client.force_login(dar(proyectista, "documents.add_requisitoids"))

    respuesta = client.post(reverse("documents:generar-ids", args=[sin_brecha.pk]))

    assert respuesta.status_code == 302
    assert not RequisitoIds.objects.exists()


@pytest.mark.django_db
def test_el_ids_generado_queda_como_requisito_del_proyecto(client, proyectista, con_brecha):
    """De medir a exigir en un clic, que es el punto de todo esto."""
    client.force_login(dar(proyectista, "documents.add_requisitoids"))

    client.post(reverse("documents:generar-ids", args=[con_brecha.pk]))

    requisito = RequisitoIds.objects.get()
    assert requisito.proyecto_id == con_brecha.entregable.proyecto_id
    assert requisito.nombre_original.endswith(".ids")
    # El titulo sale del propio archivo, igual que al subirlo a mano.
    assert requisito.titulo != ""
    # Y el contenido esta en el disco, con su clave por contenido.
    assert storage.leer(requisito.clave_archivo).startswith(b"<?xml")


@pytest.mark.django_db
def test_un_pdf_no_se_puede_medir(client, proyectista, entregable, settings, tmp_path):
    """La cobertura de psets es de un modelo. Con un PDF se dice, en vez de intentar leerlo con
    `ifcopenshell` y mostrar el error de la libreria."""
    settings.DOCUMENTS_ROOT = tmp_path
    revision = Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/abc.pdf",
        nombre_original="Planta.pdf",
        sha256="c" * 64,
        es_vigente=True,
    )
    client.force_login(dar(proyectista, "documents.view_revision"))

    respuesta = client.get(reverse("documents:cobertura", args=[revision.pk]))

    assert respuesta.status_code == 302
