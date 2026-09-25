"""El seguimiento del equipo: **lo atrasado de cada persona, en una pantalla** (2026-09-23).

## Lo que faltaba

El usuario lo pidió así: *«mejorar cómo se informan los atrasos y pendientes, alguna página o forma
de seguimiento general más optimizada para avisar cuando algo está vencido»*.

Había tres sitios donde ver lo pendiente y **los tres eran de una sola persona**: la portada, la
bandeja y la campana contestan «¿qué tengo yo?». La lista de observaciones filtra por «mías», por
prioridad, por estado y por obra — pero **no por vencidas**. O sea que la pregunta que un
coordinador se hace antes de la reunión semanal —«¿quién va atrasado y con qué?»— no tenía
pantalla: había que abrir la lista entera, ordenar por fecha y contar a ojo.

## Por persona, y por qué

Porque es como se actúa sobre un atraso: se habla con alguien. Una lista de treinta hallazgos
vencidos ordenados por fecha no dice que veinte son de la misma persona, que es justo lo que
decide si hay que repartir de otra manera o preguntar qué pasa.

## Lo que no hace

**No avisa a nadie.** Es una pantalla para mirar, no un emisor: el aviso a la persona ya existe —la
campana, el resumen con su cadencia por obra y el escalado a quien abrió lo parado— y un segundo
canal que escriba por su cuenta sería el spam que el encargo pidió evitar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from apps.documents.models import Actividad, Observacion

#: Cuántos días por delante cuentan como «esta semana». Es el mismo corte que el tramo `en_7` de
#: `notify.TRAMOS`, y va escrito como número porque aquí solo hace falta el borde.
DIAS_DE_LA_SEMANA = 7


def abiertos_con_fecha(observaciones, actividades) -> list:
    """Lo que sigue abierto y tiene fecha, de las dos clases de tarea.

    **Una sola definición de «abierto» para toda la aplicación.** La bandeja y el seguimiento la
    comparten: si cada una escribiera su propio `exclude`, un estado nuevo —una observación
    `EN_REVISION`, una actividad `PAUSADA`— cerraría la tarea en una pantalla y la dejaría abierta
    en la otra, y las dos cifras discreparían sin que nada fallara.

    Recibe los conjuntos ya acotados por quien llama —por responsable, por organización— para que
    el alcance lo decida la vista y la definición de abierto no.
    """
    return list(
        observaciones.exclude(estado__in=[Observacion.CERRADA, Observacion.DESCARTADA])
        .exclude(vence=None)
        .select_related("proyecto", "responsable")
    ) + list(
        actividades.exclude(status__in=[Actividad.HECHA, Actividad.ANULADA])
        .exclude(vence=None)
        .select_related("proyecto", "responsable")
    )


@dataclass
class Persona:
    """Lo que una persona tiene atrasado y lo que le vence pronto."""

    usuario: object
    vencidas: list = field(default_factory=list)
    esta_semana: int = 0

    @property
    def peor_atraso(self) -> int:
        """Los días del atraso más viejo, o cero si no tiene nada vencido."""
        return max((item.dias for item in self.vencidas), default=0)


@dataclass(frozen=True)
class Vencida:
    """Un atraso con sus días ya calculados, para no restar fechas en la plantilla."""

    item: object
    dias: int

    @property
    def es_observacion(self) -> bool:
        return isinstance(self.item, Observacion)

    @property
    def gravedad(self) -> str:
        """El mismo grado que la bandeja, de la misma función: ver `tareas.gravedad_de`."""
        from apps.documents.tareas import gravedad_de

        return gravedad_de(self.dias)


@dataclass(frozen=True)
class Seguimiento:
    """La pantalla entera: las personas, en el orden en que hay que mirarlas."""

    personas: tuple[Persona, ...]

    @property
    def total_vencidas(self) -> int:
        return sum(len(persona.vencidas) for persona in self.personas)

    @property
    def con_vencidas(self) -> int:
        return sum(1 for persona in self.personas if persona.vencidas)

    @property
    def peor_atraso(self) -> int:
        return max((persona.peor_atraso for persona in self.personas), default=0)


def del_equipo(items: list, hoy: date) -> Seguimiento:
    """Reparte las tareas abiertas por responsable.

    **El orden es la mitad del valor.** Primero quien tiene más vencidas y, a igualdad, quien tiene
    la más vieja: es el orden en que un coordinador tiene que hablar con la gente. Quien no tiene
    nada vencido va al final aunque tenga mucho esta semana — eso todavía no es un atraso.

    Solo aparece quien tiene **algo** que mirar: vencido o de esta semana. Listar a todo el equipo
    con ceros convertiría la pantalla en una nómina.
    """
    por_usuario: dict[int, Persona] = {}
    for item in items:
        dias = (hoy - item.vence).days
        if dias <= 0 and -dias >= DIAS_DE_LA_SEMANA:
            continue
        persona = por_usuario.setdefault(item.responsable_id, Persona(usuario=item.responsable))
        if dias > 0:
            persona.vencidas.append(Vencida(item=item, dias=dias))
        else:
            persona.esta_semana += 1

    for persona in por_usuario.values():
        # Lo más viejo arriba, que es lo mismo que hace el tramo «vencido» de la bandeja.
        persona.vencidas.sort(key=lambda una: -una.dias)

    orden = sorted(
        por_usuario.values(),
        key=lambda persona: (-len(persona.vencidas), -persona.peor_atraso, -persona.esta_semana),
    )
    return Seguimiento(personas=tuple(orden))
