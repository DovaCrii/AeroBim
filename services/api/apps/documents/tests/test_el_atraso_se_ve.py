"""**«Queda el seguimiento, pero el aviso no es claro.»**

Dos defectos en `pendientes_por_tramo` y uno en la fila, y los tres del mismo tipo: la informacion
estaba en la base y no llegaba a los ojos.

## 1. Lo que vence a mas de treinta dias desaparecia

`TRAMOS` acababa en `(15, 30, "en_30")` y el bucle terminaba **sin encontrar sitio** para lo que
vence mas alla. Ni en la bandeja, ni en el resumen, ni en ninguna cuenta: una tarea con fecha a
cuarenta dias no estaba en la lista de nadie, y nada lo decia.

## 2. Dentro de «vencido» no habia orden

La funcion concatena dos consultas —observaciones por fecha de alta, actividades por vencimiento—
asi que **un atraso de tres meses podia salir debajo de uno de ayer**. No piden lo mismo, y el orden
es lo unico que lo dice sin leer las fechas una a una.

## 3. La fila no decia cuanto llevaba

Rojo y negrita, y ahi se acababa. Tres meses y un dia se veian **exactamente igual**.
"""

from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.documents.models import Observacion
from apps.documents.notify import pendientes_por_tramo
from apps.documents.tareas import como_tarea


def hallazgo(proyecto, autor, responsable, titulo, *, dias):
    """Un hallazgo abierto que vence dentro de `dias` (negativo = ya vencido)."""
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        vence=timezone.localdate() + timedelta(days=dias),
    )


# ── Los tramos ─────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_lo_que_vence_a_mas_de_treinta_dias_ya_no_desaparece(proyecto, proyectista, revisor):
    """**No estaba en la lista de nadie, y nada lo decía.**

    Es el peor modo de fallar de los tres: no sale un hueco ni un cero, sale una lista que parece
    completa.
    """
    hallazgo(proyecto, proyectista, revisor, "Vence en cuarenta días", dias=40)

    tramos = pendientes_por_tramo(revisor)

    assert [t.titulo for t in tramos["mas_adelante"]] == ["Vence en cuarenta días"]
    total = sum(len(v) for v in tramos.values())
    assert total == 1, "el ítem se contó dos veces o se perdió"


@pytest.mark.django_db
def test_cada_cosa_sigue_cayendo_en_su_tramo(proyecto, proyectista, revisor):
    """El reparto de siempre, para que el tramo nuevo no se lleve por delante a los otros."""
    hallazgo(proyecto, proyectista, revisor, "Vencida", dias=-3)
    hallazgo(proyecto, proyectista, revisor, "Esta semana", dias=3)
    hallazgo(proyecto, proyectista, revisor, "En dos", dias=10)
    hallazgo(proyecto, proyectista, revisor, "Este mes", dias=20)
    hallazgo(proyecto, proyectista, revisor, "Más allá", dias=60)

    tramos = pendientes_por_tramo(revisor)

    assert [len(tramos[n]) for n in ("vencido", "en_7", "en_15", "en_30", "mas_adelante")] == [
        1,
        1,
        1,
        1,
        1,
    ]


@pytest.mark.django_db
def test_lo_vencido_sale_lo_mas_viejo_primero(proyecto, proyectista, revisor):
    """**Un atraso de tres meses y uno de ayer no piden lo mismo.**

    Se crean al revés de como tienen que salir, que es lo único que distingue esta prueba de una
    que pasa por casualidad.
    """
    hallazgo(proyecto, proyectista, revisor, "El de ayer", dias=-1)
    hallazgo(proyecto, proyectista, revisor, "El de hace tres meses", dias=-92)
    hallazgo(proyecto, proyectista, revisor, "El de la semana pasada", dias=-8)

    vencidas = pendientes_por_tramo(revisor)["vencido"]

    assert [una.titulo for una in vencidas] == [
        "El de hace tres meses",
        "El de la semana pasada",
        "El de ayer",
    ]


@pytest.mark.django_db
def test_todos_los_tramos_llegan_a_la_bandeja_y_al_correo(proyecto, proyectista, revisor):
    """**El defecto que añadir un tramo destapó, y que la suite entera no vio.**

    Los nombres de los tramos vivían en `TRAMOS` y sus etiquetas escritas a mano en otros dos
    sitios: el resumen por correo y la bandeja. Añadir un quinto tramo rompía los dos —el correo
    con un `KeyError` y la bandeja **en silencio**, trayendo el ítem y no pintándolo— y **ninguna
    prueba lo vio**, porque ninguna tenía una tarea a más de treinta días.

    Ahora la etiqueta vive junto al tramo y esto lo comprueba de punta a punta.
    """
    from django.core import mail

    from apps.documents.notify import TRAMOS, enviar_resumen

    revisor.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_observacion")
    )
    for dias, titulo in (
        (-3, "Vencida"),
        (3, "Semana"),
        (10, "Quince"),
        (20, "Mes"),
        (60, "Lejos"),
    ):
        hallazgo(proyecto, proyectista, revisor, titulo, dias=dias)

    # El correo: no revienta y nombra los cinco tramos.
    assert enviar_resumen(revisor) == 5
    cuerpo = mail.outbox[-1].body
    for _d, _h, _n, etiqueta in TRAMOS:
        assert str(etiqueta) in cuerpo, f"el resumen no nombra el tramo «{etiqueta}»"


@pytest.mark.django_db
def test_la_bandeja_pinta_los_cinco_tramos(client, proyecto, proyectista, revisor):
    """La otra mitad: lo que la consulta trae tiene que llegar a la pantalla."""
    revisor.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_observacion")
    )
    hallazgo(proyecto, proyectista, revisor, "Vence en dos meses", dias=60)
    client.force_login(revisor)

    html = client.get(reverse("documents:bandeja")).content.decode()

    assert "Vence en dos meses" in html, (
        "la bandeja trajo el ítem y no lo pintó: el tramo no estaba en la lista de etiquetas"
    )


# ── La fila ────────────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_tarea_sabe_cuantos_dias_lleva_y_de_que_grado(proyecto, proyectista, revisor):
    """**Tres grados y no uno**: con todo del mismo rojo, una lista de treinta no dice por dónde
    empezar. Los cortes son 7 y 30 días, los mismos que ya usan los tramos."""
    casos = {
        -1: ("leve", 1),
        -7: ("leve", 7),
        -8: ("serio", 8),
        -30: ("serio", 30),
        -31: ("grave", 31),
        -120: ("grave", 120),
    }
    for dias, (grado, atraso) in casos.items():
        tarea = como_tarea(hallazgo(proyecto, proyectista, revisor, f"H{dias}", dias=dias))
        assert tarea.dias_de_atraso == atraso
        assert tarea.gravedad == grado

    al_dia = como_tarea(hallazgo(proyecto, proyectista, revisor, "Al día", dias=5))
    assert al_dia.dias_de_atraso == 0
    assert al_dia.gravedad == ""


@pytest.mark.django_db
def test_la_bandeja_pinta_los_dias_y_el_grado(client, proyecto, proyectista, revisor):
    """De punta a punta: lo que se ve en la pantalla, no lo que devuelve una propiedad."""
    revisor.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_observacion")
    )
    hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-47)
    client.force_login(revisor)

    html = client.get(reverse("documents:bandeja")).content.decode()

    assert "47" in html
    assert "atraso-grave" in html, "un atraso de mes y medio se pinta igual que uno de ayer"
