"""Avisar a quien le toca, con lo que necesita para actuar.

**Es la funcion, no un adorno.** Lo que el usuario pidio es que quien tiene que hacer
algo se entere y le llegue la informacion necesaria: un aviso que no sale, o que sale
sin el enlace, deja el registro documental como una lista que alguien tiene que
acordarse de mirar.

Por eso todo pasa por `apps.core.mail`: **un aviso que dice "enviado" cuando solo se
imprimio en el log es peor que no tener avisos**, y esa es la historia de ese modulo.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.core.mail import mail_is_delivered
from apps.documents.models import Actividad, Observacion

logger = logging.getLogger("aerobim.jobs")

# Los tramos del resumen. Son los de AeroControl y por la misma razon: "vence pronto"
# no es una sola cosa —lo que vencio ayer y lo que vence en un mes piden reacciones
# distintas— y un resumen que los mezcla no se lee.
TRAMOS = ((None, 0, "vencido"), (0, 7, "en_7"), (7, 15, "en_15"), (15, 30, "en_30"))


def enlace(ruta: str) -> str:
    """Un enlace absoluto. En un correo no hay peticion de la que deducir el dominio."""
    return f"{settings.SITE_BASE_URL}{ruta}"


def _destinatario(usuario) -> str | None:
    correo = (usuario.email or "").strip()
    return correo or None


def avisar_comentario(comentario) -> list[str]:
    """Avisa de una respuesta en el hilo de un hallazgo. Devuelve **a quién se avisó**.

    ## El hueco que cierra

    Un hallazgo se abre y se avisa; se reparte y se avisa; **se contesta y no se avisaba a nadie**.
    Alguien respondía «esto ya está corregido en la revisión B» y quien lo había abierto no se
    enteraba hasta que volviera a entrar y mirara — es decir, hasta la siguiente reunión de
    coordinación, que es exactamente lo que el hilo existe para evitar.

    Es el aviso que más falta hace de los tres, porque es el único que corresponde a **algo que
    espera respuesta**. Los otros dos avisan de trabajo asignado, que además sale en el resumen
    diario; una respuesta no sale en ningún sitio.

    ## A quién, y por qué solo a dos

    Al **autor** y al **responsable**, quitando a quien acaba de escribir. Son las dos personas
    entre las que va el hallazgo: quien lo encontró y quien tiene que resolverlo.

    **No a todos los que comentaron antes**, y es deliberado: en un hilo de coordinación con seis
    intervenciones eso son seis correos por respuesta, y el resultado conocido es que la gente
    filtra el remitente — y entonces tampoco lee el aviso que sí importaba. Ver `mail.py`, que
    existe por esta lección.

    ## Y por qué devuelve la lista y no un booleano

    Porque quien llama tiene que poder decir en la pantalla **si el aviso salió o no**: con `True`
    no se distingue «avisé a una persona» de «no había a quién avisar», y esa diferencia es la que
    decide si quien escribió puede dar por hecho que el otro se enteró.
    """
    observacion = comentario.observacion
    quien_escribe = comentario.autor_id

    # **Se quita lo repetido por la dirección, no por la persona.**
    #
    # Es el caso normal: el autor y el responsable suelen ser la misma persona en un hallazgo que
    # alguien se abrió a sí mismo. Y también el raro: dos cuentas distintas con el mismo correo —el
    # campo `email` de Django **no es único**—, que es lo que una prueba cazó aquí. Las dos veces el
    # resultado sería la misma dirección dos veces en el `to`, y eso se lee como un error del
    # sistema, no como dos avisos.
    #
    # Se conserva el orden en que se recorren para que el correo salga siempre igual y una prueba
    # pueda compararlo.
    destinos: dict[str, None] = {}
    for persona in (observacion.autor, observacion.responsable):
        if persona is None or persona.pk == quien_escribe:
            continue
        correo = _destinatario(persona)
        if correo is None:
            logger.warning(
                "aviso_sin_destinatario",
                extra={"recipient": str(persona), "item_count": 1},
            )
            continue
        destinos[correo.lower()] = None

    if not destinos:
        return []

    asunto = _("[AeroBim] New reply: %(titulo)s") % {"titulo": observacion.titulo}
    # **El texto del comentario va dentro del correo, recortado.** Un aviso que solo dice «hay una
    # respuesta» obliga a entrar para saber si hacía falta entrar, y la mitad de las veces no hacía
    # falta. El recorte evita que un comentario largo convierta el correo en el sitio donde se lee
    # el hilo, que es lo que haría que nadie volviera a la aplicación.
    texto = (comentario.texto or "").strip()
    recortado = texto if len(texto) <= 600 else texto[:600].rstrip() + "…"

    cuerpo = "\n".join(
        [
            _("%(quien)s replied on an observation you are part of.")
            % {"quien": comentario.autor.get_full_name() or comentario.autor.get_username()},
            "",
            f"{observacion.titulo}",
            _("Project: %(p)s") % {"p": observacion.proyecto},
            "",
            recortado,
            "",
            enlace(f"/documentos/observaciones/{observacion.pk}/"),
        ]
    )

    send_mail(
        asunto,
        cuerpo,
        settings.DEFAULT_FROM_EMAIL,
        list(destinos),
        fail_silently=False,
    )
    logger.info(
        "aviso_de_comentario",
        extra={"recipient": ", ".join(destinos), "item_count": len(destinos)},
    )
    return list(destinos)


def avisar_asignacion(objeto) -> bool:
    """Avisa al responsable de una observacion o de una actividad recien asignada.

    Devuelve `True` si se intento enviar. **Un responsable sin correo no es un error
    silencioso**: se registra, porque es un aviso que nadie va a recibir y el sistema
    tiene que poder decir cuantos van asi.
    """
    correo = _destinatario(objeto.responsable)
    if correo is None:
        logger.warning(
            "aviso_sin_destinatario",
            extra={"recipient": str(objeto.responsable), "item_count": 1},
        )
        return False

    if isinstance(objeto, Observacion):
        asunto = _("[AeroBim] Observation assigned: %(titulo)s") % {"titulo": objeto.titulo}
        ruta = f"/documentos/observaciones/{objeto.pk}/"
        que = _("observation")
    else:
        asunto = _("[AeroBim] Activity assigned: %(titulo)s") % {"titulo": objeto.titulo}
        ruta = f"/documentos/actividades/{objeto.pk}/"
        que = _("activity")

    vence = objeto.vence.isoformat() if objeto.vence else _("no due date")
    cuerpo = "\n".join(
        [
            _("You have been assigned a %(que)s in AeroBim.") % {"que": que},
            "",
            f"{objeto.titulo}",
            "",
            _("Project: %(p)s") % {"p": objeto.proyecto},
            _("Due: %(v)s") % {"v": vence},
            "",
            (objeto.descripcion or "").strip(),
            "",
            enlace(ruta),
        ]
    )

    send_mail(asunto, cuerpo, settings.DEFAULT_FROM_EMAIL, [correo], fail_silently=False)
    logger.info(
        "aviso_de_asignacion",
        extra={
            "recipient": correo,
            "item_count": 1,
            "send_result": "enviado" if mail_is_delivered() else "impreso",
        },
    )
    return True


def avisar_transmittal(transmittal) -> tuple[int, list[str]]:
    """Avisa a los destinatarios de un transmittal emitido.

    Devuelve **cuantos se avisaron y a quienes no se pudo**. Los dos numeros importan y por
    eso van los dos: emitir un transmittal es un acto con consecuencias contractuales, y
    "se emitio" sin decir que dos de los cinco destinatarios no tienen correo es la clase
    de silencio que hace que nadie se entere hasta la reunion.

    **El correo lleva la lista de documentos**, no solo el enlace. Quien lo recibe tiene que
    poder saber que le mandaron sin entrar, porque muchas veces lo lee en el telefono y en
    obra; y el enlace esta para lo otro, que es descargarlos.
    """
    documentos = [
        f"  · {revision.entregable.codigo}  rev. {revision.correlativo}  "
        f"[{revision.idoneidad}]  {revision.entregable.titulo}"
        for revision in transmittal.revisiones.select_related("entregable")
    ]
    cuerpo = "\n".join(
        [
            _("%(quien)s has issued a transmittal to you in AeroBim.")
            % {"quien": transmittal.emisor},
            "",
            f"{transmittal.folio} · {transmittal.asunto}",
            "",
            _("Project: %(p)s") % {"p": transmittal.proyecto},
            _("Documents (%(n)s):") % {"n": len(documentos)},
            *documentos,
            "",
            enlace(f"/documentos/transmittals/{transmittal.pk}/"),
        ]
    )
    asunto = _("[AeroBim] Transmittal %(folio)s: %(asunto)s") % {
        "folio": transmittal.folio,
        "asunto": transmittal.asunto,
    }

    avisados = 0
    sin_correo: list[str] = []
    for destinatario in transmittal.destinatarios.all():
        correo = _destinatario(destinatario)
        if correo is None:
            sin_correo.append(str(destinatario))
            continue
        send_mail(asunto, cuerpo, settings.DEFAULT_FROM_EMAIL, [correo], fail_silently=False)
        avisados += 1

    logger.info(
        "transmittal_emitido",
        extra={
            "recipient": transmittal.folio,
            "item_count": len(documentos),
            "send_result": "enviado" if mail_is_delivered() else "impreso",
        },
    )
    if sin_correo:
        logger.warning(
            "transmittal_sin_destinatario",
            extra={"recipient": ", ".join(sin_correo), "item_count": len(sin_correo)},
        )
    return avisados, sin_correo


def pendientes_por_tramo(usuario) -> dict[str, list]:
    """Lo que le queda a alguien, repartido en los tramos del resumen."""
    hoy = timezone.localdate()
    salida: dict[str, list] = {nombre: [] for _d, _h, nombre in TRAMOS}

    abiertas = list(
        Observacion.objects.filter(responsable=usuario)
        .exclude(estado__in=[Observacion.CERRADA, Observacion.DESCARTADA])
        .exclude(vence=None)
        .select_related("proyecto")
    ) + list(
        Actividad.objects.filter(responsable=usuario)
        .exclude(status__in=[Actividad.HECHA, Actividad.ANULADA])
        .exclude(vence=None)
        .select_related("proyecto")
    )

    for item in abiertas:
        dias = (item.vence - hoy).days
        for desde, hasta, nombre in TRAMOS:
            if desde is None and dias < hasta:
                salida[nombre].append(item)
                break
            if desde is not None and desde <= dias < hasta:
                salida[nombre].append(item)
                break
    return salida


def enviar_resumen(usuario) -> int:
    """Un correo con lo que le queda, o ninguno si no le queda nada.

    **No se manda un resumen vacio.** Un correo que dice "no tienes nada" todas las
    mañanas enseña a archivar el remitente sin leerlo, y entonces el dia que si trae algo
    tampoco se lee.
    """
    correo = _destinatario(usuario)
    if correo is None:
        return 0

    tramos = pendientes_por_tramo(usuario)
    total = sum(len(v) for v in tramos.values())
    if total == 0:
        return 0

    etiquetas = {
        "vencido": _("Overdue"),
        "en_7": _("Next 7 days"),
        "en_15": _("Next 15 days"),
        "en_30": _("Next 30 days"),
    }
    lineas = [_("What is on your plate in AeroBim."), ""]
    for _d, _h, nombre in TRAMOS:
        items = tramos[nombre]
        if not items:
            continue
        lineas.append(f"{etiquetas[nombre]} ({len(items)}):")
        for item in items:
            lineas.append(f"  · {item.vence.isoformat()}  {item.titulo}  [{item.proyecto}]")
        lineas.append("")
    lineas.append(enlace("/"))

    send_mail(
        _("[AeroBim] %(n)s items on your plate") % {"n": total},
        "\n".join(lineas),
        settings.DEFAULT_FROM_EMAIL,
        [correo],
        fail_silently=False,
    )
    logger.info(
        "resumen_enviado",
        extra={
            "recipient": correo,
            "item_count": total,
            "send_result": "enviado" if mail_is_delivered() else "impreso",
        },
    )
    return total
