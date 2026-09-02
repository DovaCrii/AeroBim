"""Importar un BCF de otra oficina: `F4.6`, la vuelta del ciclo.

**El oraculo es `bcf-client`, que es otra implementacion.** Es la misma regla que la exportacion,
al reves: alli escribimos a mano y leemos con la libreria; aca la libreria **escribe** y leemos
nosotros. Si hicieramos las dos mitades, la prueba solo diria que somos consistentes con nosotros
mismos, que es exactamente lo que no se quiere saber.

Y una prueba de ida y vuelta, que es la que importa para el caso real: el mandante devuelve el
mismo archivo que le mandamos, con su respuesta dentro.
"""

import datetime as dt
import tempfile
import uuid
import zipfile
import zlib
from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from bcf.v2.bcfxml import BcfXml
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.messages import get_messages
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents import bcf_importar, storage
from apps.documents.bcf import exportar
from apps.documents.models import Comentario, Observacion
from apps.projects.models import Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def png(ancho: int = 2, alto: int = 2) -> bytes:
    """Un PNG válido de verdad, escrito a mano. Mismo criterio que `test_instantanea.py`.

    **Se construye en vez de guardarse como fixture**: un binario en el árbol es algo que nadie
    vuelve a mirar, y así la prueba dice de qué está hecho lo que compara.
    """

    def trozo(etiqueta: bytes, datos: bytes) -> bytes:
        cuerpo = etiqueta + datos
        return len(datos).to_bytes(4, "big") + cuerpo + zlib.crc32(cuerpo).to_bytes(4, "big")

    cabecera = ancho.to_bytes(4, "big") + alto.to_bytes(4, "big") + bytes([8, 2, 0, 0, 0])
    crudo = b"".join(b"\x00" + b"\xff\x00\x00" * ancho for _ in range(alto))
    return (
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", cabecera)
        + trozo(b"IDAT", zlib.compress(crudo))
        + trozo(b"IEND", b"")
    )


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def bcf_ajeno(
    *,
    titulo="Choque de bandeja con viga",
    descripcion="La bandeja no pasa por el hueco.",
    autor="otra@oficina.cl",
    estado="Open",
    prioridad="High",
    guid_elemento=GUID,
    con_camara=True,
) -> tuple[bytes, str]:
    """Un BCF escrito por `bcf-client`. Devuelve los bytes y el GUID del tema.

    **Lo escribe la libreria y no nosotros**, que es todo el sentido de esta prueba.
    """
    documento = BcfXml.create_new("Obra del mandante")
    manejador = documento.add_topic(titulo, descripcion, autor)
    manejador.topic.priority = prioridad
    manejador.topic.topic_status = estado
    if con_camara:
        manejador.add_viewpoint_from_point_and_guids(np.array([10.0, -4.0, 2.5]), guid_elemento)
    # `bcf-client` solo sabe escribir a una ruta, no a un `BytesIO`.
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "ajeno.bcf"
        documento.save(ruta)
        documento.close()
        return ruta.read_bytes(), manejador.topic.guid


# --- Leer el formato, sin base de datos ----------------------------------------------


def test_se_lee_un_bcf_que_escribio_otra_herramienta():
    contenido, guid = bcf_ajeno()

    temas = bcf_importar.leer(contenido)

    assert len(temas) == 1
    tema = temas[0]
    assert tema.guid == guid
    assert tema.titulo == "Choque de bandeja con viga"
    assert tema.descripcion == "La bandeja no pasa por el hueco."
    assert tema.autor == "otra@oficina.cl"
    assert tema.estado == "abierta"
    assert tema.prioridad == "alta"


def test_el_viewpoint_no_se_llama_viewpoint_bcfv():
    """**El hallazgo que motivo la mitad del lector.**

    Nosotros escribimos `viewpoint.bcfv`; `bcf-client` escribe `<guid-del-viewpoint>.bcfv`. Dar el
    nombre por supuesto no revienta —deja en silencio cada camara y cada GUID de elemento fuera—,
    que es la peor forma de fallar: el archivo entra, parece bien, y no trae nada de lo que se
    venia a buscar.
    """
    contenido, _ = bcf_ajeno()

    with zipfile.ZipFile(BytesIO(contenido)) as z:
        nombres = [n for n in z.namelist() if n.endswith(".bcfv")]
    assert nombres, "bcf-client dejó de escribir un viewpoint: la prueba ya no mide nada"
    assert not any(n.endswith("/viewpoint.bcfv") for n in nombres)

    # Y aun asi se lee: el nombre sale del markup.
    tema = bcf_importar.leer(contenido)[0]
    assert tema.ifc_guid == GUID
    assert tema.camara["tipo"] == "perspectiva"
    assert tema.camara["punto"] == [15.0, 1.0, 7.5]


