"""**La única puerta de AeroBim que contesta sin sesión**, medida por los dos lados.

Todo lo demás del producto pide cuenta, y eso hace que un descuido aquí no se parezca a ningún
otro: no hay permiso ni membresía detrás que amortigüe el error. Lo único que separa un modelo de
obra de internet es el testigo de la URL y las tres condiciones que lo acompañan —existe, no
caducó, no se revocó—.

Estas pruebas miden las dos mitades:

- que **con** un enlace vigente se pueda ver exactamente esa revisión y nada más;
- que **sin** él, o con uno caducado, revocado o inventado, no se pueda ver nada — y que las tres
  situaciones se contesten igual, porque distinguirlas le dice a quien prueba testigos que acertó.
"""

import hashlib
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.core.models import Membresia, Organizacion
from apps.documents import storage
from apps.documents.compartir import DIAS_MAXIMO, EnlaceCompartido
from apps.documents.models import Entregable, Idoneidad, Revision
from apps.projects.models import Disciplina, Proyecto

IFC = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"


def dar(usuario, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=usuario.pk)


@pytest.fixture
def modelo(db, organizacion, proyecto, disciplina, proyectista, tmp_path):
    """Un IFC de verdad en el almacén, que es lo que un enlace abre."""
    entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-ES-M-001",
        titulo="Modelo de estructura",
        responsable=proyectista,
        peso=5,
    )
    with override_settings(DOCUMENTS_DIR=tmp_path):
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=hashlib.sha256(IFC).hexdigest(),
            extension="ifc",
        )
        storage.guardar(clave, IFC)
        yield Revision.objects.create(
            entregable=entregable,
            correlativo="A1",
            idoneidad=Idoneidad.A,
            subida_por=proyectista,
            clave_archivo=clave,
            nombre_original="estructura.ifc",
            sha256=hashlib.sha256(IFC).hexdigest(),
            tamano_bytes=len(IFC),
            es_vigente=True,
        )


@pytest.fixture
def enlace(modelo, proyectista):
    return EnlaceCompartido.objects.create(
        revision=modelo,
        para="ITO de la obra",
        expira_en=timezone.now() + timedelta(days=30),
        creado_por=proyectista,
    )


# --- Lo que un enlace vigente sí abre --------------------------------------------------


@pytest.mark.django_db
def test_sin_cuenta_se_abre_la_pagina_y_la_ficha(client, enlace, tmp_path, settings):
    """El caso que justifica todo lo demás: alguien de fuera abre el enlace y ve el modelo."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        ficha = client.get(reverse("compartido-ficha", args=[enlace.testigo]))

    assert ficha.status_code == 200
    datos = ficha.json()
    assert datos["entregable"]["codigo"] == "716-LCD-ES-M-001"
    assert datos["correlativo"] == "A1"
    assert datos["nombre"] == "estructura.ifc"


@pytest.mark.django_db
def test_la_ficha_dice_la_idoneidad(client, enlace):
    """**El dato que evita el malentendido caro.**

    Un modelo en `S2` es trabajo para coordinar; uno en `A` está aprobado para construir. Quien
    mira desde fuera es justo quien puede confundirlos, porque no ha visto el resto del expediente.
    Enseñar el modelo sin decir para qué sirve reintroduce el problema que el registro documental
    existe para resolver.
    """
    datos = client.get(reverse("compartido-ficha", args=[enlace.testigo])).json()

    assert datos["idoneidad"] == Idoneidad.A
    assert datos["idoneidadTexto"]


@pytest.mark.django_db
def test_sin_cuenta_se_descargan_los_bytes_del_modelo(client, enlace, tmp_path):
    """Los bytes salen, **y eso no es un defecto**: el visor dibuja el IFC en la otra máquina.

    Se fija aquí para que quede medido y no se descubra en producción como si fuera una fuga: es
    la consecuencia inevitable de enseñar un modelo en un navegador, está escrita en
    `compartir.py`, y es lo que la pantalla de compartir advierte antes de crear un enlace.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuesta = client.get(reverse("compartido-contenido", args=[enlace.testigo]))

    assert respuesta.status_code == 200
    assert b"".join(respuesta.streaming_content) == IFC


