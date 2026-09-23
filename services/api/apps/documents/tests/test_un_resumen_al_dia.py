"""**Dos corridas el mismo día no pueden escribirle dos veces a nadie.**

El encargo fue literal: *«el correo que sea cuando el coordinador lo delimite, para no generar
spam»*. `AvisosDeObra` contesta *cada cuánto* — y eso ya estaba. Lo que faltaba contesta otra cosa:
**no otra vez hoy**.

## Y no es un caso raro: es el día que se configure el SMTP

Se enciende, se quiere ver que funciona, y `enviar_resumen` se corre a mano — con el timer de las
07:30 ya disparado. Dos correos idénticos la primera mañana, que es justo la que decide si alguien
deja de leer al remitente. El `Persistent=true` del timer añade la otra puerta: una VM apagada a las
07:30 dispara el resumen al arrancar, que puede ser después de que alguien lo corriera a mano.

## Lo que frena es la restricción, no el `if`

Dos procesos que preguntan a la vez obtienen los dos «no se le ha mandado». Lo que impide el correo
doble es que la segunda fila **no pueda existir**. Aquí se prueban las dos mitades: que el segundo
envío no salga, y que el turno se **suelte** si el envío falla — porque quemar el día por un SMTP
mal configurado deja sin resumen justo a quien está configurándolo.
"""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.documents.models import Idoneidad, Observacion, ResumenEnviado
from apps.documents.notify import enviar_resumen

pytestmark = pytest.mark.django_db


@pytest.fixture
def con_algo_pendiente(organizacion, proyecto, revisor, proyectista):
    """Una observación vencida a nombre del revisor: suficiente para que le toque resumen."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga choca con el ducto",
        autor=proyectista,
        responsable=revisor,
        vence=timezone.localdate() - timedelta(days=3),
    )
    return revisor


def test_el_primero_sale(con_algo_pendiente):
    assert enviar_resumen(con_algo_pendiente) > 0
    assert len(mail.outbox) == 1


def test_el_segundo_del_mismo_dia_no(con_algo_pendiente):
    """**El defecto.** Sin el freno, correr el comando dos veces escribe dos veces."""
    enviar_resumen(con_algo_pendiente)
    mail.outbox.clear()

    assert enviar_resumen(con_algo_pendiente) == 0
    assert mail.outbox == []


def test_manana_vuelve_a_salir(con_algo_pendiente):
    """La otra mitad: un freno que no suelta nunca es un correo que no sale nunca."""
    enviar_resumen(con_algo_pendiente)
    # Se envejece el turno en vez de viajar en el tiempo: es la misma condición y no depende de
    # congelar el reloj.
    ResumenEnviado.objects.filter(usuario=con_algo_pendiente).update(
        fecha=timezone.localdate() - timedelta(days=1)
    )
    mail.outbox.clear()

    assert enviar_resumen(con_algo_pendiente) > 0
    assert len(mail.outbox) == 1


def test_a_otra_persona_si(con_algo_pendiente, organizacion, proyecto, proyectista):
    """El freno es por persona, no por corrida: que a uno ya se le escribiera no calla al resto."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Falta el detalle del encuentro",
        autor=con_algo_pendiente,
        responsable=proyectista,
        vence=timezone.localdate() - timedelta(days=2),
    )
    enviar_resumen(con_algo_pendiente)
    mail.outbox.clear()

    assert enviar_resumen(proyectista) > 0
    assert len(mail.outbox) == 1


def test_quien_lo_pide_para_si_no_choca_con_el_freno(con_algo_pendiente):
    """«Mándame el mío ahora» lo pide el propio destinatario.

    Negárselo porque el trabajo programado ya escribió sería tratar su petición como spam.
    """
    enviar_resumen(con_algo_pendiente)
    mail.outbox.clear()

    assert enviar_resumen(con_algo_pendiente, una_vez_al_dia=False) > 0
    assert len(mail.outbox) == 1


def test_si_el_envio_falla_el_dia_no_se_quema(con_algo_pendiente, monkeypatch):
    """**Y este es el caso del día que se configura el SMTP.**

    El turno se reclama antes de escribir —que es lo que frena el correo doble— así que un envío
    que revienta dejaría a esta persona sin resumen hasta mañana. Se suelta al fallar: se arregla
    el SMTP y se vuelve a correr, que es lo que uno espera poder hacer.
    """
    from django.core.mail import EmailMultiAlternatives

    def revienta(self, *args, **kwargs):
        raise OSError("el SMTP dijo que no")

    monkeypatch.setattr(EmailMultiAlternatives, "send", revienta)

    with pytest.raises(OSError):
        enviar_resumen(con_algo_pendiente)

    assert not ResumenEnviado.objects.filter(usuario=con_algo_pendiente).exists()

    # Y arreglado, sale.
    monkeypatch.undo()
    assert enviar_resumen(con_algo_pendiente) > 0


def test_la_restriccion_existe_y_es_la_que_frena(con_algo_pendiente):
    """**El `if` no frena una carrera; la restricción sí.**

    Dos procesos que preguntan a la vez obtienen los dos «no se le ha mandado». Esto comprueba que
    la base no admite la segunda fila, que es lo único que lo hace imposible en vez de improbable.
    """
    from django.db import IntegrityError, transaction

    hoy = timezone.localdate()
    ResumenEnviado.objects.create(usuario=con_algo_pendiente, fecha=hoy)

    with pytest.raises(IntegrityError), transaction.atomic():
        ResumenEnviado.objects.create(usuario=con_algo_pendiente, fecha=hoy)


def test_y_sigue_sin_mandarse_un_resumen_vacio(revisor):
    """No se reclama turno para un correo que no se iba a mandar.

    Si se reclamara antes de mirar si hay algo que contar, quien no tuviera nada por la mañana se
    quedaría sin resumen por la tarde — cuando sí lo tiene.
    """
    assert enviar_resumen(revisor) == 0
    assert not ResumenEnviado.objects.filter(usuario=revisor).exists()
    assert mail.outbox == []


@pytest.mark.parametrize("idoneidad", [Idoneidad.S3])
def test_el_comando_entero_no_repite(con_algo_pendiente, idoneidad):
    """De punta a punta, que es como lo va a correr quien configure el SMTP."""
    from django.core.management import call_command

    call_command("enviar_resumen")
    primera = len(mail.outbox)
    call_command("enviar_resumen")

    assert primera == 1
    assert len(mail.outbox) == 1, "la segunda corrida del día volvió a escribir"
