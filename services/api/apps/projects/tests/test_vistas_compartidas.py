"""Vistas del modelo que se le pueden pasar a otra persona.

**Las vistas guardadas vivian en el navegador y ahi se quedaban.** Sobrevivian a recargar la pagina
y no salian del equipo, asi que dos personas revisando el mismo modelo no podian mirar lo mismo —
que es exactamente en lo que consiste coordinar.

Lo que se prueba, mas alla del contrato de permisos: que la vista viaje **en el idioma del modelo**
—camara en el sistema del IFC, lo apagado por GUID— y no en el de la sesion que la guardo; que una
vista **sin camara no se guarde a medias**; y que **la borre quien la compartio y nadie mas**.
"""

import json

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.projects.models import Proyecto, VistaDeProyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"

CAMARA = {
    "tipo": "perspectiva",
    "punto": [10.0, -10.0, 10.0],
    "direccion": [-0.57735, 0.57735, -0.57735],
    "arriba": [-0.408248, 0.408248, 0.816497],
    "campoVisual": 60.0,
}

VISIBILIDAD = {"porDefecto": False, "excepciones": [GUID]}
CORTES = [{"normal": [0.0, 0.0, 1.0], "origen": [0.0, 0.0, 3.2]}]


def dar(user, *etiquetas):
    """El usuario con esos permisos y **recargado**.

    `User` cachea los permisos en la instancia: darle uno y seguir usando el mismo objeto deja la
    prueba mintiendo en verde.
    """
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def lista_de(proyecto):
    return reverse("projects_api:proyecto-vistas", args=[proyecto.pk])


def una(vista):
    return reverse("projects_api:vista", args=[vista.pk])


def cuerpo(**extra):
    return {"nombre": "Encuentro del eje C", "camara": json.dumps(CAMARA), **extra}


@pytest.fixture
def compartida(db, organizacion, proyecto, revisor):
    return VistaDeProyecto.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        nombre="Encuentro del eje C",
        autor=revisor,
        camara=CAMARA,
        visibilidad=VISIBILIDAD,
        cortes=CORTES,
    )


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_leerlas_pide_view_vistadeproyecto(client, proyectista, proyecto, compartida):
    """`LoginRequiredMixin` solo no alcanza: cada superficie de lectura pide su `view_*`."""
    ruta = lista_de(proyecto)

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "projects.view_vistadeproyecto"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_compartirla_pide_add_vistadeproyecto(client, proyectista, proyecto):
    """Leer y compartir son dos permisos: el mandante lee las vistas del proyecto y no las llena."""
    ruta = lista_de(proyecto)

    client.force_login(dar(proyectista, "projects.view_vistadeproyecto"))
    assert client.post(ruta, cuerpo(), content_type="application/json").status_code == 403

    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))
    assert client.post(ruta, cuerpo(), content_type="application/json").status_code == 201


