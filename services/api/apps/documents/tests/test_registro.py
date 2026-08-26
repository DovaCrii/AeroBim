"""El registro documental: revisiones, avance, transmittals y observaciones."""

import pytest
from django.core.exceptions import ValidationError

from apps.documents.models import (
    AVANCE_POR_IDONEIDAD,
    Actividad,
    Idoneidad,
    Observacion,
    Revision,
    Transmittal,
)


@pytest.mark.django_db
def test_emitir_una_revision_releva_a_la_anterior(entregable, revision, proyectista):
    """**Nunca se sobreescribe una revision, se emite otra.** Es lo que permite contestar
    que decia el plano cuando se aprobo la etapa."""
    nueva = Revision.objects.create(
        entregable=entregable,
        correlativo="P02",
        idoneidad=Idoneidad.S4,
        subida_por=proyectista,
    )

    revision.refresh_from_db()
    assert revision.es_vigente is False
    assert nueva.es_vigente is True
    assert entregable.revision_vigente == nueva
    # Y la anterior sigue ahi: no se borro nada.
    assert entregable.revisiones.count() == 2


@pytest.mark.django_db
def test_el_avance_sale_del_codigo_de_idoneidad_y_no_de_un_numero_teclado(entregable, revision):
    assert entregable.avance == AVANCE_POR_IDONEIDAD[Idoneidad.S3]

    revision.idoneidad = Idoneidad.A
    revision.save()
    assert entregable.avance == 1.0


@pytest.mark.django_db
def test_publicado_con_comentarios_no_es_el_cien_por_ciento(entregable, revision):
    """Una `B` se puede usar y **queda la obligacion de resolver los comentarios**."""
    revision.idoneidad = Idoneidad.B
    revision.save()

    assert entregable.esta_publicado is True
    assert entregable.avance < 1.0


@pytest.mark.django_db
def test_un_entregable_sin_revision_avanza_cero_y_existe_igual(entregable):
    """**El entregable no tiene archivo**: existe desde que se planifica. Un registro que
    necesita un archivo para existir no puede decir que falta."""
    assert entregable.revision_vigente is None
    assert entregable.avance == 0.0
    assert entregable.esta_publicado is False


@pytest.mark.django_db
def test_el_avance_del_proyecto_es_la_suma_ponderada(proyecto, entregable, revision, disciplina):
    from apps.documents.models import Entregable

    # Un segundo entregable, con peso 1 y sin revision: tira el promedio hacia abajo.
    Entregable.objects.create(
        organizacion=entregable.organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716-LCD-AR-P-002",
        titulo="Planta piso 6",
        responsable=entregable.responsable,
        peso=1,
    )
    revision.idoneidad = Idoneidad.A
    revision.save()

    # (3 × 1,0 + 1 × 0,0) / 4
    assert proyecto.avance_fisico == pytest.approx(0.75)


@pytest.mark.django_db
def test_un_proyecto_sin_entregables_no_divide_por_cero(proyecto):
    assert proyecto.avance_fisico == 0.0


@pytest.mark.django_db
def test_un_transmittal_no_se_emite_vacio_ni_sin_destinatario(
    organizacion, proyecto, revision, proyectista, revisor
):
    """Los dos casos existen —se arma el borrador antes de decidir a quien va— y los dos
    producen un registro que no dice nada."""
    transmittal = Transmittal.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        folio="TR-001",
        asunto="Emision para revision",
        emisor=proyectista,
    )

    assert transmittal.puede_emitirse is False
    with pytest.raises(ValidationError):
        transmittal.emitir()

    transmittal.revisiones.add(revision)
    assert transmittal.puede_emitirse is False  # falta el destinatario

    transmittal.destinatarios.add(revisor)
    assert transmittal.puede_emitirse is True

    transmittal.emitir()
    transmittal.refresh_from_db()
    assert transmittal.status == Transmittal.EMITIDO
    assert transmittal.emitido_en is not None


@pytest.mark.django_db
def test_una_observacion_no_se_cierra_sin_decir_como(
    organizacion, proyecto, revision, revisor, proyectista
):
    """**Es lo que distingue una observacion resuelta de una que alguien marco para bajar
    el contador.**"""
    observacion = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        revision=revision,
        titulo="El muro del eje C no coincide con el modelo",
        autor=revisor,
        responsable=proyectista,
    )

    assert observacion.puede_cerrarse is False
    with pytest.raises(ValidationError):
        observacion.cerrar(revisor, "   ")

    observacion.cerrar(revisor, "Se corrigio el eje en la revision P02.")
    observacion.refresh_from_db()
    assert observacion.estado == Observacion.CERRADA
    assert observacion.cerrada_por == revisor
    assert observacion.cerrada_en is not None


@pytest.mark.django_db
def test_una_observacion_dice_sobre_que_esta_puesta(
    organizacion, proyecto, revision, revisor, proyectista
):
    """Las dos anclas del mismo ciclo de vida: el documento y el modelo. Es lo que hace
    que este registro sea la mitad ya construida de la Fase 4."""
    comun = {
        "organizacion": organizacion,
        "proyecto": proyecto,
        "autor": revisor,
        "responsable": proyectista,
    }
    sobre_documento = Observacion.objects.create(
        **comun, titulo="En la pagina 2", revision=revision, pagina=2, ancla_x=0.4, ancla_y=0.7
    )
    sobre_modelo = Observacion.objects.create(
        **comun, titulo="En el muro", ifc_guid="3vB2mZ1QT8xACPfhBoS0Qd"
    )
    sobre_proyecto = Observacion.objects.create(**comun, titulo="Falta la memoria de calculo")

    assert sobre_documento.ancla == "documento"
    assert sobre_modelo.ancla == "modelo"
    assert sobre_proyecto.ancla == "proyecto"


@pytest.mark.django_db
def test_lo_vencido_se_sabe_y_lo_cerrado_deja_de_estarlo(
    organizacion, proyecto, revisor, proyectista
):
    from django.utils import timezone

    ayer = timezone.localdate() - timezone.timedelta(days=1)
    observacion = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Vencida",
        autor=revisor,
        responsable=proyectista,
        vence=ayer,
    )
    assert observacion.vencida is True

    observacion.cerrar(revisor, "Resuelta en obra.")
    assert observacion.vencida is False

    actividad = Actividad.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Levantar el as-built",
        responsable=proyectista,
        vence=ayer,
    )
    assert actividad.vencida is True
    actividad.status = Actividad.HECHA
    assert actividad.vencida is False


@pytest.mark.django_db
def test_el_paso_a_paso_se_deriva_del_modelo_y_no_de_una_plantilla(
    organizacion, proyecto, proyectista
):
    actividad = Actividad.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Coordinar instalaciones",
        responsable=proyectista,
        status=Actividad.EN_CURSO,
    )

    pasos = actividad.status_steps()
    assert [p["code"] for p in pasos] == Actividad.STATUS_FLOW
    assert [p["state"] for p in pasos] == ["done", "current", "pending", "pending"]

    # Y un estado terminal no pinta en gris todo el recorrido: dice donde se detuvo.
    actividad.status = Actividad.ANULADA
    estados = [p["state"] for p in actividad.status_steps()]
    assert estados[-1] == "blocked"
