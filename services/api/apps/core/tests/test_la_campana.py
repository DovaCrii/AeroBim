"""**«El mensaje es plano y no causa una alerta visible; falta una forma de verlo.»**

Hasta hoy, asignarle algo a alguien mandaba **un correo de texto plano y nada mas**: ni campana, ni
contador, ni distintivo, ni una sola notificacion dentro de la aplicacion. Quien no tenia direccion
de correo **no se enteraba de nada**, y quien la tenia se enteraba cuando abriera el correo.

## Las dos reglas que estas pruebas sujetan

**La campana no genera correo.** Es lo que permite avisar de todo sin hacer spam — el usuario pidio
expresamente que el correo lo delimite el coordinador, y la campana no depende de eso.

**Nadie se avisa a si mismo.** Un contador que sube por lo que acabas de hacer tu enseña a ignorar
el contador, y ese es el unico modo real de romper una campana.
"""

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse

from apps.core import avisos
from apps.core.models import Aviso


@pytest.fixture
def otra_persona(db, organizacion):
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user(
        username="otra", password="x" * 14, email="otra@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.mark.django_db
def test_se_deja_un_aviso_y_no_sale_ni_un_correo(proyectista, otra_persona):
    """**Los dos canales van por separado, y esta es la asercion que lo demuestra.**"""
    aviso = avisos.avisar(
        destinatario=proyectista,
        tipo=Aviso.ASIGNACION,
        titulo="El ducto del eje C",
        url="/documentos/observaciones/x/",
        de_parte_de=otra_persona,
    )

    assert aviso is not None
    assert avisos.cuantos_sin_leer(proyectista) == 1
    assert mail.outbox == [], "la campana mandó correo: son dos canales, no uno con dos salidas"


@pytest.mark.django_db
def test_nadie_se_avisa_a_si_mismo(proyectista):
    """Un contador que sube por lo que acabas de hacer tú enseña a no mirar el contador."""
    assert (
        avisos.avisar(
            destinatario=proyectista,
            tipo=Aviso.COMENTARIO,
            titulo="Mi propio comentario",
            url="/x/",
            de_parte_de=proyectista,
        )
        is None
    )
    assert avisos.cuantos_sin_leer(proyectista) == 0


@pytest.mark.django_db
def test_una_cuenta_desactivada_no_acumula_avisos(proyectista, otra_persona):
    """Quien ya no trabaja aquí no necesita un contador esperándole."""
    proyectista.is_active = False
    proyectista.save(update_fields=["is_active"])

    assert (
        avisos.avisar(
            destinatario=proyectista,
            tipo=Aviso.ASIGNACION,
            titulo="Algo",
            url="/x/",
            de_parte_de=otra_persona,
        )
        is None
    )


@pytest.mark.django_db
def test_los_avisos_de_uno_no_los_ve_ni_los_cuenta_otro(proyectista, otra_persona):
    """El acotado por destinatario, que es el único que hay aquí."""
    avisos.avisar(
        destinatario=proyectista,
        tipo=Aviso.ASIGNACION,
        titulo="Para el proyectista",
        url="/x/",
        de_parte_de=otra_persona,
    )

    assert avisos.cuantos_sin_leer(otra_persona) == 0


@pytest.mark.django_db
def test_marcar_leidos_no_toca_los_de_otro(proyectista, otra_persona):
    """**Aunque lleguen identificadores sueltos**, el filtro por destinatario va siempre."""
    ajeno = avisos.avisar(
        destinatario=otra_persona, tipo=Aviso.ASIGNACION, titulo="Ajeno", url="/x/"
    )
    avisos.avisar(destinatario=proyectista, tipo=Aviso.ASIGNACION, titulo="Mío", url="/x/")

    assert avisos.marcar_leidos(proyectista, ids=[ajeno.pk]) == 0
    ajeno.refresh_from_db()
    assert ajeno.leido_en is None
    assert avisos.cuantos_sin_leer(otra_persona) == 1


# ── La campana en la pantalla ──────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_barra_enseña_el_contador_solo_si_hay_algo(client, proyectista, otra_persona):
    """**Un distintivo que sale siempre deja de mirarse a la semana.**

    Es el patrón de Autodesk y Trimble: el rojo va a quien tiene que actuar, no a quien está en
    copia.
    """
    client.force_login(proyectista)
    limpio = client.get(reverse("core:avisos")).content.decode()
    assert "campana-cifra" not in limpio

    avisos.avisar(
        destinatario=proyectista,
        tipo=Aviso.ASIGNACION,
        titulo="El ducto del eje C",
        url="/documentos/observaciones/x/",
        de_parte_de=otra_persona,
    )

    con_algo = client.get(reverse("core:avisos")).content.decode()
    assert "campana-cifra" in con_algo
    assert ">1<" in con_algo


@pytest.mark.django_db
def test_abrir_un_aviso_lo_marca_leido_y_lleva_al_objeto(client, proyectista, otra_persona):
    """**Un solo clic**: obligar a dos para lo mismo es como se acumulan cien sin leer."""
    aviso = avisos.avisar(
        destinatario=proyectista,
        tipo=Aviso.ASIGNACION,
        titulo="El ducto del eje C",
        url="/documentos/observaciones/abc/",
        de_parte_de=otra_persona,
    )
    client.force_login(proyectista)

    respuesta = client.get(reverse("core:abrir-aviso", args=[aviso.pk]))

    assert respuesta.status_code == 302
    assert respuesta["Location"] == "/documentos/observaciones/abc/"
    aviso.refresh_from_db()
    assert aviso.leido_en is not None


@pytest.mark.django_db
def test_no_se_abre_el_aviso_de_otro(client, proyectista, otra_persona):
    """**404 y no 403**: decir «no es tuyo» confirma que existe."""
    ajeno = avisos.avisar(
        destinatario=otra_persona, tipo=Aviso.ASIGNACION, titulo="Ajeno", url="/x/"
    )
    client.force_login(proyectista)

    assert client.get(reverse("core:abrir-aviso", args=[ajeno.pk])).status_code == 404


@pytest.mark.django_db
def test_el_centro_de_avisos_solo_pide_sesion(client, proyectista):
    """Los avisos de alguien son suyos: exigir un permiso de modelo dejaría sin campana a quien
    menos permisos tiene, que suele ser quien más depende de que le avisen."""
    assert client.get(reverse("core:avisos")).status_code == 302

    client.force_login(proyectista)
    assert client.get(reverse("core:avisos")).status_code == 200


@pytest.mark.django_db
def test_el_contador_es_una_sola_consulta(proyectista, django_assert_num_queries):
    """**Se pinta en cada página**, así que no puede ser una lista que se cuente en Python.

    Se mide con doce avisos: si fuera una lista, la consulta traería doce filas y el número saldría
    de recorrerlas. Un `count()` con índice por (destinatario, leído) es una sola consulta y no
    crece.
    """
    for n in range(12):
        avisos.avisar(
            destinatario=proyectista, tipo=Aviso.ASIGNACION, titulo=f"Aviso {n}", url="/x/"
        )

    with django_assert_num_queries(1):
        assert avisos.cuantos_sin_leer(proyectista) == 12


@pytest.mark.django_db
def test_una_respuesta_sin_plantilla_no_paga_el_contador(rf, proyectista):
    """**Corre en cada respuesta, incluidas las que no pintan nada.**

    Es la misma razón por la que el rail va perezoso: una descarga de archivo o una respuesta de la
    API no tienen que pagar una consulta por un contador que nadie va a mirar. Si esto deja de ser
    perezoso, el coste se paga en todas partes y no se nota en ninguna.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.accounts.context_processors import navegacion

    peticion = rf.get("/")
    peticion.user = proyectista

    with CaptureQueriesContext(connection) as consultas:
        contexto = navegacion(peticion)
    assert len(consultas) == 0, "el contador se calculó sin que ninguna plantilla lo pidiera"

    # Y al nombrarlo, sí se calcula. `SimpleLazyObject` no se convierte con `int()`, así que se
    # compara como lo haría una plantilla: por su texto.
    assert str(contexto["avisos_sin_leer"]) == "0"
