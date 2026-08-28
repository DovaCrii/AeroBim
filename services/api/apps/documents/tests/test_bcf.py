"""Exportar a BCF 2.1: `F4.4`.

**El oraculo es el lector de otro.** Escribimos el BCF a mano —es un ZIP con tres XML pequeños— y lo
leemos de vuelta con `bcf-client`, que es la implementacion de referencia de buildingSMART y que ya
esta instalado porque lo trae `ifcopenshell`. Escribir y leer con la misma libreria solo diria que
es consistente consigo misma; asi la prueba dice algo sobre el archivo.

Lo que `MASTER_PLAN.md` declara como oraculo de la fase —«que el BCF abra en Navisworks o Solibri
con su viewpoint intacto»— **no se puede correr aqui**, y va dicho al final. Que la implementacion
de referencia lo parsee es evidencia fuerte, no la misma afirmacion.
"""

import zipfile
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.bcf import VERSION, exportar
from apps.documents.models import Comentario, Observacion

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def con_lectura(client, usuario):
    """El usuario, con `view_observacion` y la sesion recargada.

    Hay que volver a buscarlo: `User` cachea los permisos en la instancia, asi que darle uno y
    seguir usando el mismo objeto deja la prueba mintiendo en verde.
    """
    usuario.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_observacion")
    )
    client.force_login(get_user_model().objects.get(pk=usuario.pk))


@pytest.fixture
def observacion(db, organizacion, proyecto, revisor, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga del eje C no trae su fase",
        descripcion="Detectado por la validacion IDS.",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )


def leer(contenido: bytes, tmp_path):
    """El BCF, leido por `bcf-client`. Es el oraculo independiente."""
    from bcf.v2.bcfxml import BcfXml

    ruta = tmp_path / "salida.bcf"
    ruta.write_bytes(contenido)
    return BcfXml.load(ruta)


# --- La forma del archivo ------------------------------------------------------------


@pytest.mark.django_db
def test_el_zip_tiene_la_forma_que_bcf_declara(observacion):
    contenido = exportar([observacion], "716-LCD")

    with zipfile.ZipFile(BytesIO(contenido)) as zip_bcf:
        nombres = set(zip_bcf.namelist())
        # `bcf.version` en la raiz, y un directorio por tema con su markup.
        assert "bcf.version" in nombres
        assert f"{observacion.pk}/markup.bcf" in nombres
        assert f"{observacion.pk}/viewpoint.bcfv" in nombres
        assert VERSION in zip_bcf.read("bcf.version").decode()


@pytest.mark.django_db
def test_el_guid_del_tema_es_el_de_la_observacion(observacion):
    """**No uno nuevo**, y por eso: reimportar el mismo BCF actualiza el tema en vez de duplicarlo,
    que es lo que pasa cuando cada exportacion inventa identificadores."""
    contenido = exportar([observacion], "716-LCD")

    with zipfile.ZipFile(BytesIO(contenido)) as zip_bcf:
        markup = zip_bcf.read(f"{observacion.pk}/markup.bcf").decode()
    assert f'Guid="{observacion.pk}"' in markup


# --- Lo que dice el lector de otro ---------------------------------------------------


@pytest.mark.django_db
def test_bcf_client_lo_lee_y_encuentra_el_tema(observacion, tmp_path):
    documento = leer(exportar([observacion], "716-LCD"), tmp_path)

    assert documento is not None
    temas = documento.topics
    assert len(temas) == 1
    [tema] = list(temas.values())
    assert tema.topic.title == observacion.titulo
    assert tema.topic.priority == "High"
    assert tema.topic.topic_status == "Open"


@pytest.mark.django_db
def test_el_responsable_viaja_como_correo(observacion, tmp_path):
    """BCF identifica a las personas por correo: es lo que permite que el software del otro lado
    sepa a quien esta asignado un tema."""
    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    assert tema.topic.assigned_to == observacion.responsable.email
    assert tema.topic.creation_author == observacion.autor.email


@pytest.mark.django_db
def test_el_guid_del_elemento_sobrevive_al_viaje(observacion, tmp_path):
    """**Es el dato que hace util el BCF.** Sin el GUID, el tema dice "hay un problema" y no dice
    donde; con el, Solibri selecciona la viga."""
    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    vistas = list(tema.viewpoints.values()) if hasattr(tema, "viewpoints") else []
    assert vistas, "el tema no trae viewpoint"
    componentes = vistas[0].visualization_info.components
    assert componentes is not None
    guids = [c.ifc_guid for c in componentes.selection.component]
    assert guids == [GUID]