@pytest.mark.django_db
def test_se_cuenta_cada_vez_que_alguien_lo_abre(client, enlace, tmp_path):
    """**La única señal de que un enlace se reenvió a media obra.**

    Uno mandado a una persona que aparece con ochenta aperturas no lo abrió una persona.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.get(reverse("compartido-contenido", args=[enlace.testigo]))
        client.get(reverse("compartido-contenido", args=[enlace.testigo]))

    enlace.refresh_from_db()
    assert enlace.visitas == 2
    assert enlace.ultima_visita is not None


@pytest.mark.django_db
def test_los_tramos_no_inflan_el_contador(client, enlace, tmp_path):
    """El COPC pide cientos de tramos por sesión: contarlos haría inútil el número de arriba."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.get(reverse("compartido-contenido", args=[enlace.testigo]), HTTP_RANGE="bytes=0-9")
        client.get(reverse("compartido-contenido", args=[enlace.testigo]), HTTP_RANGE="bytes=10-19")
        client.get(reverse("compartido-contenido", args=[enlace.testigo]), HTTP_RANGE="bytes=20-29")

    enlace.refresh_from_db()
    assert enlace.visitas == 1, "cada tramo cuenta como una visita y el número deja de decir nada"


# --- Lo que no abre, que es casi todo --------------------------------------------------


@pytest.mark.django_db
def test_un_testigo_inventado_no_abre_nada(client):
    inventado = "x" * 43

    assert client.get(reverse("compartido-ficha", args=[inventado])).status_code == 404
    assert client.get(reverse("compartido-contenido", args=[inventado])).status_code == 404


@pytest.mark.django_db
def test_un_enlace_caducado_deja_de_servir_solo(client, enlace, tmp_path):
    """**Sin esto la caducidad sería decorativa**, y es la mitad del control que se ofrece."""
    enlace.expira_en = timezone.now() - timedelta(seconds=1)
    enlace.save(update_fields=["expira_en"])

    with override_settings(DOCUMENTS_DIR=tmp_path):
        assert client.get(reverse("compartido-ficha", args=[enlace.testigo])).status_code == 404
        assert client.get(reverse("compartido-contenido", args=[enlace.testigo])).status_code == 404


@pytest.mark.django_db
def test_un_enlace_revocado_deja_de_servir_al_instante(client, enlace, tmp_path):
    """Si uno se reenvió a quien no debía, la respuesta tiene que ser un botón y no una llamada."""
    enlace.revocar()

    with override_settings(DOCUMENTS_DIR=tmp_path):
        assert client.get(reverse("compartido-contenido", args=[enlace.testigo])).status_code == 404


@pytest.mark.django_db
def test_los_tres_motivos_se_contestan_igual(client, enlace, modelo, proyectista):
    """**Decir «caducado» le confirma a quien prueba testigos que acertó uno.**

    Es la diferencia entre un 404 y un oráculo: con mensajes distintos, quien tantea aprende cuáles
    de sus intentos existen, y eso convierte un espacio de 256 bits en una lista que se puede podar.
    """
    caducado = EnlaceCompartido.objects.create(
        revision=modelo,
        para="caducado",
        expira_en=timezone.now() - timedelta(days=1),
        creado_por=proyectista,
    )
    revocado = EnlaceCompartido.objects.create(
        revision=modelo,
        para="revocado",
        expira_en=timezone.now() + timedelta(days=1),
        revocado_en=timezone.now(),
        creado_por=proyectista,
    )

    respuestas = [
        client.get(reverse("compartido-ficha", args=[t]))
        for t in ("z" * 43, caducado.testigo, revocado.testigo)
    ]

    assert {r.status_code for r in respuestas} == {404}
    assert len({r.content for r in respuestas}) == 1, "las respuestas se distinguen entre sí"


@pytest.mark.django_db
def test_el_enlace_no_abre_ninguna_otra_cosa_del_registro(client, enlace, modelo, tmp_path):
    """**Un testigo abre una revisión, no una sesión.**

    Es lo que hay que comprobar de verdad: que tener el enlace no sirva de llave para el resto.
    """
    with override_settings(DOCUMENTS_DIR=tmp_path):
        caminos = [
            "/api/revisiones/abribles/",
            f"/api/revisiones/{modelo.pk}/",
            f"/api/revisiones/{modelo.pk}/contenido/",
            reverse("documents:descargar-revision", args=[modelo.pk]),
            reverse("documents:expediente", args=[modelo.entregable_id]),
            reverse("projects:proyectos"),
        ]
        codigos = {camino: client.get(camino).status_code for camino in caminos}

    assert all(c in {301, 302, 401, 403, 404} for c in codigos.values()), codigos


@pytest.mark.django_db
def test_la_ficha_no_lleva_identificadores_internos(client, enlace, modelo):
    """Nada que sirva para pedir otra cosa, ni siquiera aunque hoy esas rutas pidan sesión.

    No es paranoia: es que el día que algo más se equivoque, un identificador ya publicado
    convierte una fuga pequeña en una grande, y para entonces ya está en los correos de otros.
    """
    crudo = client.get(reverse("compartido-ficha", args=[enlace.testigo])).content.decode()

    for interno in (
        str(modelo.pk),
        str(modelo.entregable_id),
        str(modelo.entregable.proyecto_id),
        str(modelo.entregable.organizacion_id),
    ):
        assert interno not in crudo, f"la ficha publica el identificador {interno}"


