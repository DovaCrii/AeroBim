"""Revisa las interferencias de **una obra entera** y avisa en la campana al terminar.

Es lo que lanza el botón «Revisar interferencias» cuando la corrida no cabe en una petición — ver
`apps/documents/revisar.py`, `lanzar_en_segundo_plano`. Se puede correr también a mano:

    uv run python manage.py revisar_obra <uuid-de-la-obra> --autor <uuid-o-usuario>

**No sustituye a `detectar_interferencias`**, que cruza un par concreto de revisiones con clases y
tolerancia a elección: ese es el instrumento de diagnóstico, y este es la revisión de la obra, con
el selector y el agrupado de siempre y las observaciones abiertas a nombre de quien la pidió.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.urls import reverse
from django.utils import translation
from django.utils.translation import gettext as _

from apps.core import avisos
from apps.core.models import Aviso
from apps.documents.revisar import nombre_de_corrida, revisar_proyecto
from apps.projects.models import Proyecto


class Command(BaseCommand):
    help = "Revisa las interferencias de todos los modelos vigentes de una obra."

    def add_arguments(self, parser):
        parser.add_argument("proyecto", help="UUID de la obra.")
        parser.add_argument(
            "--autor",
            required=True,
            help="Quien la pide: su clave o su usuario. Las observaciones quedan a su nombre.",
        )

    def handle(self, *args, **options):
        proyecto = Proyecto.objects.filter(pk=options["proyecto"]).first()
        if proyecto is None:
            raise CommandError(f"No existe la obra {options['proyecto']}.")
        autor = _autor(options["autor"])

        url = reverse("projects:proyecto", args=[proyecto.pk])
        # **El aviso en el idioma de la casa**: el comando corre fuera de una petición, así que no
        # hay idioma del navegador que heredar.
        with translation.override(settings.LANGUAGE_CODE):
            try:
                resultado = revisar_proyecto(
                    proyecto, autor, corrida_como=nombre_de_corrida(proyecto)
                )
            except Exception as error:
                # **Un fallo se avisa igual que un éxito.** Quien pulsó el botón no está mirando la
                # consola: sin esto, una corrida que muere no le dice nada, y seguiría esperando.
                avisos.avisar(
                    destinatario=autor,
                    tipo=Aviso.INTERFERENCIAS,
                    titulo=_("The clash review of %(obra)s failed") % {"obra": proyecto.codigo},
                    detalle=f"{type(error).__name__}: {error}",
                    url=url,
                    proyecto=proyecto.codigo,
                )
                raise

            avisos.avisar(
                destinatario=autor,
                tipo=Aviso.INTERFERENCIAS,
                titulo=_("Clash review of %(obra)s finished") % {"obra": proyecto.codigo},
                detalle=resultado.resumen,
                url=url,
                proyecto=proyecto.codigo,
            )
        self.stdout.write(resultado.resumen)


def _autor(clave: str):
    usuarios = get_user_model().objects
    autor = usuarios.filter(username=clave).first()
    if autor is None:
        try:
            autor = usuarios.filter(pk=clave).first()
        except (ValueError, TypeError):
            autor = None
    if autor is None:
        raise CommandError(f"No existe el usuario {clave}.")
    return autor
