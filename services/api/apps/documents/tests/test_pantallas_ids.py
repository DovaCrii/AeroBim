"""Las pantallas de la validacion IDS: `F3.5`.

De `AGENTS.md`: **cada vista nueva trae su prueba de 403** y su prueba de aislamiento entre
organizaciones. Y ademas lo que esta pantalla añade de suyo:

- que **el requisito se compruebe antes de guardarlo** —uno que no se abre no rechaza ni aprueba
  nada, solo da error en cada validacion—;
- que un fallo se pueda convertir en **una observacion anclada al elemento por su GUID**, que es lo
  que convierte "702 vigas sin su fase" en una tarea con responsable;
- y que el veredicto del expediente distinga **cumple**, **falla** y **no se comprobo**.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents import storage
from apps.documents.models import Idoneidad, Observacion, RequisitoIds, Revision, ValidacionIds
from apps.documents.tests.test_validacion_ids import (
    IFC,
    ids_con,
    spec_muros_con_pset_inventado,
    spec_vigas_con_nombre,
)
from apps.projects.models import Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def requisito(db, organizacion, proyecto, proyectista, tmp_path):
    """Un requisito ya guardado, por el mismo camino que la pantalla."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        contenido = ids_con([spec_vigas_con_nombre(), spec_muros_con_pset_inventado()]).encode()
        _extension, sha = storage.validar("requisito.ids", contenido)
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo, entregable_codigo="ids", sha256=sha, extension="ids"
        )
        storage.guardar(clave, contenido)
        yield RequisitoIds.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            titulo="Requisito de prueba",
            clave_archivo=clave,
            nombre_original="requisito.ids",
            sha256=sha,
            subido_por=proyectista,
        )


@pytest.fixture
def revision_ifc(db, entregable, proyectista, tmp_path):
    with override_settings(DOCUMENTS_DIR=tmp_path):
        contenido = IFC.encode()
        _extension, sha = storage.validar("modelo.ifc", contenido)
        clave = storage.clave_para(
            proyecto_codigo=entregable.proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=sha,
            extension="ifc",
        )
        storage.guardar(clave, contenido)
        yield Revision.objects.create(
            entregable=entregable,
            correlativo="A1",
            idoneidad=Idoneidad.A,
            subida_por=proyectista,
            clave_archivo=clave,
            nombre_original="Estructura.ifc",
            tamano_bytes=len(contenido),
            sha256=sha,
        )


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_anonimo_va_al_login(client):
    for ruta in ("documents:requisitos-ids", "documents:nuevo-requisito-ids"):
        respuesta = client.get(reverse(ruta))
        assert respuesta.status_code == 302
        assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
