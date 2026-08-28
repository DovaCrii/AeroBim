"""El calculo del tablero: la ventana, las barras, la rejilla del mes y el avance.

**Se prueba con figuras de tamano conocido**, que es la unica forma de saber que una barra esta
donde dice. Una barra mal posicionada **no da error**: se dibuja en el sitio equivocado y parece un
dato — es el mismo motivo por el que el perimetro de un cuadrado de 4 m se prueba contra 16 y no
contra «lo que devuelva».
"""

from dataclasses import dataclass
from datetime import date

import pytest

from apps.projects.tablero import (
    ANCHO_MINIMO_PCT,
    avance_por_disciplina,
    mes_de,
    tramos_de,
    ventana_de,
)


@dataclass
class DisciplinaFalsa:
    codigo: str
    nombre: str
    color: str


@dataclass
class EntregableFalso:
    """Lo justo que la linea de tiempo necesita. Sin base de datos: es calculo puro."""

    codigo: str
    titulo: str
    fecha_planificada: date | None
    avance: float
    peso: float = 1.0
    disciplina: DisciplinaFalsa | None = None


# --- La ventana ----------------------------------------------------------------------


def test_las_fechas_del_proyecto_mandan_y_se_deja_margen():
    """Son la promesa contractual. El margen existe para que la primera barra no quede pegada al
    borde, donde no se distingue del marco."""
    ventana = ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])

    assert ventana is not None
    assert ventana.inicio == date(2025, 12, 25)
    assert ventana.fin == date(2027, 1, 7)


def test_un_entregable_fuera_de_plazo_amplia_la_ventana():
    """**Es justamente lo que hay que ver.** Recortarlo al termino del proyecto esconderia que hay
    algo planificado despues de la fecha de entrega."""
    ventana = ventana_de(date(2026, 1, 1), date(2026, 6, 30), [date(2026, 11, 15)])

    assert ventana.fin > date(2026, 11, 15)


def test_sin_ninguna_fecha_no_hay_linea_de_tiempo():
    """No es un grafico vacio: es un grafico que no se puede dibujar. La pantalla lo dice en vez de
    mostrar un marco con nada dentro."""
    assert ventana_de(None, None, [None, None]) is None


def test_una_sola_fecha_abre_un_mes_a_cada_lado():
    """Una sola fecha no define un intervalo, y dividir por cero dias daria `inf`."""
    ventana = ventana_de(None, None, [date(2026, 5, 10)])

    assert ventana.inicio < date(2026, 5, 10) < ventana.fin
    assert ventana.dias >= 60


def test_los_extremos_caen_en_cero_y_en_cien():
    ventana = ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])

    assert ventana.porcentaje(ventana.inicio) == 0.0
    assert ventana.porcentaje(ventana.fin) == 100.0


def test_la_mitad_del_intervalo_cae_en_la_mitad():
    """La figura de tamano conocido: un año exacto, y el 1 de julio cae al 50% con menos de un
    punto de error —los 365 dias no se parten en dos exactos—."""
    ventana = ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])
    medio = ventana.inicio + (ventana.fin - ventana.inicio) / 2

    assert abs(ventana.porcentaje(medio) - 50.0) < 0.5


def test_una_fecha_fuera_de_la_ventana_se_recorta_y_no_desborda():
    """Sin recortar, un `left: -340%` saca la barra de la pantalla y **no da error**: simplemente
    no se ve, y quien mira cuenta un entregable menos."""
    ventana = ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])

    assert ventana.porcentaje(date(2020, 1, 1)) == 0.0
    assert ventana.porcentaje(date(2040, 1, 1)) == 100.0


def test_las_marcas_de_mes_se_espacian_en_un_proyecto_largo():
    """En cinco años son sesenta etiquetas encimadas, que es peor que ninguna."""
    corto = ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])
    largo = ventana_de(date(2026, 1, 1), date(2031, 12, 31), [])

    assert 10 <= len(corto.marcas) <= 14
    assert len(largo.marcas) < len(corto.marcas) + 6


# --- Las barras ----------------------------------------------------------------------


@pytest.fixture
def ventana_anual():
    return ventana_de(date(2026, 1, 1), date(2026, 12, 31), [])


