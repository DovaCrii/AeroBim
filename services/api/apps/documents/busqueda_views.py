"""La pantalla del buscador del registro (`F15.6`). Ver `busqueda.py` para qué se compara.

## Quién la ve y qué ve

**Pide `view_entregable`**, que es el permiso del registro documental, y **acota por organización en
la consulta**. Las observaciones salen **solo si además tiene `view_observacion`**: son dos permisos
distintos y un buscador que los mezclara le enseñaría un hallazgo a quien no puede abrirlo. Cada
grupo lleva su tope: una búsqueda que devuelve mil filas no se lee, y el aviso dice cuántas más hay.
"""

import operator
from functools import reduce

from django.db.models import Q
from django.views.generic import TemplateView

from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import ModelViewPermissionRequiredMixin
from apps.documents.busqueda import MINIMO_DE_LETRAS, terminos_de
from apps.documents.models import Entregable, Observacion
from apps.documents.seguimiento import sin_obras_archivadas

#: Cuántas filas enseña cada grupo. El resto se cuenta y se dice.
FILAS_POR_GRUPO = 25


def _todos_los_terminos(terminos: list[str], *campos: str) -> Q:
    """Cada término en **algún** campo, y **todos** los términos presentes."""
    return reduce(
        operator.and_,
        (reduce(operator.or_, (Q(**{f"{c}__icontains": t}) for c in campos)) for t in terminos),
    )


class BuscarView(ModelViewPermissionRequiredMixin, TemplateView):
    template_name = "documents/buscar.html"
    model = Entregable

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        usuario = self.request.user
        consulta = (self.request.GET.get("q") or "").strip()
        terminos = terminos_de(consulta)

        contexto.update(
            consulta=consulta,
            hay_busqueda=bool(terminos),
            # Dice por qué no se buscó, en vez de enseñar una pantalla vacía que se lee como «no hay
            # nada».
            demasiado_corta=bool(consulta) and not terminos,
            minimo_de_letras=MINIMO_DE_LETRAS,
            filas_por_grupo=FILAS_POR_GRUPO,
        )
        if not terminos:
            return contexto

        entregables = (
            scope_queryset_to_organizacion(Entregable.objects.all(), usuario)
            .filter(is_active=True)
            .exclude(proyecto__is_active=False)
            .filter(_todos_los_terminos(terminos, "codigo", "titulo"))
            .select_related("proyecto", "disciplina")
            .order_by("codigo")
        )
        contexto["entregables_total"] = entregables.count()
        contexto["entregables"] = list(entregables[:FILAS_POR_GRUPO])

        # Los hallazgos, **solo si puede abrirlos**: son otro permiso y otro modelo.
        puede_ver_observaciones = usuario.has_perm("documents.view_observacion")
        contexto["puede_ver_observaciones"] = puede_ver_observaciones
        if puede_ver_observaciones:
            observaciones = (
                sin_obras_archivadas(
                    scope_queryset_to_organizacion(Observacion.objects.all(), usuario), "proyecto"
                )
                .filter(_todos_los_terminos(terminos, "titulo", "descripcion"))
                .select_related("proyecto", "responsable")
                .order_by("-created_at")
            )
            contexto["observaciones_total"] = observaciones.count()
            contexto["observaciones"] = list(observaciones[:FILAS_POR_GRUPO])
        return contexto
