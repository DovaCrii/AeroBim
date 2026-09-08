"""Lo que se dibujo sobre el modelo, dentro del viewpoint: `F4.5`.

**El BCF ya llevaba a donde mirar, que se veia y una foto. Lo que no llevaba es que senalaba quien
anoto.** El titulo dice «la viga del eje C choca con el ducto» y en la pantalla habia una cota de
4 cm entre las dos: ese numero es el hallazgo, y se quedaba en el navegador.

El oraculo del archivo sigue siendo `bcf-client`: es quien lee el `<Lines>` del viewpoint y saca
sus extremos. Y el orden de los hijos importa —`Components`, camaras, `Lines`— asi que si estuviera
mal, es esto lo que lo dice.
"""

import json

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.bcf import exportar
from apps.documents.marcado import LARGO_MAXIMO, MAXIMO_LINEAS, leer
from apps.documents.models import Idoneidad, Observacion, Revision

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"

#: Una cota de 4 cm, que es el caso que motiva la fila entera.
UNA_COTA = [{"inicio": [1.0, -2.0, 3.0], "fin": [1.04, -2.0, 3.0]}]

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


# --- Lo que se acepta y lo que no ----------------------------------------------------


def test_una_cota_pasa_entera():
    assert leer(json.dumps(UNA_COTA)) == UNA_COTA


def test_acepta_la_lista_ya_decodificada():
    """Las cuatro piezas del viewpoint llegan por el mismo cuerpo, y leerlas de formas distintas es
    como se cuela un dato sin validar el dia que alguien cambia el cliente."""
    assert leer(UNA_COTA) == UNA_COTA


def test_sin_dato_no_hay_marcado():
    """Es el estado normal: la mayoria de las observaciones se abren sin haber medido nada."""
    assert leer(None) == []
    assert leer("") == []
    assert leer([]) == []


def test_un_json_roto_no_revienta():
    assert leer("{no es json") == []
    assert leer(json.dumps({"inicio": [0, 0, 0]})) == []


def test_descarta_los_segmentos_mal_formados_y_conserva_los_demas():
    """Los segmentos son independientes entre si, al contrario que la camara: perder el marcado
    completo porque uno venia mal seria peor que dibujar los que valen."""
    leidas = leer(
        json.dumps(
            [
                {"inicio": [0, 0], "fin": [1, 1, 1]},
                UNA_COTA[0],
                {"inicio": "x", "fin": [1, 1, 1]},
                {"fin": [1, 1, 1]},
            ]
        )
    )
    assert leidas == UNA_COTA


def test_un_segmento_de_largo_cero_no_dibuja_nada():
    """Dos clics en el mismo sitio. No se ve y ensucia el archivo."""
    assert leer(json.dumps([{"inicio": [1, 1, 1], "fin": [1, 1, 1]}])) == []


def test_un_punto_absurdo_se_descarta():
    """Mil kilometros no es un limite fisico: es la marca de que algo se leyo en las unidades
    equivocadas, que es el mismo criterio que aplica la camara."""
    assert leer(json.dumps([{"inicio": [0, 0, 0], "fin": [9e9, 0, 0]}])) == []
    assert leer(json.dumps([{"inicio": [0, 0, 0], "fin": [float("inf"), 0, 0]}])) == []


def test_una_lista_mas_larga_que_el_tope_se_descarta_entera():
    """**No se recorta.** Recortar dejaria el contorno de un area abierto, o sea una forma que
    nadie dibujo, que es peor que no dibujar nada."""
    demasiadas = [UNA_COTA[0]] * (MAXIMO_LINEAS + 1)
    assert leer(demasiadas) == []


def test_un_json_enorme_no_se_llega_a_parsear():
    assert leer("x" * (LARGO_MAXIMO + 1)) == []


# --- En el BCF -----------------------------------------------------------------------


@pytest.fixture
def observacion(db, organizacion, proyecto, revisor, proyectista):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga del eje C choca con el ducto",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )


def leer_bcf(contenido: bytes, tmp_path):
    from bcf.v2.bcfxml import BcfXml

    ruta = tmp_path / "salida.bcf"
    ruta.write_bytes(contenido)
    return BcfXml.load(ruta)


