"""Dejar un aviso dentro de la aplicacion, y contarlos.

## Las dos reglas que gobiernan este modulo

**1. Un aviso no se escribe si no hay a quien.** Ni a uno mismo, ni a una cuenta desactivada. Un
contador que sube por algo que tu acabas de hacer enseña a ignorar el contador, y ese es el unico
modo real de romper una campana.

**2. Escribir un aviso no puede tumbar lo que lo provoco.** Se deja **dentro** de la transaccion del
objeto —asi que o se guardan los dos o ninguno— pero cualquier fallo se traga con un registro. Es la
diferencia con el correo, que vive fuera y por eso ya nos costo un `500` con el objeto guardado.

## Por que aqui y no en `documents/notify.py`

`notify.py` es el canal de **correo**: sabe de SMTP, de direcciones y de lo que cuesta un envio.
Esto es otra cosa y tiene otro ritmo — inmediato, sin coste, y sin riesgo de spam porque **no sale
de la aplicacion**. Mezclarlos haria que apagar el correo apagara tambien la campana, que es
justamente lo que no se quiere: el usuario pidio que el correo lo delimite el coordinador, y la
campana no.

Ademas `Aviso` vive en `core` porque lo escriben varias aplicaciones, y `core` no puede importar de
`documents` sin invertir la dependencia.
"""

from __future__ import annotations

import logging

from django.db.models import QuerySet
from django.utils import timezone

from apps.core.models import Aviso

logger = logging.getLogger("aerobim.avisos")


def avisar(
    *,
    destinatario,
    tipo: str,
    titulo: str,
    url: str,
    detalle: str = "",
    proyecto: str = "",
    de_parte_de=None,
    objeto: str = "",
) -> Aviso | None:
    """Deja un aviso, o `None` si no habia a quien dejarselo.

    Devuelve el aviso para poder comprobarlo; quien llama no necesita mirarlo.
    """
    if destinatario is None or not getattr(destinatario, "is_active", False):
        return None
    # **Nadie se avisa a si mismo.** Es la regla que ya sigue el aviso del hilo por correo
    # (`avisar_comentario`), y por el mismo motivo: un aviso de lo que acabas de hacer tu no informa
    # de nada y enseña a no mirar la campana.
    if de_parte_de is not None and de_parte_de.pk == destinatario.pk:
        return None

    try:
        return Aviso.objects.create(
            destinatario=destinatario,
            tipo=tipo,
            titulo=titulo[:250],
            detalle=detalle[:300],
            url=url[:300],
            proyecto=str(proyecto or "")[:60],
            de_parte_de=de_parte_de,
            objeto=str(objeto or "")[:80],
        )
    except Exception:  # noqa: BLE001
        # **Un aviso que falla no puede llevarse por delante la observacion.** Se registra y se
        # sigue: el trabajo de la persona ya esta guardado y eso es lo que no se puede perder.
        logger.warning("aviso_no_escrito", extra={"item_count": 1}, exc_info=True)
        return None


def sin_leer(usuario) -> QuerySet[Aviso]:
    """Los avisos pendientes de alguien, lo mas nuevo primero."""
    if usuario is None or not getattr(usuario, "is_authenticated", False):
        return Aviso.objects.none()
    return Aviso.objects.filter(destinatario=usuario, leido_en=None)


def cuantos_sin_leer(usuario) -> int:
    """El numero del distintivo rojo. **Una consulta, con indice.**

    Se pinta en cada pagina, asi que no puede ser una lista que se cuente en Python.
    """
    return sin_leer(usuario).count()


def marcar_leidos(usuario, ids=None) -> int:
    """Marca como leidos los de alguien —todos, o los que se nombren—. Devuelve cuantos.

    Nunca toca los de otra persona: el filtro por `destinatario` va siempre, aunque lleguen ids
    sueltos por la URL.
    """
    consulta = sin_leer(usuario)
    if ids:
        consulta = consulta.filter(pk__in=ids)
    return consulta.update(leido_en=timezone.now())
