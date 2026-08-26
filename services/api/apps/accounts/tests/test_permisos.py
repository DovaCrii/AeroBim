"""El contrato de permisos, comprobado.

De `AGENTS.md`: **toda superficie de lectura pide un `view_*` explicito**, y cada
vista nueva trae su prueba de 403 para un usuario sin el permiso. Esto es esa prueba,
y esta escrita como una tabla para que añadir una vista signifique añadir una fila —
no acordarse de escribir un test.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

# (ruta, permiso que la abre)
VISTAS_PROTEGIDAS = [
    ("accounts:usuarios-roles", "auth.view_user"),
    ("accounts:auditoria", "core.view_auditevent"),
    ("accounts:trabajos", "core.view_jobrun"),
    ("core:organizaciones", "core.view_organizacion"),
]


def usuario(**extra):
    return get_user_model().objects.create_user(
        username=extra.pop("username", "alguien"), password="una-clave-larga-99", **extra
    )


def dar(user, etiqueta):
    app_label, codename = etiqueta.split(".")
    user.user_permissions.add(
        Permission.objects.get(content_type__app_label=app_label, codename=codename)
    )
    # El cache de permisos se calcula una vez por instancia.
    return get_user_model().objects.get(pk=user.pk)


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", VISTAS_PROTEGIDAS)
def test_anonimo_va_al_login_y_no_a_un_403(client, ruta, permiso):
    """**Redirigir, no 403.** A quien no ha entrado hay que ofrecerle entrar."""
    respuesta = client.get(reverse(ruta))

    assert respuesta.status_code == 302
    assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", VISTAS_PROTEGIDAS)
def test_autenticado_sin_permiso_recibe_403_duro(client, ruta, permiso):
    """**403 y no redirigir.** Mandar al login a quien ya entro es un bucle: vuelve a
    entrar, vuelve a rebotar, y nadie le dice nunca que lo que le falta es un permiso."""
    client.force_login(usuario())

    assert client.get(reverse(ruta)).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", VISTAS_PROTEGIDAS)
def test_con_su_permiso_abre(client, ruta, permiso):
    client.force_login(dar(usuario(), permiso))

    assert client.get(reverse(ruta)).status_code == 200


@pytest.mark.django_db
def test_el_portal_solo_lista_lo_que_el_usuario_puede_abrir(client):
    """Si no tienes el permiso, **la fila no existe**: ni en gris ni llevando a un 403."""
    client.force_login(usuario())
    sin_nada = client.get("/").content.decode()

    assert "Users and roles" not in sin_nada
    assert "Audit trail" not in sin_nada

    client.force_login(dar(usuario(username="con-permiso"), "auth.view_user"))
    con_uno = client.get("/").content.decode()

    assert "Users and roles" in con_uno
    # Y solo ese: tener uno no destapa los demas.
    assert "Audit trail" not in con_uno
