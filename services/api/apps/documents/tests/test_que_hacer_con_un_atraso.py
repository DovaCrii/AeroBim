"""**«Queda el seguimiento, pero el aviso no es claro; cuál es la acción a tomar.»**

El seguimiento era **reactivo**, y no por falta de datos: por falta de camino. Lo atrasado se veia
—rojo, negrita, un aviso— y para hacer algo con ello habia que abrir el hallazgo y buscar el
formulario dentro. Mirar y actuar eran dos pantallas.

Y faltaba lo otro: el resumen iba **solo al responsable**. Quien abrio un hallazgo —quien detecto el
problema y quien lo sufre si no se resuelve— no recibia nada nunca. Si el responsable no entraba, el
hallazgo se quedaba quieto y **no se enteraba nadie**.

## Lo que este modulo sujeta

1. Que las acciones **lleguen a la fila** y no haya que entrar a buscarlas.
2. Que **no se ofrezca lo que terminaria en 403**. Ya paso este mes con el boton de compartir.
3. Que no haya ni un endpoint nuevo: `repartir` y `cerrar` ya existian.
4. Que lo que **abriste tu y nadie toca** te llegue, que es el escalado minimo que existe.
"""

from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.core import mail
from django.urls import reverse
from django.utils import timezone

from apps.documents.models import Observacion
from apps.documents.notify import atrasos_que_no_avanzan, enviar_resumen
from apps.documents.tareas import como_tarea


def hallazgo(proyecto, autor, responsable, titulo, *, dias):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        vence=timezone.localdate() + timedelta(days=dias),
    )


def con_permiso(usuario, *codigos):
    from django.contrib.auth import get_user_model

    for codigo in codigos:
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label="documents", codename=codigo)
        )
    return get_user_model().objects.get(pk=usuario.pk)


# ── Las acciones en la fila ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_una_tarea_vencida_ofrece_replanificar_y_cerrar(proyecto, proyectista, revisor):
    """**Sin endpoints nuevos**: llevan a `repartir` y `cerrar`, que ya existían."""
    una = hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-10)
    quien = con_permiso(revisor, "change_observacion")

    tarea = como_tarea(una, quien)

    destinos = [url for _e, url in tarea.acciones]
    assert reverse("documents:repartir-observacion", args=[una.pk]) in destinos
    assert reverse("documents:cerrar-observacion", args=[una.pk]) in destinos


@pytest.mark.django_db
def test_no_se_ofrece_lo_que_terminaria_en_403(proyecto, proyectista, revisor):
    """**Un botón que da 403 no dice si te falta un permiso o si la aplicación está rota.**

    Pasó este mismo mes con el botón de compartir, que miraba el permiso de la regla y no el de la
    vista. Aquí se mira el que exigen `RepartirObservacionView` y `CerrarObservacionView`.
    """
    una = hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-10)

    assert como_tarea(una, revisor).acciones == ()


@pytest.mark.django_db
def test_sin_usuario_no_se_ofrece_ninguna_accion(proyecto, proyectista, revisor):
    """Calcular los botones sin saber quien mira da una lista que alguien no puede usar."""
    una = hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-10)

    assert como_tarea(una).acciones == ()


@pytest.mark.django_db
def test_lo_ya_cerrado_no_ofrece_cerrarse_otra_vez(proyecto, proyectista, revisor):
    una = hallazgo(proyecto, proyectista, revisor, "Ya resuelto", dias=-10)
    una.estado = Observacion.CERRADA
    una.save(update_fields=["estado"])
    quien = con_permiso(revisor, "change_observacion")

    etiquetas = [str(e) for e, _u in como_tarea(una, quien).acciones]
    assert not any("Close" in e or "Cerrar" in e for e in etiquetas)


@pytest.mark.django_db
def test_la_bandeja_pinta_las_acciones_solo_en_lo_vencido(client, proyecto, proyectista, revisor):
    """**En una lista de treinta filas, dos enlaces por fila son sesenta enlaces**: lo que se
    quería señalar deja de señalarse."""
    hallazgo(proyecto, proyectista, revisor, "Vencido hace tiempo", dias=-20)
    hallazgo(proyecto, proyectista, revisor, "Para la semana que viene", dias=5)
    quien = con_permiso(revisor, "view_observacion", "change_observacion")
    client.force_login(quien)

    html = client.get(reverse("documents:bandeja")).content.decode()

    assert html.count("accion-de-tarea") == 2, (
        "las acciones tienen que salir en la fila vencida y solo en esa"
    )


