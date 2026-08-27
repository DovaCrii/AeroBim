"""Ver y comentar el documento: `F8.6`.

El modelo guardaba `pagina`, `ancla_x` y `ancla_y` de cada observación desde el primer día y
**no había quien las dibujara**. Lo que se prueba aquí es lo que la pantalla añade, y sobre
todo sus dos bordes:

- **el ancla es una fracción de la página, no un píxel**, y fuera de `[0, 1]` no se guarda —una
  marca que cae fuera de la hoja existe y no se ve—;
- **las tres partes del ancla van juntas**: media ancla no se puede dibujar.

Más el contrato de permisos de siempre: 403 por vista, y aislamiento entre organizaciones.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.abribles import VISOR_MODELO, abre_en, es_abrible, visor_de
from apps.documents.models import Entregable, Idoneidad, Observacion, Revision
from apps.projects.models import Disciplina, Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def revision_pdf(db, entregable, proyectista):
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/abc.pdf",
        nombre_original="Planta piso 5.pdf",
        sha256="c" * 64,
    )


@pytest.fixture
def observacion_anclada(db, revision_pdf, organizacion, proyecto, proyectista, revisor):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        revision=revision_pdf,
        titulo="El muro del eje C no coincide",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        pagina=2,
        ancla_x=0.42,
        ancla_y=0.35,
    )


# --- Qué visor abre qué ---------------------------------------------------------------


@pytest.mark.django_db
def test_un_pdf_se_abre_pero_no_en_el_visor_de_modelos(revision_pdf, revision):
    """**Dos preguntas distintas, y confundirlas rompía el visor de modelos.**

    «Es abrible» decide si ofrecer un enlace; «lo abre este visor» decide si entra en el
    selector de uno concreto. Con una sola función, los PDFs entraban en la lista del visor 3D
    y este los habría cargado como geometría: pantalla en blanco.
    """
    assert es_abrible(revision_pdf) is True
    assert visor_de(revision_pdf) == "documento"
    assert abre_en(revision_pdf, VISOR_MODELO) is False

    # El fixture `revision` no trae nombre de archivo: no se abre con nada.
    assert es_abrible(revision) is False


@pytest.mark.django_db
def test_el_expediente_manda_cada_formato_a_su_visor(client, mirona_lectora, revision_pdf):
    """El enlace apunta al visor del documento, no al de modelos. Se comprueba por la URL, que
    no depende del idioma."""
    respuesta = client.get(reverse("documents:expediente", args=[revision_pdf.entregable_id]))
    cuerpo = respuesta.content.decode()

    assert f"{reverse('visor:documento')}?revision={revision_pdf.pk}" in cuerpo
    assert f"{reverse('visor:visor')}?revision={revision_pdf.pk}" not in cuerpo


@pytest.fixture
def mirona_lectora(client, db, organizacion, revision_pdf):
    usuario = get_user_model().objects.create_user(username="lectora", password="clave-larga-99")
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = dar(
        usuario,
        "documents.view_entregable",
        "documents.view_revision",
        "documents.add_revision",
    )
    client.force_login(usuario)
    return usuario


# --- La página del visor -------------------------------------------------------------


@pytest.mark.django_db
def test_la_pagina_del_documento_esta_detras_del_login(client):
    respuesta = client.get(reverse("visor:documento"))

    assert respuesta.status_code == 302
    assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
def test_la_pagina_del_documento_no_es_la_del_visor_de_modelos(
    settings, client, proyectista, tmp_path
):
    """**Son dos archivos del mismo build.** Servir el mismo `index.html` en las dos rutas
    cargaría Three.js y el WASM de `web-ifc` para leer un PDF, y no sabría abrirlo."""
    (tmp_path / "index.html").write_text("<html>modelos</html>", encoding="utf-8")
    (tmp_path / "documento.html").write_text("<html>documento</html>", encoding="utf-8")
    settings.VISOR_DIST = tmp_path
    client.force_login(proyectista)

    assert b"documento" in client.get(reverse("visor:documento")).content
    assert b"modelos" in client.get(reverse("visor:visor")).content


@pytest.mark.django_db
def test_sin_build_se_redirige_al_servidor_de_vite_con_la_pagina_y_la_consulta(
    settings, client, proyectista, tmp_path
):
    """**Es el camino normal mientras alguien trabaja en el visor**, y tiene dos partes que se
    pierden fácil: el nombre de la página —el servidor de Vite sirve `index.html` en la raíz y
    las demás por su nombre— y la consulta, sin la cual `?revision=<uuid>` no llega y la
    pantalla se abre vacía sin decir por qué.
    """
    settings.VISOR_DIST = tmp_path  # vacío: no hay build
    settings.VISOR_DEV_URL = "http://localhost:5173"
    client.force_login(proyectista)

    documento = client.get(reverse("visor:documento"), {"revision": "abc"})
    assert documento.status_code == 302
    assert documento["Location"] == "http://localhost:5173/documento.html?revision=abc"

    # Y la raíz sigue siendo la raíz: sin nombre de archivo.
    modelos = client.get(reverse("visor:visor"), {"revision": "abc"})
    assert modelos["Location"] == "http://localhost:5173/?revision=abc"


# --- La API de las observaciones ancladas ---------------------------------------------


@pytest.mark.django_db
def test_las_observaciones_ancladas_piden_su_permiso(client, proyectista, revision_pdf):
    ruta = reverse("documents_api:revision-observaciones", args=[revision_pdf.pk])
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_la_api_devuelve_el_ancla_y_si_se_puede_observar(
    client, proyectista, revision_pdf, observacion_anclada
):
    client.force_login(
        dar(
            proyectista,
            "documents.view_revision",
            "documents.add_revision",
            "documents.view_observacion",
        )
    )
    datos = client.get(
        reverse("documents_api:revision-observaciones", args=[revision_pdf.pk])
    ).json()

    assert datos["puedeObservar"] is False  # tiene lectura, no `add_observacion`
    [una] = datos["observaciones"]
    assert una["pagina"] == 2
    assert (una["x"], una["y"]) == (0.42, 0.35)
    assert una["url"] == f"/documentos/observaciones/{observacion_anclada.pk}/"


@pytest.mark.django_db
def test_una_observacion_sin_ancla_no_se_dibuja(
    client, proyectista, revision_pdf, organizacion, proyecto, revisor
):
    """Sin página no hay dónde ponerla. **Se omite y no se manda con coordenada cero**, que la
    dibujaría en la esquina de la primera hoja afirmando algo que nadie dijo."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        revision=revision_pdf,
        titulo="Sobre el documento en general",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
    )
    client.force_login(
        dar(
            proyectista,
            "documents.view_revision",
            "documents.add_revision",
            "documents.view_observacion",
        )
    )

    datos = client.get(
        reverse("documents_api:revision-observaciones", args=[revision_pdf.pk])
    ).json()
    assert datos["observaciones"] == []