@pytest.mark.django_db
def test_las_lineas_viajan_al_viewpoint_y_bcf_client_las_lee(observacion, tmp_path):
    """**Es el oraculo que importa**: no que nosotros escribamos un `<Lines>`, sino que el lector de
    buildingSMART lo encuentre en su sitio de la secuencia y saque los extremos."""
    observacion.marcado = UNA_COTA
    observacion.save(update_fields=["marcado"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.lines is not None
    [linea] = vista.lines.line
    assert (linea.start_point.x, linea.start_point.y, linea.start_point.z) == (1.0, -2.0, 3.0)
    assert (linea.end_point.x, linea.end_point.y, linea.end_point.z) == (1.04, -2.0, 3.0)


@pytest.mark.django_db
def test_el_marcado_convive_con_la_camara_y_el_orden_no_lo_rompe(observacion, tmp_path):
    """**El orden de los hijos importa y es la tercera vez en este archivo.** El XSD declara
    `Components`, camaras, `Lines`: al reves, un lector estricto rechaza el viewpoint entero."""
    observacion.punto_de_vista = CAMARA
    observacion.marcado = UNA_COTA
    observacion.save(update_fields=["punto_de_vista", "marcado"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    vista = list(tema.viewpoints.values())[0].visualization_info

    assert vista.perspective_camera is not None
    assert vista.lines is not None
    assert len(vista.lines.line) == 1
    # Y el ancla sigue intacta: el marcado se suma al elemento, no lo reemplaza.
    assert [c.ifc_guid for c in vista.components.selection.component] == [GUID]


@pytest.mark.django_db
def test_un_contorno_cerrado_viaja_con_todos_sus_lados(observacion, tmp_path):
    """Un area de cuatro vertices son cuatro segmentos, y el ultimo vuelve al primero: con tres
    saldria abierta, que es una forma que nadie dibujo."""
    cuadrado = [
        {"inicio": [0.0, 0.0, 0.0], "fin": [2.0, 0.0, 0.0]},
        {"inicio": [2.0, 0.0, 0.0], "fin": [2.0, 2.0, 0.0]},
        {"inicio": [2.0, 2.0, 0.0], "fin": [0.0, 2.0, 0.0]},
        {"inicio": [0.0, 2.0, 0.0], "fin": [0.0, 0.0, 0.0]},
    ]
    observacion.marcado = cuadrado
    observacion.save(update_fields=["marcado"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())
    lineas = list(tema.viewpoints.values())[0].visualization_info.lines.line

    assert len(lineas) == 4
    primero = lineas[0].start_point
    ultimo = lineas[-1].end_point
    assert (ultimo.x, ultimo.y, ultimo.z) == (primero.x, primero.y, primero.z)


@pytest.mark.django_db
def test_sin_marcado_no_se_escribe_el_elemento(observacion, tmp_path):
    """Un `<Lines>` vacio no dice nada y hay lectores que lo tratan como archivo mal formado."""
    import zipfile
    from io import BytesIO

    contenido = exportar([observacion], "716-LCD")
    with zipfile.ZipFile(BytesIO(contenido)) as zip_bcf:
        assert "<Lines" not in zip_bcf.read(f"{observacion.pk}/viewpoint.bcfv").decode()

    documento = leer_bcf(contenido, tmp_path)
    [tema] = list(documento.topics.values())
    assert list(tema.viewpoints.values())[0].visualization_info.lines is None


@pytest.mark.django_db
def test_un_marcado_a_medias_guardado_a_mano_no_tumba_la_exportacion(observacion, tmp_path):
    """La base puede traer uno escrito por un script. Una exportacion que revienta es lo peor de
    todo: se cae la del proyecto entero por un registro."""
    observacion.marcado = [{"inicio": [1, 2]}, {"fin": "x"}, "ni un dict"]
    observacion.save(update_fields=["marcado"])

    documento = leer_bcf(exportar([observacion], "716-LCD"), tmp_path)
    [tema] = list(documento.topics.values())

    assert list(tema.viewpoints.values())[0].visualization_info.lines is None
    assert tema.topic.title == observacion.titulo


# --- Desde la tarjeta del visor ------------------------------------------------------


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


@pytest.mark.django_db
def test_la_nota_desde_el_visor_guarda_su_marcado(client, proyectista, revision_ifc):
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        reverse("documents_api:revision-observaciones", args=[revision_ifc.pk]),
        {"titulo": "Choca con el ducto", "guid": GUID, "marcado": json.dumps(UNA_COTA)},
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).marcado == UNA_COTA


@pytest.mark.django_db
def test_un_marcado_malo_no_impide_guardar_el_hallazgo(client, proyectista, revision_ifc):
    """Mismo criterio que la camara y la instantanea: lo que hay que conservar es el hallazgo."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        reverse("documents_api:revision-observaciones", args=[revision_ifc.pk]),
        {"titulo": "Choca", "guid": GUID, "marcado": "{no es json"},
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).marcado == []


@pytest.mark.django_db
def test_sin_guid_no_se_guarda_marcado(client, proyectista, revision_ifc):
    """Una nota sin ancla en el modelo no tiene viewpoint, asi que no hay donde dibujar."""
    client.force_login(dar(proyectista, "documents.add_observacion"))

    respuesta = client.post(
        reverse("documents_api:revision-observaciones", args=[revision_ifc.pk]),
        {"titulo": "Algo de esta revision", "guid": "", "marcado": json.dumps(UNA_COTA)},
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert Observacion.objects.get(pk=respuesta.json()["id"]).marcado == []
