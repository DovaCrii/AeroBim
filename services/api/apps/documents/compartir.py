"""**Un enlace para que alguien de fuera vea un modelo, sin cuenta y sin entrar al registro.**

## Lo que resuelve, y lo que cuesta

Hoy enseñarle un modelo al mandante, al calculista externo o al revisor de la ITO tiene dos
caminos y los dos son malos: mandarle el IFC por correo —que es entregar el archivo para siempre,
sin saber quién lo reenvía— o abrirle una cuenta en AeroBim, que para mirar una vez es demasiado.

Un enlace resuelve eso, y **abre una puerta de verdad**: cualquiera que tenga la dirección entra.
No hay contraseña detrás, porque el sentido del enlace es no pedir nada. Así que todo lo que sigue
está escrito para que esa puerta sea **lo más estrecha posible**.

## Lo que un enlace deja ver, y lo que no

| Deja | No deja |
| --- | --- |
| abrir **una** revisión en el visor | el expediente, ni las demás revisiones |
| girar, medir y mirar propiedades | descargar desde la aplicación |
| saber qué es: obra, entregable, correlativo e **idoneidad** | los hallazgos y los transmittals |
| — | nada de ninguna otra obra ni de ninguna otra organización |

La idoneidad va a propósito: un plano en `S2` no es un plano `A`, y quien lo mira de fuera es
exactamente quien puede confundirlos. Enseñar el modelo sin decir para qué sirve es la manera de
que alguien construya con un preliminar.

## Lo que este enlace **no puede** impedir, dicho sin rodeos

**El navegador recibe los bytes del archivo.** Tiene que recibirlos: el visor dibuja el IFC en la
máquina de quien mira, no en el servidor. Quien sepa abrir las herramientas de desarrollo puede
guardarse ese archivo, y ninguna opción de esta pantalla lo evita.

O sea que «solo ver» significa **sin botón de descarga y sin acceso a nada más**, no que el archivo
sea irrecuperable. Quitar el botón sube el listón lo justo para que nadie lo haga sin querer; no
sirve contra alguien que quiera el archivo. Si algún día hace falta lo segundo, la única respuesta
honesta es **no mandar el IFC**: convertirlo antes a una malla sin propiedades ni identificadores.
Es una funcionalidad aparte y no está escrita.

Mientras tanto, lo que sí controlas está aquí: **caduca, se revoca al instante, y se ve cuántas
veces se abrió** — que es lo que delata un enlace que se reenvió a media obra.
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseModel
from apps.documents.models import Revision

#: Bytes de azar del testigo. 32 bytes son **256 bits**, o sea que adivinarlo no es una amenaza
#: que haya que modelar: no hay fuerza bruta contra esto. `token_urlsafe` los deja en 43
#: caracteres que caben en una URL sin escapar nada y sobreviven a pegarlos en WhatsApp.
BYTES_DEL_TESTIGO = 32

#: Cuánto dura por omisión.
#:
#: **Un enlace sin caducidad es un enlace que olvidaste que hiciste.** Treinta días cubre una
#: revisión de proyecto entera; si hace falta más, se elige al crearlo, y si hace falta menos
#: también. Lo que no se ofrece es «para siempre».
DIAS_POR_OMISION = 30

#: El tope. Un año es lo que dura una etapa de proyecto; más allá, lo que corresponde es una cuenta.
DIAS_MAXIMO = 365


def nuevo_testigo() -> str:
    """El secreto que va en la URL. `secrets`, nunca `random`."""
    return secrets.token_urlsafe(BYTES_DEL_TESTIGO)


class EnlaceCompartido(BaseModel):
    """Una revisión, abierta a quien tenga la dirección, hasta que caduque o la revoques.

    ## Por qué el testigo se guarda tal cual y no cifrado

    Lo normal para un secreto es guardar su huella, no el secreto. Aquí no, y es una decisión, no
    un descuido: **el enlace hay que poder volver a copiarlo**. Quien lo creó el martes y el jueves
    tiene que reenviárselo a otra persona no va a generar uno nuevo — va a buscar el anterior—, y
    con una huella eso es imposible.

    Lo que hace aceptable la decisión es que **este testigo no vale más que el archivo que abre**:
    no da acceso a ninguna otra cosa, no es una credencial de nadie y no se puede usar para entrar.
    Quien pueda leer esta tabla ya puede leer los documentos. Es distinto de una contraseña, que
    abre todo lo de una persona y además suele estar repetida en otro sitio.
    """

    revision = models.ForeignKey(
        Revision,
        on_delete=models.CASCADE,
        related_name="enlaces_compartidos",
        verbose_name=_("revision"),
    )
    #: Lo que va en la URL. Único e indexado: se busca por él en cada visita.
    testigo = models.CharField(
        max_length=64, unique=True, default=nuevo_testigo, editable=False, db_index=True
    )
    #: **Para quién es.** No es decoración: seis enlaces de la misma revisión sin etiqueta son seis
    #: filas idénticas, y entonces revocar «el del calculista» obliga a revocarlos todos.
    para = models.CharField(
        max_length=150,
        verbose_name=_("who it is for"),
        help_text=_("A name you will recognise later, to revoke this one and not the others."),
    )
    expira_en = models.DateTimeField(verbose_name=_("expires"))
    #: **Cuándo se revocó, no si se revocó.** Un booleano dice que alguien lo cerró; la fecha dice
    #: cuándo, que es lo que se pregunta cuando algo se filtró y hay que saber qué ventana hubo.
    revocado_en = models.DateTimeField(null=True, blank=True, verbose_name=_("revoked"))
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="enlaces_compartidos",
        verbose_name=_("created by"),
    )
    #: Cuántas veces se abrió y cuándo fue la última.
    #:
    #: **Es la única señal de que un enlace se fue de las manos.** Uno mandado a una persona que
    #: aparece con ochenta visitas se reenvió; sin este número, eso no se nota nunca.
    visitas = models.PositiveIntegerField(default=0, editable=False)
    ultima_visita = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        verbose_name = _("shared link")
        verbose_name_plural = _("shared links")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.revision} → {self.para}"

    @property
    def caducado(self) -> bool:
        return timezone.now() >= self.expira_en

    @property
    def revocado(self) -> bool:
        return self.revocado_en is not None

    @property
    def vigente(self) -> bool:
        return not self.revocado and not self.caducado

    @property
    def estado(self) -> str:
        """Para la pantalla: `vigente`, `revocado` o `caducado`. **Revocado gana.**

        Si se revocó y además caducó, lo que interesa saber es que alguien lo cerró a mano.
        """
        if self.revocado:
            return "revocado"
        return "caducado" if self.caducado else "vigente"

    def revocar(self):
        self.revocado_en = timezone.now()
        self.save(update_fields=["revocado_en", "updated_at"])

    def anotar_visita(self):
        """Suma una visita **sin leer y volver a escribir**.

        `F()` hace la suma en la base: con dos personas abriendo el enlace a la vez, `visitas + 1`
        calculado en Python pierde una de las dos. Es la misma carrera que dejó duplicados en la
        auditoría, y aquí el número es justo la señal de alarma que se quiere vigilar.
        """
        type(self).objects.filter(pk=self.pk).update(
            visitas=models.F("visitas") + 1, ultima_visita=timezone.now()
        )

    @classmethod
    def vigente_por_testigo(cls, testigo: str):
        """El enlace utilizable que corresponde a ese testigo, o `None`.

        **Una sola consulta y ninguna rama que distinga los motivos**, a propósito: contestar «este
        enlace caducó» a quien prueba testigos le dice que acertó uno. De cara afuera, todo lo que
        no es un enlace vigente es lo mismo.
        """
        if not testigo:
            return None
        return (
            cls.objects.select_related(
                "revision__entregable__proyecto", "revision__entregable__disciplina"
            )
            .filter(testigo=testigo, revocado_en__isnull=True, expira_en__gt=timezone.now())
            .first()
        )


def expiracion_por_omision():
    return timezone.now() + timedelta(days=DIAS_POR_OMISION)
