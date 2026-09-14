"""**Una cuenta recién creada arrastra una clave que un tercero conoce.** Esto es lo que lo cierra.

## El problema que resuelve

En el piloto las cuentas las crea una persona —tú— y le pasa la clave inicial a su dueño por el
canal que sea: WhatsApp, un papel, de viva voz. Mientras esa clave siga en pie hay **dos personas
que pueden entrar** con ella, y en un registro documental de obra eso significa que una revisión
firmada por alguien no prueba que fuera esa persona quien la subió. Es la firma del ISO 19650 sobre
un secreto compartido.

La clave inicial es inevitable —no hay SMTP todavía, así que no se puede mandar un enlace—, pero lo
que sí se puede es hacer que **dure exactamente hasta la primera entrada**.

## Por qué una fila y no un campo

`AUTH_USER_MODEL` es el `auth.User` de Django, sin extender. Cambiarlo ahora, con la base ya
migrada, es de las operaciones más caras que existen en Django y no la justifica un booleano.

**Y por qué la existencia de la fila y no un booleano dentro de ella:** un `debe_cambiar = False`
es un estado que hay que acordarse de escribir, y el día que alguien lo olvide la cuenta queda
exigiendo el cambio para siempre. Con la fila, «ya la cambió» **es no tener fila**, que es el estado
al que se llega borrando — y borrar no se olvida a medias.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel


class ClaveProvisional(BaseModel):
    """Marca que esta cuenta todavía usa la clave que le puso quien la creó.

    Mientras exista, `ExigirCambioDeClave` manda a esta persona a cambiarla **antes de poder hacer
    nada**. Se borra sola cuando la cambia (`CambiarClaveView`).

    No guarda la clave. Guardar la clave para poder «recordársela» convertiría la base de datos en
    el sitio donde viven las credenciales en claro de todo el equipo, y el respaldo diario en una
    copia de esa lista. La clave se enseña **una vez**, en la pantalla, y si se pierde se genera
    otra — que es un botón y diez segundos.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="clave_provisional",
        verbose_name=_("user"),
    )
    #: Quién la creó. **Es la mitad que hace auditable el alta**: sin esto, una cuenta nueva no dice
    #: quién la abrió, y el registro de auditoría guarda la petición pero no sobrevive a la
    #: retención que algún día se decida.
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cuentas_que_abrio",
        verbose_name=_("created by"),
    )

    class Meta:
        verbose_name = _("provisional password")
        verbose_name_plural = _("provisional passwords")

    def __str__(self):
        return f"{self.usuario} · clave provisional"