def test_un_estado_vacio_no_deja_un_estado_invalido():
    """`bcf-client` escribe `TopicStatus=""` si nadie lo pone, y `""` no está en las opciones."""
    contenido, _ = bcf_ajeno(estado="")

    assert bcf_importar.leer(contenido)[0].estado == Observacion.ABIERTA


def test_la_fecha_sin_zona_se_lee_con_zona():
    """`bcf-client` escribe `2026-09-02T12:02:09.580527`, sin `Z`.

    Guardar una fecha ingenua con `USE_TZ` es un aviso de Django y una hora corrida.
    """
    contenido, _ = bcf_ajeno()

    creado = bcf_importar.leer(contenido)[0].creado_en
    assert creado is not None
    assert creado.tzinfo is not None


def test_lo_que_no_es_un_bcf_se_rechaza_con_un_motivo():
    for basura, esperado in (
        (b"", "vacío"),
        (b"<Markup></Markup>", "ZIP"),
        (b"PK\x03\x04 esto no es un zip", "ZIP"),
    ):
        with pytest.raises(bcf_importar.BcfInvalido) as fallo:
            bcf_importar.leer(basura)
        assert esperado in str(fallo.value)


def test_un_zip_sin_markup_no_es_un_bcf():
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w") as z:
        z.writestr("leeme.txt", "hola")

    with pytest.raises(bcf_importar.BcfInvalido) as fallo:
        bcf_importar.leer(memoria.getvalue())
    assert "markup.bcf" in str(fallo.value)


def test_una_version_3_se_rechaza_diciendo_que_pedir():
    """**Leer una 3.0 a medias es peor que rechazarla**: cambia la estructura del ZIP."""
    contenido, _ = bcf_ajeno()
    memoria = BytesIO()
    with zipfile.ZipFile(BytesIO(contenido)) as viejo, zipfile.ZipFile(memoria, "w") as nuevo:
        for info in viejo.infolist():
            if info.filename == "bcf.version":
                continue
            nuevo.writestr(info.filename, viejo.read(info.filename))
        nuevo.writestr("bcf.version", '<?xml version="1.0"?><Version VersionId="3.0"/>')

    with pytest.raises(bcf_importar.BcfInvalido) as fallo:
        bcf_importar.leer(memoria.getvalue())
    assert "2.1" in str(fallo.value)


def test_la_bomba_de_descompresion_se_para_antes_de_descomprimir():
    """Un ZIP de kilobytes que descomprime a gigas. `zipfile` lo hace sin quejarse."""
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("uno/markup.bcf", b"\0" * (bcf_importar.BYTES_MAXIMOS_DESCOMPRIMIDO + 1))

    with pytest.raises(bcf_importar.BcfInvalido) as fallo:
        bcf_importar.leer(memoria.getvalue())
    assert "grande" in str(fallo.value)


def test_una_entidad_externa_no_se_expande():
    """El XML llega de otra oficina: es el dato hostil del que avisa bandit en `bcf.py`."""
    ataque = (
        '<?xml version="1.0"?>'
        '<!DOCTYPE Markup [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        "<Markup><Topic Guid='x'><Title>&xxe;</Title></Topic></Markup>"
    )
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w") as z:
        z.writestr("uno/markup.bcf", ataque)

    with pytest.raises(bcf_importar.BcfInvalido):
        bcf_importar.leer(memoria.getvalue())


# --- Guardarlos ----------------------------------------------------------------------


@pytest.mark.django_db
def test_un_tema_ajeno_se_crea_como_observacion(proyecto, revisor):
    contenido, guid = bcf_ajeno()

    resultado = bcf_importar.importar(proyecto, contenido, revisor)

    assert resultado.creadas == 1
    observacion = Observacion.objects.get(proyecto=proyecto)
    assert observacion.titulo == "Choque de bandeja con viga"
    assert observacion.ifc_guid == GUID
    assert observacion.prioridad == Observacion.ALTA
    assert observacion.punto_de_vista["tipo"] == "perspectiva"
    # El GUID del tema **es** la clave: es lo que cierra el ciclo.
    assert str(observacion.pk) == guid