@pytest.mark.django_db
def test_no_se_leen_las_vistas_de_otra_organizacion(client, proyectista, revisor):
    """El permiso dice «puede ver vistas», no «puede ver **estas**». Sin acotar el queryset, pedir
    a mano el id de otra obra responde con sus vistas."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )
    VistaDeProyecto.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        nombre="La reunion del otro cliente",
        autor=revisor,
        camara=CAMARA,
    )

    client.force_login(dar(proyectista, "projects.view_vistadeproyecto"))

    assert client.get(lista_de(proyecto_ajeno)).status_code == 404


@pytest.mark.django_db
def test_no_se_borra_una_vista_de_otra_organizacion(client, proyectista, revisor):
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )
    suya = VistaDeProyecto.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        nombre="La reunion del otro cliente",
        autor=revisor,
        camara=CAMARA,
    )

    client.force_login(dar(proyectista, "projects.delete_vistadeproyecto"))

    assert client.delete(una(suya)).status_code == 404


# --- Que la vista viaje en el idioma del modelo --------------------------------------


@pytest.mark.django_db
def test_la_vista_guarda_camara_visibilidad_y_cortes(client, proyectista, proyecto):
    """**Las tres cosas, o la vista del otro muestra algo distinto.** Con solo la cámara, quien la
    abre mira desde el mismo sitio y ve el edificio entero sin cortar."""
    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))

    respuesta = client.post(
        lista_de(proyecto),
        cuerpo(visibilidad=json.dumps(VISIBILIDAD), cortes=json.dumps(CORTES)),
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    guardada = VistaDeProyecto.objects.get(pk=respuesta.json()["id"])
    assert guardada.camara == CAMARA
    assert guardada.visibilidad == VISIBILIDAD
    assert guardada.cortes == CORTES


@pytest.mark.django_db
def test_una_vista_sin_camara_no_se_guarda_a_medias(client, proyectista, proyecto):
    """Guardarla dejaria una fila en la lista del otro que se pulsa y no hace nada: peor que no
    poder compartirla."""
    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))

    respuesta = client.post(
        lista_de(proyecto),
        {"nombre": "Sin camara", "camara": "{no es json"},
        content_type="application/json",
    )

    assert respuesta.status_code == 400
    assert not VistaDeProyecto.objects.filter(nombre="Sin camara").exists()


@pytest.mark.django_db
def test_una_vista_sin_nombre_tampoco(client, proyectista, proyecto):
    """El nombre es lo unico con lo que otra persona la reconoce en una lista."""
    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))

    respuesta = client.post(
        lista_de(proyecto), cuerpo(nombre="   "), content_type="application/json"
    )

    assert respuesta.status_code == 400


@pytest.mark.django_db
def test_un_corte_malo_no_se_lleva_la_vista_por_delante(client, proyectista, proyecto):
    """**Los cortes se descartan uno a uno, la camara entera.** Son independientes entre si, y
    perder una vista completa porque uno venia mal seria peor que aplicarla con los que valen."""
    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))

    respuesta = client.post(
        lista_de(proyecto),
        cuerpo(
            cortes=json.dumps(
                [
                    {"normal": [0.0, 0.0, 0.0], "origen": [0.0, 0.0, 1.0]},
                    CORTES[0],
                    {"normal": "x"},
                ]
            )
        ),
        content_type="application/json",
    )

    assert respuesta.status_code == 201
    assert VistaDeProyecto.objects.get(pk=respuesta.json()["id"]).cortes == CORTES


@pytest.mark.django_db
def test_la_lista_dice_de_quien_es_cada_vista(client, proyectista, proyecto, compartida):
    """**Es lo que decide si se ofrece el boton de borrar.** Calcularlo aca y no en el visor evita
    que la interfaz lo adivine comparando el nombre mostrado, que no es identidad."""
    client.force_login(dar(proyectista, "projects.view_vistadeproyecto"))

    datos = client.get(lista_de(proyecto)).json()

    [una_vista] = datos["vistas"]
    assert una_vista["nombre"] == compartida.nombre
    assert una_vista["esMia"] is False
    assert una_vista["camara"] == CAMARA
    assert una_vista["visibilidad"] == VISIBILIDAD
    assert una_vista["cortes"] == CORTES


# --- Borrar, y quien puede -----------------------------------------------------------


@pytest.mark.django_db
def test_la_borra_quien_la_compartio(client, revisor, compartida):
    client.force_login(dar(revisor, "projects.delete_vistadeproyecto"))

    assert client.delete(una(compartida)).status_code == 204
    compartida.refresh_from_db()
    assert compartida.is_active is False


@pytest.mark.django_db
def test_no_la_borra_otro_aunque_tenga_el_permiso(client, proyectista, compartida):
    """`delete_vistadeproyecto` dice «puede borrar vistas», no «puede borrar **estas**». Sin la
    comprobacion del autor, cualquiera quita la vista que otro preparo para una reunion."""
    client.force_login(dar(proyectista, "projects.delete_vistadeproyecto"))

    assert client.delete(una(compartida)).status_code == 403
    compartida.refresh_from_db()
    assert compartida.is_active is True


@pytest.mark.django_db
def test_una_borrada_desaparece_de_la_lista(client, revisor, proyecto, compartida):
    client.force_login(
        dar(revisor, "projects.delete_vistadeproyecto", "projects.view_vistadeproyecto")
    )
    client.delete(una(compartida))

    assert client.get(lista_de(proyecto)).json()["vistas"] == []


# --- Volver a compartir con el mismo nombre ------------------------------------------


@pytest.mark.django_db
def test_el_mismo_nombre_reemplaza_la_propia_en_vez_de_duplicarla(client, revisor, proyecto):
    """Dos vistas iguales en la lista no se distinguen, y quien vuelve a compartir con el mismo
    nombre esta corrigiendo la suya."""
    client.force_login(dar(revisor, "projects.add_vistadeproyecto"))
    ruta = lista_de(proyecto)

    client.post(ruta, cuerpo(), content_type="application/json")
    otra_camara = {**CAMARA, "punto": [20.0, -20.0, 20.0]}
    client.post(ruta, cuerpo(camara=json.dumps(otra_camara)), content_type="application/json")

    vistas = VistaDeProyecto.objects.filter(proyecto=proyecto, is_active=True)
    assert vistas.count() == 1
    assert vistas.first().camara["punto"] == [20.0, -20.0, 20.0]


@pytest.mark.django_db
def test_no_se_pisa_la_vista_de_otro_con_el_mismo_nombre(client, proyectista, proyecto, compartida):
    """Reemplazar la propia es corregir; reemplazar la de otro es borrarsela sin decirlo."""
    client.force_login(dar(proyectista, "projects.add_vistadeproyecto"))

    respuesta = client.post(lista_de(proyecto), cuerpo(), content_type="application/json")

    assert respuesta.status_code == 400
    compartida.refresh_from_db()
    assert compartida.camara == CAMARA
