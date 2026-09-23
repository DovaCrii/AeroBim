"""Archivar la lámina del visor **sin volver al portal**: `G.4`.

Hasta ahora, dejar archivada una planta del modelo eran seis pasos: generarla, descargar el PDF,
volver al portal, buscar el entregable, abrir el formulario de subir y elegir el archivo del disco.
Seis pasos para mover un archivo que el servidor acababa de fabricar.

## Lo que este archivo sujeta

1. **El contrato de permisos**, que es la parte no negociable: `add_revision` para publicar,
   `view_entregable` **y** `add_revision` para la lista de destinos, y aislamiento entre
   organizaciones en las dos — con su 404, no con un 403, porque quien pregunta por una obra ajena
   no debe enterarse de que existe.
2. **Que se pregunta antes de escribir.** La pantalla del portal guarda el archivo y después llama
   a `save()`, así que un correlativo repetido revienta **con el archivo ya en disco**. Aquí no, y
   hay una prueba que lo mide contando lo que quedó guardado.
3. **Que los bytes los escribe el servidor.** Nadie sube un archivo: llega la geometría y sale un
   PDF con el membrete de la casa. Es lo que hace que no haya nada que validar de nadie.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents import storage
from apps.documents.models import Entregable, Idoneidad, Revision
from apps.projects.models import Disciplina, Proyecto

#: Una hoja mínima con algo que dibujar, en la forma que manda el visor (`Viewer.sheetOf`).
HOJA = {
    "nombre": "Planta nivel 1",
    "segmentos": [[0.0, 0.0, 10.0, 0.0], [10.0, 0.0, 10.0, 6.0]],
    "textos": [],
    "recortada": False,
}


def _lo_guardado() -> set[str]:
    """Qué archivos hay en el almacén ahora mismo.

    **Es el único oráculo que demuestra el orden.** Que la respuesta sea 400 no dice nada sobre si
    el PDF llegó a fabricarse y a escribirse antes de fallar: eso solo lo dice el disco.
    """
    raiz = Path(settings.DOCUMENTS_DIR)
    return {str(uno.relative_to(raiz)) for uno in raiz.rglob("*") if uno.is_file()}


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def publicador(revisor):
    return dar(revisor, "documents.add_revision", "documents.view_entregable")


def publicar(client, entregable, **cambios):
    cuerpo = {"hoja": HOJA, "correlativo": "P01", "idoneidad": Idoneidad.S3, **cambios}
    return client.post(
        reverse("documents_api:publicar-lamina", args=[entregable.pk]),
        data=cuerpo,
        content_type="application/json",
    )


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_sin_add_revision_no_se_publica(client, entregable, revisor):
    """403 duro y no redirección: quien entró y no puede, tiene que saber que le falta un rol."""
    client.force_login(dar(revisor, "documents.view_revision"))

    assert publicar(client, entregable).status_code == 403


@pytest.mark.django_db
def test_sin_sesion_tampoco(client, entregable):
    assert publicar(client, entregable).status_code in (401, 403)


@pytest.mark.django_db
def test_no_se_publica_en_la_obra_de_otra_organizacion(client, db, publicador):
    """**404 y no 403**: quien pregunta por una obra ajena no debe enterarse de que existe."""
    otra = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto = Proyecto.objects.create(organizacion=otra, codigo="999-XX", nombre="Ajena")
    disciplina = Disciplina.objects.create(proyecto=proyecto, codigo="AR", nombre="Arquitectura")
    ajeno = Entregable.objects.create(
        organizacion=otra,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="999-XX-AR-P-001",
        titulo="No es tuyo",
        responsable=publicador,
        peso=1,
    )
    client.force_login(publicador)

    assert publicar(client, ajeno).status_code == 404
    assert Revision.objects.filter(entregable=ajeno).count() == 0


@pytest.mark.django_db
def test_la_lista_de_destinos_pide_los_dos_permisos(client, proyecto, revisor):
    """**Es una lectura, y además es el desplegable de un formulario de escribir.**

    Con solo `view_entregable` la lista saldría y el botón fallaría después; con solo `add_revision`
    se estaría entregando el catálogo de entregables a quien no puede leerlo.
    """
    ruta = reverse("documents_api:proyecto-donde-publicar", args=[proyecto.pk])

    client.force_login(dar(revisor, "documents.view_entregable"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(revisor, "documents.add_revision"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_la_lista_no_ensena_entregables_de_otra_organizacion(client, publicador):
    otra = Organizacion.objects.create(nombre="Ajena", slug="ajena-2")
    proyecto = Proyecto.objects.create(organizacion=otra, codigo="999-YY", nombre="Ajena")
    client.force_login(publicador)

    ruta = reverse("documents_api:proyecto-donde-publicar", args=[proyecto.pk])

    assert client.get(ruta).status_code == 404


@pytest.mark.django_db
def test_la_lista_trae_los_de_la_obra(client, proyecto, entregable, publicador):
    client.force_login(publicador)

    datos = client.get(reverse("documents_api:proyecto-donde-publicar", args=[proyecto.pk])).json()

    assert [uno["codigo"] for uno in datos["entregables"]] == [entregable.codigo]
    assert datos["entregables"][0]["disciplina"] == "AR"
    assert datos["cuantos"] == 1
    assert datos["recortada"] is False


@pytest.mark.django_db
def test_si_la_lista_se_corta_lo_dice(client, proyecto, disciplina, publicador, monkeypatch):
    """**Un desplegable cortado en silencio hace que alguien cree el entregable dos veces.**

    Quien no encuentra el suyo concluye que no está creado, no que la lista está recortada. Se
    cuenta antes de cortar, que es la misma lección que ya costó una pasada en las tarjetas de obra.
    """
    from apps.documents.api import DondePublicarAPI

    monkeypatch.setattr(DondePublicarAPI, "MAXIMO", 1)
    for numero in range(2):
        Entregable.objects.create(
            organizacion=proyecto.organizacion,
            proyecto=proyecto,
            disciplina=disciplina,
            codigo=f"716-LCD-AR-P-90{numero}",
            titulo=f"Otro {numero}",
            responsable=publicador,
            peso=1,
        )
    client.force_login(publicador)

    datos = client.get(reverse("documents_api:proyecto-donde-publicar", args=[proyecto.pk])).json()

    assert len(datos["entregables"]) == 1
    assert datos["cuantos"] == 2
    assert datos["recortada"] is True


# --- Que se archive de verdad --------------------------------------------------------


@pytest.mark.django_db
def test_publicar_deja_una_revision_con_su_pdf(client, entregable, publicador):
    client.force_login(publicador)

    respuesta = publicar(client, entregable)

    assert respuesta.status_code == 201, respuesta.content
    revision = Revision.objects.get(entregable=entregable, correlativo="P01")
    assert revision.subida_por == publicador
    assert revision.idoneidad == Idoneidad.S3
    # **Los bytes los escribió el servidor**, y son un PDF de verdad: el sha y el tamaño salen de
    # ellos, no de lo que dijera nadie.
    guardado = storage.leer(revision.clave_archivo)
    assert guardado.startswith(b"%PDF")
    assert revision.tamano_bytes == len(guardado)
    assert len(revision.sha256) == 64
    # Y el nombre con el que se descarga dice qué es sin abrirlo.
    assert entregable.codigo in revision.nombre_original
    assert revision.nombre_original.endswith(".pdf")


@pytest.mark.django_db
def test_la_revision_publicada_pasa_a_ser_la_vigente(client, entregable, publicador, proyectista):
    """Es el comportamiento de `Revision.save()`, y se comprueba porque esta puerta es nueva."""
    vieja = Revision.objects.create(
        entregable=entregable,
        correlativo="P00",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
        clave_archivo="p/e/vieja.pdf",
        nombre_original="vieja.pdf",
        sha256="a" * 64,
    )
    client.force_login(publicador)

    publicar(client, entregable)

    vieja.refresh_from_db()
    assert vieja.es_vigente is False
    assert Revision.objects.get(entregable=entregable, correlativo="P01").es_vigente is True


# --- Que se pregunte antes de escribir -----------------------------------------------


@pytest.mark.django_db
def test_un_correlativo_repetido_no_deja_basura(client, entregable, publicador, proyectista):
    """**El defecto que la pantalla del portal sí tiene**, y que aquí no se reproduce.

    `SubirRevisionView` guarda el archivo y **después** llama a `revision.save()`. Con el
    `UniqueConstraint` sobre `(entregable, correlativo)`, un correlativo repetido revienta con un
    `IntegrityError` y el archivo se queda en disco sin ninguna fila que lo nombre.

    Aquí se pregunta antes, y se mide por lo único que lo demuestra: **qué quedó guardado**.
    """
    Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=proyectista,
        clave_archivo="p/e/ya-estaba.pdf",
        nombre_original="ya-estaba.pdf",
        sha256="b" * 64,
    )
    antes = _lo_guardado()
    client.force_login(publicador)

    respuesta = publicar(client, entregable)

    assert respuesta.status_code == 400
    assert respuesta.json()["codigo"] == "correlativo-repetido"
    assert _lo_guardado() == antes, "se guardó el PDF de una publicación que no llegó a hacerse"
    assert Revision.objects.filter(entregable=entregable).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("cambio", "codigo"),
    [
        ({"correlativo": ""}, "correlativo-vacio"),
        ({"correlativo": "X" * 21}, "correlativo-largo"),
        ({"idoneidad": "ZZ"}, "idoneidad-desconocida"),
        ({"hoja": {"nombre": "Vacía", "segmentos": [], "textos": []}}, "hoja-vacia"),
    ],
)
def test_lo_que_se_rechaza_dice_por_que_con_un_codigo(
    client, entregable, publicador, cambio, codigo
):
    """**El código es lo que el visor puede mirar sin leer castellano.**

    Es la misma decisión que ya toma `CargaRechazada` con las subidas: los mensajes cambian, y
    `correlativo-repetido` no.
    """
    client.force_login(publicador)

    respuesta = publicar(client, entregable, **cambio)

    assert respuesta.status_code == 400
    assert respuesta.json()["codigo"] == codigo
    assert Revision.objects.filter(entregable=entregable).count() == 0


@pytest.mark.django_db
def test_sin_hoja_no_se_publica(client, entregable, publicador):
    client.force_login(publicador)

    respuesta = client.post(
        reverse("documents_api:publicar-lamina", args=[entregable.pk]),
        data={"correlativo": "P01", "idoneidad": Idoneidad.S3},
        content_type="application/json",
    )

    assert respuesta.status_code == 400
    assert respuesta.json()["codigo"] == "sin-hoja"


@pytest.mark.django_db
def test_el_correlativo_se_normaliza_igual_que_en_el_portal(client, entregable, publicador):
    """`  p01 ` y `P01` son el mismo correlativo, y si no se normaliza conviven los dos."""
    client.force_login(publicador)

    publicar(client, entregable, correlativo="  p01 ")

    assert Revision.objects.filter(entregable=entregable, correlativo="P01").exists()