def test_la_barra_va_donde_cae_su_fecha(ventana_anual):
    tramos = tramos_de(
        [EntregableFalso("A-001", "Planta", date(2026, 1, 1), 0.5)],
        ventana_anual,
        hoy=date(2026, 1, 1),
    )

    [uno] = tramos
    assert uno.izquierda_pct == round(ventana_anual.porcentaje(date(2026, 1, 1)), 2)
    assert uno.avance_pct == 50.0
    assert uno.ancho_pct == ANCHO_MINIMO_PCT


def test_un_entregable_sin_fecha_no_se_dibuja(ventana_anual):
    """No hay donde ponerlo, e inventarle una posicion es afirmar una fecha que nadie
    comprometio."""
    tramos = tramos_de(
        [EntregableFalso("A-001", "Sin fecha", None, 0.0)],
        ventana_anual,
        hoy=date(2026, 6, 1),
    )

    assert tramos == []


def test_va_atrasado_si_la_fecha_paso_y_no_esta_terminado(ventana_anual):
    entregables = [
        EntregableFalso("A-001", "Vencido a medias", date(2026, 3, 1), 0.4),
        EntregableFalso("A-002", "Vencido y listo", date(2026, 3, 1), 1.0),
        EntregableFalso("A-003", "Por venir", date(2026, 9, 1), 0.0),
    ]

    tramos = tramos_de(entregables, ventana_anual, hoy=date(2026, 6, 1))

    assert [t.atrasado for t in tramos] == [True, False, False]


def test_las_barras_salen_ordenadas_por_fecha(ventana_anual):
    entregables = [
        EntregableFalso("C", "Tercero", date(2026, 9, 1), 0.0),
        EntregableFalso("A", "Primero", date(2026, 2, 1), 0.0),
        EntregableFalso("B", "Segundo", date(2026, 5, 1), 0.0),
    ]

    tramos = tramos_de(entregables, ventana_anual, hoy=date(2026, 1, 1))

    assert [t.etiqueta for t in tramos] == ["A", "B", "C"]


def test_la_barra_lleva_el_color_de_su_disciplina(ventana_anual):
    """**Es el estreno de `Disciplina.color`**, que existe desde el primer dia y no lo usaba
    nadie."""
    estructura = DisciplinaFalsa("ES", "Estructura", "#c0392b")
    tramos = tramos_de(
        [EntregableFalso("E-001", "Viga", date(2026, 4, 1), 0.2, disciplina=estructura)],
        ventana_anual,
        hoy=date(2026, 1, 1),
    )

    assert tramos[0].color == "#c0392b"


def test_sin_disciplina_la_barra_no_queda_sin_color(ventana_anual):
    tramos = tramos_de(
        [EntregableFalso("X-001", "Suelto", date(2026, 4, 1), 0.0)],
        ventana_anual,
        hoy=date(2026, 1, 1),
    )

    assert tramos[0].color.startswith("#")


# --- El calendario -------------------------------------------------------------------


def test_la_semana_empieza_en_lunes():
    """Es como se lee un calendario en Chile y en Europa. El 1 de junio de 2026 es lunes, asi que
    tiene que abrir la primera semana."""
    rejilla = mes_de(2026, 6, {}, hoy=date(2026, 6, 15))

    assert rejilla[0][0].dia == 1
    assert rejilla[0][0].delMes is True


def test_los_huecos_del_borde_se_marcan_y_no_se_confunden_con_dias():
    """Un hueco con `dia = 0` pintado como dia daria un «0 de agosto»."""
    # Agosto de 2026 empieza en sabado: la primera semana trae cinco huecos.
    rejilla = mes_de(2026, 8, {}, hoy=date(2026, 8, 15))
    huecos = [d for d in rejilla[0] if not d.delMes]

    assert len(huecos) == 5
    assert all(h.dia == 0 for h in huecos)


def test_hoy_va_marcado_solo_en_su_propio_mes():
    """Sin la comprobacion de mes, el dia 15 saldria marcado en los doce meses del año."""
    junio = mes_de(2026, 6, {}, hoy=date(2026, 6, 15))
    julio = mes_de(2026, 7, {}, hoy=date(2026, 6, 15))

    assert any(d.esHoy for semana in junio for d in semana)
    assert not any(d.esHoy for semana in julio for d in semana)


