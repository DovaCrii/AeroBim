"""Que corrio, cuando, y quien vigila que alguien lo esta vigilando.

Portado de AeroControl. Un trabajo programado que deja de correr **no da error**:
simplemente no pasa nada, y los avisos que tenia que mandar no se mandan. La unica
forma de notarlo es que alguien lleve la cuenta.
"""

import logging
from contextlib import contextmanager

from django.utils import timezone

from apps.core.models import JobRun

logger = logging.getLogger("aerobim.jobs")


@contextmanager
def record_job_run(command_name: str):
    """Envuelve un trabajo y deja su fila en `JobRun`.

    La fila nace en **`running`**, no en `ok`. Es la correccion que AeroControl pago
    con un punto ciego: creandola con el resultado bueno por adelantado, un proceso
    muerto a mitad dejaba un exito permanente — justo lo que un aviso de trabajo
    colgado tendria que detectar.

    Se cede el propio `JobRun` para que el comando le escriba su resumen.
    """
    corrida = JobRun.objects.create(command=command_name, started_at=timezone.now())
    try:
        yield corrida
    except Exception as error:
        corrida.result = JobRun.RESULT_ERROR
        corrida.finished_at = timezone.now()
        if not corrida.summary:
            corrida.summary = f"{type(error).__name__}: {error}"[:300]
        corrida.save(update_fields=["result", "finished_at", "summary", "updated_at"])
        logger.exception(
            "job_failed",
            extra={"job_command": command_name, "job_result": JobRun.RESULT_ERROR},
        )
        raise
    else:
        corrida.result = JobRun.RESULT_OK
        corrida.finished_at = timezone.now()
        corrida.save(update_fields=["result", "finished_at", "summary", "updated_at"])
        logger.info(
            "job_complete",
            extra={
                "job_command": command_name,
                "job_result": JobRun.RESULT_OK,
                "job_duration_ms": round((corrida.duration_seconds or 0) * 1000, 2),
            },
        )


def trabajos_colgados(horas: int = 6):
    """Las corridas que llevan demasiado en `running`: trabajos muertos a mitad."""
    limite = timezone.now() - timezone.timedelta(hours=horas)
    return JobRun.objects.filter(result=JobRun.RESULT_RUNNING, started_at__lt=limite)


def ultima_corrida(command_name: str):
    """La ultima vez que corrio un comando, o `None` si nunca corrio."""
    return JobRun.objects.filter(command=command_name).order_by("-started_at").first()
