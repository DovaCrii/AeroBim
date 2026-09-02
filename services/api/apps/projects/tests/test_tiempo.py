"""La antigüedad de una observación, en una sola unidad.

**El oráculo es el propio `timesince` de Django**, que es la función que el filtro envuelve: lo que
se prueba aquí no es el redondeo —eso ya lo prueba Django— sino que la columna de una tabla no se
lleve dos unidades, que es lo que hacía que «abierta hace 3 horas, 43 minutos» fuese el texto más
largo de la fila.
"""

from datetime import timedelta

from django.utils import timezone
from django.utils.timesince import timesince

from apps.projects.templatetags.tiempo import antiguedad

# 3 horas y 43 minutos: el caso real que se vio en la pantalla del proyecto.
HORAS_Y_MINUTOS = timedelta(hours=3, minutes=43)


def test_una_sola_unidad_donde_django_pone_dos():
    cuando = timezone.now() - HORAS_Y_MINUTOS
    # Lo que hace el filtro de Django sin `depth`, para que la diferencia quede escrita.
    assert "," in timesince(cuando)
    assert "," not in antiguedad(cuando)


def test_la_unidad_que_queda_es_la_mayor():
    cuando = timezone.now() - HORAS_Y_MINUTOS
    assert antiguedad(cuando) == timesince(cuando, depth=1)
    assert antiguedad(cuando).startswith("3")


def test_una_semana_se_dice_igual_que_en_django():
    cuando = timezone.now() - timedelta(days=8)
    assert antiguedad(cuando) == timesince(cuando, depth=1)


def test_sin_fecha_no_revienta():
    """Una observación sin `created_at` no puede tumbar la tabla del proyecto."""
    assert antiguedad(None) == ""