def test_la_lista_pide_su_permiso(client, proyectista):
    ruta = reverse("documents:requisitos-ids")
    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_requisitoids"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_subir_un_requisito_pide_el_permiso_de_alta(client, proyectista):
    """**Leer no es escribir el requisito**: el requisito es un acuerdo con el mandante."""
    ruta = reverse("documents:nuevo-requisito-ids")
    client.force_login(dar(proyectista, "documents.view_requisitoids"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.add_requisitoids"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_validar_pide_su_permiso(client, proyectista, revision_ifc, requisito, tmp_path):
    ruta = reverse("documents:validar-ids", args=[revision_ifc.pk])
    client.force_login(dar(proyectista, "documents.view_requisitoids"))
    assert client.post(ruta).status_code == 403
    assert ValidacionIds.objects.count() == 0


@pytest.mark.django_db
def test_no_se_sube_un_requisito_al_proyecto_de_otra_organizacion(client, proyectista, tmp_path):
    """**El desplegable de proyectos se acota.** Subir el requisito de otro cliente seria escribir
    en su proyecto: el mandante de esa obra vería aparecer una exigencia que nadie acordó con él."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    client.force_login(dar(proyectista, "documents.add_requisitoids"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        elegibles = (
            client.get(reverse("documents:nuevo-requisito-ids"))
            .context["form"]
            .fields["proyecto"]
            .queryset
        )
        assert proyecto_ajeno not in elegibles

        respuesta = client.post(
            reverse("documents:nuevo-requisito-ids"),
            {
                "proyecto": str(proyecto_ajeno.pk),
                "titulo": "",
                "archivo": SimpleUploadedFile(
                    "requisito.ids", ids_con([spec_vigas_con_nombre()]).encode()
                ),
            },
        )
        assert respuesta.status_code == 400
        assert RequisitoIds.objects.count() == 0


# --- Lo que la pantalla añade --------------------------------------------------------


@pytest.mark.django_db
def test_un_ids_que_no_se_puede_leer_se_rechaza_al_subirlo(client, proyectista, proyecto, tmp_path):
    """**Se comprueba antes de guardarlo.** Un requisito que no se abre no rechaza nada ni aprueba
    nada: se queda en el proyecto dando error en cada validacion, y eso se lee como que el sistema
    esta roto."""
    client.force_login(dar(proyectista, "documents.add_requisitoids"))

    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.post(
            reverse("documents:nuevo-requisito-ids"),
            {
                "proyecto": str(proyecto.pk),
                "titulo": "",
                "archivo": SimpleUploadedFile("roto.ids", b"esto no es un IDS\n"),
            },
        )

    assert respuesta.status_code == 400
    assert respuesta.context["form"].errors["archivo"]
    assert RequisitoIds.objects.count() == 0
    # Y nada llegó al disco.
    assert list(tmp_path.rglob("*.ids")) == []


@pytest.mark.django_db
def test_el_titulo_sale_del_ids_si_nadie_escribe_uno(client, proyectista, proyecto, tmp_path):
    """Un IDS lleva su propio `<title>`; pedirlo aparte deja dos nombres para la misma cosa."""
    client.force_login(
        dar(proyectista, "documents.add_requisitoids", "documents.view_requisitoids")
    )

    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.post(
            reverse("documents:nuevo-requisito-ids"),
            {
                "proyecto": str(proyecto.pk),
                "titulo": "",
                "archivo": SimpleUploadedFile(
                    "requisito.ids", ids_con([spec_vigas_con_nombre()]).encode()
                ),
            },
        )

    guardado = RequisitoIds.objects.get()
    # Es el título que `ids_con` le pone al documento.
    assert guardado.titulo == "Requisito de prueba"


@pytest.mark.django_db
def test_solo_un_ifc_se_valida(client, proyectista, entregable, requisito, tmp_path):
    """Un PDF no se valida contra un IDS, y decirlo es mejor que devolver un error de
    `ifcopenshell` sobre un archivo que está perfecto."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        contenido = b"%PDF-1.7\n%%EOF\n"
        _e, sha = storage.validar("plano.pdf", contenido)
        clave = storage.clave_para(
            proyecto_codigo=entregable.proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=sha,
            extension="pdf",
        )
        storage.guardar(clave, contenido)
        pdf = Revision.objects.create(
            entregable=entregable,
            correlativo="A1",
            idoneidad=Idoneidad.A,
            subida_por=proyectista,
            clave_archivo=clave,
            nombre_original="plano.pdf",
            sha256=sha,
        )

        client.force_login(
            dar(proyectista, "documents.add_validacionids", "documents.view_entregable")
        )
        respuesta = client.post(reverse("documents:validar-ids", args=[pdf.pk]))

    assert respuesta.status_code == 302
    assert ValidacionIds.objects.count() == 0


@pytest.mark.django_db
def test_sin_requisito_no_se_valida_y_se_dice(client, proyectista, revision_ifc, tmp_path):
    """El proyecto no tiene requisito: no hay nada contra lo que validar, y callarlo dejaría un
    botón que no hace nada."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.force_login(
            dar(proyectista, "documents.add_validacionids", "documents.view_entregable")
        )
        respuesta = client.post(
            reverse("documents:validar-ids", args=[revision_ifc.pk]), follow=True
        )

    assert ValidacionIds.objects.count() == 0
    avisos = [str(m) for m in respuesta.context["messages"]]
    assert any(avisos)


@pytest.mark.django_db
def test_el_ciclo_completo_de_una_validacion(
    client, proyectista, revisor, revision_ifc, requisito, tmp_path
):
    """**El oráculo de `F3.5`**: se valida, no cumple, se dice qué falla y **se abre una observación
    sobre el elemento que falla, por su GUID**."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.force_login(
            dar(
                proyectista,
                "documents.add_validacionids",
                "documents.view_validacionids",
                "documents.view_entregable",
                "documents.view_revision",
                "documents.add_revision",
            )
        )
        respuesta = client.post(reverse("documents:validar-ids", args=[revision_ifc.pk]))
        assert respuesta.status_code == 302

        validacion = ValidacionIds.objects.get()
        # El IFC tiene una viga sin nombre y un muro sin el pset: no cumple, y se comprobó.
        assert validacion.cumple is False
        assert validacion.se_comprobo is True
        assert validacion.resumen["fallaron"] == 2

        # El expediente lo muestra, con el nombre del requisito.
        cuerpo = client.get(
            reverse("documents:expediente", args=[revision_ifc.entregable_id])
        ).content.decode()
        assert "Requisito de prueba" in cuerpo

        # **Y el fallo se convierte en una observación anclada al elemento.**
        guid = validacion.resumen["detalle"][0]["requisitos"][0]["fallos"][0]["guid"]
        client.force_login(dar(revisor, "documents.add_observacion"))
        formulario = client.get(
            reverse("documents:nueva-observacion", args=[revision_ifc.entregable_id]),
            {"guid": guid, "titulo": "Name"},
        )
        assert formulario.context["form"].initial["ifc_guid"] == guid

        creada = client.post(
            reverse("documents:nueva-observacion", args=[revision_ifc.entregable_id]),
            {
                "titulo": "La viga no trae nombre",
                "descripcion": "",
                "prioridad": Observacion.ALTA,
                "responsable": proyectista.pk,
                "vence": "",
                "ifc_guid": guid,
            },
        )
        assert creada.status_code == 302

        observacion = Observacion.objects.get(titulo="La viga no trae nombre")
        assert observacion.ifc_guid == guid
        # **El ancla es el modelo**, no el documento: es lo que después exporta a BCF.
        assert observacion.ancla == "modelo"


@pytest.mark.django_db
def test_un_guid_con_mala_forma_se_ignora(client, revisor, entregable):
    """Un GUID de IFC son 22 caracteres. Guardar cualquier cosa dejaría un ancla que no apunta a
    nada, y el formulario se abre igual —sin ancla— porque quien llega aquí no escribió ese
    parámetro."""
    client.force_login(dar(revisor, "documents.add_observacion"))
    respuesta = client.get(
        reverse("documents:nueva-observacion", args=[entregable.pk]),
        {"guid": "corto"},
    )

    assert respuesta.status_code == 200
    assert "ifc_guid" not in respuesta.context["form"].initial
