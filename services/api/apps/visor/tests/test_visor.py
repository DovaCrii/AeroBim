"""La costura entre el visor y el registro, comprobada.

Son tres cosas distintas y las tres pueden fallar por su cuenta: que el SPA esté detrás del
login, que la API dé los bytes a quien corresponde, y que **lo que Django publica como
estático no incluya datos de proyecto**.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Idoneidad, Revision

DXF = b"  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def revision_dxf(db, organizacion, proyecto, disciplina, proyectista, tmp_path):
    """Una revisión con un DXF de verdad en el disco temporal."""
    from apps.documents import storage

    entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-AR-P-001",
        titulo="Planta piso 5",
        responsable=proyectista,
    )
    with override_settings(DOCUMENTS_DIR=tmp_path):
        _ext, sha = storage.validar("plano.dxf", DXF)
        clave = storage.clave_para(
            proyecto_codigo=proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256=sha,
            extension="dxf",
        )
        storage.guardar(clave, DXF)
    return Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
        clave_archivo=clave,
        nombre_original="plano.dxf",
        tamano_bytes=len(DXF),
        sha256=sha,
    )


# ── El SPA detrás del login ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_el_visor_no_se_abre_sin_entrar(client):
    """**Es la razón de que esta vista exista.** Un `index.html` servido como archivo estático
    lo entrega whitenoise antes de que Django mire quién pregunta; pasándolo por una vista se
    le puede poner el login delante."""
    respuesta = client.get(reverse("visor:visor"))

    assert respuesta.status_code == 302
    assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
def test_sin_construir_dice_que_orden_correr_en_vez_de_fallar(client, proyectista, tmp_path):
    """Es el caso normal en un equipo recién clonado, y un 500 ahí manda a leer un traceback
    para enterarse de que falta un `npm run build`."""
    client.force_login(proyectista)
    with override_settings(VISOR_DIST=tmp_path / "no-existe", VISOR_DEV_URL=""):
        respuesta = client.get(reverse("visor:visor"))

    assert respuesta.status_code == 503
    assert "npm run build" in respuesta.content.decode()


@pytest.mark.django_db
def test_con_servidor_de_desarrollo_redirige_conservando_la_revision(client, proyectista, tmp_path):
    """Sin conservar la consulta, «abrir en el visor» llegaría al SPA sin decirle qué abrir."""
    client.force_login(proyectista)
    with override_settings(
        VISOR_DIST=tmp_path / "no-existe", VISOR_DEV_URL="http://localhost:5173"
    ):
        respuesta = client.get(reverse("visor:visor") + "?revision=abc")

    assert respuesta.status_code == 302
    assert respuesta["Location"] == "http://localhost:5173/?revision=abc"


@pytest.mark.django_db
def test_construido_se_sirve(client, proyectista, tmp_path):
    (tmp_path / "index.html").write_text("<html>el visor</html>", encoding="utf-8")
    client.force_login(proyectista)
    with override_settings(VISOR_DIST=tmp_path):
        respuesta = client.get(reverse("visor:visor"))

    assert respuesta.status_code == 200
    assert "el visor" in respuesta.content.decode()


# ── La API que lo alimenta ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_api_no_contesta_sin_autenticar(client, revision_dxf):
    for ruta in (
        reverse("documents_api:revision", args=[revision_dxf.pk]),
        reverse("documents_api:revision-contenido", args=[revision_dxf.pk]),
        reverse("documents_api:abribles"),
    ):
        # **401 y no una redirección**: una API que redirige al login devuelve HTML donde el
        # visor esperaba JSON, y el error que se ve es «Unexpected token '<'».
        assert client.get(ruta).status_code in {401, 403}


@pytest.mark.django_db
def test_sin_view_revision_no_se_leen_los_bytes(client, revision_dxf, proyectista):
    client.force_login(proyectista)

    assert client.get(reverse("documents_api:revision", args=[revision_dxf.pk])).status_code == 403
    assert (
        client.get(reverse("documents_api:revision-contenido", args=[revision_dxf.pk])).status_code
        == 403
    )


@pytest.mark.django_db
def test_con_permiso_devuelve_los_metadatos_y_los_bytes(
    client, revision_dxf, proyectista, tmp_path
):
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    meta = client.get(reverse("documents_api:revision", args=[revision_dxf.pk]))
    assert meta.status_code == 200
    datos = meta.json()
    assert datos["nombre"] == "plano.dxf"
    assert datos["extension"] == "dxf"
    assert datos["entregable"]["codigo"] == "716-LCD-AR-P-001"
    # El enlace a los bytes viene en la respuesta: el visor no tiene que construir rutas.
    assert datos["contenido"].endswith("/contenido/")

    with override_settings(DOCUMENTS_DIR=tmp_path):
        bytes_ = client.get(datos["contenido"])
    assert bytes_.status_code == 200
    assert b"".join(bytes_.streaming_content) == DXF
    # El sha viaja para que el visor pueda comprobar que abrió lo que el registro dice.
    assert bytes_["X-Aerobim-Sha256"] == revision_dxf.sha256


@pytest.mark.django_db
def test_una_revision_de_otra_organizacion_no_existe_para_la_api(client, revision_dxf, tmp_path):
    """El permiso dice qué se puede hacer, no sobre qué. Y una `Revision` **no lleva** el campo
    `organizacion` —cuelga de su entregable—, así que confiar en el acotado automático dejaría
    el hueco abierto: hay que filtrar por `entregable__organizacion`."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    forastera = get_user_model().objects.create_user(username="forastera", password="x-99")
    Membresia.objects.create(organizacion=ajena, usuario=forastera)
    client.force_login(dar(forastera, "documents.view_revision", "documents.add_revision"))

    assert client.get(reverse("documents_api:revision", args=[revision_dxf.pk])).status_code == 404
    assert client.get(reverse("documents_api:abribles")).json()["revisiones"] == []


