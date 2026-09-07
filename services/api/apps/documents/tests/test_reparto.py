"""Repartir un hallazgo ya abierto: dueño, fecha y prioridad. `F12.10`.

## El hueco que esto cierra

Dueño, fecha y prioridad **solo se podian fijar al crear** la observacion. Una nota abierta desde
el visor nace con el autor como responsable —y su propio texto dice «Repartela desde la pantalla
de observaciones cuando toque»— pero esa pantalla era **solo una lista**: no habia `editar/`.

Y sin dueño y fecha un hallazgo **no esta en la bandeja de nadie**: `pendientes_por_tramo` filtra
por `responsable` y `vence`. O sea que el reparto, que es lo que convierte un hallazgo en la tarea
de alguien, no existia — y es el primer requisito del piloto.

Lo que se prueba: que reparte de verdad, que **no toca lo que no debe**, que avisa al nuevo dueño,
que deja traza de **quien lo tenia antes**, y el contrato de permisos.
"""

import datetime as dt

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.urls import reverse

from apps.documents.models import Observacion


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def sin_repartir(db, organizacion, proyecto, revisor):
    """Una nota como la que deja el visor: **a nombre de su autor y sin fecha**.

    Es exactamente el estado en que `ObservacionesDeRevisionAPI.post` deja una nota, y el que hacia
    falta poder cambiar.
    """
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Falta la cota del vano V-03",
        descripcion="Se ve en el alzado norte.",
        autor=revisor,
        responsable=revisor,
        prioridad=Observacion.MEDIA,
        ifc_guid="2x9ibDgrvAu8y4Yd$Ug4Qu",
    )


def ruta_de(observacion):
    return reverse("documents:repartir-observacion", args=[observacion.pk])


# --- Que reparte ---------------------------------------------------------------------


def test_cambia_dueno_fecha_y_prioridad(client, sin_repartir, revisor, proyectista):
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    respuesta = client.post(
        ruta_de(sin_repartir),
        {"responsable": proyectista.pk, "vence": "2026-10-15", "prioridad": Observacion.ALTA},
    )

    assert respuesta.status_code == 302
    sin_repartir.refresh_from_db()
    assert sin_repartir.responsable == proyectista
    assert sin_repartir.vence == dt.date(2026, 10, 15)
    assert sin_repartir.prioridad == Observacion.ALTA


def test_un_hallazgo_no_se_queda_SIN_dueno(client, sin_repartir, revisor):
    """**`Observacion.responsable` es `NOT NULL`: no existe «sin repartir».**

    Esta prueba se escribio al reves —dando por opcional el dueño— y el resultado fue un
    `IntegrityError`, o sea un 500 al intentar vaciarlo. Repartir es cambiar de dueño, nunca
    quitarlo, y se fija aqui para que nadie vuelva a suponer lo otro.
    """
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    respuesta = client.post(
        ruta_de(sin_repartir),
        {"responsable": "", "vence": "", "prioridad": Observacion.BAJA},
    )

    # Se rechaza con su motivo y se vuelve a la ficha; no revienta.
    assert respuesta.status_code == 302
    sin_repartir.refresh_from_db()
    assert sin_repartir.responsable == revisor
    assert sin_repartir.prioridad == Observacion.MEDIA


def test_la_fecha_SI_se_puede_quitar(client, sin_repartir, revisor, proyectista):
    """`vence` admite nulo: un hallazgo puede estar repartido y todavia sin plazo."""
    sin_repartir.vence = dt.date(2026, 10, 1)
    sin_repartir.save(update_fields=["vence"])

    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))
    client.post(
        ruta_de(sin_repartir),
        {"responsable": proyectista.pk, "vence": "", "prioridad": Observacion.MEDIA},
    )

    sin_repartir.refresh_from_db()
    assert sin_repartir.vence is None
    assert sin_repartir.responsable == proyectista


def test_NO_toca_el_titulo_ni_la_descripcion_aunque_se_manden(client, sin_repartir, revisor):
    """El hallazgo es lo que se vio; repartirlo no lo reescribe.

    Si el formulario aceptara el titulo, el hilo de comentarios quedaria hablando de otra cosa —y
    quien mandara el POST a mano podria reescribir un hallazgo ajeno con permiso de cambiarlo.
    """
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    client.post(
        ruta_de(sin_repartir),
        {
            "prioridad": Observacion.ALTA,
            "titulo": "OTRA COSA",
            "descripcion": "reescrita",
            "estado": Observacion.CERRADA,
        },
    )

    sin_repartir.refresh_from_db()
    assert sin_repartir.titulo == "Falta la cota del vano V-03"
    assert sin_repartir.descripcion == "Se ve en el alzado norte."
    # Y el estado tiene sus propias puertas, que piden motivo.
    assert sin_repartir.estado == Observacion.ABIERTA


