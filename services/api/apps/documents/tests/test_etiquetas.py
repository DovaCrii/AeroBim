"""Las etiquetas del proyecto, y el informe pedido por etiqueta: `F10.1`.

**La razón de que sean vocabulario y no texto libre es lo primero que se prueba.** Un texto libre se
fragmenta a la tercera semana —«estructura», «Estructura», «estruct», «EE» son cuatro etiquetas para
una cosa— y entonces filtrar por etiqueta deja de encontrar lo que hay. Aquí eso se traduce en dos
reglas comprobables: el nombre es único dentro de la obra, y una etiqueta de otra obra **no** puede
ni asignarse ni filtrar.

Lo que se prueba, entonces: la unicidad, el filtro del informe con su oráculo `pypdf`, que una
etiqueta ajena se ignore **sin vaciar el informe** —devolver cero filas diría «no hay nada abierto»
sobre una obra con treinta hallazgos, que es la peor de las respuestas—, y el contrato de permisos:
etiquetar es cambiar el hallazgo, no crear vocabulario.
"""

from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db.utils import IntegrityError
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.informe import Opciones, csv_de, hallazgos, pdf_de
from apps.documents.models import Observacion
from apps.projects.models import Etiqueta, Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def dar(user, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def anotar(proyecto, autor, responsable, titulo, *, etiquetas=()):
    observacion = Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        prioridad=Observacion.MEDIA,
        ifc_guid=GUID,
    )
    if etiquetas:
        observacion.etiquetas.set(etiquetas)
    return observacion


def texto_del_pdf(contenido: bytes) -> str:
    """El oráculo va aparte: `pypdf` lee lo que reportlab escribió."""
    from pypdf import PdfReader

    lector = PdfReader(BytesIO(contenido))
    return "\n".join(pagina.extract_text() or "" for pagina in lector.pages)


# --- El vocabulario, que es la decisión de la tarea ----------------------------------


@pytest.mark.django_db
def test_el_nombre_es_unico_dentro_de_la_obra(proyecto):
    """**Sin esto el vocabulario no es vocabulario**: dos «Instalaciones» son dos etiquetas."""
    Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")

    with pytest.raises(IntegrityError):
        Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")


@pytest.mark.django_db
def test_el_mismo_nombre_en_dos_obras_son_dos_etiquetas(proyecto):
    """Y la unicidad es **por obra**: cada proyecto define el suyo."""
    otra = Proyecto.objects.create(
        organizacion=proyecto.organizacion, codigo="OTRA-01", nombre="Otra obra"
    )
    Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    Etiqueta.objects.create(proyecto=otra, nombre="Instalaciones")

    assert Etiqueta.objects.filter(nombre="Instalaciones").count() == 2


@pytest.mark.django_db
def test_un_hallazgo_lleva_varias(proyecto, revisor, proyectista):
    """«Afecta a presupuesto» y «pendiente de mandante» son dos cosas sobre el mismo problema."""
    presupuesto = Etiqueta.objects.create(proyecto=proyecto, nombre="Afecta a presupuesto")
    mandante = Etiqueta.objects.create(proyecto=proyecto, nombre="Pendiente de mandante")

    una = anotar(
        proyecto, revisor, proyectista, "El pilar choca", etiquetas=[presupuesto, mandante]
    )

    assert una.etiquetas.count() == 2


# --- El informe por etiqueta, que es lo que esto desbloquea --------------------------


@pytest.mark.django_db
def test_el_informe_por_etiqueta_deja_fuera_lo_demas(proyecto, revisor, proyectista):
    """«Todo lo de instalaciones que sigue abierto» era la consulta que no se podía escribir."""
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    anotar(
        proyecto, revisor, proyectista, "El conducto pasa por la viga", etiquetas=[instalaciones]
    )
    anotar(proyecto, revisor, proyectista, "Falta la cota del vano")

    todos = hallazgos(proyecto, Opciones())
    solo = hallazgos(proyecto, Opciones(etiqueta=instalaciones))

    assert len(todos) == 2
    assert [una.titulo for una in solo] == ["El conducto pasa por la viga"]


