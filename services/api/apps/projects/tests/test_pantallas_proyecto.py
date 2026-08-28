"""Las pantallas del proyecto: lista, detalle y alta.

**Los modelos existian desde `F8.1` y no tenian ni una vista.** Un proyecto solo se podia crear
entrando al `/admin/` tecnico, y con una obra real eso significa que el trabajo empieza fuera de la
aplicacion.

Lo que se prueba, ademas del contrato de siempre —403 por vista y aislamiento entre
organizaciones—, es lo que hace que la pantalla de detalle sirva de algo: **que ofrezca el salto al
visor** y que no ofrezca botones que terminan en 403.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Idoneidad, Observacion, Revision
from apps.projects.models import Disciplina, Proyecto


def dar(user, *etiquetas):
    """Los permisos, y el usuario recargado.

    Hay que volver a buscarlo: `User` cachea los permisos en la instancia, asi que darle uno y
    seguir usando el mismo objeto deja la prueba mintiendo en verde.
    """
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def ajena(db):
    """Otra organizacion, con su obra. Es el escenario de toda prueba de aislamiento."""
    organizacion = Organizacion.objects.create(nombre="Otra constructora", slug="otra")
    proyecto = Proyecto.objects.create(
        organizacion=organizacion, codigo="999-XXX", nombre="Obra de otro cliente"
    )
    return proyecto


# --- El contrato de permisos ---------------------------------------------------------


@pytest.mark.django_db
def test_la_lista_pide_su_permiso_de_lectura(client, proyectista, proyecto):
    ruta = reverse("projects:proyectos")

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_el_detalle_pide_su_permiso_de_lectura(client, proyectista, proyecto):
    ruta = reverse("projects:proyecto", args=[proyecto.pk])

    client.force_login(proyectista)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_crear_pide_add_y_no_alcanza_con_leer(client, proyectista):
    """**Leer y escribir son dos permisos**, y `view_proyecto` no crea obras."""
    ruta = reverse("projects:nuevo-proyecto")

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "projects.add_proyecto"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_crear_disciplina_pide_su_permiso(client, proyectista, proyecto):
    ruta = reverse("projects:nueva-disciplina", args=[proyecto.pk])

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(proyectista, "projects.add_disciplina"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_sin_entrar_se_redirige_al_login_y_no_se_devuelve_403(client, proyecto):
    """Mandar un 403 a quien no ha entrado no le dice que tiene que entrar; y mandar al login a
    quien ya entro es un bucle. Las dos mitades de la misma regla."""
    respuesta = client.get(reverse("projects:proyecto", args=[proyecto.pk]))

    assert respuesta.status_code == 302
    assert reverse("login") in respuesta["Location"]


# --- Aislamiento entre organizaciones ------------------------------------------------


@pytest.mark.django_db
def test_la_lista_no_muestra_la_obra_de_otro_cliente(client, proyectista, proyecto, ajena):
    """**El permiso dice que se puede leer proyectos, no cuales.** Sin acotar la consulta, la lista
    entrega la cartera de obras de la oficina entera."""
    client.force_login(dar(proyectista, "projects.view_proyecto"))

    cuerpo = client.get(reverse("projects:proyectos")).content.decode()

    assert proyecto.codigo in cuerpo
    assert ajena.codigo not in cuerpo


@pytest.mark.django_db
def test_pedir_a_mano_la_obra_de_otro_cliente_da_404(client, proyectista, ajena):
    client.force_login(dar(proyectista, "projects.view_proyecto"))

    assert client.get(reverse("projects:proyecto", args=[ajena.pk])).status_code == 404


@pytest.mark.django_db
def test_no_se_crea_una_disciplina_en_la_obra_de_otro_cliente(client, proyectista, ajena):
    """`add_disciplina` dice que puede crear disciplinas, **no que pueda crearlas en la obra de
    otro**."""
    client.force_login(dar(proyectista, "projects.add_disciplina"))

    respuesta = client.post(
        reverse("projects:nueva-disciplina", args=[ajena.pk]),
        {"codigo": "AR", "nombre": "Arquitectura", "color": "#5b3a9e"},
    )

    assert respuesta.status_code == 404
    assert not Disciplina.objects.filter(proyecto=ajena).exists()


@pytest.mark.django_db
def test_no_se_crea_un_proyecto_para_una_organizacion_ajena(client, proyectista, ajena):
    """El desplegable ya viene acotado, pero **el POST no pasa por el desplegable**: se puede
    escribir a mano el id de la organizacion de otro cliente."""
    client.force_login(dar(proyectista, "projects.add_proyecto"))

    client.post(
        reverse("projects:nuevo-proyecto"),
        {
            "organizacion": str(ajena.organizacion_id),
            "codigo": "NUEVO",
            "nombre": "Obra colada",
            "status": Proyecto.ETAPA_ANTEPROYECTO,
        },
    )

    assert not Proyecto.objects.filter(codigo="NUEVO").exists()


# --- Que la pantalla de detalle sirva de algo ----------------------------------------


@pytest.fixture
def revision_ifc(db, entregable, proyectista):
    """Una revision publicada con un IFC: es la que el visor puede abrir."""
    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo="p/e/abc.ifc",
        nombre_original="716-LCD-ME-ISUP-D.ifc",
        sha256="d" * 64,
        es_vigente=True,
    )


@pytest.mark.django_db
def test_el_detalle_ofrece_el_salto_al_visor(client, proyectista, proyecto, revision_ifc):
    """**Es el salto que hasta hoy obligaba a pasar por el listado de entregables y buscar a
    mano.** Y abierto asi el visor sabe de que revision viene, que es lo que le permite ofrecer
    «Observar este elemento» sobre un GUID.

    Se comprueba por la URL y no por el texto: el texto depende del idioma.
    """
    client.force_login(dar(proyectista, "projects.view_proyecto", "documents.view_revision"))

    cuerpo = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert f"{reverse('visor:visor')}?revision={revision_ifc.pk}" in cuerpo


@pytest.mark.django_db
def test_una_revision_en_curso_no_se_ofrece_a_quien_solo_lee(
    client, proyectista, proyecto, entregable
):
    """**El permiso no sabe distinguir una `S0` de una `A1`**, y lo que esta en curso no obliga a
    nadie. La regla la pone la vista, igual que en el expediente."""
    en_curso = Revision.objects.create(
        entregable=entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S0,
        subida_por=proyectista,
        clave_archivo="p/e/wip.ifc",
        nombre_original="borrador.ifc",
        sha256="e" * 64,
        es_vigente=True,
    )
    client.force_login(dar(proyectista, "projects.view_proyecto", "documents.view_revision"))

    cuerpo = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert str(en_curso.pk) not in cuerpo


@pytest.mark.django_db
def test_el_detalle_nombra_los_entregables_sin_revision(client, proyectista, proyecto, entregable):
    """Es la fila que exige una decision hoy: **no hay nada emitido de ese entregable**. Un
    porcentaje no lo dice; el codigo del entregable si."""
    client.force_login(dar(proyectista, "projects.view_proyecto"))

    cuerpo = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert entregable.codigo in cuerpo


@pytest.mark.django_db
def test_el_detalle_no_ofrece_botones_que_terminarian_en_403(
    client, proyectista, proyecto, organizacion, revisor
):
    """**Ofrecer un boton que termina en 403 es peor que no ofrecerlo**: enseña a probar puertas.
    Se comprueba con las dos URL que la pantalla puede ofrecer y no siempre debe."""
    Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Hay algo que exportar",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
    )
    client.force_login(dar(proyectista, "projects.view_proyecto"))
    ruta = reverse("projects:proyecto", args=[proyecto.pk])

    cuerpo = client.get(ruta).content.decode()
    assert reverse("projects:nueva-disciplina", args=[proyecto.pk]) not in cuerpo
    assert reverse("documents:exportar-bcf", args=[proyecto.pk]) not in cuerpo

    # Con los permisos puestos, los dos aparecen.
    client.force_login(
        dar(
            proyectista,
            "projects.add_disciplina",
            "documents.view_observacion",
        )
    )
    cuerpo = client.get(ruta).content.decode()
    assert reverse("projects:nueva-disciplina", args=[proyecto.pk]) in cuerpo
    assert reverse("documents:exportar-bcf", args=[proyecto.pk]) in cuerpo


@pytest.mark.django_db
def test_las_observaciones_abiertas_se_ven_y_las_cerradas_no(
    client, proyectista, proyecto, organizacion, revisor
):
    """La pantalla contesta «que hay que resolver», asi que una observacion cerrada solo seria
    ruido: su historial vive en su propia pantalla."""
    abierta = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="La viga del eje C no trae su fase",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
    )
    cerrada = Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Esta ya se resolvio",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
    )
    cerrada.cerrar(revisor, "Corregido en la A2.")
    client.force_login(dar(proyectista, "projects.view_proyecto"))

    cuerpo = client.get(reverse("projects:proyecto", args=[proyecto.pk])).content.decode()

    assert abierta.titulo in cuerpo
    assert cerrada.titulo not in cuerpo


# --- El alta ------------------------------------------------------------------------


@pytest.mark.django_db
def test_se_crea_el_proyecto_y_el_codigo_queda_en_mayusculas(client, proyectista, organizacion):
    """**El codigo es un identificador, no un texto.** `716-lcd` y `716-LCD` son la misma obra, y
    la restriccion de unicidad de la base distingue: sin normalizar, entran las dos."""
    client.force_login(dar(proyectista, "projects.add_proyecto"))

    respuesta = client.post(
        reverse("projects:nuevo-proyecto"),
        {
            "organizacion": str(organizacion.pk),
            "codigo": " 802-mej ",
            "nombre": "Mejoramiento",
            "status": Proyecto.ETAPA_DETALLE,
        },
    )

    assert respuesta.status_code == 302
    creado = Proyecto.objects.get(nombre="Mejoramiento")
    assert creado.codigo == "802-MEJ"
    assert creado.organizacion_id == organizacion.pk


@pytest.mark.django_db
def test_un_proyecto_que_termina_antes_de_empezar_se_rechaza(client, proyectista, organizacion):
    """No es un error de dedo que se arregle solo: los plazos de los entregables se calculan
    contra estas dos fechas."""
    client.force_login(dar(proyectista, "projects.add_proyecto"))

    respuesta = client.post(
        reverse("projects:nuevo-proyecto"),
        {
            "organizacion": str(organizacion.pk),
            "codigo": "IMPOSIBLE",
            "nombre": "Al reves",
            "status": Proyecto.ETAPA_ANTEPROYECTO,
            "inicio": "2026-06-01",
            "termino": "2026-01-01",
        },
    )

    assert respuesta.status_code == 400
    assert not Proyecto.objects.filter(codigo="IMPOSIBLE").exists()


@pytest.mark.django_db
def test_una_disciplina_repetida_lo_dice_en_el_formulario(
    client, proyectista, proyecto, disciplina
):
    """La base ya lo impide con su restriccion; comprobarlo aca es lo que permite **decirlo** en
    vez de devolver un error de integridad."""
    client.force_login(dar(proyectista, "projects.add_disciplina"))

    respuesta = client.post(
        reverse("projects:nueva-disciplina", args=[proyecto.pk]),
        {"codigo": disciplina.codigo, "nombre": "Otra cosa", "color": "#123456"},
    )

    assert respuesta.status_code == 400
    assert proyecto.disciplinas.filter(codigo=disciplina.codigo).count() == 1


@pytest.mark.django_db
def test_un_color_mal_escrito_se_rechaza_en_el_formulario(client, proyectista, proyecto):
    """El color viaja al visor y a los informes. Tres digitos —`#abc`— tampoco se acepta: media
    docena de sitios tendrian que saber expandirlo."""
    client.force_login(dar(proyectista, "projects.add_disciplina"))

    for color in ("azul", "#abc", "5b3a9e", "#5b3a9ez"):
        respuesta = client.post(
            reverse("projects:nueva-disciplina", args=[proyecto.pk]),
            {"codigo": "ES", "nombre": "Estructura", "color": color},
        )
        assert respuesta.status_code == 400, color

    assert not proyecto.disciplinas.filter(codigo="ES").exists()


@pytest.mark.django_db
def test_con_una_sola_membresia_no_se_pregunta_la_organizacion(client, proyectista, organizacion):
    """Preguntar lo que solo tiene una respuesta es una casilla mas que alguien puede equivocar."""
    client.force_login(dar(proyectista, "projects.add_proyecto"))

    cuerpo = client.get(reverse("projects:nuevo-proyecto")).content.decode()

    assert 'name="organizacion"' in cuerpo
    assert 'type="hidden"' in cuerpo


@pytest.mark.django_db
def test_con_dos_membresias_si_se_pregunta(client, proyectista, organizacion):
    """Hay quien trabaja para dos clientes, y entonces la obra nueva es de uno de los dos."""
    segunda = Organizacion.objects.create(nombre="Segunda", slug="segunda")
    Membresia.objects.create(organizacion=segunda, usuario=proyectista)
    client.force_login(dar(proyectista, "projects.add_proyecto"))

    cuerpo = client.get(reverse("projects:nuevo-proyecto")).content.decode()

    assert "<select" in cuerpo
    assert str(segunda.pk) in cuerpo


# --- El portal ----------------------------------------------------------------------


@pytest.mark.django_db
def test_el_portal_ofrece_los_proyectos_solo_a_quien_puede_leerlos(client, proyectista):
    """Cada entrada del portal se filtra por su propio permiso: si no lo tienes, la fila no
    existe."""
    client.force_login(proyectista)
    assert reverse("projects:proyectos") not in client.get(reverse("portal")).content.decode()

    client.force_login(dar(proyectista, "projects.view_proyecto"))
    assert reverse("projects:proyectos") in client.get(reverse("portal")).content.decode()