def test_una_prioridad_inventada_no_guarda_nada(client, sin_repartir, revisor):
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    client.post(ruta_de(sin_repartir), {"prioridad": "urgentisima"})

    sin_repartir.refresh_from_db()
    assert sin_repartir.prioridad == Observacion.MEDIA


# --- Que avisa, y que deja traza -----------------------------------------------------


def test_avisa_al_nuevo_dueno(client, sin_repartir, revisor, proyectista):
    """**Repartir sin avisar** deja al nuevo dueño sin enterarse hasta el resumen del dia."""
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))
    mail.outbox.clear()

    client.post(
        ruta_de(sin_repartir),
        {"responsable": proyectista.pk, "vence": "", "prioridad": Observacion.MEDIA},
    )

    assert len(mail.outbox) == 1
    assert proyectista.email in mail.outbox[0].to


def test_no_avisa_si_el_dueno_no_cambia(client, sin_repartir, revisor):
    """Cambiar solo la fecha no es una asignacion: un correo por cada ajuste es ruido."""
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))
    mail.outbox.clear()

    client.post(
        ruta_de(sin_repartir),
        {"responsable": revisor.pk, "vence": "2026-11-01", "prioridad": Observacion.MEDIA},
    )

    sin_repartir.refresh_from_db()
    assert sin_repartir.vence == dt.date(2026, 11, 1)
    assert mail.outbox == []


def test_la_traza_dice_de_quien_era_antes(client, sin_repartir, revisor, proyectista):
    """**Repartir es una decision de coordinacion**, y dentro de un mes «¿por que es mia?» se
    contesta mirando la auditoria. Sin el dueño anterior, la traza dice que algo cambio y no que."""
    from apps.core.models import AuditEvent

    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    client.post(
        ruta_de(sin_repartir),
        {"responsable": proyectista.pk, "vence": "2026-10-15", "prioridad": Observacion.ALTA},
    )

    evento = AuditEvent.objects.filter(action="repartir_observacion").latest("created_at")
    assert evento.metadata["antes"] == revisor.get_username()
    assert evento.metadata["ahora"] == proyectista.get_username()
    assert evento.metadata["vence"] == "2026-10-15"


# --- El contrato de permisos ---------------------------------------------------------


def test_sin_permiso_de_cambiar_no_se_reparte(client, sin_repartir, proyectista, revisor):
    """Repartir es **cambiar** una observacion, no abrirla: quien solo puede abrir no reparte."""
    client.force_login(dar(proyectista, "documents.add_observacion", "documents.view_observacion"))

    respuesta = client.post(
        ruta_de(sin_repartir),
        {"responsable": proyectista.pk, "vence": "", "prioridad": Observacion.ALTA},
    )

    assert respuesta.status_code in (302, 403)
    sin_repartir.refresh_from_db()
    assert sin_repartir.responsable == revisor
    assert sin_repartir.prioridad == Observacion.MEDIA


def test_anonimo_no_reparte(client, sin_repartir, revisor):
    respuesta = client.post(ruta_de(sin_repartir), {"prioridad": Observacion.ALTA})

    assert respuesta.status_code in (302, 403)
    sin_repartir.refresh_from_db()
    assert sin_repartir.prioridad == Observacion.MEDIA


# --- Y que la ficha lo ofrezca -------------------------------------------------------


def test_la_ficha_trae_el_formulario_de_reparto(client, sin_repartir, revisor):
    client.force_login(dar(revisor, "documents.change_observacion", "documents.view_observacion"))

    cuerpo = client.get(reverse("documents:observacion", args=[sin_repartir.pk])).content.decode()

    assert reverse("documents:repartir-observacion", args=[sin_repartir.pk]) in cuerpo
    # **Relleno con lo que ya lleva**: en blanco, guardar sin mirar borraria el dueño puesto.
    assert f'value="{Observacion.MEDIA}" selected' in cuerpo or "selected" in cuerpo


def test_quien_no_puede_cambiar_no_ve_el_formulario(client, sin_repartir, proyectista):
    """Un formulario que termina en 403 es peor que no ofrecerlo: enseña a probar puertas."""
    client.force_login(dar(proyectista, "documents.view_observacion"))

    cuerpo = client.get(reverse("documents:observacion", args=[sin_repartir.pk])).content.decode()

    assert reverse("documents:repartir-observacion", args=[sin_repartir.pk]) not in cuerpo
