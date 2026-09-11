"""El numero de orden de la auditoria, tambien con varios procesos escribiendo. `AuditEvent`.

## Por que esta prueba existe

`sequence` esta en el modelo con su motivo escrito: **`created_at` no basta para ordenar dos filas
creadas en el mismo instante**, porque `timezone.now()` devuelve el mismo valor en llamadas rapidas
y SQL no garantiza ningun orden para empates en una columna no unica.

Se calculaba leyendo el maximo y sumandole uno, sin transaccion, sin cerrojo y sin unicidad. Con un
solo proceso eso funciona, y por eso la suite —que corre en uno— nunca dijo nada. En la VM hay
`workers = cpu*2+1` de gunicorn con dos hilos cada uno, y se escribe **una fila por cada peticion
que muta**.

**Medido contra PostgreSQL 16, dieciseis hilos escribiendo doce filas cada uno:**

| | antes | despues |
| --- | --- | --- |
| filas escritas | 192 | 192 |
| valores distintos de `sequence` | **27** | 192 |
| duplicados | **165** | 0 |

O sea que el campo cuyo unico motivo es dar un orden total dejaba de darlo justo cuando hace falta.
Y no fallaba nada: la auditoria quedaba mal ordenada, en silencio.

## Lo que se prueba aqui y lo que no

Lo de la forma —que la columna sea unica, que los numeros salgan seguidos— corre en cualquier motor.
**La carrera de verdad solo se puede reproducir contra PostgreSQL**, porque en SQLite las escrituras
ya van de una en una: ahi el caso malo no existe. Asi que ese caso se salta cuando la base no es
PostgreSQL, y lo dice en vez de aparentar que paso.
"""

from concurrent.futures import ThreadPoolExecutor

import pytest
from django.core.exceptions import ValidationError
from django.db import connection, connections

from apps.core.models import AuditEvent

pytestmark = pytest.mark.django_db(transaction=True)

solo_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="la carrera solo existe donde hay escrituras a la vez; en SQLite van de una en una",
)


def un_evento(camino: str) -> AuditEvent:
    evento = AuditEvent(action="prueba", method="POST", path=camino, status_code=200)
    evento.save()
    return evento


# --- La forma, en cualquier motor ----------------------------------------------------


def test_la_columna_es_unica():
    """**Es la unica de las tres piezas que hace imposible el defecto**, y no solo improbable.

    El cerrojo y el reintento evitan el choque; esto garantiza que, si alguna vez se colaran, se
    entere alguien en vez de quedar una auditoria mal ordenada sin que nada falle.
    """
    assert AuditEvent._meta.get_field("sequence").unique


def test_los_numeros_salen_seguidos_y_empiezan_en_uno():
    for esperado in range(1, 6):
        assert un_evento(f"/uno/{esperado}").sequence == esperado


def test_sigue_sin_poderse_modificar_ni_borrar():
    """El campo es nuevo pero la tabla sigue siendo de solo agregar."""
    evento = un_evento("/intocable/")

    with pytest.raises(ValidationError):
        evento.path = "/otra/"
        evento.save()
    with pytest.raises(ValidationError):
        evento.delete()


# --- La carrera, solo donde puede existir --------------------------------------------


@solo_postgres
def test_con_diecise_is_hilos_no_hay_dos_filas_con_el_mismo_numero():
    """**El caso que estaba mal.** Antes del arreglo: 192 filas y 27 numeros distintos.

    Se usan hilos y no procesos porque cada hilo abre su propia conexion —es lo que hace
    `connections.close_all()` al final de cada uno— y eso basta para que PostgreSQL vea
    transacciones concurrentes de verdad.
    """
    hilos, por_hilo = 16, 12

    def escribe(n: int) -> None:
        for i in range(por_hilo):
            un_evento(f"/carrera/{n}/{i}")
        connections.close_all()

    with ThreadPoolExecutor(max_workers=hilos) as piscina:
        list(piscina.map(escribe, range(hilos)))

    total = AuditEvent.objects.count()
    distintos = AuditEvent.objects.values("sequence").distinct().count()

    assert total == hilos * por_hilo
    assert distintos == total, f"{total - distintos} filas comparten numero con otra"
    # Y el orden es total de verdad: los numeros son 1..N sin huecos.
    assert AuditEvent.objects.order_by("-sequence").first().sequence == total