@pytest.mark.django_db
def test_no_se_inventa_una_camara(observacion, tmp_path):
    """**Es una decision, no una omision.** Nadie eligio un punto de vista para esta observacion
    —viene de una validacion IDS—, y un BCF que abre mirando a un sitio que nadie decidio afirma
    algo falso. Seleccionar el elemento dice lo que se sabe."""
    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.perspective_camera is None
    assert vista.orthogonal_camera is None


@pytest.mark.django_db
def test_los_comentarios_viajan_con_su_historial(observacion, proyectista, revisor, tmp_path):
    """Es la mitad del valor de una observacion: la respuesta y el cierre son lo que explica por que
    esta cerrada."""
    Comentario.objects.create(
        observacion=observacion, autor=proyectista, texto="Corregido en la A2."
    )
    Comentario.objects.create(observacion=observacion, autor=revisor, texto="Verificado.")

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    textos = [c.comment for c in tema.markup.comment]
    assert "Corregido en la A2." in textos
    assert "Verificado." in textos


@pytest.mark.django_db
def test_la_resolucion_viaja_como_un_comentario_mas(observacion, revisor, tmp_path):
    """Cerrar una observacion **diciendo como** es una regla del registro; ese texto es justo el que
    contesta «por que esta cerrada», asi que tiene que salir en el BCF."""
    observacion.cerrar(revisor, "Se agrego el pset en la revision A2.")

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    assert tema.topic.topic_status == "Closed"
    textos = [c.comment for c in tema.markup.comment]
    assert "Se agrego el pset en la revision A2." in textos


# --- Los bordes ----------------------------------------------------------------------


@pytest.mark.django_db
def test_una_observacion_sin_ancla_en_el_modelo_no_lleva_viewpoint(
    db, organizacion, proyecto, revisor, proyectista, tmp_path
):
    """Una observacion sobre un PDF **no tiene elemento que seleccionar**, y el tema sigue siendo
    util: dice que hay un problema, quien lo abrio y a quien le toca. Inventarle un viewpoint vacio
    haria que el lector seleccionara nada."""
    sin_guid = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Falta la cota del vano",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
    )

    contenido = exportar([sin_guid], "716-LCD")
    with zipfile.ZipFile(BytesIO(contenido)) as zip_bcf:
        assert f"{sin_guid.pk}/viewpoint.bcfv" not in zip_bcf.namelist()

    documento = leer(contenido, tmp_path)
    [tema] = list(documento.topics.values())
    assert tema.topic.title == "Falta la cota del vano"


@pytest.mark.django_db
def test_varias_observaciones_son_varios_temas(observacion, proyecto, revisor, tmp_path):
    otra = Observacion.objects.create(
        organizacion=observacion.organizacion,
        proyecto=proyecto,
        titulo="Segundo hallazgo",
        autor=revisor,
        responsable=revisor,
        prioridad=Observacion.BAJA,
    )

    documento = leer(exportar([observacion, otra], "716-LCD"), tmp_path)
    titulos = sorted(t.topic.title for t in documento.topics.values())
    assert titulos == ["La viga del eje C no trae su fase", "Segundo hallazgo"]


# --- La pantalla ---------------------------------------------------------------------


@pytest.mark.django_db
def test_la_exportacion_pide_su_permiso_de_lectura(client, proyectista, observacion, proyecto):
    """**Exportar es leer**, así que pide `view_observacion` y nada más: se lleva lo que el usuario
    ya puede ver en la lista, ni un tema más."""
    ruta = reverse("documents:exportar-bcf", args=[proyecto.pk])
    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    con_lectura(client, proyectista)
    respuesta = client.get(ruta)
    assert respuesta.status_code == 200
    assert respuesta["Content-Disposition"].startswith("attachment")
    # Y es un ZIP de verdad, no una página de error con estado 200.
    cuerpo = b"".join(respuesta.streaming_content)
    with zipfile.ZipFile(BytesIO(cuerpo)) as zip_bcf:
        assert "bcf.version" in zip_bcf.namelist()


@pytest.mark.django_db
def test_no_se_exportan_las_observaciones_de_otra_organizacion(client, proyectista, observacion):
    """**El permiso dice qué se puede hacer, no sobre qué.** Sin acotar la consulta, pedir el id del
    proyecto de otro cliente entregaría sus hallazgos en un archivo, listo para reenviar."""
    from apps.core.models import Organizacion
    from apps.projects.models import Proyecto

    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    Observacion.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        titulo="Hallazgo de otro cliente",
        autor=proyectista,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
    )

    con_lectura(client, proyectista)

    assert (
        client.get(reverse("documents:exportar-bcf", args=[proyecto_ajeno.pk])).status_code == 404
    )