@pytest.mark.django_db
def test_las_observaciones_de_otra_organizacion_no_se_listan(client, proyectista, organizacion):
    """La revisión se busca por `revisiones_visibles`, así que sobre un documento de otro
    cliente no hay observaciones que listar **ni para decir cuántas hay**."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    disciplina_ajena = Disciplina.objects.create(
        proyecto=proyecto_ajeno, codigo="ES", nombre="Estructura"
    )
    entregable_ajeno = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        disciplina=disciplina_ajena,
        codigo="OTRO-001",
        titulo="No es tuyo",
        responsable=proyectista,
    )
    de_otra = Revision.objects.create(
        entregable=entregable_ajeno,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        nombre_original="ajeno.pdf",
        sha256="d" * 64,
    )
    client.force_login(
        dar(
            proyectista,
            "documents.view_revision",
            "documents.add_revision",
            "documents.view_observacion",
        )
    )

    ruta = reverse("documents_api:revision-observaciones", args=[de_otra.pk])
    assert client.get(ruta).status_code == 404


# --- El ancla que llega del visor ----------------------------------------------------


@pytest.mark.django_db
def test_el_formulario_llega_con_el_ancla_puesta(client, proyectista, revision_pdf):
    """Es lo que convierte un clic sobre la página en una observación anclada."""
    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.get(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {"revision": str(revision_pdf.pk), "pagina": "2", "x": "0.2992", "y": "0.7993"},
    )

    inicial = respuesta.context["form"].initial
    assert inicial["pagina"] == 2
    assert inicial["ancla_x"] == pytest.approx(0.2992)
    assert inicial["ancla_y"] == pytest.approx(0.7993)
    assert inicial["revision"] == str(revision_pdf.pk)


@pytest.mark.django_db
def test_un_ancla_con_mala_forma_abre_el_formulario_sin_ancla(client, proyectista, revision_pdf):
    """**Sin un error sobre un parámetro que nadie escribió.** Quien llega aquí con la URL
    editada abre el formulario igual; lo que no pasa es que se guarde una marca inventada."""
    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.get(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {"pagina": "dos", "x": "0.5", "y": "0.5"},
    )

    assert respuesta.status_code == 200
    assert respuesta.context["form"].initial == {}


@pytest.mark.django_db
def test_una_coordenada_fuera_de_la_hoja_no_se_guarda(client, proyectista, revision_pdf):
    """Fuera de `[0, 1]` la marca cae fuera de la página: la observación existiría y no se
    vería. Pasa si alguien edita la URL."""
    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {
            "titulo": "Fuera de la hoja",
            "descripcion": "",
            "prioridad": Observacion.MEDIA,
            "responsable": proyectista.pk,
            "vence": "",
            "revision": revision_pdf.pk,
            "pagina": "1",
            "ancla_x": "1.4",
            "ancla_y": "0.5",
        },
    )

    assert respuesta.status_code == 400
    assert respuesta.context["form"].errors["ancla_x"]
    assert Observacion.objects.count() == 0


@pytest.mark.django_db
def test_media_ancla_se_rechaza(client, proyectista, revision_pdf):
    """La página sin la posición deja una marca que no se puede dibujar, y el visor la
    descartaría en silencio."""
    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {
            "titulo": "Media ancla",
            "descripcion": "",
            "prioridad": Observacion.MEDIA,
            "responsable": proyectista.pk,
            "vence": "",
            "revision": revision_pdf.pk,
            "pagina": "1",
        },
    )

    assert respuesta.status_code == 400
    assert respuesta.context["form"].errors
    assert Observacion.objects.count() == 0


@pytest.mark.django_db
def test_un_ancla_sin_documento_no_ancla_en_nada(client, proyectista, revision_pdf):
    client.force_login(dar(proyectista, "documents.add_observacion"))
    respuesta = client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {
            "titulo": "Sin revision",
            "descripcion": "",
            "prioridad": Observacion.MEDIA,
            "responsable": proyectista.pk,
            "vence": "",
            "pagina": "1",
            "ancla_x": "0.5",
            "ancla_y": "0.5",
        },
    )

    assert respuesta.status_code == 400
    assert Observacion.objects.count() == 0


@pytest.mark.django_db
def test_el_ciclo_de_una_observacion_anclada(client, proyectista, revisor, revision_pdf):
    """**El oráculo de `F8.6`**: se abre desde un clic sobre la página y aparece dibujada donde
    se hizo el clic."""
    client.force_login(dar(revisor, "documents.add_observacion"))
    respuesta = client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable_id]),
        {
            "titulo": "Falta la cota del vano V-03",
            "descripcion": "Revisar contra el cuadro de vanos.",
            "prioridad": Observacion.ALTA,
            "responsable": proyectista.pk,
            "vence": "",
            "revision": revision_pdf.pk,
            "pagina": "2",
            "ancla_x": "0.2992",
            "ancla_y": "0.7993",
        },
    )
    assert respuesta.status_code == 302

    abierta = Observacion.objects.get(titulo="Falta la cota del vano V-03")
    assert abierta.ancla == "documento"
    assert (abierta.pagina, abierta.ancla_x, abierta.ancla_y) == (2, 0.2992, 0.7993)

    # Y el visor la recibe con su ancla, que es lo que la dibuja.
    client.force_login(
        dar(
            revisor,
            "documents.view_revision",
            "documents.add_revision",
            "documents.view_observacion",
        )
    )
    datos = client.get(
        reverse("documents_api:revision-observaciones", args=[revision_pdf.pk])
    ).json()
    [una] = datos["observaciones"]
    assert (una["pagina"], una["x"], una["y"]) == (2, 0.2992, 0.7993)
    # Quien puede abrirlas ve el aviso de que el clic hace algo.
    assert datos["puedeObservar"] is True


@pytest.mark.django_db
def test_no_se_observa_sobre_el_entregable_de_otra_organizacion(client, proyectista, organizacion):
    """**`add_observacion` dice que puede abrir observaciones, no sobre qué.**

    Sin acotar la consulta, `POST /entregables/<id-de-otra>/observar/` mete un hallazgo en el
    proyecto de otro cliente — y le manda un correo a alguien que no tiene nada que ver.
    """
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    disciplina_ajena = Disciplina.objects.create(
        proyecto=proyecto_ajeno, codigo="ES", nombre="Estructura"
    )
    de_otra = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        disciplina=disciplina_ajena,
        codigo="OTRO-001",
        titulo="No es tuyo",
        responsable=proyectista,
    )
    client.force_login(dar(proyectista, "documents.add_observacion"))

    ruta = reverse("documents:nueva-observacion", args=[de_otra.pk])
    assert client.get(ruta).status_code == 404
    assert (
        client.post(
            ruta,
            {
                "titulo": "En el proyecto de otro",
                "descripcion": "",
                "prioridad": Observacion.ALTA,
                "responsable": proyectista.pk,
                "vence": "",
            },
        ).status_code
        == 404
    )
    assert Observacion.objects.count() == 0


# --- Observar desde el visor de modelos: `F4.1` --------------------------------------


@pytest.mark.django_db
def test_los_metadatos_dicen_si_este_usuario_puede_observar(client, proyectista, revision_pdf):
    """El visor dibuja «Observar este elemento» solo si el servidor dice que si.

    **Viaja en los metadatos que el visor ya pide**, no en una peticion aparte: es una pregunta de
    un solo bit y el visor la necesita antes del primer clic sobre el modelo.

    Y el visor **no puede contestarla**: depende de `add_observacion` y de la organizacion, que
    viven en el servidor. Un boton dibujado por adivinanza termina en 403 y enseña a probar
    puertas.
    """
    ruta = reverse("documents_api:revision", args=[revision_pdf.pk])

    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))
    assert client.get(ruta).json()["puedeObservar"] is False

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.get(ruta).json()["puedeObservar"] is True


@pytest.mark.django_db
def test_los_metadatos_traen_el_id_del_entregable(client, proyectista, revision_pdf):
    """Sin el, el visor no sabe **donde** anotar la observacion: el formulario cuelga del
    entregable, no de la revision."""
    client.force_login(dar(proyectista, "documents.view_revision", "documents.add_revision"))

    datos = client.get(reverse("documents_api:revision", args=[revision_pdf.pk])).json()

    assert datos["entregable"]["id"] == str(revision_pdf.entregable.pk)


@pytest.mark.django_db
def test_el_guid_del_visor_llega_al_formulario_y_se_guarda(client, proyectista, revision_pdf):
    """**El camino completo de `F4.1`**, tal como lo arma el visor: el enlace de la ficha del
    elemento trae la revision y el GUID, el formulario los recibe como valores iniciales, y lo que
    se guarda queda anclado al elemento.

    Que ese GUID sobreviva es lo que hace que el BCF exportado seleccione la viga en Solibri.
    """
    guid = "2x9ibDgrvAu8y4Yd$Ug4Qu"
    usuario = dar(
        proyectista,
        "documents.view_revision",
        "documents.add_revision",
        "documents.add_observacion",
    )
    client.force_login(usuario)
    ruta = reverse("documents:nueva-observacion", args=[revision_pdf.entregable.pk])

    formulario = client.get(f"{ruta}?revision={revision_pdf.pk}&guid={guid}&titulo=Viga+eje+C")
    assert formulario.status_code == 200
    # El GUID viaja en el formulario, no en un campo que quien lo usa tenga que copiar a mano.
    assert guid in formulario.content.decode()

    creada = client.post(
        ruta,
        {
            "titulo": "Viga eje C sin su fase",
            "descripcion": "",
            "prioridad": Observacion.ALTA,
            "responsable": usuario.pk,
            "revision": str(revision_pdf.pk),
            "ifc_guid": guid,
        },
    )
    assert creada.status_code == 302

    observacion = Observacion.objects.get(titulo="Viga eje C sin su fase")
    assert observacion.ifc_guid == guid
    assert observacion.revision_id == revision_pdf.pk


@pytest.mark.django_db
def test_la_camara_del_visor_llega_al_formulario_y_se_guarda(client, proyectista, revision_pdf):
    """**El camino completo de la camara** (`F4.1`): el visor la arma ya convertida al sistema del
    IFC, viaja en la URL, el formulario la valida y queda en `punto_de_vista`, que es de donde la
    lee el exportador a BCF."""
    import json

    guid = "2x9ibDgrvAu8y4Yd$Ug4Qu"
    camara = {
        "tipo": "perspectiva",
        "punto": [10.0, -10.0, 10.0],
        "direccion": [-0.57735, 0.57735, -0.57735],
        "arriba": [-0.408248, 0.408248, 0.816497],
        "campoVisual": 60.0,
    }
    usuario = dar(
        proyectista,
        "documents.view_revision",
        "documents.add_revision",
        "documents.add_observacion",
    )
    client.force_login(usuario)
    ruta = reverse("documents:nueva-observacion", args=[revision_pdf.entregable.pk])

    creada = client.post(
        ruta,
        {
            "titulo": "Viga eje C sin su fase",
            "descripcion": "",
            "prioridad": Observacion.ALTA,
            "responsable": usuario.pk,
            "revision": str(revision_pdf.pk),
            "ifc_guid": guid,
            "camara": json.dumps(camara),
        },
    )
    assert creada.status_code == 302

    observacion = Observacion.objects.get(titulo="Viga eje C sin su fase")
    assert observacion.punto_de_vista == camara


@pytest.mark.django_db
def test_una_camara_mala_no_impide_guardar_la_observacion(client, proyectista, revision_pdf):
    """**Quien abre la observacion no escribio ese parametro**: llega del visor por la URL.
    Negarse a guardar un hallazgo real por un dato accesorio seria el peor de los dos errores, y
    sin camara el BCF sale con el elemento seleccionado."""
    usuario = dar(
        proyectista,
        "documents.view_revision",
        "documents.add_revision",
        "documents.add_observacion",
    )
    client.force_login(usuario)

    creada = client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable.pk]),
        {
            "titulo": "Con una camara rota",
            "descripcion": "",
            "prioridad": Observacion.MEDIA,
            "responsable": usuario.pk,
            "ifc_guid": "2x9ibDgrvAu8y4Yd$Ug4Qu",
            "camara": "{no es json",
        },
    )

    assert creada.status_code == 302
    assert Observacion.objects.get(titulo="Con una camara rota").punto_de_vista == {}


@pytest.mark.django_db
def test_una_camara_sin_guid_no_se_guarda(client, proyectista, revision_pdf):
    """El punto de vista es **la mitad del ancla en el modelo**. Sin el elemento al que apunta, un
    viewpoint dice «mira hacia aca» sin decir que hay que mirar."""
    import json

    usuario = dar(
        proyectista,
        "documents.view_revision",
        "documents.add_revision",
        "documents.add_observacion",
    )
    client.force_login(usuario)

    client.post(
        reverse("documents:nueva-observacion", args=[revision_pdf.entregable.pk]),
        {
            "titulo": "Camara sin elemento",
            "descripcion": "",
            "prioridad": Observacion.MEDIA,
            "responsable": usuario.pk,
            "camara": json.dumps(
                {
                    "tipo": "ortogonal",
                    "punto": [0.0, 0.0, 40.0],
                    "direccion": [0.0, 0.0, -1.0],
                    "arriba": [0.0, 1.0, 0.0],
                    "escala": 25.0,
                }
            ),
        },
    )

    assert Observacion.objects.get(titulo="Camara sin elemento").punto_de_vista == {}