@pytest.mark.django_db
def test_el_encabezado_dice_por_que_etiqueta_va(proyecto, revisor, proyectista):
    """**Un informe filtrado que presume de ser el total es peor que no tener informe**, y a los
    tres días nadie recuerda por qué traía doce hallazgos y no treinta."""
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    anotar(
        proyecto, revisor, proyectista, "El conducto pasa por la viga", etiquetas=[instalaciones]
    )
    anotar(proyecto, revisor, proyectista, "Falta la cota del vano")

    texto = texto_del_pdf(pdf_de(proyecto, Opciones(etiqueta=instalaciones)))

    assert "Instalaciones" in texto
    assert "El conducto pasa por la viga" in texto
    assert "Falta la cota del vano" not in texto


@pytest.mark.django_db
def test_el_csv_filtra_igual_que_el_pdf(proyecto, revisor, proyectista):
    """Las dos salidas responden a la misma pregunta, así que no pueden discrepar."""
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    anotar(
        proyecto, revisor, proyectista, "El conducto pasa por la viga", etiquetas=[instalaciones]
    )
    anotar(proyecto, revisor, proyectista, "Falta la cota del vano")

    salida = csv_de(proyecto, Opciones(etiqueta=instalaciones))

    assert "El conducto pasa por la viga" in salida
    assert "Falta la cota del vano" not in salida


@pytest.mark.django_db
def test_una_etiqueta_de_otra_obra_no_vacia_el_informe(proyecto, revisor, proyectista):
    """**Se ignora, no filtra.** Con el identificador de una etiqueta ajena el informe diría «no
    hay nada abierto» sobre una obra con hallazgos, que es la peor de las respuestas."""
    otra_obra = Proyecto.objects.create(
        organizacion=proyecto.organizacion, codigo="OTRA-02", nombre="Otra obra"
    )
    ajena = Etiqueta.objects.create(proyecto=otra_obra, nombre="Instalaciones")
    anotar(proyecto, revisor, proyectista, "Sigue abierta")

    opciones = Opciones.desde({"etiqueta": str(ajena.pk)}, proyecto=proyecto)

    assert opciones.etiqueta is None
    assert len(hallazgos(proyecto, opciones)) == 1


@pytest.mark.django_db
def test_un_identificador_con_mala_forma_no_da_error(proyecto):
    """Igual que el resto de las opciones: quien pide el informe no escribió ese parámetro a mano,
    y un 400 en una descarga no dice nada útil."""
    assert Opciones.desde({"etiqueta": "no-es-un-uuid"}, proyecto=proyecto).etiqueta is None
    assert Opciones.desde({"etiqueta": ""}, proyecto=proyecto).etiqueta is None
    # Y sin proyecto tampoco revienta: es lo que pasa si alguien llama a `desde` sin él.
    assert Opciones.desde({"etiqueta": "cualquiera"}).etiqueta is None


# --- Etiquetar es cambiar el hallazgo, no crear vocabulario --------------------------


@pytest.mark.django_db
def test_etiquetar_pide_cambiar_la_observacion(client, proyecto, revisor, proyectista):
    """**No pide `add_etiqueta`**, y la diferencia importa: quien coordina clasifica lo que ve sin
    poder inventar etiquetas nuevas, que es lo que evita que el vocabulario se fragmente."""
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    una = anotar(proyecto, revisor, proyectista, "El pilar choca")
    ruta = reverse("documents:etiquetar-observacion", args=[una.pk])

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.post(ruta, {"etiquetas": [str(instalaciones.pk)]}).status_code == 403

    client.force_login(dar(proyectista, "documents.change_observacion"))
    assert client.post(ruta, {"etiquetas": [str(instalaciones.pk)]}).status_code == 302
    assert [str(e) for e in una.etiquetas.all()] == ["Instalaciones"]


@pytest.mark.django_db
def test_guardar_sin_ninguna_marcada_las_quita(client, proyecto, revisor, proyectista):
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    una = anotar(proyecto, revisor, proyectista, "El pilar choca", etiquetas=[instalaciones])
    client.force_login(dar(proyectista, "documents.change_observacion"))

    client.post(reverse("documents:etiquetar-observacion", args=[una.pk]), {})

    assert una.etiquetas.count() == 0


