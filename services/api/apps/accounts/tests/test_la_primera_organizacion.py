"""**El producto recién instalado no se podía empezar a usar, y esto es lo que lo fija.**

## El callejón, medido

`p340`, 2026-09-15, instalación limpia. Se abre «Cuenta nueva», se escribe nombre, apellido y
correo, se llega a «Organización» y el desplegable **está vacío**. El formulario no puede validar
nunca. No hay ningún sitio donde crear una: la pantalla de Organizaciones era una tabla de solo
leer, y el `/admin/` técnico —que era por donde se hacía— dejó de publicarse **ese mismo día**,
porque AeroBim pasó a estar en internet.

O sea que las dos mitades eran correctas por separado y juntas cerraban la puerta. El usuario lo
dijo así: «la cuenta para crear me pide organización y no aparece cómo generar».

## Por qué no se vio antes

Porque en desarrollo **la base viene sembrada**: `preparar_piloto` crea la organización del piloto,
así que el desplegable siempre tenía algo dentro. El agujero solo existe en una base limpia, que es
la única base que ve quien instala. Es el mismo patrón de siempre: el caso que no se prueba es el
que le toca al primero que llega.

Por eso estas pruebas empiezan **borrando las organizaciones**, y no vale con no crearlas: hay
fixtures compartidas que las crean por su cuenta.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.accounts.forms import NuevaOrganizacionForm
from apps.core.models import Membresia, Organizacion


@pytest.fixture
def sin_organizaciones(db):
    """Una base como la de una instalación recién hecha."""
    Organizacion.objects.all().delete()


@pytest.fixture
def quien_administra(db):
    U = get_user_model()
    u = U.objects.create_user(username="admin-piloto", password="x" * 14)
    u.user_permissions.add(
        Permission.objects.get(codename="add_organizacion", content_type__app_label="core"),
        Permission.objects.get(codename="view_organizacion", content_type__app_label="core"),
        Permission.objects.get(codename="add_user", content_type__app_label="auth"),
    )
    return u


@pytest.mark.django_db
def test_sin_organizaciones_la_pantalla_de_alta_dice_que_falta_y_a_donde_ir(
    client, sin_organizaciones, quien_administra
):
    """**El fallo original, en una sola prueba.**

    Lo que se comprueba no es que salga un texto: es que la pantalla **no ofrezca el formulario**
    —rellenarlo no lleva a ninguna parte— y que sí ofrezca la salida. Con el formulario presente,
    quien la abre escribe cinco campos antes de descubrir que no puede terminar.
    """
    client.force_login(quien_administra)

    respuesta = client.get(reverse("accounts:nueva-cuenta"))
    cuerpo = respuesta.content.decode()

    assert respuesta.status_code == 200
    assert reverse("core:nueva-organizacion") in cuerpo, "no dice dónde se crea la organización"
    assert 'name="correo"' not in cuerpo, (
        "el formulario sigue ahí: se puede rellenar entero y no se va a poder enviar"
    )


@pytest.mark.django_db
def test_con_una_organizacion_vuelve_el_formulario(client, sin_organizaciones, quien_administra):
    """La contraprueba. **Sin esto, la de arriba pasaría escondiendo el formulario para siempre**,
    que es romper la pantalla en vez de arreglarla."""
    organizacion = Organizacion.objects.create(nombre="JEJ", slug="jej")
    Membresia.objects.create(organizacion=organizacion, usuario=quien_administra)
    client.force_login(quien_administra)

    cuerpo = client.get(reverse("accounts:nueva-cuenta")).content.decode()

    assert 'name="correo"' in cuerpo
    assert 'name="organizacion"' in cuerpo


@pytest.mark.django_db
def test_quien_la_crea_queda_dentro(sin_organizaciones, quien_administra):
    """**Sin membresía la habría creado y no la vería.**

    `organizaciones_de` devuelve `none()` para quien no es miembro de ninguna, así que la
    organización recién creada desaparecería de la lista al recargar —para todo el que no sea
    superusuario—. Es la trampa nº 1 de `PILOTO.md` un piso más arriba: algo creado a medias que
    entra bien y no enseña nada.
    """
    from apps.core.tenancy import organizaciones_de

    form = NuevaOrganizacionForm({"nombre": "JEJ Ingeniería"})
    assert form.is_valid(), form.errors

    organizacion = form.crear(autor=quien_administra)

    assert organizacion.miembros.filter(pk=quien_administra.pk).exists()
    assert list(organizaciones_de(quien_administra)) == [organizacion]


@pytest.mark.django_db
def test_el_slug_se_calcula_y_nunca_choca(sin_organizaciones, quien_administra):
    """El slug no se pide —es una cadena para la URL, no un dato del negocio— así que se deriva.

    **Y derivarlo puede chocar aunque el nombre sea único**: «JEJ Ingeniería» y «Jej ingenieria»
    dan el mismo. Una violación de `unique` al guardar sería un 500 delante de quien está dando el
    primer paso del producto.
    """
    primera = NuevaOrganizacionForm({"nombre": "JEJ Ingeniería"})
    assert primera.is_valid()
    una = primera.crear(autor=quien_administra)

    segunda = NuevaOrganizacionForm({"nombre": "Jej ingenieria"})
    assert segunda.is_valid(), segunda.errors
    otra = segunda.crear(autor=quien_administra)

    assert una.slug == "jej-ingenieria"
    assert otra.slug == "jej-ingenieria-2"


@pytest.mark.django_db
def test_el_mismo_nombre_dos_veces_se_rechaza_con_su_motivo(sin_organizaciones, quien_administra):
    """Dos organizaciones con el mismo nombre parten al equipo en dos mitades que no se ven entre
    sí, **y no hay pantalla para moverlas**. Se para antes, y diciendo por qué."""
    Organizacion.objects.create(nombre="JEJ", slug="jej")

    form = NuevaOrganizacionForm({"nombre": "  jej  "})

    assert not form.is_valid()
    assert "nombre" in form.errors


@pytest.mark.django_db
def test_crear_una_organizacion_pide_su_permiso(client, sin_organizaciones):
    """Crear la empresa a la que pertenece todo no es tarea del día a día: va detrás de
    `add_organizacion`, que hoy tienen el superusuario y `Administrador` y ningún rol más."""
    U = get_user_model()
    cualquiera = U.objects.create_user(username="sin-permiso", password="x" * 14)
    client.force_login(cualquiera)

    assert client.get(reverse("core:nueva-organizacion")).status_code == 403
    assert client.post(reverse("core:nueva-organizacion"), {"nombre": "Ajena"}).status_code == 403
    assert not Organizacion.objects.filter(nombre="Ajena").exists()


@pytest.mark.django_db
def test_el_boton_no_se_le_ofrece_a_quien_recibiria_un_403(client, sin_organizaciones):
    """Enseñar un botón que termina en 403 es peor que no enseñarlo: promete algo y lo niega sin
    decir por qué. Es la regla que ya ordena el portal entero."""
    U = get_user_model()
    mira = U.objects.create_user(username="solo-mira", password="x" * 14)
    mira.user_permissions.add(
        Permission.objects.get(codename="view_organizacion", content_type__app_label="core")
    )
    client.force_login(mira)

    cuerpo = client.get(reverse("core:organizaciones")).content.decode()

    assert reverse("core:nueva-organizacion") not in cuerpo
