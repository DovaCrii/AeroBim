"""**Quién va atrasado y con qué**: el seguimiento del equipo (2026-09-23).

Había tres sitios donde ver lo pendiente y los tres eran de una sola persona. La pregunta de la
reunión semanal —«¿quién va atrasado?»— no tenía pantalla. Ver `apps/documents/seguimiento.py`.

## Lo que se sujeta

1. **Quién la ve.** Todos los roles tienen `view_observacion`, el mandante incluido; esta pantalla
   enseña la carga de trabajo del equipo, así que pide además `change_observacion`. Hay prueba de
   403 para el mandante y para el proyectista, no solo para quien no tiene nada.
2. **De qué organización.** Por la consulta, no por el permiso.
3. **El orden**, que es la mitad del valor: primero quien tiene más vencidas.
4. **Que «abierto» sea lo mismo que en la bandeja.** Si las dos pantallas lo definieran por su
   cuenta, un estado nuevo las haría discrepar sin que nada fallara.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone

from apps.accounts import roles
from apps.core.models import Membresia, Organizacion
from apps.documents.models import Actividad, Observacion
from apps.documents.notify import pendientes_por_tramo
from apps.documents.seguimiento import abiertos_con_fecha, del_equipo
from apps.projects.models import Proyecto

pytestmark = pytest.mark.django_db

RUTA = "documents:seguimiento"


def con_rol(usuario, rol):
    from django.core.management import call_command

    call_command("bootstrap_roles", verbosity=0)
    usuario.groups.add(Group.objects.get(name=rol))
    return get_user_model().objects.get(pk=usuario.pk)


def persona(organizacion, nombre):
    usuario = get_user_model().objects.create_user(nombre, password="x" * 14)
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.fixture
def vence(organizacion, proyecto, revisor):
    """Una observación a nombre de alguien, vencida hace `dias` (negativo = todavía no vence)."""

    def crear(responsable, dias, *, titulo=None, estado=None):
        return Observacion.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            titulo=titulo or f"Hallazgo a {dias} días",
            autor=revisor,
            responsable=responsable,
            vence=timezone.localdate() - timedelta(days=dias),
            **({"estado": estado} if estado else {}),
        )

    return crear


# --- Quién la ve ---------------------------------------------------------------------


def test_sin_sesion_se_va_al_login(client):
    assert client.get(reverse(RUTA)).status_code == 302


@pytest.mark.parametrize("rol", [roles.MANDANTE, roles.PROYECTISTA])
def test_quien_no_reparte_no_la_ve(client, revisor, rol):
    """**El mandante tiene `view_observacion`**, y es justo por lo que no basta ese permiso.

    Lo que esta pantalla enseña es cuánto va atrasada cada persona de la oficina: información
    interna. 403 duro, no una redirección: quien entró tiene que saber que le falta un rol.
    """
    client.force_login(con_rol(revisor, rol))

    assert client.get(reverse(RUTA)).status_code == 403


@pytest.mark.parametrize("rol", [roles.COORDINADOR, roles.REVISOR])
def test_quien_reparte_si(client, revisor, rol):
    client.force_login(con_rol(revisor, rol))

    assert client.get(reverse(RUTA)).status_code == 200


def test_no_se_ven_los_atrasos_de_otra_organizacion(client, revisor, vence):
    otra = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    ajeno = persona(otra, "ajeno")
    obra_ajena = Proyecto.objects.create(organizacion=otra, codigo="999-XX", nombre="Ajena")
    Observacion.objects.create(
        organizacion=otra,
        proyecto=obra_ajena,
        titulo="Atraso de otra empresa",
        autor=ajeno,
        responsable=ajeno,
        vence=timezone.localdate() - timedelta(days=40),
    )
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA)).content.decode()

    assert "Atraso de otra empresa" not in html


def test_una_obra_mal_escrita_en_la_url_no_da_un_500(client, revisor):
    """La clave es un UUID y `filter(pk="abc")` lanza: un enlace mal copiado daba un 500."""
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    assert client.get(reverse(RUTA), {"obra": "no-es-un-uuid"}).status_code == 200


# --- Qué enseña y en qué orden -------------------------------------------------------


def test_primero_quien_mas_debe(organizacion, revisor, vence):
    """**El orden en que un coordinador tiene que hablar con la gente.**"""
    poco = persona(organizacion, "poco")
    mucho = persona(organizacion, "mucho")
    vence(poco, 40)
    vence(mucho, 3)
    vence(mucho, 5)

    seguimiento = del_equipo(
        abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all()),
        timezone.localdate(),
    )

    # Dos vencidas pesan más que una muy vieja: se habla antes con quien tiene más cosas paradas.
    assert [p.usuario.username for p in seguimiento.personas] == ["mucho", "poco"]
    assert seguimiento.total_vencidas == 3
    assert seguimiento.peor_atraso == 40


def test_dentro_de_cada_persona_lo_mas_viejo_arriba(organizacion, vence):
    alguien = persona(organizacion, "alguien")
    vence(alguien, 2, titulo="reciente")
    vence(alguien, 30, titulo="viejo")

    seguimiento = del_equipo(
        abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all()),
        timezone.localdate(),
    )

    assert [v.item.titulo for v in seguimiento.personas[0].vencidas] == ["viejo", "reciente"]


def test_lo_de_esta_semana_cuenta_y_lo_de_mas_adelante_no(organizacion, vence):
    """Quien no tiene nada vencido pero sí esta semana aparece, al final; lo lejano no."""
    alguien = persona(organizacion, "alguien")
    vence(alguien, -3)  # vence dentro de 3 días
    vence(alguien, -20)  # dentro de 20: no es de esta pantalla

    seguimiento = del_equipo(
        abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all()),
        timezone.localdate(),
    )

    assert len(seguimiento.personas) == 1
    assert seguimiento.personas[0].vencidas == []
    assert seguimiento.personas[0].esta_semana == 1


def test_lo_cerrado_no_es_un_atraso(organizacion, vence):
    alguien = persona(organizacion, "alguien")
    vence(alguien, 50, estado=Observacion.CERRADA)

    seguimiento = del_equipo(
        abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all()),
        timezone.localdate(),
    )

    assert seguimiento.personas == ()


def test_abierto_es_lo_mismo_aqui_que_en_la_bandeja(organizacion, vence):
    """**La definición es una sola**, y esta prueba es la que lo sostiene.

    La bandeja de una persona y su tarjeta en el seguimiento tienen que contar lo mismo. Si alguna
    vez cada una vuelve a escribir su propio `exclude`, esto lo dice.
    """
    alguien = persona(organizacion, "alguien")
    vence(alguien, 12)
    vence(alguien, 1)
    vence(alguien, 50, estado=Observacion.DESCARTADA)

    bandeja = pendientes_por_tramo(alguien)["vencido"]
    seguimiento = del_equipo(
        abiertos_con_fecha(Observacion.objects.all(), Actividad.objects.all()),
        timezone.localdate(),
    )

    assert {o.pk for o in bandeja} == {v.item.pk for v in seguimiento.personas[0].vencidas}


def test_la_pantalla_dice_los_dias_y_no_la_fecha(client, organizacion, revisor, vence):
    alguien = persona(organizacion, "alguien")
    vence(alguien, 45, titulo="Viga sin detallar")
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA)).content.decode()

    assert "Viga sin detallar" in html
    assert "45" in html
    # El mismo grado de color que la bandeja, de la misma función.
    assert "atraso-grave" in html


def test_sin_atrasos_lo_dice_en_una_frase(client, revisor):
    client.force_login(con_rol(revisor, roles.COORDINADOR))

    html = client.get(reverse(RUTA)).content.decode()

    assert 'class="vacio vacio-grande"' in html
    assert "persona-seguimiento" not in html


def test_esta_en_el_rail_de_quien_reparte_y_no_del_mandante(client, revisor, proyectista):
    ruta = reverse(RUTA)

    client.force_login(con_rol(revisor, roles.COORDINADOR))
    assert f'href="{ruta}"' in client.get("/").content.decode()

    client.force_login(con_rol(proyectista, roles.MANDANTE))
    assert f'href="{ruta}"' not in client.get("/").content.decode()
