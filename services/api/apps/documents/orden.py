"""Como se ordena una lista de hallazgos, y por que no vale el orden alfabetico.

**`ORDER BY prioridad` devuelve alta, baja, media.** Los valores guardados son `alta`, `media` y
`baja` —palabras, no numeros— asi que la base los ordena por letra: la prioridad baja se cuela en
medio. Lo mismo con el estado: `abierta`, `cerrada`, `descartada`, `respondida` por letra pone lo
cerrado antes de lo que espera respuesta, o sea justo al reves del camino que recorre un hallazgo.

Se descubrio al hacer las columnas ordenables de la lista, **y estaba desde antes en el informe**:
`informe.ORDENES["prioridad"]` ordenaba por el campo tal cual. No se noto porque la obra de
desarrollo no tenia ni un hallazgo de prioridad baja.

Asi que el peso vive **una sola vez, aqui**, y lo usan la lista y el informe. Con una copia en cada
sitio se llega a una pantalla que ordena de una forma y un PDF de la misma consulta que ordena de
otra.
"""

from __future__ import annotations

from django.db.models import Case, IntegerField, Value, When

from apps.documents.models import Observacion

#: De mas urgente a menos. Es el orden en el que se ataca una lista.
PESO_PRIORIDAD = {Observacion.ALTA: 0, Observacion.MEDIA: 1, Observacion.BAJA: 2}

#: El camino de un hallazgo, en su orden real: se abre, se responde, se cierra.
#:
#: **Descartada va al final y no es el cuarto paso**: es donde se sale del camino, no donde termina.
#: Ordenar por estado tiene que dejar arriba lo que espera algo de alguien.
PESO_ESTADO = {
    Observacion.ABIERTA: 0,
    Observacion.RESPONDIDA: 1,
    Observacion.CERRADA: 2,
    Observacion.DESCARTADA: 3,
}


def _peso(campo: str, pesos: dict[str, int]):
    """Un `Case` que traduce el valor guardado a su peso, para poder ordenar por el."""
    return Case(
        *[When(**{campo: valor}, then=Value(peso)) for valor, peso in pesos.items()],
        # Un valor que no este en la tabla —porque alguien añadio un estado y no lo puso aqui— va al
        # final en vez de reventar la consulta: la lista sigue siendo utilizable.
        default=Value(len(pesos)),
        output_field=IntegerField(),
    )


def anotaciones() -> dict:
    """Los pesos, para pasarlos a `annotate()`. Los nombres empiezan por `orden_`."""
    return {
        "orden_prioridad": _peso("prioridad", PESO_PRIORIDAD),
        "orden_estado": _peso("estado", PESO_ESTADO),
    }


#: Por que columna se puede ordenar la lista, y con que criterio de desempate.
#:
#: **Cada una lleva su segundo campo**, porque una columna sola deja el resto en un orden que
#: cambia entre peticiones: dos hallazgos de prioridad media saldrian hoy en un orden y mañana en
#: otro, y una lista que se reordena sola no se puede recorrer.
#:
#: Y el desempate no es decorativo: dentro de la misma prioridad manda lo que vence antes, y dentro
#: del mismo responsable manda la prioridad. Es como se reparte el trabajo de verdad.
COLUMNAS: dict[str, tuple[str, ...]] = {
    "prioridad": ("orden_prioridad", "vence", "-created_at"),
    "hallazgo": ("titulo", "orden_prioridad"),
    "obra": ("proyecto__codigo", "orden_prioridad", "vence"),
    "responsable": ("responsable__username", "orden_prioridad", "vence"),
    # **Sin fecha va al final y no al principio.** `vence` ascendente pone los nulos primero en
    # SQLite y en PostgreSQL los pone al final: sin esto la lista se ordena distinto segun el motor.
    "vence": ("vence", "orden_prioridad"),
    "estado": ("orden_estado", "orden_prioridad", "vence"),
    "antiguedad": ("-created_at", "orden_prioridad"),
}

#: El orden de partida: lo mas urgente arriba.
POR_DEFECTO = "prioridad"


def criterio(pedido: str | None) -> tuple[str, bool, tuple[str, ...]]:
    """(columna, descendente, campos) a partir de lo que venga en la URL.

    Un valor con mala forma cae al de por defecto **en silencio**: quien pincha una cabecera no
    escribio ese parametro a mano, y un 400 en una lista no dice nada util. Es la misma regla que
    usan las opciones del informe.
    """
    crudo = (pedido or "").strip()
    descendente = crudo.startswith("-")
    columna = crudo.lstrip("-")
    if columna not in COLUMNAS:
        columna, descendente = POR_DEFECTO, False

    campos = COLUMNAS[columna]
    if descendente:
        # Solo se invierte **la primera**: los desempates existen para dar un orden estable, y
        # darles la vuelta tambien haria que «al reves» reordenara cosas que no se pidieron.
        primera = campos[0]
        campos = (primera[1:] if primera.startswith("-") else f"-{primera}", *campos[1:])

    # Y un ultimo desempate por identidad, que es lo que hace el orden **total** y no solo
    # determinista por columna: sin el, dos filas iguales en todos los campos pueden bailar entre
    # paginas y una de ellas no aparecer nunca.
    return columna, descendente, (*campos, "pk")


def nulos_al_final(consulta, campos: tuple[str, ...]):
    """`vence` sin fecha, siempre al final, sea SQLite o PostgreSQL.

    **Los dos motores no coinciden**: SQLite pone los `NULL` primero en ascendente y PostgreSQL los
    pone al final. Una lista que se ordena distinto en desarrollo y en produccion es una lista en la
    que no se puede confiar, asi que se dice explicitamente.
    """
    from django.db.models import F

    orden = []
    for campo in campos:
        descendente = campo.startswith("-")
        nombre = campo.lstrip("-")
        if nombre == "vence":
            expresion = (
                F(nombre).desc(nulls_last=True) if descendente else F(nombre).asc(nulls_last=True)
            )
            orden.append(expresion)
        else:
            orden.append(campo)
    return consulta.order_by(*orden)
