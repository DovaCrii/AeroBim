"""Los roles, y la leccion que viene con ellos.

El rol de solo lectura de AeroControl era "todo permiso cuyo nombre empiece por
`view_`", y eso le entregaba en silencio los tokens de API, la lista de usuarios, las
sesiones y la auditoria. Estas pruebas son lo que impide que vuelva a pasar.
"""

import pytest
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command

from apps.accounts.roles import (
    ADMINISTRADOR,
    DIRECCION,
    MANDANTE,
    PERMISOS_POR_ROL,
)


@pytest.mark.django_db
def test_bootstrap_roles_crea_los_grupos_y_es_idempotente():
    call_command("bootstrap_roles")
    primera = {g.name: g.permissions.count() for g in Group.objects.all()}

    call_command("bootstrap_roles")
    segunda = {g.name: g.permissions.count() for g in Group.objects.all()}

    assert primera == segunda
    for rol in PERMISOS_POR_ROL:
        assert rol in primera


@pytest.mark.django_db
def test_el_administrador_se_lleva_todos_los_permisos_que_existan():
    """Enumerarlos seria una lista que se queda atras en cuanto se añade un modelo."""
    from django.contrib.auth.models import Permission

    call_command("bootstrap_roles")

    admin = Group.objects.get(name=ADMINISTRADOR)
    assert admin.permissions.count() == Permission.objects.count()


@pytest.mark.django_db
def test_direccion_no_es_un_rol_y_no_lleva_ningun_permiso():
    """Estar en una lista de correo no da acceso a nada."""
    call_command("bootstrap_roles")

    assert Group.objects.get(name=DIRECCION).permissions.count() == 0


@pytest.mark.django_db
def test_el_mandante_no_ve_la_administracion_del_sistema():
    """**La prueba que vale.** El rol de lectura lee el registro del proyecto, no la
    administracion: ni usuarios, ni tokens, ni sesiones, ni la auditoria."""
    call_command("bootstrap_roles")

    suyos = {
        f"{p.content_type.app_label}.{p.codename}"
        for p in Group.objects.get(name=MANDANTE).permissions.select_related("content_type")
    }
    prohibidos = {
        "auth.view_user",
        "auth.view_group",
        "auth.view_permission",
        "authtoken.view_token",
        "sessions.view_session",
        "core.view_auditevent",
        "core.view_jobrun",
    }

    assert suyos.isdisjoint(prohibidos), f"El mandante no deberia poder ver: {suyos & prohibidos}"


@pytest.mark.django_db
def test_un_permiso_mal_escrito_para_el_comando(monkeypatch):
    """**Falla el despliegue, no el trabajo de alguien.** Un nombre mal escrito que se
    ignora deja un rol silenciosamente incompleto, y eso se descubre cuando una persona
    no puede hacer su trabajo y nadie sabe por que."""
    monkeypatch.setitem(PERMISOS_POR_ROL, MANDANTE, ("core.view_esto_no_existe",))

    with pytest.raises(CommandError, match="no existen"):
        call_command("bootstrap_roles")