@pytest.mark.django_db
def test_nada_de_esto_se_indexa(client, enlace, tmp_path):
    """Un enlace pegado en un correo web acaba en un rastreador, y de ahí en un buscador."""
    with override_settings(DOCUMENTS_DIR=tmp_path):
        respuestas = [
            client.get(reverse("compartido-ficha", args=[enlace.testigo])),
            client.get(reverse("compartido-contenido", args=[enlace.testigo])),
        ]

    for respuesta in respuestas:
        assert "noindex" in respuesta["X-Robots-Tag"]


# --- Y quién puede crearlos ------------------------------------------------------------


@pytest.mark.django_db
def test_compartir_pide_mas_que_leer(client, modelo, revisor):
    """**Compartir hacia fuera no es leer.**

    Con el permiso de lectura, cualquier cuenta del piloto —incluida la del mandante— podría
    publicar el modelo de la obra. Se pide el permiso de quien manda sobre el documento.
    """
    client.force_login(dar(revisor, "documents.view_revision"))

    respuesta = client.get(reverse("documents:enlaces", args=[modelo.pk]))

    assert respuesta.status_code == 403


@pytest.mark.django_db
def test_no_se_comparte_una_revision_de_otra_organizacion(client, proyectista, db):
    """El mismo acotado que el resto: por `revisiones_visibles`, no por el `pk` de la URL."""
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")
    suyo = get_user_model().objects.create_user(
        username="ajeno", password="una-clave-larga-99", email="a@b.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=suyo)
    obra = Proyecto.objects.create(organizacion=ajena, codigo="999-AJENA", nombre="Ajena")
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    entregable = Entregable.objects.create(
        organizacion=ajena,
        proyecto=obra,
        disciplina=disciplina,
        codigo="999-AJENA-ES-M-001",
        titulo="Modelo ajeno",
        responsable=suyo,
        peso=3,
    )
    revision = Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=suyo,
        clave_archivo="x/y.ifc",
        nombre_original="ajeno.ifc",
        sha256="0" * 64,
        es_vigente=True,
    )
    client.force_login(
        dar(
            proyectista,
            "documents.add_enlacecompartido",
            "documents.change_revision",
            "documents.view_revision",
            "documents.add_revision",
        )
    )

    respuesta = client.post(
        reverse("documents:enlaces", args=[revision.pk]), {"para": "alguien", "dias": 7}
    )

    assert respuesta.status_code == 404
    assert not EnlaceCompartido.objects.filter(revision=revision).exists()


@pytest.mark.django_db
def test_no_se_revoca_el_enlace_de_otra_organizacion(client, proyectista, modelo, db):
    """Conocer el id de un enlace no puede bastar para cerrar el de otra empresa."""
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")
    suyo = get_user_model().objects.create_user(
        username="ajeno2", password="una-clave-larga-99", email="a2@b.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=suyo)
    obra = Proyecto.objects.create(organizacion=ajena, codigo="998-AJENA", nombre="Ajena")
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="AR", nombre="Arquitectura")
    entregable = Entregable.objects.create(
        organizacion=ajena,
        proyecto=obra,
        disciplina=disciplina,
        codigo="998-AJENA-AR-M-001",
        titulo="Ajeno",
        responsable=suyo,
        peso=3,
    )
    revision = Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=suyo,
        clave_archivo="x/z.ifc",
        nombre_original="ajeno.ifc",
        sha256="1" * 64,
        es_vigente=True,
    )
    suyo_enlace = EnlaceCompartido.objects.create(
        revision=revision, para="suyo", expira_en=timezone.now() + timedelta(days=5)
    )
    client.force_login(
        dar(
            proyectista,
            "documents.change_enlacecompartido",
            "documents.view_revision",
            "documents.add_revision",
        )
    )

    respuesta = client.post(reverse("documents:revocar-enlace", args=[suyo_enlace.pk]))

    suyo_enlace.refresh_from_db()
    assert respuesta.status_code == 404
    assert not suyo_enlace.revocado, "le cerraron el enlace a otra empresa"


@pytest.mark.django_db
def test_no_se_ofrece_un_enlace_para_siempre(client, proyectista, modelo):
    """**Un enlace sin caducidad es un enlace que olvidaste que hiciste.**"""
    client.force_login(
        dar(
            proyectista,
            "documents.add_enlacecompartido",
            "documents.view_revision",
            "documents.add_revision",
        )
    )

    respuesta = client.post(
        reverse("documents:enlaces", args=[modelo.pk]),
        {"para": "para siempre", "dias": DIAS_MAXIMO + 1},
    )

    assert respuesta.status_code == 200
    assert not EnlaceCompartido.objects.filter(para="para siempre").exists()
