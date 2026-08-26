"""La auditoria es de solo agregar, y ordenable. Las dos cosas se prueban.

`sequence` existe porque `created_at` **no basta**: en la misma maquina
`timezone.now()` devuelve el valor identico en llamadas sucesivas rapidas, y SQL no
garantiza ningun orden para empates en una columna no unica. Una auditoria que no se
puede ordenar no contesta "que paso antes".
"""

import pytest
from django.core.exceptions import ValidationError

from apps.core.models import AuditEvent


def crear(**extra):
    return AuditEvent.objects.create(
        action="post_success",
        method="POST",
        path="/proyecto/organizaciones/",
        status_code=200,
        **extra,
    )


@pytest.mark.django_db
def test_la_secuencia_ordena_aunque_el_reloj_empate():
    primero = crear()
    segundo = crear()
    tercero = crear()

    assert [primero.sequence, segundo.sequence, tercero.sequence] == [1, 2, 3]
    # El orden por defecto es el mas reciente primero.
    assert list(AuditEvent.objects.values_list("sequence", flat=True)) == [3, 2, 1]


@pytest.mark.django_db
def test_no_se_puede_modificar_un_evento_ya_escrito():
    evento = crear()
    evento.action = "otra_cosa"

    with pytest.raises(ValidationError):
        evento.save()


@pytest.mark.django_db
def test_no_se_puede_borrar_ni_de_uno_en_uno_ni_en_bloque():
    evento = crear()

    with pytest.raises(ValidationError):
        evento.delete()
    with pytest.raises(ValidationError):
        AuditEvent.objects.all().delete()
    with pytest.raises(ValidationError):
        AuditEvent.objects.all().update(action="otra")

    assert AuditEvent.objects.count() == 1
