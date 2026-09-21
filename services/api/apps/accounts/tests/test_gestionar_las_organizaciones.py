"""**«Cómo puedo mover a mi equipo o ligarlo a las organizaciones, y poder borrar una.»**

La pantalla de organizaciones era **una tabla de tres columnas sin un solo enlace**: nombre,
identificador y cuantos miembros. Decia **cuantos** y no **quienes**; no habia detalle, ni forma de
meter o sacar a nadie, ni de borrarla. Para mover a una persona habia que abrir «Usuarios y roles» y
cruzarlo a mano, y para deshacerse de una organizacion de pruebas no habia ninguna via.

## Las dos invariantes que estas pruebas sujetan

**Nadie se queda sin ninguna organizacion.** Sin membresia, la persona entra perfectamente, pasa los
permisos, y **ve todas las listas vacias sin un solo mensaje**: la trampa numero uno de
`docs/PILOTO.md`. Sacar a alguien de la ultima se rechaza a proposito.

**Y una organizacion no se borra con gente dentro**, aunque la base lo permita. Nueve de las once
claves ajenas son `PROTECT` y frenan las obras; **`Membresia` es `CASCADE`** y no frena nada, asi
que borrar una organizacion sin obras pero con personas las dejaria a todas invisibles de golpe. El
rastro las cuenta por eso.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion


@pytest.fixture
def otra_empresa(db):
    return Organizacion.objects.create(nombre="Consorcio", slug="consorcio")


@pytest.fixture
def quien_administra(db, organizacion, otra_empresa):
    usuario = get_user_model().objects.create_user(
        username="jefa", password="x" * 14, email="jefa@jej.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    Membresia.objects.create(organizacion=otra_empresa, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=(
                "view_organizacion",
                "change_organizacion",
                "delete_organizacion",
                "add_organizacion",
            ),
            content_type__app_label="core",
        ),
        *Permission.objects.filter(codename="view_user", content_type__app_label="auth"),
    )
    return get_user_model().objects.get(pk=usuario.pk)


# ── La ficha ───────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_ficha_dice_quienes_estan_dentro_y_no_solo_cuantos(
    client, organizacion, quien_administra, proyectista
):
    """**El dato que hace falta antes de mover a nadie.**"""
    client.force_login(quien_administra)

    html = client.get(reverse("core:organizacion", args=[organizacion.pk])).content.decode()

    assert proyectista.get_username() in html
    assert quien_administra.get_username() in html


@pytest.mark.django_db
def test_no_se_abre_la_ficha_de_una_organizacion_ajena(client, quien_administra):
    """**`organizaciones_de` y no el acotador general.** Ese devuelve la lista entera para este
    modelo —`Organizacion` no tiene un campo `organizacion`, es ella misma— y esa trampa ya costó
    una vez."""
    ajena = Organizacion.objects.create(nombre="De otros", slug="de-otros")
    client.force_login(quien_administra)

    assert client.get(reverse("core:organizacion", args=[ajena.pk])).status_code == 404


@pytest.mark.django_db
def test_la_lista_lleva_a_la_ficha(client, organizacion, quien_administra):
    """La tabla no llevaba a ninguna parte: se veia el numero de miembros y nada mas."""
    client.force_login(quien_administra)

    html = client.get(reverse("core:organizaciones")).content.decode()

    assert reverse("core:organizacion", args=[organizacion.pk]) in html


# ── Mover al equipo ────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_se_mete_a_alguien_en_otra_organizacion(
    client, organizacion, otra_empresa, quien_administra, proyectista
):
    """Lo que se pidió como «mover a mi equipo»."""
    client.force_login(quien_administra)

    client.post(
        reverse("core:miembros-de-organizacion", args=[otra_empresa.pk]),
        {"usuario": proyectista.pk},
    )

    assert set(proyectista.organizaciones.values_list("slug", flat=True)) == {
        organizacion.slug,
        "consorcio",
    }


@pytest.mark.django_db
def test_no_se_saca_a_nadie_de_su_ultima_organizacion(
    client, organizacion, quien_administra, proyectista
):
    """**La invariante que más importa de este archivo.**

    Sin ninguna membresía, la persona entra, pasa los permisos, y ve todas las listas vacías sin un
    solo mensaje. Es la trampa número uno de `docs/PILOTO.md`, y desde esta pantalla sería un clic.
    """
    client.force_login(quien_administra)

    client.post(
        reverse("core:miembros-de-organizacion", args=[organizacion.pk]),
        {"usuario": proyectista.pk, "accion": "quitar"},
    )

    assert proyectista.organizaciones.count() == 1, "se dejó a alguien sin ninguna organización"


@pytest.mark.django_db
def test_si_esta_en_dos_si_se_puede_sacar_de_una(
    client, organizacion, otra_empresa, quien_administra, proyectista
):
    """Con una segunda membresía, sacarla de aquí no la deja invisible."""
    Membresia.objects.create(organizacion=otra_empresa, usuario=proyectista)
    client.force_login(quien_administra)

    client.post(
        reverse("core:miembros-de-organizacion", args=[organizacion.pk]),
        {"usuario": proyectista.pk, "accion": "quitar"},
    )

    assert list(proyectista.organizaciones.values_list("slug", flat=True)) == ["consorcio"]


@pytest.mark.django_db
def test_no_se_puede_meter_a_alguien_que_no_se_alcanza(client, otra_empresa, quien_administra):
    """Sin el acotado, el desplegable sería un directorio de todas las cuentas del sistema."""
    ajena = Organizacion.objects.create(nombre="De otros", slug="de-otros")
    forastero = get_user_model().objects.create_user(username="forastero", password="x" * 14)
    Membresia.objects.create(organizacion=ajena, usuario=forastero)
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("core:miembros-de-organizacion", args=[otra_empresa.pk]),
        {"usuario": forastero.pk},
    )

    assert respuesta.status_code == 404
    assert forastero.organizaciones.count() == 1


# ── Borrar ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_una_organizacion_vacia_se_borra(client, quien_administra):
    """Sin obras y sin nadie dentro, que es el estado en el que queda una de pruebas al vaciarla.

    **Va con superusuaria** porque `organizaciones_de` acota por membresía: alguien que no está
    dentro no la alcanza, y estar dentro es justamente lo que hace que no esté vacía. El caso real
    es el mismo — quien administra el sistema la borra después de que todos hayan salido.
    """
    vacia = Organizacion.objects.create(nombre="De pruebas", slug="de-pruebas")
    quien_administra.is_superuser = True
    quien_administra.save(update_fields=["is_superuser"])
    client.force_login(get_user_model().objects.get(pk=quien_administra.pk))

    respuesta = client.post(reverse("core:borrar-organizacion", args=[vacia.pk]))

    assert respuesta.status_code == 302
    assert not Organizacion.objects.filter(pk=vacia.pk).exists()


@pytest.mark.django_db
def test_una_organizacion_con_gente_dentro_no_se_borra(
    client, organizacion, quien_administra, proyectista
):
    """**La base no lo frena, y ese es el punto.**

    Las obras van con `PROTECT` y sí frenan. `Membresia` es `CASCADE`: borrar una organización sin
    obras pero con personas dentro las dejaría a todas sin membresía de golpe, entrando y viendo
    todo vacío. Por eso el rastro las cuenta.
    """
    client.force_login(quien_administra)

    respuesta = client.post(reverse("core:borrar-organizacion", args=[organizacion.pk]))

    assert respuesta.status_code == 302
    assert Organizacion.objects.filter(pk=organizacion.pk).exists()


@pytest.mark.django_db
def test_la_pantalla_dice_que_hay_dentro_antes_de_borrar(
    client, organizacion, quien_administra, proyecto
):
    """Quien borra tiene que ver qué se lleva por delante **antes**, no descubrirlo por un 500."""
    client.force_login(quien_administra)

    html = client.get(reverse("core:borrar-organizacion", args=[organizacion.pk])).content.decode()

    assert "aviso alerta" in html


@pytest.mark.django_db
def test_borrar_pide_su_permiso(client, organizacion, proyectista):
    """`delete_organizacion` no lo reparte ningún rol de aplicación: es de administración."""
    proyectista.user_permissions.add(
        Permission.objects.get(codename="view_organizacion", content_type__app_label="core")
    )
    client.force_login(get_user_model().objects.get(pk=proyectista.pk))

    assert (
        client.get(reverse("core:borrar-organizacion", args=[organizacion.pk])).status_code == 403
    )


# ── Ver quién está dónde ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_usuarios_y_roles_dice_a_que_organizacion_pertenece_cada_uno(
    client, organizacion, quien_administra, proyectista
):
    """Sin esta columna, decidir un traslado obligaba a cruzar dos pantallas a mano."""
    quien_administra.user_permissions.add(
        Permission.objects.get(codename="view_user", content_type__app_label="auth")
    )
    client.force_login(get_user_model().objects.get(pk=quien_administra.pk))

    html = client.get(reverse("accounts:usuarios-roles")).content.decode()

    assert organizacion.nombre in html


@pytest.mark.django_db
def test_quien_no_tiene_organizacion_sale_marcado(client, organizacion, quien_administra):
    """**Un hueco se lee como un dato que falta; esto es un dato que hay que arreglar.**

    Esa persona entra perfectamente y ve todas las listas vacías sin un solo mensaje.
    """
    suelta = get_user_model().objects.create_user(username="suelta", password="x" * 14)
    Membresia.objects.create(organizacion=organizacion, usuario=suelta)
    Membresia.objects.filter(usuario=suelta).delete()

    quien_administra.is_superuser = True
    quien_administra.save(update_fields=["is_superuser"])
    client.force_login(get_user_model().objects.get(pk=quien_administra.pk))

    html = client.get(reverse("accounts:usuarios-roles")).content.decode()

    assert "suelta" in html
    assert "distintivo aviso" in html
