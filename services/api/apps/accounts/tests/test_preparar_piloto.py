"""Que `preparar_piloto` deje la base lista, y que se pueda correr dos veces.

**La trampa que este comando existe para tapar**: sin `Membresia`, una cuenta entra, el portal
carga, y todas las listas salen vacias — `scope_queryset_to_organizacion` devuelve `none()` para
quien no es miembro, y no hay ni un mensaje que lo explique. Asi que la prueba que mas importa no
es que cree filas: es **que la persona vea la obra despues**.
"""

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.management.commands.preparar_piloto import (
    CODIGO_PILOTO,
    ETIQUETAS_DEL_PILOTO,
)
from apps.core.models import Membresia, Organizacion
from apps.projects.models import Etiqueta, Proyecto


@pytest.fixture
def gente(db):
    U = get_user_model()
    return {
        "coordinadora": U.objects.create_user("coordinadora", password="x"),
        "proyectista": U.objects.create_user("proyectista", password="x"),
    }


def correr(**opciones):
    call_command("preparar_piloto", **opciones)


# --- Lo que crea ---------------------------------------------------------------------


def test_crea_organizacion_membresias_obra_y_etiquetas(db, gente):
    correr(organizacion="JEJ Ingenieria", miembro=["proyectista"], admin=["coordinadora"])

    organizacion = Organizacion.objects.get(slug="jej-ingenieria")
    assert organizacion.nombre == "JEJ Ingenieria"
    assert Membresia.objects.get(usuario=gente["proyectista"]).rol == "miembro"
    assert Membresia.objects.get(usuario=gente["coordinadora"]).rol == "admin"

    obra = Proyecto.objects.get(codigo=CODIGO_PILOTO)
    assert obra.organizacion == organizacion
    assert Etiqueta.objects.filter(proyecto=obra).count() == len(ETIQUETAS_DEL_PILOTO)


def test_el_vocabulario_tiene_los_dos_ejes(db, gente):
    """`tipo` dice **que** clase de hallazgo es y `pantalla:` dice **donde** se vio."""
    correr(organizacion="Obra", miembro=["coordinadora"])
    obra = Proyecto.objects.get(codigo=CODIGO_PILOTO)
    nombres = set(Etiqueta.objects.filter(proyecto=obra).values_list("nombre", flat=True))

    assert {"defecto", "mejora", "duda"} <= nombres
    assert len([n for n in nombres if n.startswith("pantalla:")]) >= 5
    assert "plan:pospuesto" in nombres


def test_el_slug_se_puede_dar_a_mano(db, gente):
    correr(organizacion="JEJ Ingeniería y Construcción", slug="jej", miembro=["coordinadora"])
    assert Organizacion.objects.filter(slug="jej").exists()


# --- Que la persona VEA la obra, que es el punto ---------------------------------------


def test_con_membresia_la_persona_ve_la_obra(client, db, gente):
    """**Es la prueba que justifica el comando.** Sin membresia se ve todo vacio y sin aviso."""
    from apps.core.tenancy import organizaciones_visibles

    correr(organizacion="Obra", miembro=["proyectista"])

    # `organizaciones_visibles` devuelve **los ids**, no los objetos.
    visibles = organizaciones_visibles(get_user_model().objects.get(username="proyectista"))
    assert Organizacion.objects.get(slug="obra").pk in list(visibles)


def test_sin_membresia_no_ve_nada_y_nadie_lo_dice(client, db, gente):
    """El comportamiento que hace falta conocer: **no da error, da vacio.**

    Se fija aqui para que quien lea estas pruebas entienda por que el comando imprime el aviso al
    terminar, y no lo quite pensando que sobra.
    """
    from apps.core.tenancy import organizaciones_visibles

    correr(organizacion="Obra", miembro=["proyectista"])

    # `coordinadora` no se paso como miembro: existe, entra, y no ve la organizacion.
    fuera = get_user_model().objects.get(username="coordinadora")
    assert list(organizaciones_visibles(fuera)) == []


# --- Que se pueda correr dos veces ----------------------------------------------------


def test_correrlo_dos_veces_no_duplica_nada(db, gente):
    correr(organizacion="Obra", miembro=["proyectista"], admin=["coordinadora"])
    correr(organizacion="Obra", miembro=["proyectista"], admin=["coordinadora"])

    assert Organizacion.objects.count() == 1
    assert Membresia.objects.count() == 2
    assert Proyecto.objects.filter(codigo=CODIGO_PILOTO).count() == 1
    obra = Proyecto.objects.get(codigo=CODIGO_PILOTO)
    assert Etiqueta.objects.filter(proyecto=obra).count() == len(ETIQUETAS_DEL_PILOTO)


def test_no_renombra_lo_que_alguien_ajusto_a_mano(db, gente):
    """Correr esto otra vez **no deshace** un ajuste manual: eso lo hace repetible sin miedo."""
    correr(organizacion="Obra", miembro=["coordinadora"])
    obra = Proyecto.objects.get(codigo=CODIGO_PILOTO)
    obra.nombre = "Piloto — segunda ronda"
    obra.save(update_fields=["nombre"])
    Organizacion.objects.filter(slug="obra").update(nombre="Nombre puesto a mano")

    correr(organizacion="Obra", miembro=["coordinadora"])

    assert Proyecto.objects.get(codigo=CODIGO_PILOTO).nombre == "Piloto — segunda ronda"
    assert Organizacion.objects.get(slug="obra").nombre == "Nombre puesto a mano"


def test_cambiar_el_rol_de_alguien_si_se_aplica(db, gente):
    correr(organizacion="Obra", miembro=["proyectista"])
    correr(organizacion="Obra", admin=["proyectista"])

    assert Membresia.objects.get(usuario=gente["proyectista"]).rol == "admin"


# --- Lo que se niega a hacer ----------------------------------------------------------


def test_una_cuenta_que_no_existe_para_el_comando_entero(db, gente):
    """**Se comprueban todas antes de crear ninguna.**

    Con un nombre mal escrito a la mitad quedaria media organizacion preparada, y habria que
    averiguar cuales entraron. Asi se arregla el nombre y se vuelve a correr.
    """
    with pytest.raises(CommandError, match="no existen"):
        correr(organizacion="Obra", miembro=["proyectista", "quien-no-esta"])

    assert not Organizacion.objects.filter(slug="obra").exists()
    assert Membresia.objects.count() == 0


def test_no_crea_usuarios(db):
    """No deja contraseñas conocidas: las cuentas se dan de alta en `/admin/`."""
    with pytest.raises(CommandError):
        correr(organizacion="Obra", miembro=["nadie"])

    assert get_user_model().objects.count() == 0


def test_se_puede_pedir_sin_la_obra_del_piloto(db, gente):
    correr(organizacion="Obra", miembro=["coordinadora"], sin_obra_piloto=True)

    assert Organizacion.objects.filter(slug="obra").exists()
    assert not Proyecto.objects.filter(codigo=CODIGO_PILOTO).exists()
