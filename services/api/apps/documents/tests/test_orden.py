"""El orden de una lista de hallazgos, y el defecto que tenía: era alfabético.

**`ORDER BY prioridad` devuelve alta, baja, media.** Los valores guardados son palabras, así que la
base los ordena por letra y la prioridad **baja** se colaba en medio. Estaba en el informe desde que
se escribió y no se notó porque la obra de desarrollo no tenía ni un hallazgo de prioridad baja: lo
destapó hacer las columnas ordenables de la lista.

Lo que se prueba: el peso —que es donde se arregló—, que la pantalla y el informe **coincidan**
porque usan la misma tabla, que ordenar por una columna no se lleve por delante el filtro que había
puesto, y que un valor con mala forma en la URL no rompa la lista.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.documents.informe import Opciones, hallazgos
from apps.documents.models import Observacion
from apps.documents.orden import COLUMNAS, POR_DEFECTO, criterio

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def dar(user, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def anotar(proyecto, autor, responsable, titulo, prioridad, **extra):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        prioridad=prioridad,
        ifc_guid=GUID,
        **extra,
    )


def las_tres(proyecto, revisor, proyectista):
    """Una de cada prioridad, creadas **en el orden que delata el defecto**.

    Se crean baja, alta y media a propósito: si el orden saliera del `created_at` en vez de la
    prioridad, la prueba pasaría por casualidad.
    """
    anotar(proyecto, revisor, proyectista, "La baja", Observacion.BAJA)
    anotar(proyecto, revisor, proyectista, "La alta", Observacion.ALTA)
    anotar(proyecto, revisor, proyectista, "La media", Observacion.MEDIA)


# --- El peso, que es donde estaba el defecto ----------------------------------------


@pytest.mark.django_db
def test_el_informe_ordena_por_urgencia_y_no_por_letra(proyecto, revisor, proyectista):
    """**Esta es la prueba del defecto**: por letra saldría alta, baja, media."""
    las_tres(proyecto, revisor, proyectista)

    titulos = [una.titulo for una in hallazgos(proyecto, Opciones(orden="prioridad"))]

    assert titulos == ["La alta", "La media", "La baja"]


@pytest.mark.django_db
def test_la_pantalla_de_la_obra_ordena_igual_que_el_informe(client, proyecto, revisor, proyectista):
    """**No pueden discrepar**: son la misma pregunta con dos salidas."""
    las_tres(proyecto, revisor, proyectista)
    client.force_login(dar(proyectista, "projects.view_proyecto", "documents.view_observacion"))

    respuesta = client.get(reverse("projects:proyecto", args=[proyecto.pk]))
    en_pantalla = [una.titulo for una in respuesta.context["observaciones"]]
    en_papel = [una.titulo for una in hallazgos(proyecto, Opciones(orden="prioridad"))]

    assert en_pantalla == en_papel == ["La alta", "La media", "La baja"]


@pytest.mark.django_db
def test_el_estado_se_ordena_por_el_camino_del_hallazgo(client, proyecto, revisor, proyectista):
    """Por letra sería abierta, cerrada, descartada, respondida: lo cerrado antes de lo que espera
    respuesta, o sea al revés del camino que recorre un hallazgo."""
    anotar(proyecto, revisor, proyectista, "Cerrada", Observacion.MEDIA, estado=Observacion.CERRADA)
    anotar(proyecto, revisor, proyectista, "Abierta", Observacion.MEDIA)
    anotar(
        proyecto,
        revisor,
        proyectista,
        "Respondida",
        Observacion.MEDIA,
        estado=Observacion.RESPONDIDA,
    )
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(reverse("documents:observaciones"), {"orden": "estado"})

    assert [una.titulo for una in respuesta.context["observaciones"]] == [
        "Abierta",
        "Respondida",
        "Cerrada",
    ]


# --- Las columnas ordenables ---------------------------------------------------------


@pytest.mark.django_db
def test_pinchar_la_columna_que_manda_le_da_la_vuelta(client, proyecto, revisor, proyectista):
    las_tres(proyecto, revisor, proyectista)
    client.force_login(dar(proyectista, "documents.view_observacion"))

    normal = client.get(reverse("documents:observaciones"), {"orden": "prioridad"})
    vuelta = client.get(reverse("documents:observaciones"), {"orden": "-prioridad"})

    assert [o.titulo for o in normal.context["observaciones"]] == ["La alta", "La media", "La baja"]
    assert [o.titulo for o in vuelta.context["observaciones"]] == ["La baja", "La media", "La alta"]


@pytest.mark.django_db
def test_la_cabecera_de_la_columna_activa_dice_por_donde_va(client, proyecto, proyectista):
    """**Una tabla ordenada que no dice por dónde lo está** obliga a deducirlo leyendo las filas."""
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(reverse("documents:observaciones"), {"orden": "responsable"})
    columnas = {c["clave"]: c for c in respuesta.context["columnas"]}

    assert columnas["responsable"]["activa"] is True
    assert columnas["responsable"]["descendente"] is False
    # Y el siguiente clic en la misma le da la vuelta; en otra, empieza de nuevo.
    assert columnas["responsable"]["enlace"].startswith("?orden=-responsable")
    assert columnas["prioridad"]["enlace"].startswith("?orden=prioridad")
    assert 'aria-sort="ascending"' in respuesta.content.decode()


@pytest.mark.django_db
def test_ordenar_no_se_lleva_por_delante_el_filtro(client, proyecto, revisor, proyectista):
    """**Es el defecto clásico de una tabla ordenable**: se filtra, se ordena y vuelve la lista
    entera, y entonces el filtro parece no funcionar."""
    las_tres(proyecto, revisor, proyectista)
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(
        reverse("documents:observaciones"), {"orden": "vence", "prioridad": Observacion.ALTA}
    )
    enlace = next(c for c in respuesta.context["columnas"] if c["clave"] == "estado")["enlace"]

    assert "prioridad=alta" in enlace
    assert [o.titulo for o in respuesta.context["observaciones"]] == ["La alta"]


@pytest.mark.django_db
def test_un_orden_inventado_cae_al_de_por_defecto(client, proyecto, revisor, proyectista):
    """Quien pincha una cabecera no escribió ese parámetro a mano, así que un 400 no dice nada."""
    las_tres(proyecto, revisor, proyectista)
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(
        reverse("documents:observaciones"), {"orden": "; DROP TABLE documents_observacion"}
    )

    assert respuesta.status_code == 200
    assert respuesta.context["orden_columna"] == POR_DEFECTO
    assert [o.titulo for o in respuesta.context["observaciones"]] == [
        "La alta",
        "La media",
        "La baja",
    ]


def test_todas_las_columnas_tienen_desempate():
    """**Una columna sola deja el resto en un orden que cambia entre peticiones**, y una lista
    paginada que se reordena sola puede esconder una fila para siempre."""
    for clave, campos in COLUMNAS.items():
        assert len(campos) >= 2, clave
    # Y el criterio siempre termina en `pk`, que es lo que lo hace un orden total.
    for clave in COLUMNAS:
        assert criterio(clave)[2][-1] == "pk"


# --- Los filtros que pidió el usuario ------------------------------------------------


@pytest.mark.django_db
def test_se_filtra_por_prioridad_estado_y_obra(client, proyecto, revisor, proyectista):
    las_tres(proyecto, revisor, proyectista)
    cerrada = anotar(proyecto, revisor, proyectista, "Ya está", Observacion.ALTA)
    cerrada.cerrar(revisor, "Se corrigió el trazado.")
    client.force_login(dar(proyectista, "documents.view_observacion"))
    ruta = reverse("documents:observaciones")

    por_prioridad = client.get(ruta, {"prioridad": Observacion.ALTA})
    por_estado = client.get(ruta, {"estado": Observacion.CERRADA})
    por_obra = client.get(ruta, {"obra": proyecto.codigo})

    assert sorted(o.titulo for o in por_prioridad.context["observaciones"]) == [
        "La alta",
        "Ya está",
    ]
    assert [o.titulo for o in por_estado.context["observaciones"]] == ["Ya está"]
    assert len(por_obra.context["observaciones"]) == 4


@pytest.mark.django_db
def test_un_filtro_desconocido_no_vacia_la_lista(client, proyecto, revisor, proyectista):
    """**Una pantalla en blanco se lee como «no hay nada»**, no como «ese filtro no existe»."""
    las_tres(proyecto, revisor, proyectista)
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(reverse("documents:observaciones"), {"prioridad": "urgentisima"})

    assert len(respuesta.context["observaciones"]) == 3


@pytest.mark.django_db
def test_sin_fecha_de_vencimiento_va_al_final(client, proyecto, revisor, proyectista):
    """**Los dos motores no coinciden** con los nulos —SQLite los pone primero, PostgreSQL al
    final—, así que se dice explícitamente o la lista se ordena distinto en desarrollo que en
    producción."""
    manana = timezone.localdate() + timezone.timedelta(days=1)
    anotar(proyecto, revisor, proyectista, "Sin fecha", Observacion.MEDIA)
    anotar(proyecto, revisor, proyectista, "Con fecha", Observacion.MEDIA, vence=manana)
    client.force_login(dar(proyectista, "documents.view_observacion"))

    respuesta = client.get(reverse("documents:observaciones"), {"orden": "vence"})

    assert [o.titulo for o in respuesta.context["observaciones"]] == ["Con fecha", "Sin fecha"]


# --- El guardian, que es lo que habria cazado los tres que faltaban ------------------


def test_ninguna_consulta_ordena_por_vence_a_mano():
    """**`nulos_al_final` existia y tres consultas no pasaban por ella.**

    SQLite pone los `NULL` primero en ascendente y PostgreSQL al final. Se desarrolla en SQLite y se
    despliega en PostgreSQL, asi que un hallazgo sin fecha salia arriba en el equipo y abajo en la
    VM **sin que nada fallara**: la clase de diferencia que solo se ve en el sitio donde no se puede
    depurar.

    Las tres que faltaban eran la pantalla de la obra, el informe de coordinacion —PDF y CSV— y la
    lista que el visor pide por la API. Ninguna prueba de comportamiento las cubria, porque para
    verlo hay que correr contra PostgreSQL. Este guardian si las ve, y en cualquier motor: **busca
    el patron en el codigo** en vez de esperar a que la base lo delate.

    Si algun dia hace falta ordenar por `vence` sin `nulos_al_final`, la forma de decirlo es anadir
    el archivo a `PERMITIDOS` con el motivo, no borrar la prueba.
    """
    import re
    from pathlib import Path

    APPS = Path(__file__).resolve().parents[3]
    #: Donde vive el arreglo: es el unico sitio que puede nombrar `vence` en un `order_by`.
    PERMITIDOS = {"orden.py"}
    #: `order_by(...)` con `vence` dentro, en la misma linea o en las dos siguientes.
    ORDENA = re.compile(r"\.order_by\([^)]*\bvence\b", re.DOTALL)

    culpables = []
    for archivo in sorted(APPS.rglob("*.py")):
        partes = archivo.parts
        if "tests" in partes or "migrations" in partes or ".venv" in partes:
            continue
        if archivo.name in PERMITIDOS:
            continue
        if ORDENA.search(archivo.read_text(encoding="utf-8")):
            culpables.append(str(archivo.relative_to(APPS)))

    assert not culpables, (
        "ordenan por `vence` sin pasar por `nulos_al_final`, y eso se ordena distinto en "
        f"SQLite y en PostgreSQL: {culpables}"
    )
