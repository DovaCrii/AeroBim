"""Que a quien le toca le llegue el aviso, y con lo que necesita para actuar.

Es lo que el usuario pidio con estas palabras: «ver los responsables y asignar quien
debe realizarlo y que le debe enviar mensaje e informacion necesaria».
"""

import pytest
from django.core import mail
from django.utils import timezone

from apps.documents.models import Actividad, Observacion
from apps.documents.notify import avisar_asignacion, enviar_resumen, pendientes_por_tramo


def observacion(organizacion, proyecto, autor, responsable, **extra):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo=extra.pop("titulo", "Revisar el eje C"),
        autor=autor,
        responsable=responsable,
        **extra,
    )


@pytest.mark.django_db
def test_el_aviso_de_asignacion_lleva_el_enlace_y_la_fecha(
    organizacion, proyecto, revisor, proyectista
):
    """**Un aviso sin el enlace obliga a buscar**, y entonces el aviso no sirve."""
    obs = observacion(organizacion, proyecto, revisor, proyectista, vence=timezone.localdate())

    assert avisar_asignacion(obs) is True
    assert len(mail.outbox) == 1

    enviado = mail.outbox[0]
    assert enviado.to == ["proyectista@ejemplo.cl"]
    assert "Revisar el eje C" in enviado.subject
    assert str(obs.pk) in enviado.body
    assert "http" in enviado.body
    assert obs.vence.isoformat() in enviado.body


@pytest.mark.django_db
def test_un_responsable_sin_correo_no_es_un_error_silencioso(organizacion, proyecto, revisor, db):
    from django.contrib.auth import get_user_model

    sin_correo = get_user_model().objects.create_user(username="sin-correo", password="x-99")
    obs = observacion(organizacion, proyecto, revisor, sin_correo)

    assert avisar_asignacion(obs) is False
    assert mail.outbox == []


@pytest.mark.django_db
def test_una_actividad_tambien_avisa(organizacion, proyecto, proyectista, revisor):
    actividad = Actividad.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Levantar el as-built del piso 5",
        responsable=proyectista,
        creada_por=revisor,
    )

    assert avisar_asignacion(actividad) is True
    assert "as-built" in mail.outbox[0].subject


@pytest.mark.django_db
def test_el_resumen_reparte_por_tramos_y_no_los_mezcla(
    organizacion, proyecto, revisor, proyectista
):
    """«Vence pronto» no es una sola cosa: lo que vencio ayer y lo que vence en un mes
    piden reacciones distintas, y un resumen que los mezcla no se lee."""
    hoy = timezone.localdate()
    observacion(
        organizacion,
        proyecto,
        revisor,
        proyectista,
        titulo="Vencida",
        vence=hoy - timezone.timedelta(days=3),
    )
    observacion(
        organizacion,
        proyecto,
        revisor,
        proyectista,
        titulo="Esta semana",
        vence=hoy + timezone.timedelta(days=3),
    )
    observacion(
        organizacion,
        proyecto,
        revisor,
        proyectista,
        titulo="En un mes",
        vence=hoy + timezone.timedelta(days=25),
    )
    # Sin fecha: no entra en ningun tramo, porque no hay nada que anticipar.
    observacion(organizacion, proyecto, revisor, proyectista, titulo="Sin fecha")

    tramos = pendientes_por_tramo(proyectista)
    assert [o.titulo for o in tramos["vencido"]] == ["Vencida"]
    assert [o.titulo for o in tramos["en_7"]] == ["Esta semana"]
    assert [o.titulo for o in tramos["en_30"]] == ["En un mes"]
    assert tramos["en_15"] == []


@pytest.mark.django_db
def test_no_se_manda_un_resumen_vacio(proyectista):
    """**Un correo que dice «no tienes nada» todas las mañanas enseña a archivar el
    remitente**, y entonces el dia que si trae algo tampoco se lee."""
    assert enviar_resumen(proyectista) == 0
    assert mail.outbox == []


@pytest.mark.django_db
def test_el_resumen_va_con_lo_que_queda(organizacion, proyecto, revisor, proyectista):
    hoy = timezone.localdate()
    observacion(organizacion, proyecto, revisor, proyectista, titulo="Una", vence=hoy)
    observacion(
        organizacion,
        proyecto,
        revisor,
        proyectista,
        titulo="Otra",
        vence=hoy - timezone.timedelta(days=1),
    )

    assert enviar_resumen(proyectista) == 2
    cuerpo = mail.outbox[0].body
    assert "Una" in cuerpo
    assert "Otra" in cuerpo
    assert "2" in mail.outbox[0].subject


@pytest.mark.django_db
def test_lo_cerrado_deja_de_aparecer_en_el_resumen(organizacion, proyecto, revisor, proyectista):
    # **Vencida de ayer y no de hoy**, y no es un detalle: desde que el correo lo delimita el
    # coordinador, la cadencia de fábrica es «solo si hay algo vencido», y lo que vence *hoy*
    # todavía no lo está. Con la fecha de hoy esta prueba comprobaba el cierre y, sin querer,
    # también que el resumen saliera siempre — que es justo lo que se cambió.
    ayer = timezone.localdate() - timezone.timedelta(days=1)
    obs = observacion(organizacion, proyecto, revisor, proyectista, vence=ayer)
    assert enviar_resumen(proyectista) == 1

    mail.outbox.clear()
    obs.cerrar(revisor, "Resuelta.")
    assert enviar_resumen(proyectista) == 0
    assert mail.outbox == []


@pytest.mark.django_db
def test_el_comando_deja_su_fila_en_jobrun(organizacion, proyecto, revisor, proyectista):
    from django.core.management import call_command

    from apps.core.models import JobRun

    # Vencida, para que la cadencia de fábrica —«solo si hay algo vencido»— deje salir el correo.
    ayer = timezone.localdate() - timezone.timedelta(days=1)
    observacion(organizacion, proyecto, revisor, proyectista, vence=ayer)
    call_command("enviar_resumen")

    corrida = JobRun.objects.get(command="enviar_resumen")
    assert corrida.result == JobRun.RESULT_OK
    assert "1 personas" in corrida.summary


@pytest.mark.django_db
def test_el_comando_en_seco_no_manda_nada(organizacion, proyecto, revisor, proyectista):
    from django.core.management import call_command

    observacion(organizacion, proyecto, revisor, proyectista, vence=timezone.localdate())
    call_command("enviar_resumen", "--dry-run")

    assert mail.outbox == []