@pytest.mark.django_db
def test_importar_dos_veces_no_duplica(proyecto, revisor):
    """**Es el caso real, no un borde**: el mandante reenvía el hilo entero cada vez."""
    contenido, _ = bcf_ajeno()

    bcf_importar.importar(proyecto, contenido, revisor)
    segunda = bcf_importar.importar(proyecto, contenido, revisor)

    assert Observacion.objects.filter(proyecto=proyecto).count() == 1
    assert segunda.creadas == 0
    assert segunda.sin_cambios == 1


@pytest.mark.django_db
def test_el_correo_del_archivo_solo_alcanza_a_la_gente_de_la_organizacion(
    proyecto, revisor, proyectista
):
    """**Un correo dentro de un archivo de fuera no autoriza a atribuir nada.**

    Sin acotar por organización, quien manda el BCF elige a nombre de quién queda una observación
    en una obra que no es suya.
    """
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    forastero = get_user_model().objects.create_user(
        username="forastero", password="una-clave-larga-99", email="forastero@otra.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=forastero)

    contenido, _ = bcf_ajeno(autor="forastero@otra.cl")
    bcf_importar.importar(proyecto, contenido, revisor)

    observacion = Observacion.objects.get(proyecto=proyecto)
    # Cae en quien importa, no en el forastero cuyo correo venía escrito.
    assert observacion.autor == revisor

    # Y el de casa sí se reconoce.
    contenido, _ = bcf_ajeno(autor="proyectista@ejemplo.cl", titulo="Otro hallazgo")
    bcf_importar.importar(proyecto, contenido, revisor)
    assert Observacion.objects.get(proyecto=proyecto, titulo="Otro hallazgo").autor == proyectista


def bcf_con_foto(datos: bytes, *, nombre="snapshot.png", declarar=True) -> bytes:
    """Un BCF a mano con su instantánea, para probar la foto que entra."""
    markup = (
        '<?xml version="1.0"?><Markup>'
        '<Topic Guid="8f2c1e6a-0d44-4b71-9f3a-2c5e7a91b004" TopicStatus="Open">'
        "<Title>Viene con foto</Title><Priority>Normal</Priority>"
        '</Topic><Viewpoints Guid="v1"><Viewpoint>viewpoint.bcfv</Viewpoint>'
        + (f"<Snapshot>{nombre}</Snapshot>" if declarar else "")
        + "</Viewpoints></Markup>"
    )
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w") as z:
        z.writestr("bcf.version", '<?xml version="1.0"?><Version VersionId="2.1"/>')
        z.writestr("tema/markup.bcf", markup)
        z.writestr(f"tema/{nombre}", datos)
    return memoria.getvalue()


def test_la_foto_del_tema_entra_si_es_un_png_de_verdad():
    """**Se comprueba la firma y no la extensión.** Esto llega de fuera y se escribe en el disco.

    Es la misma regla con la que se cae un `virus.exe` renombrado a `plano.pdf`, y la instantánea
    de un BCF acaba además dentro del ZIP que se manda a otra oficina.
    """
    assert bcf_importar.leer(bcf_con_foto(png()))[0].instantanea == png()

    # Un ejecutable con el nombre de la foto no entra.
    assert bcf_importar.leer(bcf_con_foto(b"MZ\x90\x00 esto es un .exe"))[0].instantanea is None


def test_la_foto_se_encuentra_aunque_el_markup_no_la_declare():
    """`snapshot.png` es lo que usa casi todo el mundo, y hay markups que no lo dicen."""
    tema = bcf_importar.leer(bcf_con_foto(png(), declarar=False))[0]

    assert tema.instantanea == png()


@pytest.mark.django_db
def test_la_foto_importada_queda_en_el_almacen(proyecto, revisor):
    bcf_importar.importar(proyecto, bcf_con_foto(png()), revisor)

    observacion = Observacion.objects.get(proyecto=proyecto)
    assert observacion.instantanea
    assert storage.leer(observacion.instantanea) == png()


@pytest.mark.django_db
def test_un_tema_sin_titulo_se_salta_con_aviso(proyecto, revisor):
    """**Un tema perdido en silencio es peor que el aviso de que se perdió.**

    Sin título no hay nada que enseñar en una lista, así que no entra; lo que no puede pasar es que
    nadie se entere.
    """
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w") as z:
        z.writestr("bcf.version", '<?xml version="1.0"?><Version VersionId="2.1"/>')
        z.writestr(
            "sin-titulo/markup.bcf",
            '<?xml version="1.0"?><Markup><Topic Guid="6b1f0c2d-9a34-4e88-b7c1-0d5a2e93f117">'
            "<Priority>Normal</Priority></Topic></Markup>",
        )

    resultado = bcf_importar.importar(proyecto, memoria.getvalue(), revisor)

    assert resultado.creadas == 0
    assert len(resultado.avisos) == 1
    assert "sin título" in resultado.avisos[0]
    assert not Observacion.objects.filter(proyecto=proyecto).exists()


# --- La ida y la vuelta, que es el caso que motiva todo ------------------------------


@pytest.mark.django_db
def test_el_bcf_que_mandamos_vuelve_con_la_respuesta_y_no_se_duplica(
    proyecto, organizacion, revisor, proyectista
):
    """**El ciclo completo**: se exporta, el otro lado contesta y cierra, y vuelve.

    Lo que tiene que pasar: la misma observación, con el comentario nuevo y cerrada. Lo que no
    tiene que pasar: una observación nueva, que es lo que hace un importador que inventa
    identificadores.
    """
    nuestra = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="El pilar choca con el conducto",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )
    ida = exportar(Observacion.objects.filter(pk=nuestra.pk), str(proyecto))

    # El mandante contesta y cierra. Se edita el ZIP igual que lo haría su herramienta.
    vuelta = BytesIO()
    with zipfile.ZipFile(BytesIO(ida)) as viejo, zipfile.ZipFile(vuelta, "w") as nuevo:
        for info in viejo.infolist():
            crudo = viejo.read(info.filename)
            if info.filename.endswith("markup.bcf"):
                respuesta = (
                    f'<Comment Guid="{uuid.uuid4()}">'
                    "<Date>2026-08-30T09:15:00Z</Date>"
                    "<Author>jefe@mandante.cl</Author>"
                    "<Comment>Revisado en obra, se corrigió el trazado.</Comment>"
                    "</Comment>"
                )
                texto = crudo.decode("utf-8").replace('TopicStatus="Open"', 'TopicStatus="Closed"')
                texto = texto.replace("</Markup>", respuesta + "</Markup>")
                crudo = texto.encode("utf-8")
            nuevo.writestr(info.filename, crudo)

    resultado = bcf_importar.importar(proyecto, vuelta.getvalue(), revisor)

    assert Observacion.objects.filter(proyecto=proyecto).count() == 1
    assert resultado.actualizadas == 1
    assert resultado.creadas == 0
    assert resultado.comentarios == 1

    nuestra.refresh_from_db()
    assert nuestra.estado == Observacion.CERRADA
    assert nuestra.cerrada_en is not None
    comentario = nuestra.comentarios.get()
    assert comentario.texto == "Revisado en obra, se corrigió el trazado."
    # **La fecha real y no la de hoy**: `created_at` es `auto_now_add` y hay que forzarla, o el
    # hilo cuenta la historia en el orden equivocado.
    assert comentario.created_at == dt.datetime(2026, 8, 30, 9, 15, tzinfo=dt.UTC)


