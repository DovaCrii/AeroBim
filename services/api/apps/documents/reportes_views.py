"""Las pantallas del panel de reportes: la página y su exportación a CSV (`F15.5`).

Ver `reportes.py` para qué cuenta cada cifra. Aquí solo se arma lo que la pantalla necesita: se
lee lo que esta persona puede ver, se convierte en filas y se le pasa a las funciones puras.

## Quién la ve

**Pide `view_observacion` y `change_observacion`, como el seguimiento del equipo**, y por el
mismo motivo: todos los roles tienen el primero, el mandante incluido, y lo que enseña esta
pantalla —cuánto lleva cada persona, quién va atrasado— es información interna de la oficina.
Acotada por organización en la consulta, no solo por el permiso.
"""

import csv
import uuid

from django.http import HttpResponse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.translation import pgettext
from django.views.generic import TemplateView, View

from apps.core.exports import neutralizar
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import ModelPermissionRequiredMixin
from apps.documents import reportes
from apps.documents.models import Observacion
from apps.documents.seguimiento import sin_obras_archivadas
from apps.projects.models import Proyecto

#: Cuántas filas enseña la tabla de la pantalla. La exportación lleva **todas**: una tabla de
#: cientos de filas en pantalla no se lee, pero quien exporta la quiere entera.
FILAS_EN_PANTALLA = 200


def _fila_de(o: Observacion) -> reportes.Fila:
    hoy_local = timezone.localtime
    return reportes.Fila(
        id=str(o.pk),
        titulo=o.titulo,
        estado=o.estado,
        estado_texto=o.get_estado_display(),
        prioridad=o.prioridad,
        prioridad_texto=o.get_prioridad_display(),
        responsable_id=o.responsable_id,
        responsable=o.responsable.get_full_name() or o.responsable.get_username(),
        obra=o.proyecto.codigo,
        creada=hoy_local(o.created_at).date(),
        vence=o.vence,
        cerrada=hoy_local(o.cerrada_en).date() if o.cerrada_en is not None else None,
        es_interferencia=bool(o.interferencia_con),
    )


class _ReporteBase(ModelPermissionRequiredMixin):
    model = Observacion
    permission_action = "change"

    def get_permission_required(self):
        return ("documents.view_observacion", *super().get_permission_required())

    def datos(self):
        """Las obras visibles, la elegida (o `None`) y las filas de lo que se ve.

        **La obra se valida contra las visibles** y se parsea antes: la clave es un UUID y
        `filter(pk="abc")` lanza en vez de devolver vacío, o sea un 500 por un enlace mal copiado.
        """
        usuario = self.request.user
        obras = scope_queryset_to_organizacion(Proyecto.objects.all(), usuario).filter(
            is_active=True
        )
        pedida = self.request.GET.get("obra", "")
        try:
            obra = obras.filter(pk=uuid.UUID(pedida)).first() if pedida else None
        except ValueError:
            obra = None

        consulta = sin_obras_archivadas(
            scope_queryset_to_organizacion(Observacion.objects.all(), usuario), "proyecto"
        ).select_related("responsable", "proyecto")
        if obra is not None:
            consulta = consulta.filter(proyecto=obra)
        return obras, obra, [_fila_de(o) for o in consulta]

    def orden_pedido(self) -> tuple[str, bool]:
        """La columna y el sentido, con lo desconocido cayendo en el plazo, ascendente."""
        columna = self.request.GET.get("orden", "vence")
        if columna not in reportes.COLUMNAS:
            columna = "vence"
        return columna, self.request.GET.get("sentido") == "desc"


class ReportesView(_ReporteBase, TemplateView):
    template_name = "documents/reportes.html"

    def _propiedad(self, nombre: str, por_defecto: str) -> str:
        pedida = self.request.GET.get(nombre, por_defecto)
        return pedida if pedida in reportes.PROPIEDADES else por_defecto

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        obras, obra, filas = self.datos()
        hoy = timezone.localdate()
        columna, descendente = self.orden_pedido()

        circulo = self._propiedad("circulo", "responsable")
        barras = self._propiedad("barras", "estado")
        # Los gráficos cuentan **lo abierto y lo cerrado juntos** salvo que se agrupe por estado: un
        # reparto por responsable de solo lo cerrado no dice quién tiene trabajo.
        para_graficos = [f for f in filas if f.abierta] if circulo != "estado" else filas
        ordenadas = reportes.ordenar(filas, columna, descendente)

        contexto.update(
            obras=obras.order_by("codigo"),
            obra=obra,
            hoy=hoy,
            cifras=[
                (c, reportes.ROTULOS[c.clave], reportes.DEFINICIONES[c.clave])
                for c in reportes.cifras(filas, hoy, self.request.user.pk)
            ],
            circulo=circulo,
            barras=barras,
            propiedades=reportes.PROPIEDADES,
            segmentos=reportes.dona(reportes.agrupar(para_graficos, circulo)),
            grupos_de_barras=_con_ancho(reportes.agrupar(filas, barras)),
            # Cada fila con su atraso, calculado aquí una vez y no restando fechas en la plantilla.
            filas=[(f, f.dias_de_atraso(hoy)) for f in ordenadas[:FILAS_EN_PANTALLA]],
            total_filas=len(ordenadas),
            columna=columna,
            sentido="desc" if descendente else "asc",
            columnas=reportes.COLUMNAS,
        )
        return contexto


def _con_ancho(grupos):
    """Cada grupo con lo que mide su barra, en porcentaje de la mayor. Sin datos, sin barras."""
    mayor = max((g.cantidad for g in grupos), default=0)
    return [(g, round(g.cantidad * 100 / mayor, 1) if mayor else 0) for g in grupos]


class ReportesCsvView(_ReporteBase, View):
    """La tabla entera en CSV, para abrirla en Excel. Mismo permiso y mismo acotado que la pantalla.

    **Cada celda pasa por `neutralizar`**: un título que empiece por `=` es una fórmula para
    Excel, y lo escribe quien sea que abra una observación. Ver `apps/core/exports.py`.
    """

    def get(self, request, *args, **kwargs):
        _obras, _obra, filas = self.datos()
        hoy = timezone.localdate()
        columna, descendente = self.orden_pedido()

        respuesta = HttpResponse(content_type="text/csv; charset=utf-8")
        respuesta["Content-Disposition"] = f'attachment; filename="reporte-{hoy:%Y-%m-%d}.csv"'
        # El BOM es lo que hace que Excel en Windows lea los acentos.
        respuesta.write("﻿")
        escritor = csv.writer(respuesta, delimiter=";")
        escritor.writerow(
            [
                _("Title"),
                pgettext("observation field", "Status"),
                _("Priority"),
                _("Owner"),
                _("Due"),
                _("Days late"),
                _("Work"),
                _("Origin"),
                _("Opened"),
            ]
        )
        for f in reportes.ordenar(filas, columna, descendente):
            escritor.writerow(
                [
                    neutralizar(valor)
                    for valor in (
                        f.titulo,
                        f.estado_texto,
                        f.prioridad_texto,
                        f.responsable,
                        f.vence.isoformat() if f.vence else "",
                        f.dias_de_atraso(hoy) or "",
                        f.obra,
                        _("Clash") if f.es_interferencia else _("Note"),
                        f.creada.isoformat(),
                    )
                ]
            )
        return respuesta
