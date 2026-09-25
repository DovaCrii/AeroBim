"""**La bandeja de pendientes, y Archivos, que se leen de un vistazo** (2026-09-23).

El usuario, con captura de `p340`: *«mejorar cómo se informan los atrasos y pendientes… hacer el
texto más entendible»*. En la bandeja había cuatro cajas grandes de «Nada.» —una por tramo vacío—
y lo que sí había quedaba debajo; nada decía arriba cuánto había en total. Y en Archivos la revisión
decía «00 S0», con la sigla ISO sin su nombre.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.documents.models import Idoneidad, Observacion, Revision

pytestmark = pytest.mark.django_db


@pytest.fixture
def entra(client, revisor):
    from django.contrib.auth.models import Permission

    for codename in ("view_observacion", "view_revision", "view_entregable"):
        revisor.user_permissions.add(Permission.objects.get(codename=codename))
    client.force_login(revisor)
    return revisor


def pendiente(organizacion, proyecto, responsable, dias, titulo):
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=responsable,
        responsable=responsable,
        vence=timezone.localdate() + timedelta(days=dias),
    )


def test_arriba_va_la_cifra_de_cada_tramo(client, entra, organizacion, proyecto):
    """**«¿Cómo voy?» sin leer ninguna tarea.** Lo vencido va marcado aparte."""
    pendiente(organizacion, proyecto, entra, -10, "Vencida uno")
    pendiente(organizacion, proyecto, entra, -2, "Vencida dos")
    pendiente(organizacion, proyecto, entra, 3, "De esta semana")

    html = client.get(reverse("documents:bandeja")).content.decode()

    assert 'class="resumen-de-tramos"' in html
    assert 'href="#tramo-vencido"' in html
    assert "resumen-tramo resumen-tramo-arde" in html
    # Y cada cifra lleva a su sección, que tiene que existir con ese ancla.
    assert 'id="tramo-vencido"' in html
    assert 'id="tramo-en_7"' in html


def test_un_tramo_vacio_ya_no_pinta_su_caja(client, entra, organizacion, proyecto):
    """**Antes: cuatro cajas de «Nada.» encima de lo único que había.**

    El tramo vacío se queda en el resumen, a cero —dice que se miró y está limpio— pero sale de la
    lista.
    """
    pendiente(organizacion, proyecto, entra, -5, "La única")

    html = client.get(reverse("documents:bandeja")).content.decode()

    assert 'id="tramo-vencido"' in html
    assert 'id="tramo-en_15"' not in html
    assert "resumen-tramo-cero" in html
    assert html.count('class="vacio"') == 0


def test_sin_nada_pendiente_es_una_frase_y_no_cinco_cajas(client, entra):
    html = client.get(reverse("documents:bandeja")).content.decode()

    assert html.count("vacio-grande") == 1
    assert "resumen-de-tramos" not in html


def test_el_resumen_y_la_lista_salen_de_la_misma_cuenta(client, entra, organizacion, proyecto):
    """Dos listas armadas por separado pueden discrepar; estas salen una de la otra."""
    pendiente(organizacion, proyecto, entra, -1, "Una")
    pendiente(organizacion, proyecto, entra, 20, "Otra")

    contexto = client.get(reverse("documents:bandeja")).context

    etiquetadas = [len(t) for _e, t, _u in contexto["tramos_etiquetados"]]
    con_clave = [len(t) for _c, _e, t, _u in contexto["tramos_con_clave"]]
    assert etiquetadas == con_clave
    assert contexto["total_pendiente"] == 2


def test_la_revision_dice_que_significa_su_sigla(client, entra, entregable, proyectista):
    """Decía «S0»: la sigla ISO, que no dice si el archivo está en borrador o publicado.

    La revisión va publicada —A— a propósito: quien no sube revisiones solo ve las publicadas, y con
    una S2 la tabla saldría vacía y la prueba no miraría nada.
    """
    Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/a.ifc",
        nombre_original="modelo.ifc",
        sha256="a" * 64,
    )

    html = client.get(reverse("documents:archivos")).content.decode()

    # El texto sale de las opciones del modelo, así que es el mismo que en el expediente.
    assert str(Idoneidad.A.label) in html


def test_las_acciones_de_archivo_son_botones_en_su_columna(client, entra, entregable, proyectista):
    """**Tres enlaces subrayados pegados se leían como una frase**, y la columna no tenía ancho."""
    Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/a.ifc",
        nombre_original="modelo.ifc",
        sha256="b" * 64,
    )

    html = client.get(reverse("documents:archivos")).content.decode()

    assert 'class="celda-acciones"' in html
    assert 'class="boton secundario chico"' in html
