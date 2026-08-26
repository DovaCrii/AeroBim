"""Un trabajo que deja de correr no da error: simplemente no pasa nada.

Por eso la fila nace en `running` y no en `ok`. Creandola con el resultado bueno por
adelantado, un proceso muerto a mitad —matado por el planificador, corte de luz, sin
memoria— dejaba un exito permanente: **exactamente el punto ciego que un aviso de
trabajo colgado tendria que detectar**.
"""

import pytest
from django.utils import timezone

from apps.core.jobs import record_job_run, trabajos_colgados, ultima_corrida
from apps.core.models import JobRun


@pytest.mark.django_db
def test_un_trabajo_que_termina_queda_como_completado():
    with record_job_run("enviar_resumen") as corrida:
        corrida.summary = "3 avisos"

    guardada = JobRun.objects.get(command="enviar_resumen")
    assert guardada.result == JobRun.RESULT_OK
    assert guardada.summary == "3 avisos"
    assert guardada.finished_at is not None
    assert guardada.duration_seconds is not None


@pytest.mark.django_db
def test_un_trabajo_que_falla_queda_como_fallido_y_con_el_motivo():
    with pytest.raises(RuntimeError):
        with record_job_run("avisar_vencimientos"):
            raise RuntimeError("el SMTP no responde")

    guardada = JobRun.objects.get(command="avisar_vencimientos")
    assert guardada.result == JobRun.RESULT_ERROR
    assert "el SMTP no responde" in guardada.summary
    assert guardada.finished_at is not None


@pytest.mark.django_db
def test_mientras_corre_esta_en_running():
    """Es lo que hace detectable un trabajo muerto a mitad."""
    with record_job_run("verificar_respaldo"):
        assert JobRun.objects.get(command="verificar_respaldo").result == JobRun.RESULT_RUNNING


@pytest.mark.django_db
def test_una_corrida_vieja_en_running_es_un_trabajo_colgado():
    JobRun.objects.create(
        command="enviar_resumen",
        started_at=timezone.now() - timezone.timedelta(hours=9),
        result=JobRun.RESULT_RUNNING,
    )
    # Y una recien empezada no lo es: seguira corriendo.
    JobRun.objects.create(command="otro", started_at=timezone.now(), result=JobRun.RESULT_RUNNING)

    colgados = list(trabajos_colgados(horas=6))
    assert [c.command for c in colgados] == ["enviar_resumen"]


@pytest.mark.django_db
def test_nunca_corrio_es_una_respuesta():
    """Y es la que hace falta al desplegar: un trabajo que nunca corrio no es un
    trabajo que corrio bien."""
    assert ultima_corrida("no_existe") is None

    with record_job_run("enviar_resumen"):
        pass
    assert ultima_corrida("enviar_resumen").command == "enviar_resumen"