@pytest.mark.django_db
def test_no_se_puede_pegar_una_etiqueta_de_otra_obra(client, proyecto, revisor, proyectista):
    """El formulario acota las opciones al proyecto del hallazgo, así que una etiqueta ajena
    mandada a mano no pasa la validación."""
    otra_obra = Proyecto.objects.create(
        organizacion=proyecto.organizacion, codigo="OTRA-03", nombre="Otra obra"
    )
    ajena = Etiqueta.objects.create(proyecto=otra_obra, nombre="Instalaciones")
    una = anotar(proyecto, revisor, proyectista, "El pilar choca")
    client.force_login(dar(proyectista, "documents.change_observacion"))

    client.post(
        reverse("documents:etiquetar-observacion", args=[una.pk]),
        {"etiquetas": [str(ajena.pk)]},
    )

    assert una.etiquetas.count() == 0


@pytest.mark.django_db
def test_la_ficha_ensena_las_etiquetas_y_su_formulario(client, proyecto, revisor, proyectista):
    instalaciones = Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    Etiqueta.objects.create(proyecto=proyecto, nombre="Obra ejecutada")
    una = anotar(proyecto, revisor, proyectista, "El pilar choca", etiquetas=[instalaciones])
    client.force_login(
        dar(proyectista, "documents.view_observacion", "documents.change_observacion")
    )

    cuerpo = client.get(reverse("documents:observacion", args=[una.pk])).content.decode()

    assert "marca-etiqueta" in cuerpo
    assert "Obra ejecutada" in cuerpo
    # La que ya lleva sale marcada: un formulario en blanco haría que guardar sin mirar la borrase.
    casilla = next(linea for linea in cuerpo.splitlines() if f'value="{instalaciones.pk}"' in linea)
    assert "checked" in casilla


@pytest.mark.django_db
def test_sin_vocabulario_no_hay_formulario(client, proyecto, revisor, proyectista):
    """Una lista de casillas vacía con un botón «Guardar» al lado es una pantalla que no hace
    nada."""
    una = anotar(proyecto, revisor, proyectista, "El pilar choca")
    client.force_login(
        dar(proyectista, "documents.view_observacion", "documents.change_observacion")
    )

    cuerpo = client.get(reverse("documents:observacion", args=[una.pk])).content.decode()

    assert "etiquetar-observacion" not in cuerpo


@pytest.mark.django_db
def test_el_selector_de_la_obra_no_ensena_etiquetas_de_otra(client, proyecto, proyectista):
    """El desplegable del informe sale del proyecto, no de la tabla entera."""
    otra_obra = Proyecto.objects.create(
        organizacion=proyecto.organizacion, codigo="OTRA-04", nombre="Otra obra"
    )
    Etiqueta.objects.create(proyecto=proyecto, nombre="Instalaciones")
    Etiqueta.objects.create(proyecto=otra_obra, nombre="Solo de la otra obra")
    client.force_login(dar(proyectista, "projects.view_proyecto", "documents.view_observacion"))

    cuerpo = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert "Instalaciones" in cuerpo
    assert "Solo de la otra obra" not in cuerpo


# --- Y que la organización siga siendo la frontera ----------------------------------


@pytest.mark.django_db
def test_una_etiqueta_de_otra_organizacion_tampoco_filtra(proyecto):
    """`Etiqueta` cuelga del proyecto y no lleva `organizacion` —igual que `Disciplina`—, así que
    la frontera la pone el proyecto. Esto lo deja escrito."""
    ajena = Organizacion.objects.create(nombre="Otra oficina", slug="otra-oficina")
    obra_ajena = Proyecto.objects.create(organizacion=ajena, codigo="AJENA-01", nombre="Ajena")
    etiqueta = Etiqueta.objects.create(proyecto=obra_ajena, nombre="Instalaciones")

    assert Opciones.desde({"etiqueta": str(etiqueta.pk)}, proyecto=proyecto).etiqueta is None
