"""**«El correo que sea cuando el coordinador lo delimite, para no generar spam.»**

Hasta hoy el resumen salia **a todos los usuarios activos, sin filtrar, todas las mañanas**. Un
remitente que escribe a diario se archiva sin leer — y entonces el dia que trae algo importante
tampoco se lee. Es la leccion que `apps/core/mail.py` ya lleva escrita.

## La regla que separa los dos canales, y que estas pruebas sujetan

**La campana no pasa por estos ajustes.** Los avisos dentro de la aplicacion son inmediatos pase lo
que pase aqui: poner el correo en `nunca` **no deja a nadie sin enterarse**, deja de llenarle el
buzon. Esa separacion es justo lo que permite apagarlo sin perder informacion — y es lo que hace que
apagarlo sea una opcion razonable en vez de una imprudencia.

Si esta suite empezara a fallar por el lado de la campana, el ajuste habria dejado de ser sobre
correo y habria pasado a ser sobre enterarse. No es lo mismo.
"""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.core import avisos
from apps.documents.models import Observacion
from apps.documents.notify import avisar_asignacion, avisar_comentario, enviar_resumen
from apps.projects.models import AvisosDeObra


@pytest.fixture
def vencida(proyecto, proyectista, revisor):
    """Un hallazgo de `revisor`, vencido hace tres dias."""
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo="El ducto del eje C",
        autor=proyectista,
        responsable=revisor,
        vence=timezone.localdate() - timedelta(days=3),
    )


def ajustes(proyecto, **valores):
    return AvisosDeObra.objects.create(proyecto=proyecto, **valores)


# ── La cadencia del resumen ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_con_el_resumen_en_nunca_no_sale_ni_un_correo(proyecto, revisor, vencida):
    """**Y es la prueba que hace razonable apagarlo**: lo que queda sigue estando en la campana."""
    ajustes(proyecto, resumen=AvisosDeObra.NUNCA)

    assert enviar_resumen(revisor) == 0
    assert mail.outbox == []


@pytest.mark.django_db
def test_por_omision_solo_sale_si_hay_algo_vencido(proyecto, proyectista, revisor):
    """**El unico valor cuyo silencio significa algo**: sin correo, nada va tarde."""
    al_dia = Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo="Para la semana que viene",
        autor=proyectista,
        responsable=revisor,
        vence=timezone.localdate() + timedelta(days=5),
    )

    assert enviar_resumen(revisor) == 0, "salió un resumen sin nada vencido"
    assert mail.outbox == []

    al_dia.vence = timezone.localdate() - timedelta(days=1)
    al_dia.save(update_fields=["vence"])

    assert enviar_resumen(revisor) == 1
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_con_el_resumen_diario_sale_aunque_no_haya_vencidos(proyecto, proyectista, revisor):
    ajustes(proyecto, resumen=AvisosDeObra.DIARIO)
    Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo="Para la semana que viene",
        autor=proyectista,
        responsable=revisor,
        vence=timezone.localdate() + timedelta(days=5),
    )

    assert enviar_resumen(revisor) == 1


@pytest.mark.django_db
def test_el_semanal_solo_sale_su_dia(proyecto, revisor, vencida):
    """Un día concreto, no «cada siete»: así cae siempre en la misma mañana."""
    hoy = timezone.localdate()
    ajustes(proyecto, resumen=AvisosDeObra.SEMANAL, dia_de_la_semana=hoy.weekday())
    assert enviar_resumen(revisor) == 1

    obra = AvisosDeObra.objects.get(proyecto=proyecto)
    obra.dia_de_la_semana = (hoy.weekday() + 1) % 5
    obra.save(update_fields=["dia_de_la_semana"])
    mail.outbox.clear()

    assert enviar_resumen(revisor) == 0


@pytest.mark.django_db
def test_se_puede_pedir_el_resumen_a_mano_saltandose_la_cadencia(proyecto, revisor, vencida):
    """«Mándame el mío ahora» no tiene por qué esperar al trabajo programado."""
    ajustes(proyecto, resumen=AvisosDeObra.NUNCA)

    assert enviar_resumen(revisor, respetar_cadencia=False) == 1


