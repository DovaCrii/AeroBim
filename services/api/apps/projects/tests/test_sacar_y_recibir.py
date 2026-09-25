"""**Sacar y recibir**: el informe, la hoja y el BCF, en tres tarjetas (2026-09-25).

Eran dos cajas con doce controles a la vista y cuatro botones rellenos compitiendo, y la ida y la
vuelta del BCF en dos sitios de la ficha que no se ven a la vez. El usuario: «mejorar este flujo, y
dónde está ubicado, que no genere ruido visual y no sea plano».

## Lo que se sujeta

1. **Las opciones del informe siguen viajando aunque estén plegadas**: están dentro del formulario
   y dentro del `<details>`. Si alguien las saca del formulario al moverlas, el PDF sale con las
   de fábrica en silencio.
2. **Una sola acción rellena** en todo el bloque: el PDF de la reunión.
3. **Exportar e importar, en la misma tarjeta**, y exportar ya no en el subtítulo.
4. La subida sigue siendo `multipart`: sin eso `request.FILES` llega vacío con un archivo elegido.
"""

import re

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.urls import reverse

from apps.accounts import roles

pytestmark = pytest.mark.django_db


@pytest.fixture
def ficha(client, organizacion, revisor, proyecto):
    from apps.documents.models import Observacion

    # Con una observación: exportar solo se ofrece si hay algo que exportar, y es correcto.
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Algo que exportar",
        autor=revisor,
        responsable=revisor,
    )
    call_command("bootstrap_roles", verbosity=0)
    revisor.groups.add(Group.objects.get(name=roles.COORDINADOR))
    client.force_login(type(revisor).objects.get(pk=revisor.pk))
    return client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()


def tarjetas(html: str) -> list[str]:
    zona = html[html.index('<div class="sacar-y-recibir">') :]
    return re.findall(r'<section class="salida">(.*?)</section>', zona, re.S)[:3]


def test_son_tres_tarjetas_con_su_titulo(ficha):
    titulos = [re.search(r"<h2>(.*?)</h2>", t, re.S).group(1).strip() for t in tarjetas(ficha)]

    assert titulos == [
        "Informe de coordinación",
        "Resumen ejecutivo",
        "Ida y vuelta con el mandante (BCF)",
    ]


def test_las_opciones_plegadas_siguen_dentro_del_formulario(ficha, proyecto):
    informe = tarjetas(ficha)[0]
    formulario = re.search(r"<form[^>]*>(.*?)</form>", informe, re.S)

    assert reverse("documents:informe-coordinacion", args=[proyecto.pk]) in informe
    plegado = re.search(r"<details[^>]*>(.*?)</details>", formulario.group(1), re.S).group(1)
    for campo in ("estado", "orden", "mias", "comentarios", "miniaturas"):
        assert f'name="{campo}"' in plegado, f"«{campo}» se salió de las opciones plegadas"


def test_una_sola_accion_rellena_en_todo_el_bloque(ficha):
    """El PDF de la reunión es lo que se saca todas las semanas; el resto va en secundario."""
    zona = "".join(tarjetas(ficha))
    botones = re.findall(r"<button[^>]*>", zona) + re.findall(r'<a class="boton[^"]*"', zona)

    rellenos = [b for b in botones if "secundario" not in b]
    assert len(rellenos) == 1
    assert 'value="pdf"' in rellenos[0]


def test_la_ida_y_la_vuelta_del_bcf_van_juntas(ficha, proyecto):
    bcf = tarjetas(ficha)[2]

    assert reverse("documents:exportar-bcf", args=[proyecto.pk]) in bcf
    assert reverse("documents:importar-bcf", args=[proyecto.pk]) in bcf
    assert 'enctype="multipart/form-data"' in bcf
    # Y una sola vez en la página: ya no está también en el subtítulo.
    assert ficha.count(reverse("documents:exportar-bcf", args=[proyecto.pk])) == 1


def test_el_boton_de_importar_no_promete_lo_que_no_hace(ficha):
    """La importación enseña primero qué entra y solo escribe al confirmar: el botón lo dice."""
    bcf = tarjetas(ficha)[2]

    assert "Ver lo que trae" in bcf
    assert "No se escribe nada hasta que confirmes" in bcf