@pytest.mark.django_db
def test_la_vuelta_no_pisa_el_trabajo_local(proyecto, organizacion, revisor, proyectista):
    """**Lo que vuelve es la respuesta, no una versión mejor del hallazgo.**

    Reescribir título, descripción y prioridad con lo que diga un archivo de fuera borra el
    trabajo local sin preguntar, y lo hace en silencio.
    """
    nuestra = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="El pilar choca con el conducto",
        descripcion="Medido en obra: 4 cm de solape.",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )
    ida = exportar(Observacion.objects.filter(pk=nuestra.pk), str(proyecto))

    vuelta = BytesIO()
    with zipfile.ZipFile(BytesIO(ida)) as viejo, zipfile.ZipFile(vuelta, "w") as nuevo:
        for info in viejo.infolist():
            crudo = viejo.read(info.filename)
            if info.filename.endswith("markup.bcf"):
                texto = crudo.decode("utf-8")
                texto = texto.replace(
                    "<Title>El pilar choca con el conducto</Title>", "<Title>otra cosa</Title>"
                )
                texto = texto.replace("<Priority>High</Priority>", "<Priority>Low</Priority>")
                crudo = texto.encode("utf-8")
            nuevo.writestr(info.filename, crudo)

    bcf_importar.importar(proyecto, vuelta.getvalue(), revisor)

    nuestra.refresh_from_db()
    assert nuestra.titulo == "El pilar choca con el conducto"
    assert nuestra.prioridad == Observacion.ALTA
    assert nuestra.descripcion == "Medido en obra: 4 cm de solape."


