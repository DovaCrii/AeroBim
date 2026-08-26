"""¿El correo de esta aplicacion sale de la maquina, o solo se imprime?

**Portado de AeroControl, y con su historia**, porque es la clase de defecto que
se repite en cada aplicacion que manda avisos. Alli, durante meses, el servidor
corrio con `EMAIL_HOST` vacio. Django cae entonces al backend de consola —decision
deliberada, para que un despliegue mal configurado imprima el correo en vez de
perderlo— y cada trabajo de notificacion siguio terminando en `Enviado a N
destinatarios`. O sea que **la aplicacion afirmaba haber enviado lo que solamente
habia impreso**, y el informe entero quedaba escrito en el journal de systemd.

Se descubrio porque alguien pego la salida del servicio y ahi estaba el correo en
crudo. Nada en la aplicacion lo decia.

En AeroBim esto importa igual o mas: el aviso de que a alguien le asignaron una
observacion **es** la funcion. Un aviso que no sale y dice que salio es peor que
no tener avisos.
"""

from django.conf import settings

# Los backends que **no entregan**: consola imprime, filebased escribe a disco,
# dummy descarta. Los tres son legitimos en desarrollo y ninguno sirve en
# produccion.
#
# `locmem` queda **fuera** a proposito, y no por descuido: Django lo instala el
# mismo durante los tests, donde la entrega se comprueba con `mail.outbox`.
# Incluirlo haria que toda la suite corriera con la advertencia encendida, que es
# la forma mas rapida de que un aviso deje de significar algo.
BACKENDS_QUE_NO_ENTREGAN = (
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
)

# Va **delante** del resumen de un `JobRun` para que se lea en una columna angosta
# sin abrir la fila.
PREFIJO_NO_ENVIADO = "NO ENVIADO (correo sin configurar) · "


def mail_is_delivered() -> bool:
    """`True` si el backend configurado entrega de verdad."""
    return settings.EMAIL_BACKEND not in BACKENDS_QUE_NO_ENTREGAN


def undelivered_reason() -> str:
    """Por que no se entrega, en una linea, o `""` si si se entrega.

    Nombra **la variable que falta**, no el backend: quien lee esto en un log a las
    3 AM necesita saber que escribir en el entorno, no como se llama la clase de
    Python que Django eligio por el.
    """
    if mail_is_delivered():
        return ""
    if not settings.EMAIL_HOST:
        return (
            "EMAIL_HOST no esta configurado, asi que el correo se imprime en el log en vez "
            "de enviarse. Faltan EMAIL_HOST / EMAIL_PORT / EMAIL_HOST_USER / "
            "EMAIL_HOST_PASSWORD / DEFAULT_FROM_EMAIL en el entorno."
        )
    # `EMAIL_HOST` puesto y aun asi un backend que no entrega: alguien fijo
    # `EMAIL_BACKEND` a mano. Decirlo tal cual, porque el consejo de arriba no
    # aplica y repetirlo mandaria a revisar una variable que ya esta bien.
    return (
        f"EMAIL_BACKEND={settings.EMAIL_BACKEND} no entrega correo: se imprime o se "
        "descarta, aunque EMAIL_HOST este configurado."
    )


def warn_undelivered_mail(command) -> bool:
    """Avisa en la salida del comando que lo que sigue no se va a enviar.

    Se llama **antes** de mandar, no despues: puesto al final quedaria debajo del
    volcado del propio correo, que en un informe con adjunto son cientos de lineas
    —o sea, invisible justo en el caso que mas importa.

    **Avisa una sola vez por comando**, aunque se llame en un bucle: catorce copias
    del mismo parrafo son ruido que enseña a saltarse el bloque entero. La marca vive
    en el objeto del comando, asi que no hay estado global que se filtre entre tests.
    """
    if getattr(command, "_undelivered_mail_warned", False):
        return False
    motivo = undelivered_reason()
    if not motivo:
        return False
    command._undelivered_mail_warned = True
    command.stderr.write(command.style.ERROR(f"CORREO NO ENVIADO: {motivo}"))
    return True


def send_verb(dry_run: bool = False) -> str:
    """El verbo con que un trabajo cuenta lo que hizo, sin mentir."""
    if dry_run:
        return "Se enviaria"
    return "Enviado" if mail_is_delivered() else "IMPRESO, NO ENVIADO:"
