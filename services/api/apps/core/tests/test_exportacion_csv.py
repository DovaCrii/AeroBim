"""Exportar a CSV sin regalar una ejecucion de codigo.

**Una celda que empieza por `=`, `+`, `-` o `@` es una formula** para Excel y para
LibreOffice. Asi que un nombre de entregable escrito por quien sube el documento
—`=cmd|'/c calc'!A1`— se ejecuta en la maquina de quien abra el CSV. Es la inyeccion
de formulas, y es la razon de que este modulo exista.
"""

import pytest

from apps.core.exports import CsvExportMixin, neutralizar


@pytest.mark.parametrize(
    "entrada",
    ["=1+1", "+1", "-1", "@SUM(A1)", "=cmd|'/c calc'!A1", "\tvalor", "\rvalor"],
)
def test_una_celda_no_puede_empezar_una_formula(entrada):
    assert neutralizar(entrada).startswith("'")
    assert neutralizar(entrada) == "'" + entrada


@pytest.mark.parametrize("entrada", ["Muro tipo A", "0-MUROS", "12,5 m", "S3", ""])
def test_un_valor_normal_sale_tal_cual(entrada):
    assert neutralizar(entrada) == entrada


def test_el_nulo_sale_vacio_y_no_como_la_palabra_none():
    assert neutralizar(None) == ""


class _Exportador(CsvExportMixin):
    csv_filename = "prueba.csv"
    csv_fields = ("nombre", "codigo")
    csv_headers = ("Nombre", "Codigo")


class _Fila:
    def __init__(self, nombre, codigo):
        self.nombre = nombre
        self.codigo = codigo


def test_la_respuesta_es_un_adjunto_con_bom_para_que_excel_lea_los_acentos():
    respuesta = _Exportador().csv_response([_Fila("Cimentación", "A-01")])
    cuerpo = respuesta.content.decode("utf-8")

    assert respuesta["Content-Type"].startswith("text/csv")
    assert 'attachment; filename="prueba.csv"' in respuesta["Content-Disposition"]
    assert cuerpo.startswith("﻿")
    assert "Cimentación" in cuerpo
    assert "Nombre;Codigo" in cuerpo


def test_la_formula_tambien_se_neutraliza_al_escribir_la_fila():
    respuesta = _Exportador().csv_response([_Fila("=1+1", "@A1")])
    cuerpo = respuesta.content.decode("utf-8")

    assert "'=1+1" in cuerpo
    assert "'@A1" in cuerpo


def test_sin_lista_de_campos_no_exporta():
    """**La lista blanca es obligatoria.** Con un `"__all__"` basta un campo nuevo con
    algo sensible —el hash de una contraseña— para filtrarlo sin que nadie lo decida."""

    class SinCampos(CsvExportMixin):
        pass

    with pytest.raises(ValueError):
        SinCampos().csv_response([])