@pytest.mark.django_db
def test_el_mismo_comentario_dos_veces_no_dobla_el_hilo(
    proyecto, organizacion, revisor, proyectista
):
    nuestra = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Un hallazgo",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
        ifc_guid=GUID,
    )
    Comentario.objects.create(observacion=nuestra, autor=revisor, texto="Lo miro mañana.")
    ida = exportar(
        Observacion.objects.filter(pk=nuestra.pk).prefetch_related("comentarios"), str(proyecto)
    )

    bcf_importar.importar(proyecto, ida, revisor)
    bcf_importar.importar(proyecto, ida, revisor)

    assert nuestra.comentarios.count() == 1


@pytest.mark.django_db
def test_cerrada_vuelve_como_cerrada_y_nunca_como_descartada(
    proyecto, organizacion, revisor, proyectista
):
    """La ida colapsa `cerrada` y `descartada` en `Closed`, así que la vuelta no las distingue.

    **Ante la duda se elige lo reversible**: `descartada` silencia el conflicto para siempre en las
    corridas de interferencias, y eso no lo decide un archivo de fuera.
    """
    descartada = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Un falso positivo",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.BAJA,
        ifc_guid=GUID,
    )
    descartada.descartar(revisor, "El pilar apoya contra el muro.")
    ida = exportar(Observacion.objects.filter(pk=descartada.pk), str(proyecto))

    # Se borra el estado local para simular que el tema llega de fuera por primera vez.
    Observacion.objects.filter(pk=descartada.pk).delete()
    bcf_importar.importar(proyecto, ida, revisor)

    assert Observacion.objects.get(proyecto=proyecto).estado == Observacion.CERRADA


# --- La pantalla ---------------------------------------------------------------------


@pytest.mark.django_db
def test_importar_pide_add_observacion(client, proyectista, proyecto):
    """Importar **crea** observaciones: no lo hace quien solo puede leerlas."""
    ruta = reverse("documents:importar-bcf", args=[proyecto.pk])
    contenido, _ = bcf_ajeno()

    def subir():
        archivo = BytesIO(contenido)
        archivo.name = "respuesta.bcf"
        return client.post(ruta, {"archivo": archivo})

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert subir().status_code == 403

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert subir().status_code == 302
    assert Observacion.objects.filter(proyecto=proyecto).count() == 1


@pytest.mark.django_db
def test_no_se_importa_en_el_proyecto_de_otra_organizacion(client, proyectista):
    """El permiso dice «puede crear observaciones», no «puede crearlas **aquí**»."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    suyo = Proyecto.objects.create(organizacion=ajena, codigo="999-XXX", nombre="Obra de otro")
    contenido, _ = bcf_ajeno()

    client.force_login(dar(proyectista, "documents.add_observacion"))
    archivo = BytesIO(contenido)
    archivo.name = "respuesta.bcf"

    respuesta = client.post(reverse("documents:importar-bcf", args=[suyo.pk]), {"archivo": archivo})

    assert respuesta.status_code == 404
    assert not Observacion.objects.filter(proyecto=suyo).exists()


@pytest.mark.django_db
def test_un_archivo_que_no_es_bcf_lo_dice_y_no_deja_nada(client, proyectista, proyecto):
    client.force_login(dar(proyectista, "documents.add_observacion"))
    archivo = BytesIO(b"esto es un correo, no un bcf")
    archivo.name = "respuesta.bcf"

    respuesta = client.post(
        reverse("documents:importar-bcf", args=[proyecto.pk]), {"archivo": archivo}
    )

    # Se vuelve a la pantalla del proyecto con el motivo, no se revienta.
    assert respuesta.status_code == 302
    assert not Observacion.objects.filter(proyecto=proyecto).exists()
    # No se sigue la redirección: la pantalla del proyecto pide `view_proyecto`, que este rol no
    # tiene, y seguirla mediría ese permiso en vez del mensaje.
    mensajes = [str(m) for m in get_messages(respuesta.wsgi_request)]
    assert any("ZIP" in m for m in mensajes)
