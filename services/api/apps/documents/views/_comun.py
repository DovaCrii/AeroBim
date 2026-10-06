"""Lo que comparten las vistas del registro: qué se ve, y avisar al guardar."""

import logging

from django.contrib import messages
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _

from apps.core.audit import set_audit_context
from apps.core.tenancy import organizaciones_visibles, scope_queryset_to_organizacion
from apps.documents.models import (
    IDONEIDADES_PUBLICADAS,
    Observacion,
    Revision,
)
from apps.documents.notify import avisar_asignacion

#: Para lo que no puede tumbar una petición pero tiene que dejar rastro: el aviso del hilo cuando el
#: correo falla. Sin esto, «se guardó pero no se avisó» sería una frase en la pantalla y nada más.
logger = logging.getLogger("aerobim.jobs")


def solo_publicadas(queryset, user):
    """Un mandante ve **solo lo publicado**, y eso no lo puede decir un permiso.

    `view_revision` dice "puede ver revisiones"; no sabe distinguir una `S0` en curso de
    una `A1` autorizada. La diferencia es contractual —lo que está en curso no obliga a
    nadie y no se enseña— así que la pone la vista, con la regla escrita en un solo sitio.
    """
    if user.has_perm("documents.change_revision") or user.has_perm("documents.add_revision"):
        return queryset
    return queryset.filter(idoneidad__in=IDONEIDADES_PUBLICADAS)


def revisiones_visibles(user):
    """Las revisiones que este usuario puede leer, acotadas y filtradas.

    **Se acota a mano y no con `scope_queryset_to_organizacion`.** Una `Revision` no lleva el
    campo `organizacion` —cuelga de su entregable—, y ese ayudante devuelve intacto un modelo
    que no lo tiene: confiar en él dejaría el hueco abierto.

    Vive aquí, junto a {@link solo_publicadas}, porque la regla la necesitan **dos sitios**: la
    API que alimenta al visor y el desplegable de revisiones al armar un transmittal. Escrita
    una vez, no se puede olvidar en uno de los dos.
    """
    ids = organizaciones_visibles(user)
    consulta = Revision.objects.select_related("entregable__proyecto", "entregable__disciplina")
    if not user.is_superuser:
        if not ids:
            return consulta.none()
        consulta = consulta.filter(entregable__organizacion_id__in=ids)
    return solo_publicadas(consulta, user)


def observacion_visible(request, pk) -> Observacion:
    """La observación, **o 404 si es de otra organización**. Levanta `Http404`, como su nombre pide.

    ## Por qué esto existe en vez de `get_object_or_404(Observacion, pk=…)`

    Siete vistas usaban esa segunda forma. `ModelPermissionRequiredMixin` comprueba el **permiso** y
    nada más: `change_observacion` dice que esta persona puede cerrar hallazgos, no *cuáles*. Sin
    acotar, el `pk` de la URL alcanzaba cualquier fila de la tabla.

    **Medido antes de escribir esto** (`tests/test_no_se_cruzan_las_organizaciones.py`), con una
    cuenta de una organización actuando sobre un hallazgo de otra:

    | | |
    | --- | --- |
    | comentar | **escribió** en el hilo ajeno, y de paso lo pasó a «respondida» |
    | cerrar | **cerró** el hallazgo ajeno |
    | cambiar idoneidad | **aprobó** un documento de obra ajeno, de `A` a `B` |
    | repartir, etiquetar | 302 sin efecto: el formulario rechaza un valor de fuera de la obra |

    Los dos últimos no escribían **por casualidad**: lo impide la validación del formulario, que
    está ahí por otro motivo. Pasan por aquí igual — un acotado que depende de que otro control no
    cambie no es un acotado.

    `Observacion` **sí** lleva el campo `organizacion`, así que aquí el ayudante genérico sirve; es
    `Revision` y `Comentario` los que no, y por eso tienen su propio camino.
    """
    return get_object_or_404(
        scope_queryset_to_organizacion(Observacion.objects.all(), request.user), pk=pk
    )


def crear_con_aviso(objeto, request, accion: str):
    """Guarda y **avisa al responsable**, que es la mitad de lo que se vino a hacer."""
    objeto.save()
    set_audit_context(request, objeto, action=accion)
    if not avisar_asignacion(objeto):
        messages.warning(
            request,
            _("Saved, but %(quien)s has no email address: nobody was notified.")
            % {"quien": objeto.responsable},
        )
    return objeto
