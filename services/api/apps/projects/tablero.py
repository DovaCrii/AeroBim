"""El tablero grafico de un proyecto: tarjetas, linea de tiempo, calendario y avance.

**Sin una sola libreria de graficos, y es una decision con motivos.** El modulo `calendar` de la
biblioteca estandar genera la rejilla del mes; la linea de tiempo son barras posicionadas por
porcentajes que se calculan aca; el avance por disciplina son barras. Asi: nada que vendorizar —la
regla de no-CDN—, ninguna licencia que revisar, funciona con la CSP tal como esta, **imprime**, y
son tablas y listas de verdad para quien usa un lector de pantalla.

**Y el calculo vive aca y no en la plantilla.** Una barra mal posicionada no da error: se dibuja en
el sitio equivocado y parece un dato. Con el calculo separado se prueba con figuras de tamaño
conocido, que es la unica forma de saber que la barra esta donde dice.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

#: Cuando el proyecto no declara fechas, la linea de tiempo se encuadra sobre lo que hay.
#: Este es el margen que se deja a cada lado para que la primera y la ultima barra no queden
#: pegadas al borde, donde no se distinguen del marco.
MARGEN_DIAS = 7

#: Ancho minimo de una barra, en porcentaje. Un entregable de un dia en un proyecto de dos años
#: mide 0,14%: invisible. Se dibuja con este minimo y **se dice en el titulo** que es una fecha,
#: no una duracion — inflar la barra sin decirlo afirmaria una duracion que nadie planifico.
ANCHO_MINIMO_PCT = 1.5


@dataclass(frozen=True)
class Tramo:
    """Una barra de la linea de tiempo, ya en porcentajes del ancho total."""

    etiqueta: str
    detalle: str
    izquierda_pct: float
    ancho_pct: float
    avance_pct: float
    color: str
    #: `True` si la fecha ya paso y el entregable no esta publicado. Es lo que pinta el rojo.
    atrasado: bool
    url: str = ""


@dataclass(frozen=True)
class Ventana:
    """El intervalo que cubre la linea de tiempo, y sus marcas de mes."""

    inicio: date
    fin: date
    #: `(etiqueta, porcentaje)` de cada primero de mes que cae dentro.
    marcas: tuple[tuple[str, float], ...]

    @property
    def dias(self) -> int:
        return max(1, (self.fin - self.inicio).days)

    def porcentaje(self, cuando: date) -> float:
        """Donde cae una fecha, de 0 a 100. Fuera de la ventana se recorta a los extremos."""
        crudo = (cuando - self.inicio).days / self.dias * 100
        return max(0.0, min(100.0, crudo))


def ventana_de(inicio: date | None, fin: date | None, fechas) -> Ventana | None:
    """El intervalo que se dibuja, a partir de las fechas del proyecto y de sus entregables.

    **Las fechas del proyecto mandan cuando estan**, porque son la promesa contractual; los
    entregables solo amplian la ventana si se salen de ella —un entregable planificado despues del
    termino es justamente lo que hay que ver—.

    Devuelve `None` cuando no hay ni una fecha: una linea de tiempo sin fechas no es un grafico
    vacio, es un grafico que no se puede dibujar, y la pantalla dice eso en vez de mostrar un marco.
    """
    conocidas = [f for f in fechas if f is not None]
    candidatas = [f for f in (inicio, fin) if f is not None] + conocidas
    if not candidatas:
        return None

    desde = min(candidatas)
    hasta = max(candidatas)
    if desde == hasta:
        # Una sola fecha no define un intervalo. Se abre un mes a cada lado para que la barra
        # tenga donde caer y la escala signifique algo.
        desde -= timedelta(days=30)
        hasta += timedelta(days=30)
    else:
        desde -= timedelta(days=MARGEN_DIAS)
        hasta += timedelta(days=MARGEN_DIAS)

    return Ventana(inicio=desde, fin=hasta, marcas=_marcas_de_mes(desde, hasta))


def _marcas_de_mes(desde: date, hasta: date) -> tuple[tuple[str, float], ...]:
    """Un primero de mes por marca, con su posicion.

    **Se salta meses cuando no caben.** En un proyecto de cinco años son sesenta etiquetas
    encimadas, que es peor que ninguna: se deja una cada N para que queden legibles.
    """
    total_dias = max(1, (hasta - desde).days)
    meses = max(1, round(total_dias / 30))
    cada = 1 if meses <= 14 else (3 if meses <= 40 else 12)

    marcas = []
    año, mes = desde.year, desde.month
    contador = 0
    # Tope de vueltas: una ventana absurda —un proyecto con una fecha de año 9999 por un dedo—
    # no puede colgar la pantalla.
    for _vuelta in range(600):
        primero = date(año, mes, 1)
        if primero > hasta:
            break
        if primero >= desde and contador % cada == 0:
            posicion = (primero - desde).days / total_dias * 100
            marcas.append((f"{primero:%m/%y}", round(posicion, 2)))
        contador += 1
        mes += 1
        if mes > 12:
            año, mes = año + 1, 1
    return tuple(marcas)


def tramos_de(entregables, ventana: Ventana, hoy: date, url_de=None) -> list[Tramo]:
    """Una barra por entregable, ordenadas por su fecha planificada.

    Cada barra dice tres cosas a la vez: **cuando** —donde esta—, **cuanto lleva** —el relleno— y
    **si va tarde** —el color—. Un entregable sin fecha planificada no se dibuja: no hay donde
    ponerlo, e inventarle una posicion es afirmar una fecha que nadie comprometio.
    """
    tramos = []
    con_fecha = [e for e in entregables if e.fecha_planificada is not None]
    for entregable in sorted(con_fecha, key=lambda e: e.fecha_planificada):
        avance = entregable.avance
        atrasado = entregable.fecha_planificada < hoy and avance < 1.0
        disciplina = getattr(entregable, "disciplina", None)
        tramos.append(
            Tramo(
                etiqueta=entregable.codigo,
                detalle=entregable.titulo,
                izquierda_pct=round(ventana.porcentaje(entregable.fecha_planificada), 2),
                ancho_pct=ANCHO_MINIMO_PCT,
                avance_pct=round(avance * 100, 1),
                color=(getattr(disciplina, "color", None) or "#5b3a9e"),
                atrasado=atrasado,
                url=url_de(entregable) if url_de is not None else "",
            )
        )
    return tramos


@dataclass(frozen=True)
class DiaDelMes:
    """Un dia de la rejilla del calendario, con lo que vence ese dia."""

    dia: int
    #: `False` para los huecos con que `calendar` rellena la primera y la ultima semana.
    delMes: bool
    esHoy: bool
    vencidos: tuple = ()


def mes_de(año: int, mes: int, vencimientos: dict, hoy: date) -> list[list[DiaDelMes]]:
    """La rejilla del mes, semana por semana.

    La genera `calendar.Calendar` de la biblioteca estandar — **la semana empieza en lunes**, que
    es como se lee un calendario en Chile y en Europa; `calendar` por defecto tambien.

    `vencimientos` es `{dia: (cosa, ...)}`. Lo arma quien llama, que es quien sabe si mira
    observaciones, actividades o las dos.
    """
    rejilla = []
    for semana in calendar.Calendar(firstweekday=calendar.MONDAY).monthdayscalendar(año, mes):
        fila = []
        for dia in semana:
            if dia == 0:
                fila.append(DiaDelMes(dia=0, delMes=False, esHoy=False))
                continue
            fila.append(
                DiaDelMes(
                    dia=dia,
                    delMes=True,
                    esHoy=(hoy.year, hoy.month, hoy.day) == (año, mes, dia),
                    vencidos=tuple(vencimientos.get(dia, ())),
                )
            )
        rejilla.append(fila)
    return rejilla


@dataclass(frozen=True)
class BarraDeDisciplina:
    """El avance de una disciplina, con **su** color: el que guarda `Disciplina.color`."""

    codigo: str
    nombre: str
    color: str
    avance_pct: float
    cuantos: int


def avance_por_disciplina(entregables) -> list[BarraDeDisciplina]:
    """El avance ponderado por peso, disciplina por disciplina.

    **Ponderado y no promedio simple**, por el mismo motivo que el avance del proyecto: un
    entregable de peso 10 al 0% y otro de peso 1 al 100% no van al 50%.

    Los entregables sin disciplina se agrupan aparte en vez de descartarse: si hay veinte sin
    asignar, eso es justamente lo que hay que ver.
    """
    por_codigo: dict = {}
    for entregable in entregables:
        disciplina = getattr(entregable, "disciplina", None)
        clave = disciplina.codigo if disciplina is not None else ""
        acumulado = por_codigo.setdefault(
            clave,
            {
                "nombre": disciplina.nombre if disciplina is not None else "",
                "color": (getattr(disciplina, "color", None) or "#8a97ad"),
                "peso": 0.0,
                "ponderado": 0.0,
                "cuantos": 0,
            },
        )
        peso = float(entregable.peso or 0)
        acumulado["peso"] += peso
        acumulado["ponderado"] += peso * entregable.avance
        acumulado["cuantos"] += 1

    barras = [
        BarraDeDisciplina(
            codigo=codigo,
            nombre=datos["nombre"],
            color=datos["color"],
            avance_pct=round(datos["ponderado"] / datos["peso"] * 100, 1) if datos["peso"] else 0.0,
            cuantos=datos["cuantos"],
        )
        for codigo, datos in por_codigo.items()
    ]
    # Las que tienen codigo primero y por codigo; las sin disciplina, al final.
    return sorted(barras, key=lambda b: (b.codigo == "", b.codigo))