# ── El escalado a quien lo abrió ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_lo_que_abriste_y_nadie_toca_llega_a_quien_lo_abrio(proyecto, proyectista, revisor):
    """**El hueco mas grande.** Si el responsable no entraba, no se enteraba nadie."""
    una = hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-30)
    # Se envejece la fila: `updated_at` es `auto_now`, así que hay que pasar por encima.
    Observacion.objects.filter(pk=una.pk).update(updated_at=timezone.now() - timedelta(days=20))

    parados = atrasos_que_no_avanzan(proyectista)

    assert [uno.titulo for uno in parados] == ["El ducto del eje C"]


@pytest.mark.django_db
def test_lo_que_alguien_esta_trabajando_no_escala(proyecto, proyectista, revisor):
    """**El escalado es para lo que está parado, no para lo que va lento.**

    Cualquier movimiento real —replanificar, reasignar, cambiar la prioridad— toca la fila.
    """
    hallazgo(proyecto, proyectista, revisor, "Vencido pero vivo", dias=-30)

    assert atrasos_que_no_avanzan(proyectista) == []


@pytest.mark.django_db
def test_lo_vencido_de_hace_dos_dias_todavia_no_escala(proyecto, proyectista, revisor):
    """**Siete días, no uno.** Con uno, cualquier cosa abierta un viernes escala el lunes y el
    escalado deja de significar nada."""
    una = hallazgo(proyecto, proyectista, revisor, "Vencido anteayer", dias=-2)
    Observacion.objects.filter(pk=una.pk).update(updated_at=timezone.now() - timedelta(days=20))

    assert atrasos_que_no_avanzan(proyectista) == []


@pytest.mark.django_db
def test_lo_que_te_abriste_a_ti_mismo_no_se_cuenta_dos_veces(proyecto, proyectista):
    """Ya está en tu propia lista; contarlo dos veces en el mismo correo se lee como un error."""
    una = hallazgo(proyecto, proyectista, proyectista, "Mío y mío", dias=-30)
    Observacion.objects.filter(pk=una.pk).update(updated_at=timezone.now() - timedelta(days=20))

    assert atrasos_que_no_avanzan(proyectista) == []


@pytest.mark.django_db
def test_el_escalado_sale_en_el_correo_con_quien_lo_tiene(proyecto, proyectista, revisor):
    """Sin decir quien lo tiene, «esto no avanza» obliga a entrar para saber a quien preguntar."""
    una = hallazgo(proyecto, proyectista, revisor, "El ducto del eje C", dias=-30)
    Observacion.objects.filter(pk=una.pk).update(updated_at=timezone.now() - timedelta(days=20))

    assert enviar_resumen(proyectista) == 1

    mensaje = mail.outbox[0]
    assert "El ducto del eje C" in mensaje.body
    assert revisor.get_username() in mensaje.body
    assert revisor.get_username() in mensaje.alternatives[0][0]


@pytest.mark.django_db
def test_quien_no_tiene_nada_suyo_igual_recibe_el_escalado(proyecto, proyectista, revisor):
    """**El caso de quien coordina y reparte todo**: nada a su nombre, y sus hallazgos parados.

    Si el escalado no contara para mandar el correo, esa persona no recibiría nunca el aviso de que
    lo que abrió lleva un mes quieto.
    """
    una = hallazgo(proyecto, proyectista, revisor, "Repartido y olvidado", dias=-30)
    Observacion.objects.filter(pk=una.pk).update(updated_at=timezone.now() - timedelta(days=20))

    from apps.documents.notify import pendientes_por_tramo

    assert sum(len(v) for v in pendientes_por_tramo(proyectista).values()) == 0
    assert enviar_resumen(proyectista) == 1


# ── Las bandas de la portada ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_la_portada_avisa_de_lo_que_lleva_mas_de_un_mes(client, proyecto, proyectista, revisor):
    """**Treinta filas rojas no dicen que tres llevan desde agosto.**"""
    hallazgo(proyecto, proyectista, revisor, "Desde agosto", dias=-45)
    quien = con_permiso(revisor, "view_observacion")
    client.force_login(quien)

    respuesta = client.get(reverse("portal"))

    assert respuesta.context["mis_muy_vencidas"] == 1
    assert "aviso alerta" in respuesta.content.decode()


@pytest.mark.django_db
def test_sin_nada_muy_vencido_no_sale_la_banda(client, proyecto, proyectista, revisor):
    """**Una banda permanente es un marco de la página** y deja de leerse a la semana."""
    hallazgo(proyecto, proyectista, revisor, "De ayer", dias=-1)
    quien = con_permiso(revisor, "view_observacion")
    client.force_login(quien)

    assert client.get(reverse("portal")).context["mis_muy_vencidas"] == 0
