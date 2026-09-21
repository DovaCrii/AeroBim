"""**La columna «Avance» de la lista de obras salia vacia en todas las filas.**

## El defecto

`templates/projects/proyectos.html` pinta `proyecto.avance_pct` tres veces —el `aria-label`, el
`style="width: {{ }}%"` de la barra y el `<b>{{ }}%</b>`— y ese atributo **solo lo creaba el
portal**, a mano, en `apps/accounts/views.py`. `ProyectosView` nunca lo asignaba.

En una plantilla de Django un atributo que no existe **no es un error**: es la cadena vacia. Asi que
la pantalla salia con `style="width: %"`, un `%` sin numero delante, y el lector de pantalla
diciendo «Progress  per cent». Nada en rojo, nada en los registros, y el comentario de la propia
plantilla presumiendo de haber cambiado «`0.42` a secas» por una barra que no se dibujaba.

## Por que ninguna prueba lo vio

Porque **ninguna renderizaba esa columna**. Las de `test_pantallas_proyecto.py` son todas de
permisos y de acotado por organizacion: comprueban el `status_code`, no lo que dice el papel. Es el
patron de los oraculos que cuentan y no miden.

## El arreglo, y por que no es multiplicar en la vista

Se podia asignar `avance_pct` tambien en `ProyectosView`, y entonces habria **tres** sitios que
multiplican por cien y un cuarto que se olvidara. `avance_pct` pasa a ser propiedad del modelo, al
lado de `avance_fisico`: la plantilla pide lo que necesita y no hay nada que recordar.
"""

import re

import pytest
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.documents.models import Entregable, Idoneidad


@pytest.fixture
def obra_al_75(proyecto, entregable, revision, disciplina):
    """Una obra con avance 0,75 exacto: peso 3 publicado y peso 1 sin revision."""
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
    return proyecto


@pytest.fixture
def mirona(proyectista):
    """Quien puede ver la lista de obras."""
    proyectista.user_permissions.add(
        Permission.objects.get(content_type__app_label="projects", codename="view_proyecto")
    )
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(pk=proyectista.pk)


@pytest.mark.django_db
def test_el_modelo_da_el_porcentaje_ya_hecho(obra_al_75):
    """**Las dos escalas, con nombres distintos y del mismo sitio.**

    `avance_fisico` es la fraccion —lo que se calcula— y `avance_pct` el entero que se pinta. Que
    los dos salgan del modelo es lo que impide que una pantalla nueva vuelva a olvidarse del ×100.
    """
    assert obra_al_75.avance_fisico == pytest.approx(0.75)
    assert obra_al_75.avance_pct == 75


@pytest.mark.django_db
def test_la_lista_de_obras_dibuja_la_barra_con_su_numero(client, mirona, obra_al_75):
    """**El oraculo que faltaba.** Sin esto, `width: %` pasa el gate entero.

    Se mira el `style` de la barra y no solo el texto: el texto podria venir de otra celda, y lo que
    de verdad se rompio fue el ancho, que es lo unico que se compara de un vistazo entre obras.
    """
    client.force_login(mirona)
    html = client.get(reverse("projects:proyectos")).content.decode()

    assert "width: 75%" in html, "la barra de avance sale sin ancho: la columna esta vacia"
    assert ">75%<" in html, "la cifra de avance sale sin numero delante del signo"


@pytest.mark.django_db
def test_ninguna_pantalla_pinta_el_avance_como_fraccion(client, mirona, obra_al_75):
    """**Dos escalas en la misma pantalla es peor que una escala rara.**

    La ficha de la obra pintaba «Progress 0.75» arriba y «75%» doce lineas mas abajo, los dos
    ciertos y los dos del mismo dato. Quien lee eso no sabe cual creer.
    """
    client.force_login(mirona)
    html = client.get(reverse("projects:proyecto", args=[obra_al_75.pk])).content.decode()

    assert "0.75" not in html and "0,75" not in html, (
        "la ficha sigue pintando la fraccion: conviven 0.75 y 75% en la misma pagina"
    )
    assert "75%" in html


def test_ninguna_plantilla_escupe_un_comentario_a_medias():
    """**`{# #}` es de una sola linea, y el que se pasa se imprime en la pagina.**

    No es teorico: pasa dos veces en este repositorio. La primera dejo el texto de un comentario
    dentro de la tabla de proyectos —esta escrito en `proyectos.html`— y la segunda, escribiendo
    **este mismo bloque**, dejo una explicacion sobre el `%` impresa en el subtitulo de la obra.

    Django no avisa: un `{#` cuyo `#}` esta en otra linea no es un comentario, es texto. Lo unico
    que lo caza es mirar, y mirar no escala. Esto si.
    """
    from pathlib import Path

    from django.conf import settings

    plantillas = Path(settings.BASE_DIR) / "templates"
    culpables = [
        f"{ruta.relative_to(plantillas)}:{n}"
        for ruta in plantillas.rglob("*.html")
        for n, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), 1)
        if "{#" in linea and "#}" not in linea.split("{#", 1)[1]
    ]

    assert not culpables, (
        f"comentario `{{# #}}` sin cerrar en su linea: {culpables}. Django lo imprime tal cual; "
        "para varias lineas va `{% comment %}`."
    )


def test_las_plantillas_no_pintan_la_fraccion_a_mano():
    """**El guardian, porque el defecto vuelve escribiendo una plantilla nueva.**

    Lo que se prohibe es **cualquier fraccion de avance** en una plantilla: `avance_fisico` del
    proyecto y `avance` del entregable. Ninguna pantalla quiere ensenar `0.75`, y quien necesite el
    porcentaje tiene `avance_pct` al lado en los dos modelos.

    **Y el segundo se anadio despues de encontrarlo en pantalla**, no leyendo: la bandeja pintaba
    `entregable.avance|floatformat` bajo una columna llamada «Avance», o sea «0.55» donde el resto
    de la aplicacion dice «55%». El guardian solo miraba `avance_fisico` y lo dejo pasar.

    **Y se mira la linea completa, no solo `{{ }}`.** La primera version de este guardian buscaba
    `\\{\\{[^}]*avance_fisico` y **paso en verde sobre la plantilla que tenia el defecto**: la ficha
    lo pintaba dentro de un `{% blocktranslate with ... %}`, que abre con `{%`. Un guardian que no
    cubre las dos formas de interpolar de Django no guarda nada.
    """
    from pathlib import Path

    from django.conf import settings

    plantillas = Path(settings.BASE_DIR) / "templates"
    culpables = [
        f"{ruta.relative_to(plantillas)}:{n}"
        for ruta in plantillas.rglob("*.html")
        for n, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), 1)
        # `avance_fisico` en cualquier forma, y `.avance` cuando **no** es `.avance_pct`.
        if re.search(r"avance_fisico|\.avance(?!_pct)\b", linea)
    ]

    assert not culpables, (
        f"estas plantillas pintan la fraccion en vez del porcentaje: {culpables}. "
        "Usa `avance_pct`, que ya viene multiplicado."
    )
