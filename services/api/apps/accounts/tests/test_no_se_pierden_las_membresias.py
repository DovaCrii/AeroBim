"""**Corregir una cuenta borraba TODAS sus membresias, incluidas las que quien edita no ve.**

## El defecto

`EditarCuentaForm.guardar` hacia esto al cambiar de organizacion:

    Membresia.objects.filter(usuario=cuenta).delete()
    Membresia.objects.create(organizacion=organizacion, usuario=cuenta)

El `filter` no lleva `organizacion`: borra **todas**. Y el modelo permite varias a proposito —
`Membresia` tiene `UniqueConstraint(organizacion, usuario)`, o sea unicidad **del par**, y hay una
prueba que ejercita a alguien con dos (`test_pantallas_proyecto.py`). Existe porque hay gente que
trabaja para dos clientes.

## Por que es peor que perder un dato

Porque quien edita **no puede ver** la otra organizacion —`organizaciones_de` acota el desplegable a
las suyas— asi que el borrado ocurre fuera de su alcance, sin aparecer en la pantalla y sin nada que
lo mencione en el registro de auditoria, que anota «editar_cuenta».

Y lo que queda no es un error visible: la persona entra perfectamente, pasa el login, pasa los
permisos de modelo, y **ve todas las listas vacias sin un solo mensaje**. Es la trampa numero uno de
`docs/PILOTO.md`, provocada desde una pantalla que dice que corrige un apellido.

## El arreglo

El campo pasa a ser de seleccion multiple —el modelo ya lo permitia— y se aplica un **diferencial
acotado a lo que quien edita alcanza**: anade las marcadas, quita las desmarcadas, y **no toca
ninguna membresia de una organizacion que no puede ver**.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.urls import reverse

from apps.accounts import roles
from apps.core.models import Membresia, Organizacion


@pytest.fixture
def grupos(db):
    for nombre in (roles.COORDINADOR, roles.PROYECTISTA, roles.REVISOR, roles.DIRECCION):
        Group.objects.get_or_create(name=nombre)


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ prueba", slug="jej-prueba")


@pytest.fixture
def consorcio(db):
    return Organizacion.objects.create(nombre="Consorcio", slug="consorcio")


@pytest.fixture
def ajena(db):
    """La que quien edita **no ve**. Es donde se mide el daño."""
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


def _cuenta(username, *organizaciones, rol=roles.PROYECTISTA, **extra):
    usuario = get_user_model().objects.create_user(username=username, password="x" * 14, **extra)
    for organizacion in organizaciones:
        Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario.groups.add(Group.objects.get(name=rol))
    return usuario


@pytest.fixture
def quien_administra(db, grupos, jej, consorcio):
    """Trabaja para dos clientes, que es justo el caso que la multi-pertenencia existe para cubrir."""
    usuario = _cuenta("jefa", jej, consorcio, rol=roles.COORDINADOR, email="jefa@jej.cl")
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=("add_user", "change_user", "delete_user", "view_user"),
            content_type__app_label="auth",
        )
    )
    return usuario


@pytest.mark.django_db
def test_mover_a_alguien_no_le_borra_la_membresia_que_quien_edita_no_ve(
    client, quien_administra, jej, consorcio, ajena
):
    """**El defecto, medido.**

    `persona` trabaja para JEJ y para una empresa que quien administra no alcanza. Moverla al
    Consorcio le borraba las dos — y la de `ajena` es un borrado a ciegas: no sale en el
    desplegable, no sale en la pantalla, y no sale en el registro.
    """
    persona = _cuenta("pedro.silva", jej, ajena, email="pedro@jej.cl", first_name="Pedro")
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Pedro",
            "apellido": "Silva",
            "correo": "pedro@jej.cl",
            "organizacion": [consorcio.pk],
            "rol": roles.PROYECTISTA,
        },
    )

    assert respuesta.status_code == 302
    quedan = set(persona.organizaciones.values_list("slug", flat=True))
    assert "ajena" in quedan, (
        "se borró una membresía de una organización que quien edita ni siquiera ve"
    )
    assert "consorcio" in quedan, "no se aplicó el cambio que sí se pidió"
    assert "jej-prueba" not in quedan, "se pidió mover y siguió donde estaba"


@pytest.mark.django_db
def test_se_puede_estar_en_dos_a_la_vez_y_se_respeta(client, quien_administra, jej, consorcio):
    """**La multi-pertenencia deja de ser algo que solo la base sabe.**

    El desplegable era de una sola, así que la pantalla no podía ni enseñar ni conservar el caso
    que el modelo permite. Ahora se marcan las dos y quedan las dos.
    """
    persona = _cuenta("ana.rojas", jej, email="ana@jej.cl", first_name="Ana")
    client.force_login(quien_administra)

    client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Ana",
            "apellido": "Rojas",
            "correo": "ana@jej.cl",
            "organizacion": [jej.pk, consorcio.pk],
            "rol": roles.PROYECTISTA,
        },
    )

    assert set(persona.organizaciones.values_list("slug", flat=True)) == {
        "jej-prueba",
        "consorcio",
    }


@pytest.mark.django_db
def test_no_se_deja_a_nadie_sin_ninguna_membresia(client, quien_administra, jej):
    """**Sin membresía se entra y no se ve nada, sin un solo mensaje.**

    Con el campo de una sola organización esto no se podía pedir; con varias, desmarcarlas todas es
    un clic. El formulario tiene que decir que no, porque el resultado no se parece a un error:
    se parece a una aplicación vacía.
    """
    persona = _cuenta("luis.paz", jej, email="luis@jej.cl", first_name="Luis")
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Luis",
            "apellido": "Paz",
            "correo": "luis@jej.cl",
            "organizacion": [],
            "rol": roles.PROYECTISTA,
        },
    )

    assert respuesta.status_code == 200, "se guardó una cuenta sin ninguna organización"
    assert persona.organizaciones.count() == 1


@pytest.mark.django_db
def test_corregir_un_apellido_no_toca_ninguna_membresia(client, quien_administra, jej, ajena):
    """El caso de todos los días: no debe tener ningún efecto lateral."""
    persona = _cuenta("eva.luna", jej, ajena, email="eva@jej.cl", first_name="Eva")
    client.force_login(quien_administra)

    client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Eva",
            "apellido": "Luna Soto",
            "correo": "eva@jej.cl",
            "organizacion": [jej.pk],
            "rol": roles.PROYECTISTA,
        },
    )

    persona.refresh_from_db()
    assert persona.last_name == "Luna Soto"
    assert set(persona.organizaciones.values_list("slug", flat=True)) == {"jej-prueba", "ajena"}
