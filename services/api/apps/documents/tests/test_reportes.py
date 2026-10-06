"""El panel de reportes (`F15.5`): las cifras, los grupos de los gráficos y el orden de la tabla.

Todo con respuestas calculables a mano. Lo que más importa es lo que cada cifra **cuenta y no
cuenta**: una «vencida» que incluyera las cerradas, o unas «cerradas» que incluyeran las
descartadas, harían que alguien llame a quien no debe.
"""

from datetime import date, timedelta

import pytest

from apps.documents.models import Observacion
from apps.documents.reportes import (
    CERRADA,
    DESCARTADA,
    ESTADOS_SIN_PENDIENTE,
    SERIES_CON_NOMBRE,
    Fila,
    agrupar,
    cifras,
    dona,
    ordenar,
)

HOY = date(2026, 10, 6)


def fila(id="x", **kw) -> Fila:
    base = dict(
        id=id,
        titulo=f"Obs {id}",
        estado="abierta",
        estado_texto="Abierta",
        prioridad="media",
        prioridad_texto="Media",
        responsable_id=1,
        responsable="Ana",
        obra="716",
        creada=HOY - timedelta(days=3),
    )
    base.update(kw)
    return Fila(**base)


def valor(filas, clave, usuario=1):
    return {c.clave: c.valor for c in cifras(filas, HOY, usuario)}[clave]


def test_los_estados_sin_pendiente_son_los_del_modelo():
    """El módulo no importa el modelo para seguir siendo puro; esto impide que se separen."""
    assert CERRADA == Observacion.CERRADA
    assert DESCARTADA == Observacion.DESCARTADA
    assert ESTADOS_SIN_PENDIENTE == {Observacion.CERRADA, Observacion.DESCARTADA}


# --- Las cifras -----------------------------------------------------------------------------


def test_abiertas_son_abierta_y_respondida_y_nada_mas():
    filas = [
        fila("a"),
        fila("b", estado="respondida"),
        fila("c", estado="cerrada"),
        fila("d", estado="descartada"),
    ]
    assert valor(filas, "open") == 2


def test_vencida_es_plazo_anterior_a_hoy_y_no_cerrada():
    filas = [
        fila("ayer", vence=HOY - timedelta(days=1)),
        fila("hoy", vence=HOY),  # vence hoy: todavía no está vencida
        fila("sin", vence=None),
        fila("cerrada", estado="cerrada", vence=HOY - timedelta(days=9)),
        fila("descartada", estado="descartada", vence=HOY - timedelta(days=9)),
    ]
    assert valor(filas, "overdue") == 1


def test_vieja_es_mas_de_treinta_dias_abierta():
    filas = [
        fila("31", creada=HOY - timedelta(days=31)),
        fila("30", creada=HOY - timedelta(days=30)),  # justo 30: todavía no
        fila("vieja_cerrada", estado="cerrada", creada=HOY - timedelta(days=90)),
    ]
    assert valor(filas, "open_over_30") == 1


def test_vencen_esta_semana_es_de_hoy_a_dentro_de_seis_dias():
    filas = [
        fila("hoy", vence=HOY),
        fila("d6", vence=HOY + timedelta(days=6)),
        fila("d7", vence=HOY + timedelta(days=7)),  # ya es la semana que viene
        fila("ayer", vence=HOY - timedelta(days=1)),  # vencida, no «esta semana»
    ]
    assert valor(filas, "due_this_week") == 2


def test_asignadas_a_mi_son_las_abiertas_a_mi_nombre():
    filas = [
        fila("mia", responsable_id=7),
        fila("otra", responsable_id=8),
        fila("mia_cerrada", responsable_id=7, estado="cerrada"),
    ]
    assert valor(filas, "assigned_to_me", usuario=7) == 1
    assert valor(filas, "assigned_to_me", usuario=None) == 0


def test_las_descartadas_no_cuentan_como_cerradas():
    """Descartada es «esto no era un problema», no «se corrigió»: contarla como cerrada inflaría lo
    resuelto con ruido."""
    filas = [fila("c", estado="cerrada", cerrada=HOY), fila("d", estado="descartada", cerrada=HOY)]
    assert valor(filas, "closed") == 1
    assert valor(filas, "closed_today") == 1


def test_cerradas_esta_semana_y_hoy():
    filas = [
        fila("hoy", estado="cerrada", cerrada=HOY),
        fila("ayer", estado="cerrada", cerrada=HOY - timedelta(days=1)),
        fila("d6", estado="cerrada", cerrada=HOY - timedelta(days=6)),
        fila("d7", estado="cerrada", cerrada=HOY - timedelta(days=7)),
        fila("sin_fecha", estado="cerrada", cerrada=None),
    ]
    assert valor(filas, "closed") == 5
    assert valor(filas, "closed_this_week") == 3  # hoy, ayer y hace 6 días
    assert valor(filas, "closed_today") == 1


