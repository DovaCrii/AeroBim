"""Exportar a CSV sin regalar una ejecucion de codigo.

Portado de AeroControl. **Una celda que empieza por `=`, `+`, `-` o `@` es una
formula** para Excel y para LibreOffice, asi que un nombre de entregable como
`=cmd|'/c calc'!A1` —escrito por quien sea que suba un documento— se ejecuta en la
maquina de quien abra el CSV. Es la inyeccion de formulas, y se neutraliza
prefijando un apostrofo.
"""

import csv

from django.http import HttpResponse

PELIGROSOS = ("=", "+", "-", "@", "\t", "\r")


def neutralizar(valor) -> str:
    """El valor, sin poder empezar una formula."""
    texto = "" if valor is None else str(valor)
    if texto.startswith(PELIGROSOS):
        return "'" + texto
    return texto


class CsvExportMixin:
    """Exporta el queryset de la vista a CSV, con una **lista blanca** de campos.

    La lista blanca no es prudencia de mas: la exportacion de usuarios de AeroControl
    la lleva justamente para que el hash de la contraseña no pueda salir nunca. Con un
    `fields = "__all__"` basta un modelo nuevo con un campo sensible para filtrarlo.
    """

    csv_filename = "export.csv"
    csv_fields: tuple[str, ...] = ()
    csv_headers: tuple[str, ...] = ()

    def csv_response(self, queryset):
        if not self.csv_fields:
            raise ValueError("Una exportacion CSV necesita su lista de campos.")

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{self.csv_filename}"'
        # El BOM es lo que hace que Excel en Windows lea los acentos.
        response.write("﻿")

        escritor = csv.writer(response, delimiter=";")
        escritor.writerow(self.csv_headers or self.csv_fields)
        for objeto in queryset:
            fila = []
            for campo in self.csv_fields:
                valor = objeto
                for parte in campo.split("__"):
                    valor = getattr(valor, parte, None)
                    if valor is None:
                        break
                fila.append(neutralizar(valor))
            escritor.writerow(fila)
        return response
