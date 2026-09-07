"""Que `metricas_piloto` cuente bien y **no escriba nada**.

Las cifras de un piloto se usan para decidir qué se arregla, así que un error aquí no se ve: sale
un número plausible y se actúa sobre él. De ahí que las pruebas fijen las distinciones que se
pueden confundir sin que nada falle — «cerrada en el rango» frente a «cerrada hoy», descartada
frente a cerrada, y el borde del último día.
"""

import datetime as dt

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from apps.documents.models import Comentario, Observacion
from apps.projects.models import Etiqueta


def correr(**opciones) -> str:
    from io import StringIO

    salida = StringIO()
    call_command("metricas_piloto", stdout=salida, **opciones)
    return salida.getvalue()


@pytest.fixture
def gente(db):
    U = get_user_model()
    return U.objects.create_user("ito", password="x"), U.objects.create_user("proy", password="x")


def hallazgo(proyecto, gente, *, cuando=None, **campos):
    autor, responsable = gente
    obs = Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=campos.pop("titulo", "Algo"),
        autor=autor,
        responsable=campos.pop("responsable", responsable),
        **campos,
    )
    if cuando is not None:
        # `created_at` es `auto_now_add`: se pisa con un `update`, que no lo vuelve a poner.
        Observacion.objects.filter(pk=obs.pk).update(created_at=cuando)
        obs.refresh_from_db()
    return obs


# --- Lo que cuenta ---------------------------------------------------------------------


@pytest.mark.django_db
def test_cuenta_los_abiertos_del_rango(proyecto, gente):
    ahora = timezone.now()
    hallazgo(proyecto, gente, cuando=ahora)
    hallazgo(proyecto, gente, cuando=ahora)
    # Uno viejo, fuera del rango de dos semanas por omisión.
    hallazgo(proyecto, gente, cuando=ahora - dt.timedelta(days=60))

    salida = correr()

    assert "abiertos en el rango     2" in salida


@pytest.mark.django_db
def test_se_cuentan_las_cerradas_en_el_rango_y_no_las_que_estan_cerradas(proyecto, gente):
    """**Son dos preguntas distintas y solo una dice si el equipo avanza.**

    Contar las que hoy están cerradas diría cuántas hay cerradas — incluidas las de hace meses—.
    Lo que interesa es cuántas se cerraron *en el periodo*, y eso es `cerrada_en`.
    """
    ahora = timezone.now()
    vieja = hallazgo(proyecto, gente, cuando=ahora - dt.timedelta(days=90))
    vieja.estado = Observacion.CERRADA
    vieja.cerrada_en = ahora - dt.timedelta(days=80)
    vieja.save()

    reciente = hallazgo(proyecto, gente, cuando=ahora - dt.timedelta(days=3))
    reciente.estado = Observacion.CERRADA
    reciente.cerrada_en = ahora
    reciente.save()

    salida = correr()

    assert "cerrados en el rango     1" in salida


@pytest.mark.django_db
def test_descartar_no_cuenta_como_cerrar(proyecto, gente):
    """**Es el atajo que esta cifra tiene que delatar.**

    Si descartar bajara el contador igual que arreglar, la forma más rápida de tener buenas
    métricas sería descartar los hallazgos incómodos.
    """
    ahora = timezone.now()
    obs = hallazgo(proyecto, gente, cuando=ahora - dt.timedelta(days=2))
    obs.estado = Observacion.DESCARTADA
    obs.cerrada_en = ahora
    obs.save()

    salida = correr()

    assert "cerrados en el rango     0" in salida
    assert "descartados en el rango  1" in salida


@pytest.mark.django_db
def test_lo_cerrado_sin_fecha_se_declara_en_vez_de_desaparecer(proyecto, gente):
    """**Salio de la base real**: hay una cerrada con `cerrada_en` nulo, de antes de `cerrar()`.

    Contar por `cerrada_en` es lo correcto, pero deja esas filas fuera. Sin decirlo, el número de
    cerradas sería plausible y corto — el peor tipo de error en una métrica. Hoy los dos caminos
    que cierran ponen el campo siempre, así que esta línea debería salir en cero: si sale en otra
    cosa, es un camino nuevo que se olvidó del campo.
    """
    obs = hallazgo(proyecto, gente, cuando=timezone.now())
    Observacion.objects.filter(pk=obs.pk).update(estado=Observacion.CERRADA, cerrada_en=None)

    salida = correr()

    assert "cerrados en el rango     0" in salida
    assert "ojo: 1 resueltas sin fecha de cierre" in salida


@pytest.mark.django_db
def test_los_dos_caminos_que_cierran_ponen_la_fecha(proyecto, gente):
    """El oráculo del aviso de arriba: **los métodos del modelo, no un `update`**.

    Si algún día uno de los dos deja de ponerla, esta prueba cae aquí en vez de aparecer como un
    contador bajo en el triage.
    """
    cerrada = hallazgo(proyecto, gente, cuando=timezone.now())
    cerrada.cerrar(gente[0], "Corregido")
    descartada = hallazgo(proyecto, gente, cuando=timezone.now())
    descartada.descartar(gente[0], "Falso positivo")

    cerrada.refresh_from_db()
    descartada.refresh_from_db()
    assert cerrada.cerrada_en is not None
    assert descartada.cerrada_en is not None
    assert "ojo:" not in correr()


@pytest.mark.django_db
def test_el_ultimo_dia_entra_completo(proyecto, gente):
    """El borde que se pierde solo: `created_at` es un instante y `--hasta` es un día.

    Con el rango cerrado por el día en vez de por su final, un hallazgo abierto a las 10 de la
    mañana del último día se queda fuera — un día entero sin contar justo donde se está mirando.
    """
    hoy = timezone.localdate()
    manana_temprano = timezone.make_aware(dt.datetime.combine(hoy, dt.time(10, 0)))
    hallazgo(proyecto, gente, cuando=manana_temprano)

    salida = correr(desde=hoy.isoformat(), hasta=hoy.isoformat())

    assert "abiertos en el rango     1" in salida


