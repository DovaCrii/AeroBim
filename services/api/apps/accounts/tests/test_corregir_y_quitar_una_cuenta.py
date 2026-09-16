"""**Una cuenta se podía crear y no corregir.** Y quitarla no existía por ninguna vía.

## El agujero, dicho entero

La pantalla de usuarios dejaba hacer dos cosas: crear y generar otra clave. Ni editar, ni
desactivar, ni borrar. Un apellido con una letra de menos, un rol equivocado o —el caro— **un correo
mal tecleado** se quedaban así para siempre.

El correo es el caro porque **no falla**: la aplicación dice «enviado», el aviso se va a una
dirección que no existe y nadie se entera. Los otros dos molestan; ese miente.

El camino que había era el `/admin/` técnico, y dejó de publicarse el 2026-09-15 al salir AeroBim a
internet. O sea que este agujero lo abrió del todo un arreglo de seguridad correcto — y esa es la
forma en que dos cambios buenos por separado cierran una puerta entre los dos.

## Borrar sí, pero casi nunca

Son dos casos que desde la lista se parecen y no tienen nada que ver:

- La cuenta de hace dos minutos con el correo mal. No ha entrado, no ha subido nada. Borrarla no
  borra nada de nadie.
- La persona que lleva meses. Sus revisiones y sus transmittals **son** el registro documental: en
  ISO 19650, quién emitió es tanto dato como qué se emitió.

Lo que hace que el segundo caso no pueda pasar por accidente es que los enlaces al registro son
`PROTECT` y la base se niega. La pantalla se limita a preguntarlo antes, para que la respuesta sea
una explicación y no un error 500.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.urls import reverse

from apps.accounts import roles
from apps.core.models import Membresia, Organizacion


@pytest.fixture(autouse=True)
def grupos(db):
    """Los roles, como los deja `bootstrap_roles`.

    `Direccion` va también, y no es de adorno: es lo que hace posible comprobar que cambiar de rol
    **no desuscribe a nadie del resumen ejecutivo** — el efecto que `groups.clear()` tendría y que
    nadie relacionaría con esta pantalla.
    """
    for nombre in (
        roles.COORDINADOR,
        roles.PROYECTISTA,
        roles.REVISOR,
        roles.MANDANTE,
        roles.DIRECCION,
    ):
        Group.objects.get_or_create(name=nombre)


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ prueba", slug="jej-prueba")


@pytest.fixture
def otra_empresa(db):
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


def _cuenta(username, organizacion, rol=roles.PROYECTISTA, **extra):
    U = get_user_model()
    u = U.objects.create_user(username=username, password="x" * 14, **extra)
    Membresia.objects.create(organizacion=organizacion, usuario=u)
    u.groups.add(Group.objects.get(name=rol))
    return u


@pytest.fixture
def quien_administra(db, jej):
    u = _cuenta("jefa", jej, roles.COORDINADOR, email="jefa@jej.cl")
    u.user_permissions.add(
        *Permission.objects.filter(
            codename__in=("add_user", "change_user", "delete_user", "view_user"),
            content_type__app_label="auth",
        )
    )
    return u


# ── Corregir ────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_se_corrige_el_correo_mal_tecleado(client, jej, quien_administra):
    """**El caso que lo motivó todo.** Un correo mal escrito no da ningún error: la aplicación dice
    «enviado» y el aviso se va a una dirección que no existe."""
    persona = _cuenta("pedro.silva", jej, email="pedro.slva@jej.cl", first_name="Pedro")
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Pedro",
            "apellido": "Silva",
            "correo": "pedro.silva@jej.cl",
            "organizacion": jej.pk,
            "rol": roles.PROYECTISTA,
        },
    )

    assert respuesta.status_code == 302
    persona.refresh_from_db()
    assert persona.email == "pedro.silva@jej.cl"
    assert persona.last_name == "Silva"


@pytest.mark.django_db
def test_guardar_sin_cambiar_el_correo_no_choca_consigo_misma(client, jej, quien_administra):
    """El error clásico de copiar una validación de unicidad de «crear» a «editar».

    Sin el `exclude(pk=…)`, corregir solo el apellido se rechazaría con «ya hay una cuenta con ese
    correo» — y la cuenta que choca **es ella misma**.
    """
    persona = _cuenta("ana.lopez", jej, email="ana@jej.cl")
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Ana",
            "apellido": "López",
            "correo": "ana@jej.cl",
            "organizacion": jej.pk,
            "rol": roles.PROYECTISTA,
        },
    )

    assert respuesta.status_code == 302, "rechazó el correo que ya era suyo"
    persona.refresh_from_db()
    assert persona.last_name == "López"


@pytest.mark.django_db
def test_cambiar_el_rol_no_se_lleva_por_delante_el_grupo_de_notificacion(
    client, jej, quien_administra
):
    """**`groups.clear()` habría desuscrito a alguien del resumen por corregirle un apellido.**

    `Direccion` no es un rol: es la lista de quién recibe el resumen ejecutivo, y vive en la misma
    tabla de grupos. Vaciarla entera al cambiar de rol es un efecto que nadie relacionaría con esta
    pantalla — el correo deja de llegar y no hay nada que lo explique.
    """
    persona = _cuenta("carla", jej, roles.PROYECTISTA, email="carla@jej.cl")
    persona.groups.add(Group.objects.get(name=roles.DIRECCION))
    client.force_login(quien_administra)

    client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": persona.pk}),
        {
            "nombre": "Carla",
            "apellido": "Rojas",
            "correo": "carla@jej.cl",
            "organizacion": jej.pk,
            "rol": roles.REVISOR,
        },
    )

    nombres = set(persona.groups.values_list("name", flat=True))
    assert nombres == {roles.REVISOR, roles.DIRECCION}


@pytest.mark.django_db
def test_no_se_edita_a_alguien_de_otra_empresa(client, jej, otra_empresa, quien_administra):
    """La invariante que ya estuvo rota en siete vistas: **por el listado acotado, no por `pk`**.

    Con el correo de otra persona cambiado, el paso siguiente es reiniciarle la clave y entrar en su
    cuenta. No es una fuga de lectura: es una toma de control.
    """
    ajena = _cuenta("de.otra", otra_empresa, email="de.otra@ajena.cl")
    client.force_login(quien_administra)

    respuesta = client.post(
        reverse("accounts:editar-cuenta", kwargs={"pk": ajena.pk}),
        {
            "nombre": "Mía",
            "apellido": "Ahora",
            "correo": "mia@jej.cl",
            "organizacion": jej.pk,
            "rol": roles.COORDINADOR,
        },
    )

    assert respuesta.status_code == 404
    ajena.refresh_from_db()
    assert ajena.email == "de.otra@ajena.cl"


# ── Desactivar ──────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_desactivar_impide_entrar_y_no_borra_nada(client, jej, quien_administra):
    """La columna «Desactivado» se pintaba desde el primer día **y nada podía ponerla**."""
    persona = _cuenta("se.va", jej, email="se.va@jej.cl")
    client.force_login(quien_administra)

    client.post(reverse("accounts:activar-cuenta", kwargs={"pk": persona.pk}))

    persona.refresh_from_db()
    assert persona.is_active is False
    assert get_user_model().objects.filter(pk=persona.pk).exists(), "desactivar no es borrar"

    # Y se puede deshacer, que es lo que la distingue de borrar.
    client.post(reverse("accounts:activar-cuenta", kwargs={"pk": persona.pk}))
    persona.refresh_from_db()
    assert persona.is_active is True


@pytest.mark.django_db
def test_nadie_se_desactiva_a_si_mismo(client, jej, quien_administra):
    """Es quedarse fuera en el acto — y si era la única cuenta que administra, dejar el sistema sin
    quien lo administre."""
    client.force_login(quien_administra)

    respuesta = client.post(reverse("accounts:activar-cuenta", kwargs={"pk": quien_administra.pk}))

    assert respuesta.status_code == 404
    quien_administra.refresh_from_db()
    assert quien_administra.is_active is True


# ── Borrar ──────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_una_cuenta_sin_estrenar_se_borra(client, jej, quien_administra):
    """El caso de quien acaba de equivocarse tecleando: no ha entrado, no ha dejado nada."""
    persona = _cuenta("sobra", jej, email="sobra@jej.cl")
    client.force_login(quien_administra)

    confirmacion = client.get(reverse("accounts:borrar-cuenta", kwargs={"pk": persona.pk}))
    assert confirmacion.status_code == 200
    assert confirmacion.context["rastro"] == []

    client.post(reverse("accounts:borrar-cuenta", kwargs={"pk": persona.pk}))

    assert not get_user_model().objects.filter(pk=persona.pk).exists()


@pytest.mark.django_db
def test_quien_subio_una_revision_no_se_borra_y_se_dice_por_que(client, jej, quien_administra):
    """**La invariante de ISO 19650**: quién emitió es tanto parte del registro como qué se emitió.

    Y no se descubre intentándolo: la pantalla lo pregunta antes, para que la respuesta sea una
    explicación con lo que hay en su nombre y no un error de base de datos.
    """
    from apps.documents.models import Comentario, Observacion
    from apps.projects.models import Proyecto

    persona = _cuenta("trabaja", jej, email="trabaja@jej.cl")
    obra = Proyecto.objects.create(organizacion=jej, codigo="716-LCD", nombre="Edificio")
    observacion = Observacion.objects.create(
        organizacion=jej,
        proyecto=obra,
        titulo="Choque en el eje 3",
        autor=persona,
        responsable=persona,
    )
    Comentario.objects.create(observacion=observacion, autor=persona, texto="Lo miro mañana.")
    client.force_login(quien_administra)

    confirmacion = client.get(reverse("accounts:borrar-cuenta", kwargs={"pk": persona.pk}))
    assert confirmacion.context["rastro"], "no detecta que esta persona ha dejado rastro"

    respuesta = client.post(reverse("accounts:borrar-cuenta", kwargs={"pk": persona.pk}))

    assert respuesta.status_code == 302
    assert get_user_model().objects.filter(pk=persona.pk).exists(), (
        "se borró a alguien cuyo trabajo está en el registro"
    )


@pytest.mark.django_db
def test_no_se_borra_a_alguien_de_otra_empresa(client, otra_empresa, quien_administra):
    ajena = _cuenta("de.otra", otra_empresa, email="de.otra@ajena.cl")
    client.force_login(quien_administra)

    assert (
        client.post(reverse("accounts:borrar-cuenta", kwargs={"pk": ajena.pk})).status_code == 404
    )
    assert get_user_model().objects.filter(pk=ajena.pk).exists()


@pytest.mark.django_db
def test_borrar_pide_su_propio_permiso(client, jej):
    """`delete_user` y no `change_user`: quien corrige un apellido no tiene por qué poder borrar."""
    persona = _cuenta("cualquiera", jej, email="c@jej.cl")
    solo_edita = _cuenta("edita", jej, roles.COORDINADOR, email="e@jej.cl")
    solo_edita.user_permissions.add(
        Permission.objects.get(codename="change_user", content_type__app_label="auth")
    )
    client.force_login(solo_edita)

    assert (
        client.post(reverse("accounts:borrar-cuenta", kwargs={"pk": persona.pk})).status_code == 403
    )
    assert get_user_model().objects.filter(pk=persona.pk).exists()


# ── Y el defecto que este cambio arregla de paso ────────────────────────────────────


@pytest.mark.django_db
def test_reiniciar_una_clave_no_dice_que_falta_la_organizacion(client, jej, quien_administra):
    """**Un defecto mío, de esta misma tarde.**

    `ReiniciarClaveView` pinta la plantilla del alta para enseñar la clave nueva, y esa plantilla
    pasó a decidir si hay organizaciones. Al construirle el contexto a mano con tres claves,
    `hay_organizaciones` faltaba —o sea, falsa— y reiniciar una clave enseñaba «Primero, la
    organización» con su botón de crear, en una instalación con organizaciones de sobra. La
    pantalla contradecía a la lista desde la que se había pulsado.

    Es el riesgo de dos vistas que pintan la misma plantilla: la que la conoce menos se queda atrás
    **sin que nada falle**.
    """
    persona = _cuenta("olvidadiza", jej, email="olvido@jej.cl")
    client.force_login(quien_administra)

    respuesta = client.post(reverse("accounts:reiniciar-clave", kwargs={"pk": persona.pk}))

    assert respuesta.status_code == 200
    assert respuesta.context["hay_organizaciones"] is True
    assert reverse("core:nueva-organizacion") not in respuesta.content.decode()