@pytest.mark.django_db
def test_un_mandante_no_puede_bajar_una_revision_en_curso(client, revision_dxf, organizacion):
    """La regla contractual se aplica **también en la API**, no solo en la pantalla: lo que está
    en curso no obliga a nadie y no se enseña."""
    from django.contrib.auth.models import Group
    from django.core.management import call_command

    call_command("bootstrap_roles")
    mandante = get_user_model().objects.create_user(username="mandante", password="x-99")
    mandante.groups.add(Group.objects.get(name="Mandante"))
    Membresia.objects.create(organizacion=organizacion, usuario=mandante)
    client.force_login(mandante)

    assert client.get(reverse("documents_api:revision", args=[revision_dxf.pk])).status_code == 404
    assert client.get(reverse("documents_api:abribles")).json()["revisiones"] == []

    revision_dxf.idoneidad = Idoneidad.A
    revision_dxf.save()
    assert client.get(reverse("documents_api:revision", args=[revision_dxf.pk])).status_code == 200
    assert len(client.get(reverse("documents_api:abribles")).json()["revisiones"]) == 1


@pytest.mark.django_db
def test_solo_se_ofrecen_los_formatos_que_el_visor_sabe_abrir(
    client, revision_dxf, proyectista, organizacion, proyecto, disciplina
):
    """**Un PDF no está en esta lista, y desde `F8.6` es más importante que antes.**

    Ahora un PDF sí se abre —en su propia pantalla—, así que el predicado «es abrible» dice que
    sí. Pero esta lista es el selector del visor de **modelos**: metiéndole un PDF, lo intentaría
    cargar como geometría y quedaría en blanco. Son dos preguntas distintas y por eso hay dos
    funciones.
    """
    otro = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-AR-M-002",
        titulo="Memoria",
        responsable=proyectista,
    )
    Revision.objects.create(
        entregable=otro,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
        clave_archivo="x/y/z.pdf",
        nombre_original="memoria.pdf",
        sha256="a" * 64,
    )
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    nombres = [
        r["nombre"] for r in client.get(reverse("documents_api:abribles")).json()["revisiones"]
    ]
    assert nombres == ["plano.dxf"]


@pytest.mark.django_db
def test_el_expediente_ofrece_abrir_solo_lo_abrible(client, revision_dxf, proyectista):
    client.force_login(
        dar(
            proyectista,
            "documents.view_entregable",
            "documents.view_revision",
            "documents.add_revision",
        )
    )
    cuerpo = client.get(
        reverse("documents:expediente", args=[revision_dxf.entregable_id])
    ).content.decode()

    # Por la URL y no por el rótulo: el rótulo cambia con la traducción y lo que se comprueba
    # es que el enlace exista y apunte a la revisión correcta.
    assert f"/visor/?revision={revision_dxf.pk}" in cuerpo


# ── Lo que se publica como estático ──────────────────────────────────────────────────


def test_lo_publicado_no_incluye_datos_de_proyecto():
    """**El defecto que este bloque introdujo, y que se encontró midiendo.**

    Publicar `apps/web/dist` como estático dejó los IFC y DXF reales de la organización
    accesibles **sin autenticar**: `HEAD /static/visor/samples/716-LCD-ME-ISUP-D-TEST.ifc`
    devolvía 200 y 34 MB. Vite copia todo lo que hay en `public/`, y ahí viven los archivos de
    prueba.

    `AGENTS.md` ya decía que los modelos de cliente viven fuera del repositorio, y así era.
    Lo que faltaba decir es lo otro: **lo que se pone en `public/` se publica**, y publicar no
    es lo mismo que confirmar. El guardián es la lista blanca de `limpiar-dist.mjs`; esta
    prueba es la que avisa si alguien la salta.
    """
    dist = Path(settings.VISOR_DIST)
    if not dist.is_dir():
        pytest.skip("el SPA no está construido en este equipo")

    sospechosos = [
        p.relative_to(dist).as_posix()
        for p in dist.rglob("*")
        if p.is_file() and p.suffix.lower() in {".ifc", ".dxf", ".frag", ".las", ".laz", ".rvt"}
    ]
    assert sospechosos == [], (
        "Hay datos de proyecto en lo que Django publica sin autenticación: "
        f"{sospechosos}. Corre `npm run build`, que pasa por `limpiar-dist.mjs`."
    )