def test_solo_el_atraso_pide_atencion():
    alertas = [c.clave for c in cifras([fila()], HOY, 1) if c.alerta]
    assert alertas == ["overdue"]


def test_sin_filas_todo_es_cero_y_no_falla():
    assert all(c.valor == 0 for c in cifras([], HOY, 1))


# --- Agrupar --------------------------------------------------------------------------------


def test_agrupar_por_responsable_de_mas_a_menos():
    filas = [fila("1", responsable_id=1, responsable="Ana")] * 1 + [
        fila(str(i), responsable_id=2, responsable="Beto") for i in range(3)
    ]
    grupos = agrupar(filas, "responsable")
    assert [(g.etiqueta, g.cantidad) for g in grupos] == [("Beto", 3), ("Ana", 1)]


def test_el_estado_y_la_prioridad_respetan_su_orden_natural_y_no_la_cantidad():
    filas = [
        fila("1", estado="cerrada", estado_texto="Cerrada"),
        fila("2", estado="cerrada", estado_texto="Cerrada"),
        fila("3", estado="abierta"),
    ]
    assert [g.etiqueta for g in agrupar(filas, "estado")] == ["Abierta", "Cerrada"]

    filas = [
        fila("1", prioridad="baja", prioridad_texto="Baja"),
        fila("2", prioridad="alta", prioridad_texto="Alta"),
    ]
    assert [g.etiqueta for g in agrupar(filas, "prioridad")] == ["Alta", "Baja"]


def test_lo_que_pasa_de_las_series_con_nombre_se_junta_en_otros_sin_perder_ninguna():
    filas = [
        fila(str(i), responsable_id=i, responsable=f"P{i}") for i in range(SERIES_CON_NOMBRE + 3)
    ]
    grupos = agrupar(filas, "responsable")
    assert len(grupos) == SERIES_CON_NOMBRE + 1
    # «Otros» es el último y lleva el gris; el texto depende del idioma, así que no se compara.
    assert grupos[-1].serie == SERIES_CON_NOMBRE
    assert grupos[-1].cantidad == 3
    assert sum(g.cantidad for g in grupos) == len(filas)
    # El gris es el último acento, y lo llevan solo «Otros»: las series con nombre usan los otros.
    assert [g.serie for g in grupos] == list(range(SERIES_CON_NOMBRE + 1))


def test_no_se_agrupa_por_lo_que_no_se_conoce():
    with pytest.raises(ValueError):
        agrupar([fila()], "password")


# --- La dona --------------------------------------------------------------------------------


def test_la_dona_reparte_cien_y_cada_arco_empieza_donde_acabo_el_anterior():
    grupos = agrupar(
        [fila("1", responsable_id=1, responsable="A")]
        + [fila(str(i), responsable_id=2, responsable="B") for i in range(3)],
        "responsable",
    )
    arcos = dona(grupos)
    assert [round(a.porcentaje, 6) for a in arcos] == [75.0, 25.0]
    assert [round(a.desde, 6) for a in arcos] == [0.0, 75.0]
    assert sum(a.porcentaje for a in arcos) == pytest.approx(100)


def test_una_dona_sin_datos_no_dibuja_nada():
    assert dona([]) == []


# --- Ordenar la tabla -----------------------------------------------------------------------


def test_por_plazo_lo_mas_urgente_primero_y_lo_sin_plazo_siempre_al_final():
    filas = [
        fila("sin", vence=None),
        fila("tarde", vence=HOY + timedelta(days=9)),
        fila("pronto", vence=HOY - timedelta(days=2)),
    ]
    asc = [f.id for f in ordenar(filas, "vence", descendente=False)]
    desc = [f.id for f in ordenar(filas, "vence", descendente=True)]
    assert asc == ["pronto", "tarde", "sin"]
    assert desc == ["tarde", "pronto", "sin"]  # lo sin plazo, al final también aquí


def test_por_prioridad_alta_primero():
    filas = [
        fila("b", prioridad="baja"),
        fila("a", prioridad="alta"),
        fila("m", prioridad="media"),
    ]
    assert [f.id for f in ordenar(filas, "prioridad", descendente=False)] == ["a", "m", "b"]


def test_una_columna_desconocida_ordena_por_plazo_y_no_falla():
    filas = [fila("b", vence=HOY + timedelta(days=2)), fila("a", vence=HOY)]
    assert [f.id for f in ordenar(filas, "__class__", descendente=False)] == ["a", "b"]