# ── Los avisos inmediatos ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_apagar_el_correo_de_asignacion_deja_la_campana_encendida(
    proyecto, proyectista, revisor, vencida
):
    """**La asercion central de todo el bloque.**

    Si esto empezara a fallar, el ajuste habría dejado de ser sobre correo y habría pasado a ser
    sobre enterarse.
    """
    ajustes(proyecto, al_asignar=False)

    assert avisar_asignacion(vencida, de_parte_de=proyectista) is False
    assert mail.outbox == []
    assert avisos.cuantos_sin_leer(revisor) == 1, "se apagó el correo y se apagó también la campana"


@pytest.mark.django_db
def test_el_hilo_sigue_mandando_correo_mientras_nadie_decida_otra_cosa(
    proyecto, proyectista, revisor, vencida
):
    """**Lo que se pidió es que el coordinador lo delimite, no que lo decida el sistema.**

    La primera versión de este bloque dejó el correo del hilo **apagado por omisión** —es el que más
    ruido hace y el que la campana cubre mejor— y era un error: apagar por omisión un aviso que hoy
    funciona le cambia el comportamiento a quien no pidió nada. Lo destaparon cuatro pruebas de
    `test_aviso_del_hilo.py`, que existen porque responder sin avisar **ya fue un defecto una vez**.

    Hasta que alguien decida, no cambia nada.
    """
    from apps.documents.models import Comentario

    comentario = Comentario.objects.create(observacion=vencida, autor=proyectista, texto="Revisado")

    assert avisar_comentario(comentario) != []
    assert len(mail.outbox) == 1
    assert avisos.cuantos_sin_leer(revisor) == 1


@pytest.mark.django_db
def test_si_la_obra_lo_apaga_deja_de_mandar_correo_pero_sigue_avisando(
    proyecto, proyectista, revisor, vencida
):
    """El interruptor que sí se pidió: un hilo activo puede ser varios correos al día."""
    from apps.documents.models import Comentario

    ajustes(proyecto, al_responder=False)
    comentario = Comentario.objects.create(observacion=vencida, autor=proyectista, texto="Revisado")

    assert avisar_comentario(comentario) == []
    assert mail.outbox == []
    assert avisos.cuantos_sin_leer(revisor) == 1, "se apagó el correo y se apagó también la campana"


# ── El correo en sí ────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_el_resumen_sale_en_html_y_en_texto_y_dicen_lo_mismo(proyecto, revisor, vencida):
    """**Las dos versiones o ninguna.** Quien tiene el HTML desactivado tiene que poder actuar
    igual, así que el texto plano no puede decir menos."""
    assert enviar_resumen(revisor) == 1

    mensaje = mail.outbox[0]
    html = mensaje.alternatives[0][0]

    assert mensaje.alternatives[0][1] == "text/html"
    assert "El ducto del eje C" in mensaje.body
    assert "El ducto del eje C" in html


@pytest.mark.django_db
def test_el_resumen_lleva_un_enlace_por_item(proyecto, revisor, vencida):
    """**Era el defecto más tonto y el más molesto**: el correo nombraba las cosas y el único
    enlace iba a la portada, así que para llegar a lo que decía había que buscarlo a mano."""
    enviar_resumen(revisor)

    html = mail.outbox[0].alternatives[0][0]

    assert f"/documentos/observaciones/{vencida.pk}/" in html


@pytest.mark.django_db
def test_el_resumen_dice_cuantos_dias_lleva_cada_atraso(proyecto, revisor, vencida):
    """Una fecha sola obliga a restar mentalmente, y en una lista de diez nadie lo hace."""
    enviar_resumen(revisor)

    mensaje = mail.outbox[0]
    assert "(3 d)" in mensaje.body
    assert "3" in mensaje.alternatives[0][0]
