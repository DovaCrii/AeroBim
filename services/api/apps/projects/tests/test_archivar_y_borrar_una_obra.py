"""**Una aplicación que solo sabe crear no se puede ensayar.**

El usuario lo dijo probando, que es el mejor momento para encontrarlo: «necesito una forma de
borrar o archivar proyectos, ya que aún estoy en modo pruebas y no tengo cómo quitarlos».

## Lo que había, y por qué nadie lo vio

`Proyecto` hereda `is_active` de `BaseModel`, y **todos los listados ya filtraban por él** desde el
primer día: la lista de obras, la portada, los desplegables. O sea que el archivado estaba
construido entero y **nada podía ponerlo**.

Es exactamente lo que pasó con la columna «Desactivado» de las cuentas, que se pintaba sin que
existiera el botón — dos veces el mismo patrón: media función terminada, la mitad que se ve.

## Archivar y borrar son dos cosas

- **La obra terminada** con dos años de revisiones emitidas: eso *es* el registro documental, y lo
  que hay que hacer con ella es conservarla fuera de la vista. Se archiva, y se puede deshacer.
- **La obra de prueba** creada hace diez minutos: no tiene nada dentro. Archivarla dejaría basura
  para siempre en una pantalla que se mira todos los días.

Lo que impide confundirlas es que se pregunta **antes** qué hay dentro.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable
from apps.projects.models import Disciplina, Proyecto


def _persona(username, organizacion, permisos):
    usuario = get_user_model().objects.create_user(username=username, password="x" * 14)
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=permisos, content_type__app_label__in=("projects", "documents")
        )
    )
    return usuario


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ", slug="jej")


@pytest.fixture
def ajena(db):
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


@pytest.fixture
def obra(jej):
    return Proyecto.objects.create(organizacion=jej, codigo="0001", nombre="Piloto")


@pytest.fixture
def coordinadora(db, jej):
    return _persona(
        "coordinadora",
        jej,
        ("change_proyecto", "delete_proyecto", "view_proyecto", "add_entregable"),
    )


# ── Archivar ────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_archivar_la_saca_de_la_lista_y_no_borra_nada(client, jej, obra, coordinadora):
    """**Lo que el archivado hace ya funcionaba: los listados filtran por `is_active` desde el
    primer día.** Lo que no existía era ponerlo."""
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    Entregable.objects.create(
        organizacion=jej,
        proyecto=obra,
        disciplina=disciplina,
        codigo="E1",
        titulo="E1",
        responsable=coordinadora,
    )
    client.force_login(coordinadora)

    client.post(reverse("projects:archivar-proyecto", kwargs={"pk": obra.pk}))

    obra.refresh_from_db()
    assert obra.is_active is False
    # **Se mira la lista, no el HTML.** El código sale también en el mensaje de «archivada», así
    # que buscar la cadena en la página daba un falso fallo — y con otro texto habría dado un falso
    # acierto. Lo que se comprueba es qué obras trae la consulta.
    listado = client.get(reverse("projects:proyectos"))
    assert obra not in listado.context["proyectos"]
    # **Y no se pierde nada**: el registro documental de una obra terminada es justo lo que hay que
    # conservar. Archivar no es borrar.
    assert Entregable.objects.filter(proyecto=obra).exists()


@pytest.mark.django_db
def test_se_puede_volver_a_abrir(client, obra, coordinadora):
    """Es lo que la separa de borrar, y por eso es la operación normal."""
    client.force_login(coordinadora)

    client.post(reverse("projects:archivar-proyecto", kwargs={"pk": obra.pk}))
    client.post(reverse("projects:archivar-proyecto", kwargs={"pk": obra.pk}))

    obra.refresh_from_db()
    assert obra.is_active is True


@pytest.mark.django_db
def test_no_se_archiva_la_obra_de_otra_empresa(client, ajena, coordinadora):
    """Por el listado acotado y no por `pk`: la invariante que ya estuvo rota en siete vistas."""
    de_otros = Proyecto.objects.create(organizacion=ajena, codigo="AJENA", nombre="Ajena")
    client.force_login(coordinadora)

    respuesta = client.post(reverse("projects:archivar-proyecto", kwargs={"pk": de_otros.pk}))

    assert respuesta.status_code == 404
    de_otros.refresh_from_db()
    assert de_otros.is_active is True


# ── Borrar ──────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_una_obra_de_prueba_vacia_se_borra(client, obra, coordinadora):
    """El caso de quien está ensayando: nada dentro, nada que perder."""
    client.force_login(coordinadora)

    confirmacion = client.get(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk}))
    assert confirmacion.context["rastro"] == []

    client.post(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk}))

    assert not Proyecto.objects.filter(pk=obra.pk).exists()


@pytest.mark.django_db
def test_una_obra_con_trabajo_dentro_no_se_borra_y_se_dice_que_hay(client, jej, obra, coordinadora):
    """**Y se dice qué hay**, no solo que no se puede: el motivo es lo que hace entender que la
    respuesta correcta es archivar."""
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    Entregable.objects.create(
        organizacion=jej,
        proyecto=obra,
        disciplina=disciplina,
        codigo="E1",
        titulo="E1",
        responsable=coordinadora,
    )
    client.force_login(coordinadora)

    confirmacion = client.get(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk}))
    assert confirmacion.context["rastro"], "no detecta que la obra tiene trabajo dentro"

    respuesta = client.post(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk}))

    assert respuesta.status_code == 302
    assert Proyecto.objects.filter(pk=obra.pk).exists()


@pytest.mark.django_db
def test_las_disciplinas_no_cuentan_como_trabajo(client, obra, coordinadora):
    """**Y si contaran, ninguna obra recién creada sería borrable** — que es justo el caso.

    Una disciplina es andamio de la propia obra, no trabajo de nadie: se crea al dar de alta el
    primer entregable y no tiene autor ni fecha de emisión.
    """
    Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    client.force_login(coordinadora)

    client.post(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk}))

    assert not Proyecto.objects.filter(pk=obra.pk).exists()


@pytest.mark.django_db
def test_borrar_pide_su_propio_permiso(client, jej, obra):
    """`delete_proyecto` y no `change_proyecto`: quien archiva no tiene por qué poder borrar."""
    solo_archiva = _persona("archiva", jej, ("change_proyecto", "view_proyecto"))
    client.force_login(solo_archiva)

    assert (
        client.get(reverse("projects:borrar-proyecto", kwargs={"pk": obra.pk})).status_code == 403
    )
    assert Proyecto.objects.filter(pk=obra.pk).exists()


@pytest.mark.django_db
def test_no_se_borra_la_obra_de_otra_empresa(client, ajena, coordinadora):
    de_otros = Proyecto.objects.create(organizacion=ajena, codigo="AJENA", nombre="Ajena")
    client.force_login(coordinadora)

    assert (
        client.post(reverse("projects:borrar-proyecto", kwargs={"pk": de_otros.pk})).status_code
        == 404
    )
    assert Proyecto.objects.filter(pk=de_otros.pk).exists()