@pytest.mark.django_db
def test_el_tiempo_de_ciclo_sale_en_dias_con_mediana(proyecto, gente):
    ahora = timezone.now()
    for dias in (1, 2, 30):
        obs = hallazgo(proyecto, gente, cuando=ahora - dt.timedelta(days=dias))
        obs.estado = Observacion.CERRADA
        obs.cerrada_en = ahora
        obs.save()

    salida = correr(desde=(ahora - dt.timedelta(days=40)).date().isoformat())

    # La mediana es 2 y la media 11: **una sola cerrada tarde mueve la media y no la mediana**,
    # que es por lo que salen las dos.
    assert "mediana  2.0" in salida
    assert "media    11.0" in salida
    assert "maximo   30.0" in salida


@pytest.mark.django_db
def test_el_contexto_dice_cuantos_se_pueden_volver_a_mirar(proyecto, gente):
    """Un hallazgo sin punto de vista no se puede volver a mirar: hay que buscarlo a mano."""
    ahora = timezone.now()
    hallazgo(proyecto, gente, cuando=ahora, punto_de_vista={"camara": [1, 2, 3]}, ifc_guid="A" * 22)
    hallazgo(proyecto, gente, cuando=ahora)

    salida = correr()

    assert "con punto de vista        1  (50 %)" in salida
    assert "anclados al modelo        1  (50 %)" in salida


@pytest.mark.django_db
def test_las_etiquetas_se_reparten_por_el_prefijo(proyecto, gente):
    """`pantalla:` dice **dónde** se vio, y el resto **qué clase** de hallazgo es.

    `plan:pospuesto` no entra en ninguno de los dos: es una decisión del triage, no una
    característica del hallazgo.
    """
    ahora = timezone.now()
    obs = hallazgo(proyecto, gente, cuando=ahora)
    for nombre in ("defecto", "pantalla:visor", "plan:pospuesto"):
        obs.etiquetas.add(Etiqueta.objects.create(proyecto=proyecto, nombre=nombre))

    salida = correr()

    assert "POR PANTALLA" in salida
    assert "visor" in salida
    assert "POR TIPO" in salida
    assert "defecto" in salida
    assert "pospuesto" not in salida


@pytest.mark.django_db
def test_un_hilo_vacio_es_un_hallazgo_que_nadie_contesto(proyecto, gente):
    """Y no se ve en el estado: sigue «abierta» igual que uno en discusión."""
    ahora = timezone.now()
    con = hallazgo(proyecto, gente, cuando=ahora)
    hallazgo(proyecto, gente, cuando=ahora)
    Comentario.objects.create(observacion=con, autor=gente[0], texto="Lo veo")

    salida = correr()

    assert "CON AL MENOS UNA RESPUESTA  1 de 2 (50 %)" in salida


@pytest.mark.django_db
def test_lo_abierto_ahora_no_depende_del_rango(proyecto, gente):
    """«Qué hay abierto» es **hoy**, no el periodo: es el criterio de cierre de cada etapa."""
    hallazgo(
        proyecto,
        gente,
        cuando=timezone.now() - dt.timedelta(days=200),
        prioridad=Observacion.ALTA,
        vence=timezone.localdate() - dt.timedelta(days=5),
    )

    salida = correr()

    assert "alta                      1" in salida
    assert "vencidas                  1" in salida


# --- Que no escriba nada ---------------------------------------------------------------


@pytest.mark.django_db
def test_no_escribe_nada_en_la_base(proyecto, gente):
    """**Se puede correr en produccion a mitad de una sesión sin cambiar lo que se mide.**

    El oráculo es directo: se cuentan las filas de todas las tablas que toca antes y después.
    """
    hallazgo(proyecto, gente, cuando=timezone.now())
    antes = (
        Observacion.objects.count(),
        Comentario.objects.count(),
        Etiqueta.objects.count(),
    )

    correr()

    assert (
        Observacion.objects.count(),
        Comentario.objects.count(),
        Etiqueta.objects.count(),
    ) == antes


@pytest.mark.django_db
def test_no_deja_fila_de_trabajo(proyecto, gente):
    """A diferencia de `enviar_resumen`: **medir no es un trabajo programado**.

    Una fila por cada vez que alguien mira las cifras llenaría el historial de trabajos y taparía
    justo lo que esa pantalla existe para enseñar.
    """
    from apps.core.models import JobRun

    correr()

    assert JobRun.objects.count() == 0


# --- Lo que se niega a hacer ------------------------------------------------------------


@pytest.mark.django_db
def test_una_fecha_mal_escrita_lo_dice(db):
    with pytest.raises(CommandError, match="AAAA-MM-DD"):
        correr(desde="ayer")


@pytest.mark.django_db
def test_el_rango_del_reves_lo_dice(db):
    with pytest.raises(CommandError, match="posterior"):
        correr(desde="2026-09-30", hasta="2026-09-01")


@pytest.mark.django_db
def test_una_obra_que_no_existe_lo_dice(db):
    """En vez de devolver cero, que se leería como «no pasó nada en el piloto»."""
    with pytest.raises(CommandError, match="ninguna obra"):
        correr(obra="NO-EXISTE")


@pytest.mark.django_db
def test_sin_datos_no_falla(db):
    """Al empezar el piloto la base está vacía, y eso es una respuesta."""
    salida = correr()

    assert "abiertos en el rango     0" in salida
    assert "ninguna cerrada en el rango" in salida
