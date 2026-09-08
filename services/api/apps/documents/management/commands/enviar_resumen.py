"""El resumen de lo pendiente, a cada responsable.

Se corre desde el planificador. Deja su fila en `JobRun`, y **avisa antes de mandar**
si el correo no va a salir de la maquina: puesto al final quedaria debajo del volcado
del propio correo, o sea invisible justo en el caso que mas importa.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.core.jobs import record_job_run
from apps.core.mail import PREFIJO_NO_ENVIADO, mail_is_delivered, warn_undelivered_mail
from apps.documents.notify import enviar_resumen


class Command(BaseCommand):
    help = "Envia a cada responsable el resumen de sus observaciones y actividades."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Cuenta a quien se le enviaria, sin enviar nada.",
        )

    def handle(self, *args, **options):
        seco = options["dry_run"]
        with record_job_run("enviar_resumen") as corrida:
            if not seco:
                warn_undelivered_mail(self)

            enviados = 0
            personas = 0
            for usuario in get_user_model().objects.filter(is_active=True):
                if seco:
                    from apps.documents.notify import pendientes_por_tramo

                    total = sum(len(v) for v in pendientes_por_tramo(usuario).values())
                    if total:
                        personas += 1
                        enviados += total
                        self.stdout.write(f"Se enviaria a {usuario}: {total} pendientes")
                    continue

                total = enviar_resumen(usuario)
                if total:
                    personas += 1
                    enviados += total
                    self.stdout.write(f"{usuario}: {total} pendientes")

            resumen = f"{personas} personas, {enviados} pendientes"
            if seco:
                resumen = f"(seco) {resumen}"
            elif not mail_is_delivered():
                # El prefijo va **delante** para que se lea en la columna angosta del
                # historial sin abrir la fila.
                resumen = PREFIJO_NO_ENVIADO + resumen
            corrida.summary = resumen[:300]
            self.stdout.write(self.style.SUCCESS(resumen))
