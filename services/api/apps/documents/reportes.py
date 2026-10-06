"""El panel de reportes: cifras, dos gráficos y una tabla de las observaciones (`F15.5`).

Es la presentación de «Project Insights» —una pantalla que se lee de un vistazo— sobre lo que el
registro ya sabe. **No calcula nada nuevo**: cuenta lo que ya existe, y cada cifra dice cómo
se cuenta, porque un número sin definición es una opinión.

Todo aquí es puro: recibe filas y una fecha de hoy y devuelve datos, sin tocar la base ni el
reloj. Por eso se puede comprobar con respuestas calculables a mano, que es lo que hace falta:
un contador de «vencidas» que cuenta mal es peor que no tenerlo —alguien decide a quién llamar
con él—.

## Cómo se cuenta cada cifra

| Cifra | Cuenta las observaciones… |
| --- | --- |
| Abiertas | que no están cerradas ni descartadas (`abierta` y `respondida`) |
| Vencidas | abiertas con plazo **anterior a hoy** (la misma regla que `Observacion.vencida`) |
| Abiertas hace más de 30 días | abiertas creadas hace **más de** 30 días |
| Vencen esta semana | abiertas con plazo desde hoy hasta dentro de 6 días (7 días contando hoy) |
| Asignadas a mí | abiertas a nombre de quien mira |
| Cerradas | en estado `cerrada` (**las descartadas no cuentan como cerradas**: no se resolvieron) |
| Cerradas esta semana / hoy | cerradas en los últimos 7 días contando hoy / hoy |
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.utils.translation import gettext_lazy as _
from django.utils.translation import pgettext_lazy

from apps.documents.seguimiento import DIAS_DE_LA_SEMANA

#: Los estados que ya no piden nada a nadie, por clave. Se repiten aquí y no se importan del modelo
#: para que este módulo siga siendo puro; una prueba comprueba que coinciden con `Observacion`.
CERRADA = "cerrada"
DESCARTADA = "descartada"
ESTADOS_SIN_PENDIENTE = frozenset({CERRADA, DESCARTADA})

#: Cuántos días tiene que llevar abierta una observación para contar como «vieja».
DIAS_PARA_SER_VIEJA = 30

#: Cuántas series con nombre lleva un gráfico antes de juntar el resto en «Otros». Son los cinco
#: acentos ya medidos del portal menos el gris, que es de «Otros»: más series que colores
#: distinguibles
#: es un gráfico que no se lee.
SERIES_CON_NOMBRE = 4


@dataclass(frozen=True)
class Fila:
    """Una observación, con solo lo que el panel necesita."""

    id: str
    titulo: str
    estado: str
    estado_texto: str
    prioridad: str
    prioridad_texto: str
    responsable_id: int | None
    responsable: str
    obra: str
    creada: date
    vence: date | None = None
    cerrada: date | None = None
    es_interferencia: bool = False

    @property
    def abierta(self) -> bool:
        return self.estado not in ESTADOS_SIN_PENDIENTE

    def dias_de_atraso(self, hoy: date) -> int:
        """Los días que lleva vencida, o 0 si no lo está (o ya no pide nada)."""
        if not self.abierta or self.vence is None:
            return 0
        return max(0, (hoy - self.vence).days)


@dataclass(frozen=True)
class Cifra:
    """Una tarjeta de las cifras rápidas."""

    clave: str
    valor: int
    #: `True` si la cifra pide atención: se pinta con el filo rojo y solo si es mayor que cero.
    alerta: bool = False


def cifras(filas: list[Fila], hoy: date, usuario_id: int | None) -> list[Cifra]:
    """Las ocho cifras rápidas, en el orden en que se leen. Ver la tabla del módulo."""
    abiertas = [f for f in filas if f.abierta]
    cerradas = [f for f in filas if f.estado == CERRADA]

    def dias_hasta(f: Fila) -> int | None:
        return None if f.vence is None else (f.vence - hoy).days

    def hace(f: Fila) -> int | None:
        return None if f.cerrada is None else (hoy - f.cerrada).days

    return [
        Cifra("open", len(abiertas)),
        Cifra("overdue", sum(1 for f in abiertas if f.dias_de_atraso(hoy) > 0), alerta=True),
        Cifra(
            "open_over_30", sum(1 for f in abiertas if (hoy - f.creada).days > DIAS_PARA_SER_VIEJA)
        ),
        Cifra(
            "due_this_week",
            sum(
                1
                for f in abiertas
                if (d := dias_hasta(f)) is not None and 0 <= d < DIAS_DE_LA_SEMANA
            ),
        ),
        Cifra(
            "assigned_to_me",
            sum(1 for f in abiertas if usuario_id is not None and f.responsable_id == usuario_id),
        ),
        Cifra("closed", len(cerradas)),
        Cifra(
            "closed_this_week",
            sum(1 for f in cerradas if (h := hace(f)) is not None and 0 <= h < DIAS_DE_LA_SEMANA),
        ),
        Cifra("closed_today", sum(1 for f in cerradas if hace(f) == 0)),
    ]


#: El rótulo de cada cifra y **cómo se cuenta**, que se enseña al pasar el cursor por encima.
#:
#: **Con contexto `report figure`** las tres que ya existían en el catálogo con otro sentido: `Open`
#: era el verbo «Abrir» de un botón y `Overdue`/`Closed` estaban en singular. Reutilizar el texto
#: sin más rotulaba una tarjeta «Abrir», y solo se vio mirando la pantalla.
ROTULOS = {
    "open": pgettext_lazy("report figure", "Open"),
    "overdue": pgettext_lazy("report figure", "Overdue"),
    "open_over_30": _("Open for over 30 days"),
    "due_this_week": _("Due this week"),
    "assigned_to_me": _("Assigned to me"),
    "closed": pgettext_lazy("report figure", "Closed"),
    "closed_this_week": _("Closed this week"),
    "closed_today": _("Closed today"),
}

DEFINICIONES = {
    "open": _("Observations that are neither closed nor dismissed."),
    "overdue": _("Open observations whose due date is before today."),
    "open_over_30": _("Open observations opened more than 30 days ago."),
    "due_this_week": _("Open observations due from today until six days from now."),
    "assigned_to_me": _("Open observations that are yours."),
    "closed": _("Closed observations. Dismissed ones are not counted: they were not resolved."),
    "closed_this_week": _("Observations closed in the last seven days, today included."),
    "closed_today": _("Observations closed today."),
}

#: Por qué propiedades se puede agrupar un gráfico.
PROPIEDADES = ("responsable", "estado", "prioridad", "obra", "origen")

#: Las propiedades con un orden que significa algo: se respeta en vez de ordenar por cantidad.
ORDEN_NATURAL = {
    "estado": ("abierta", "respondida", "cerrada", "descartada"),
    "prioridad": ("alta", "media", "baja"),
}


@dataclass(frozen=True)
class Grupo:
    etiqueta: str  # `str` o un texto traducible: se imprime igual
    cantidad: int
    #: Índice del acento (0 a 4); el último, el gris, es el de «Otros».
    serie: int


def _clave_y_etiqueta(fila: Fila, propiedad: str) -> tuple[str, str]:
    if propiedad == "responsable":
        return (str(fila.responsable_id), fila.responsable)
    if propiedad == "estado":
        return (fila.estado, fila.estado_texto)
    if propiedad == "prioridad":
        return (fila.prioridad, fila.prioridad_texto)
    if propiedad == "obra":
        return (fila.obra, fila.obra)
    if propiedad == "origen":
        return ("interferencia", _("Clash")) if fila.es_interferencia else ("nota", _("Note"))
    raise ValueError(f"No se puede agrupar por {propiedad!r}.")


def agrupar(filas: list[Fila], propiedad: str) -> list[Grupo]:
    """Cuenta las filas por una propiedad, en grupos listos para un gráfico.

    Con orden natural (estado, prioridad) se respeta; con el resto, de más a menos. Pasadas las
    `SERIES_CON_NOMBRE` primeras, **el resto se junta en «Otros»** con el gris: no se pierde ninguna
    observación, y la tabla de abajo las tiene todas.
    """
    if propiedad not in PROPIEDADES:
        raise ValueError(f"No se puede agrupar por {propiedad!r}.")

    cuentas: dict[str, list] = {}
    for fila in filas:
        clave, etiqueta = _clave_y_etiqueta(fila, propiedad)
        entrada = cuentas.setdefault(clave, [etiqueta, 0])
        entrada[1] += 1

    natural = ORDEN_NATURAL.get(propiedad)
    if natural is not None:
        orden = {clave: i for i, clave in enumerate(natural)}
        claves = sorted(cuentas, key=lambda c: (orden.get(c, len(orden)), c))
    else:
        claves = sorted(cuentas, key=lambda c: (-cuentas[c][1], cuentas[c][0].lower()))

    visibles = claves[:SERIES_CON_NOMBRE]
    grupos = [Grupo(cuentas[c][0], cuentas[c][1], serie=i) for i, c in enumerate(visibles)]
    resto = sum(cuentas[c][1] for c in claves[SERIES_CON_NOMBRE:])
    if resto:
        # El gris, el último acento: es el que dice «el conjunto de lo demás», no una serie más.
        grupos.append(Grupo(_("Others"), resto, serie=SERIES_CON_NOMBRE))
    return grupos


@dataclass(frozen=True)
class Segmento:
    """Un arco de la dona, con la geometría que necesita `stroke-dasharray`."""

    grupo: Grupo
    #: Lo que ocupa del círculo, de 0 a 100.
    porcentaje: float
    #: Dónde empieza, de 0 a 100 desde las 12 en punto, en el sentido de las agujas del reloj.
    desde: float

    @property
    def dasharray(self) -> str:
        """`trazo hueco` para `stroke-dasharray`. **Con punto decimal siempre**: el filtro
        `floatformat` de la plantilla escribe coma en español y un SVG con `12,5` no se dibuja."""
        return f"{self.porcentaje:.3f} {100 - self.porcentaje:.3f}"

    @property
    def dashoffset(self) -> str:
        """Un `stroke-dashoffset` **negativo** adelanta el arranque del trazo a `desde`."""
        return f"{-self.desde:.3f}"


def dona(grupos: list[Grupo]) -> list[Segmento]:
    """Los arcos de una dona de circunferencia 100: un segmento por grupo, uno tras otro.

    Con circunferencia 100 el porcentaje **es** el largo del trazo, sin multiplicar por 2πr: así lo
    que
    se escribe en la plantilla se lee directamente y se comprueba con aritmética de cabeza.
    """
    total = sum(g.cantidad for g in grupos)
    if total == 0:
        return []
    segmentos: list[Segmento] = []
    acumulado = 0.0
    for grupo in grupos:
        porcentaje = grupo.cantidad * 100 / total
        segmentos.append(Segmento(grupo, porcentaje, acumulado))
        acumulado += porcentaje
    return segmentos


#: Las columnas por las que se puede ordenar la tabla, y cómo se ordena cada una.
COLUMNAS = ("titulo", "estado", "prioridad", "responsable", "vence", "obra")


def ordenar(filas: list[Fila], columna: str, descendente: bool) -> list[Fila]:
    """La tabla ordenada. Lo **sin plazo va siempre al final**, mire hacia donde mire el orden: un
    plazo vacío no es ni el más urgente ni el menos."""
    if columna not in COLUMNAS:
        columna = "vence"

    con_clave = []
    sin_valor = []
    for fila in filas:
        if columna == "vence":
            if fila.vence is None:
                sin_valor.append(fila)
                continue
            clave = fila.vence.toordinal()
        elif columna == "prioridad":
            orden = ("alta", "media", "baja")
            clave = orden.index(fila.prioridad) if fila.prioridad in orden else len(orden)
        elif columna == "estado":
            orden = ORDEN_NATURAL["estado"]
            clave = orden.index(fila.estado) if fila.estado in orden else len(orden)
        else:
            clave = getattr(fila, columna).lower()
        con_clave.append((clave, fila))

    con_clave.sort(key=lambda par: (par[0], par[1].titulo.lower()), reverse=descendente)
    return [fila for _, fila in con_clave] + sin_valor
