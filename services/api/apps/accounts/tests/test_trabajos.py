"""La pantalla de trabajos programados: que lo que vigila **exista**.

Esta pantalla tenía tres nombres en `ESPERADOS` y **dos no eran comandos**: `avisar_vencimientos` y
`verificar_respaldo`, escritos cuando la lista se pensaba como intenciones. El efecto era el
contrario del buscado: dos filas eternas en «nunca corrió» que nadie podía arreglar. Un aviso que no
se puede apagar enseña a no mirar la lista, y entonces tampoco se ve el que sí importa.

La prueba que evita que vuelva a pasar es la primera: **cada nombre es un comando de verdad**.
"""

import pytest
from django.contrib.auth.models import Permission
from django.core.management import get_commands
from django.urls import reverse

from apps.accounts.views import TrabajosView


def test_cada_trabajo_esperado_es_un_comando_de_verdad():
    """**La prueba que existe por el error que hubo.**

    `get_commands()` es el propio registro de Django: es un oráculo independiente de nuestra lista,
    y no hay forma de escribir un nombre inventado que lo pase.
    """
    comandos = get_commands()

    faltan = [nombre for nombre in TrabajosView.ESPERADOS if nombre not in comandos]

    assert faltan == [], (
        f"Estos trabajos se vigilan y no existen: {faltan}. "
        "Una fila en «nunca corrió» que nadie puede arreglar enseña a no mirar esta pantalla."
    )


def test_el_resumen_por_correo_se_vigila():
    """Es el único que corre solo, y el que el piloto necesita que salga."""
    assert "enviar_resumen" in TrabajosView.ESPERADOS


def test_lo_que_se_lanza_a_mano_no_se_vigila():
    """`detectar_interferencias` pide dos UUID de revisión: «nunca corrió» no sería un problema.

    Vigilar lo que se lanza a mano llenaría la pantalla de avisos que no significan nada.
    """
    assert "detectar_interferencias" not in TrabajosView.ESPERADOS


@pytest.mark.django_db
def test_la_pantalla_dice_que_nunca_corrio_y_no_falla(client, django_user_model):
    """Sin ninguna corrida, «nunca corrió» **es la respuesta que hace falta al desplegar**."""
    usuario = django_user_model.objects.create_user("vigilante", password="x")
    usuario.user_permissions.add(Permission.objects.get(codename="view_jobrun"))
    client.force_login(django_user_model.objects.get(pk=usuario.pk))

    respuesta = client.get(reverse("accounts:trabajos"))

    assert respuesta.status_code == 200
    esperados = respuesta.context["esperados"]
    assert [e["comando"] for e in esperados] == list(TrabajosView.ESPERADOS)
    assert all(e["ultima"] is None for e in esperados)