def test_lo_que_vence_cae_en_su_dia():
    rejilla = mes_de(2026, 6, {10: ("Observación A", "Actividad B")}, hoy=date(2026, 6, 1))
    dia_diez = [d for semana in rejilla for d in semana if d.delMes and d.dia == 10][0]

    assert dia_diez.vencidos == ("Observación A", "Actividad B")


def test_el_mes_entero_esta_y_no_falta_ni_un_dia():
    """Un dia perdido en la rejilla es un vencimiento que no se ve."""
    for mes, cuantos in ((1, 31), (2, 28), (4, 30), (12, 31)):
        rejilla = mes_de(2026, mes, {}, hoy=date(2026, 1, 1))
        dias = [d.dia for semana in rejilla for d in semana if d.delMes]
        assert dias == list(range(1, cuantos + 1)), mes


def test_febrero_de_un_ano_bisiesto_trae_veintinueve():
    rejilla = mes_de(2028, 2, {}, hoy=date(2028, 1, 1))
    dias = [d.dia for semana in rejilla for d in semana if d.delMes]

    assert dias[-1] == 29


# --- El avance por disciplina --------------------------------------------------------


def test_el_avance_se_pondera_por_peso_y_no_es_un_promedio_simple():
    """**La figura de tamano conocido.** Peso 10 al 0% y peso 1 al 100% no van al 50%: van al
    100/11 = 9,1%. Un promedio simple diria 50 y seria mentira."""
    arquitectura = DisciplinaFalsa("AR", "Arquitectura", "#5b3a9e")
    entregables = [
        EntregableFalso("A-1", "Grande", date(2026, 1, 1), 0.0, peso=10, disciplina=arquitectura),
        EntregableFalso("A-2", "Chico", date(2026, 1, 1), 1.0, peso=1, disciplina=arquitectura),
    ]

    [barra] = avance_por_disciplina(entregables)

    assert barra.avance_pct == 9.1
    assert barra.cuantos == 2


def test_cada_disciplina_lleva_su_color_y_van_ordenadas():
    entregables = [
        EntregableFalso(
            "E-1", "Viga", date(2026, 1, 1), 1.0, disciplina=DisciplinaFalsa("ES", "Est", "#c0392b")
        ),
        EntregableFalso(
            "A-1", "Muro", date(2026, 1, 1), 0.0, disciplina=DisciplinaFalsa("AR", "Arq", "#5b3a9e")
        ),
    ]

    barras = avance_por_disciplina(entregables)

    assert [b.codigo for b in barras] == ["AR", "ES"]
    assert [b.color for b in barras] == ["#5b3a9e", "#c0392b"]


def test_los_entregables_sin_disciplina_se_agrupan_al_final_y_no_se_descartan():
    """**Si hay veinte sin asignar, eso es justamente lo que hay que ver.** Descartarlos deja un
    avance que no cuadra con el del proyecto y nadie sabe por qué."""
    entregables = [
        EntregableFalso("X-1", "Suelto", date(2026, 1, 1), 0.5),
        EntregableFalso(
            "A-1", "Muro", date(2026, 1, 1), 0.5, disciplina=DisciplinaFalsa("AR", "Arq", "#5b3a9e")
        ),
    ]

    barras = avance_por_disciplina(entregables)

    assert [b.codigo for b in barras] == ["AR", ""]
    assert barras[-1].cuantos == 1


def test_una_disciplina_con_todo_a_peso_cero_no_divide_por_cero():
    """Pasa: un entregable recién creado puede quedar con peso 0, y `0/0` revienta la pantalla."""
    entregables = [
        EntregableFalso(
            "A-1",
            "Sin peso",
            date(2026, 1, 1),
            0.5,
            peso=0,
            disciplina=DisciplinaFalsa("AR", "Arq", "#5b3a9e"),
        )
    ]

    [barra] = avance_por_disciplina(entregables)

    assert barra.avance_pct == 0.0
