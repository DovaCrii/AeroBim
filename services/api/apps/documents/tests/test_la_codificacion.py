"""**La nomenclatura de los códigos, que no existía.**

`Entregable.codigo` era texto libre sin ninguna regla escrita: sin validación, sin generador, y sin
un solo documento en `docs/` que dijera qué forma tiene. Dos personas de la misma oficina codifican
el mismo plano distinto, y nadie se entera hasta que hay que buscarlo.

## Lo que estas pruebas fijan, y lo que a propósito no

Fijan **la estructura, el generador y la normalización**. No fijan que un código deba seguirla: eso
sería convertir en error lo que `Revision.correlativo` ya declaró caso previsto — *«cada mandante
impone el suyo, y forzar un formato rechaza documentos válidos»*. La prueba de que **no** bloquea es
tan importante como las otras, y está abajo.
"""

import pytest

from apps.documents import codificacion
from apps.documents.forms import EntregableForm
from apps.documents.models import Entregable, TipoEntregable


def test_un_codigo_bien_formado_se_desarma_entero():
    desarmado = codificacion.partes("716LCD-JEJ-ZZ-XX-M3-ME-0001")

    assert desarmado is not None
    assert desarmado.obra == "716LCD"
    assert desarmado.originador == "JEJ"
    assert desarmado.tipo == "M3"
    assert desarmado.disciplina == "ME"
    assert desarmado.numero == 1


def test_un_codigo_ajeno_no_revienta_devuelve_nada():
    """**Devolver `None` y no levantar es la decisión, no una comodidad.**

    Los documentos de terceros traen la codificación de quien los mandó. Que eso obligue a rodear
    cada llamada de un `try` convertiría en excepcional lo que es rutina.
    """
    assert codificacion.partes("P-102 rev B") is None
    assert codificacion.partes("") is None
    assert codificacion.sigue_la_norma("716LCD-JEJ-ZZ-XX-M3-ME-0001") is True


def test_el_numero_se_escribe_con_cuatro_cifras():
    """Ordenar como texto es como se ordena una lista de códigos, y `10` va antes que `2`."""
    assert str(codificacion.partes("A-B-C-D-E-F-7")) == "A-B-C-D-E-F-0007"


@pytest.mark.django_db
def test_se_compone_el_codigo_que_le_toca(proyecto, disciplina):
    """La obra, el originador y la disciplina salen de lo que ya está en la base."""
    compuesto = codificacion.compone(
        proyecto=proyecto, tipo=TipoEntregable.MODELO, disciplina=disciplina, numero=3
    )

    # `716-LCD` pierde el guion: es un campo del código, no puede traer el separador dentro.
    assert compuesto == "716LCD-PRUEBA-ZZ-XX-M3-AR-0003"


@pytest.mark.django_db
def test_el_correlativo_sale_de_los_codigos_y_no_de_contar_filas(
    proyecto, disciplina, entregable, proyectista
):
    """**Contar entregables daría un número repetido** en cuanto alguien borre uno.

    Y los códigos ajenos no cuentan: el `P-102` que mandó un tercero no dice nada sobre cuál es
    nuestro siguiente número.
    """
    Entregable.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="716LCD-PRUEBA-ZZ-XX-DR-AR-0007",
        titulo="Planta de techos",
        responsable=proyectista,
        tipo=TipoEntregable.PLANO,
    )
    Entregable.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        disciplina=disciplina,
        codigo="P-102 del mandante",
        titulo="Lo que mandó un tercero",
        responsable=proyectista,
        tipo=TipoEntregable.PLANO,
    )

    # El 0007 es el mayor de esa combinación; el ajeno y el de la fixtura (que tampoco sigue la
    # estructura) no participan.
    assert codificacion.siguiente_numero(proyecto, TipoEntregable.PLANO, disciplina) == 8

    # Otra clase de documento arranca su propia serie.
    assert codificacion.siguiente_numero(proyecto, TipoEntregable.MODELO, disciplina) == 1


@pytest.mark.django_db
def test_la_propuesta_es_el_codigo_completo_con_su_numero(proyecto, disciplina):
    assert codificacion.propuesta(proyecto, TipoEntregable.PLANO, disciplina) == (
        "716LCD-PRUEBA-ZZ-XX-DR-AR-0001"
    )


# --- El formulario ---------------------------------------------------------------------


@pytest.mark.django_db
def test_el_codigo_del_entregable_se_guarda_en_mayusculas(proyecto, disciplina, proyectista):
    """**El defecto de verdad de este bloque.**

    `Proyecto` y `Disciplina` normalizaban su código y `Entregable` no, siendo el que más tiene.
    `716-lcd-…` y `716-LCD-…` son el mismo documento, y la restricción de unicidad los daba por
    distintos: dos filas para un solo plano.
    """
    formulario = EntregableForm(
        data={
            "codigo": "  716lcd-jej-zz-xx-dr-ar-0001  ",
            "titulo": "Planta piso 7",
            "tipo": TipoEntregable.PLANO,
            "disciplina": disciplina.pk,
            "responsable": proyectista.pk,
            "peso": 1,
        },
        proyecto=proyecto,
    )

    assert formulario.is_valid(), formulario.errors
    assert formulario.cleaned_data["codigo"] == "716LCD-JEJ-ZZ-XX-DR-AR-0001"
    assert formulario.codigo_fuera_de_norma is False


@pytest.mark.django_db
def test_un_codigo_fuera_de_norma_se_guarda_y_se_avisa(proyecto, disciplina, proyectista):
    """**Avisa, no bloquea.** Si esto empezara a fallar, el registro dejaría de aceptar documentos
    de terceros — que son la mitad de los que pasan por una coordinación."""
    formulario = EntregableForm(
        data={
            "codigo": "P-102 rev B",
            "titulo": "Lo que mandó el mandante",
            "tipo": TipoEntregable.PLANO,
            "disciplina": disciplina.pk,
            "responsable": proyectista.pk,
            "peso": 1,
        },
        proyecto=proyecto,
    )

    assert formulario.is_valid(), formulario.errors
    assert formulario.codigo_fuera_de_norma is True


@pytest.mark.django_db
def test_el_formulario_nuevo_llega_con_el_codigo_ya_propuesto(proyecto, disciplina):
    """**Una nomenclatura que hay que teclear a mano no la sigue nadie.**"""
    formulario = EntregableForm(proyecto=proyecto)

    assert formulario.fields["codigo"].initial == "716LCD-PRUEBA-ZZ-XX-DR-AR-0001"
    assert "716LCD-JEJ-ZZ-XX-M3-ME-0001" in str(formulario.fields["codigo"].help_text)