@pytest.mark.django_db
def test_un_proyecto_sin_observaciones_no_entrega_un_zip_vacio(client, proyectista, proyecto):
    """Un BCF sin temas se abre en Solibri y no muestra nada, que se lee como que la exportación
    falló. Decirlo es mejor."""
    con_lectura(client, proyectista)

    respuesta = client.get(reverse("documents:exportar-bcf", args=[proyecto.pk]))
    assert respuesta.status_code == 302


@pytest.mark.django_db
def test_un_responsable_sin_correo_no_inventa_una_direccion(
    db, organizacion, proyecto, revisor, tmp_path
):
    """Inventar un correo seria peor que no ponerlo: el software del otro lado asignaria el tema a
    una direccion que no existe."""
    muda = get_user_model().objects.create_user(username="sin-correo", password="clave-larga-99")
    sin_correo = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Asignada a alguien sin correo",
        autor=revisor,
        responsable=muda,
        prioridad=Observacion.MEDIA,
    )

    documento = leer(exportar([sin_correo], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    assert tema.topic.assigned_to == "sin-correo"
    assert "@" not in tema.topic.assigned_to


@pytest.mark.django_db
def test_el_archivo_se_descarga_con_el_codigo_del_proyecto(
    client, proyectista, observacion, proyecto
):
    """**El nombre del archivo importa**: quien lo recibe por correo tiene que saber de qué obra es
    sin abrirlo.

    Y esta prueba encontró un defecto de verdad: `FileResponse` solo llama a `set_headers` cuando el
    contenido tiene `read`, así que con `iter([bytes])` se tragaba `as_attachment` y `filename` sin
    avisar y el BCF salía **sin `Content-Disposition`**.
    """
    con_lectura(client, proyectista)

    respuesta = client.get(reverse("documents:exportar-bcf", args=[proyecto.pk]))

    assert f"{proyecto.codigo}-observaciones.bcf" in respuesta["Content-Disposition"]


@pytest.mark.django_db
def test_la_lista_de_observaciones_ofrece_el_enlace_solo_si_hay_algo_que_exportar(
    client, proyectista, proyecto, organizacion, revisor
):
    """Un enlace a un BCF vacio se abre en Solibri y no muestra nada, que se lee como que la
    exportacion fallo. Asi que el enlace aparece **cuando el proyecto tiene observaciones**, no
    siempre."""
    con_lectura(client, proyectista)
    ruta = reverse("documents:exportar-bcf", args=[proyecto.pk])

    assert ruta not in client.get(reverse("documents:observaciones")).content.decode()

    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Ya hay algo que exportar",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
    )

    assert ruta in client.get(reverse("documents:observaciones")).content.decode()


# --- La camara del viewpoint: `F4.1` -------------------------------------------------


CAMARA = {
    "tipo": "perspectiva",
    "punto": [10.0, -10.0, 10.0],
    "direccion": [-0.57735, 0.57735, -0.57735],
    "arriba": [-0.408248, 0.408248, 0.816497],
    "campoVisual": 60.0,
}


@pytest.mark.django_db
def test_la_camara_guardada_viaja_al_viewpoint(observacion, tmp_path):
    """**Es lo que hace que el BCF abra mirando al problema** y no solo seleccionandolo. La
    camara la guarda el visor cuando alguien abre la observacion desde ahi, ya convertida al
    sistema del IFC.

    Y lo lee `bcf-client`, no nuestro propio codigo: si el orden de los hijos o el nombre de un
    elemento estuviera mal, esto es lo que lo dice.
    """
    observacion.punto_de_vista = CAMARA
    observacion.save(update_fields=["punto_de_vista"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.perspective_camera is not None
    assert vista.orthogonal_camera is None
    punto = vista.perspective_camera.camera_view_point
    assert (punto.x, punto.y, punto.z) == (10.0, -10.0, 10.0)
    assert vista.perspective_camera.field_of_view == 60.0


@pytest.mark.django_db
def test_la_camara_ortogonal_lleva_su_escala(observacion, tmp_path):
    """Una ortogonal sin `ViewToWorldScale` no se puede reproducir: la posicion dice desde donde se
    mira y nada dice cuanto se ve."""
    observacion.punto_de_vista = {
        "tipo": "ortogonal",
        "punto": [5.0, -5.0, 40.0],
        "direccion": [0.0, 0.0, -1.0],
        "arriba": [0.0, 1.0, 0.0],
        "escala": 25.0,
    }
    observacion.save(update_fields=["punto_de_vista"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.perspective_camera is None
    assert vista.orthogonal_camera is not None
    assert vista.orthogonal_camera.view_to_world_scale == 25.0


@pytest.mark.django_db
def test_el_elemento_sigue_seleccionado_con_camara(observacion, tmp_path):
    """La camara **se suma al ancla, no la reemplaza**. Sin el GUID, un viewpoint dice «mira hacia
    aca» sin decir que hay que mirar."""
    observacion.punto_de_vista = CAMARA
    observacion.save(update_fields=["punto_de_vista"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert [c.ifc_guid for c in vista.components.selection.component] == [GUID]
    assert vista.perspective_camera is not None


@pytest.mark.django_db
def test_una_camara_a_medias_guardada_a_mano_no_rompe_la_exportacion(observacion, tmp_path):
    """El formulario ya la valida, pero la base puede traer una vieja o editada por un script. Un
    BCF con media camara seria peor que uno sin ella, y una exportacion que revienta es lo peor de
    todo: se cae la de todo el proyecto por un registro."""
    observacion.punto_de_vista = {"tipo": "perspectiva", "punto": [1.0, 2.0, 3.0]}
    observacion.save(update_fields=["punto_de_vista"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    # Sin camara, y el ancla intacta: la observacion sigue valiendo.
    assert vista.perspective_camera is None
    assert [c.ifc_guid for c in vista.components.selection.component] == [GUID]


# --- Que se veia: la visibilidad del viewpoint, `F4.7` -------------------------------

OTRO_GUID = "1KJm3fT2n9wPz$Lq7BvXcD"


@pytest.mark.django_db
def test_sin_visibilidad_guardada_el_modelo_sale_entero(observacion, tmp_path):
    """**Es una decision, no una omision**, y la misma que con la camara: una observacion que no
    viene del visor —de una validacion IDS, de un clic sobre un PDF— no tiene una pantalla que
    describir. El elemento va seleccionado, no aislado: aislar decidiria por quien revisa que lo
    demas no importa, y a veces el problema es justamente el vecino."""
    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.components.visibility.default_visibility is True
    assert vista.components.visibility.exceptions.component == []


@pytest.mark.django_db
def test_lo_apagado_a_mano_viaja_como_excepcion(observacion, tmp_path):
    """El caso corriente: se apagan dos elementos que estorban y se anota. `DefaultVisibility` sigue
    en verdadero —se ve todo— y lo apagado se enumera."""
    observacion.visibilidad = {"porDefecto": True, "excepciones": [OTRO_GUID]}
    observacion.save(update_fields=["visibilidad"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.components.visibility.default_visibility is True
    assert [c.ifc_guid for c in vista.components.visibility.exceptions.component] == [OTRO_GUID]


@pytest.mark.django_db
def test_un_aislamiento_viaja_como_el_lado_corto(observacion, tmp_path):
    """**Es lo que antes se perdia entero.** Un hallazgo encontrado aislando una planta salia con el
    edificio completo encima: el BCF afirmaba algo falso y tapaba justo el problema. Aislar se
    escribe con `DefaultVisibility` en falso y lo que se ve como excepcion."""
    observacion.visibilidad = {"porDefecto": False, "excepciones": [GUID, OTRO_GUID]}
    observacion.save(update_fields=["visibilidad"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.components.visibility.default_visibility is False
    assert [c.ifc_guid for c in vista.components.visibility.exceptions.component] == [
        GUID,
        OTRO_GUID,
    ]
    # Y el ancla sigue intacta: la visibilidad se suma al elemento, no lo reemplaza.
    assert [c.ifc_guid for c in vista.components.selection.component] == [GUID]


@pytest.mark.django_db
def test_una_visibilidad_a_medias_guardada_a_mano_no_apaga_el_modelo(observacion, tmp_path):
    """La base puede traer una escrita por un script. **El fallo que hay que evitar es el peor
    posible**: `DefaultVisibility="false"` con la lista vacia es un viewpoint que se abre en negro,
    y el problema no se ve por culpa del archivo que venia a mostrarlo."""
    observacion.visibilidad = {"porDefecto": False, "excepciones": []}
    observacion.save(update_fields=["visibilidad"])

    documento = leer(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.components.visibility.default_visibility is True
    assert vista.components.visibility.exceptions.component == []
