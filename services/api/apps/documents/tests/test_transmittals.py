"""Emitir un transmittal desde la pantalla: `F8.7`.

El modelo sabía emitir desde el primer día y estaba probado —no se emite vacío ni sin
destinatario—, pero la pantalla solo listaba: **el acto solo se podía ejecutar desde una
consola**. Estas pruebas cubren lo que la pantalla añade, que es donde puede fallar:

- el contrato de permisos, con su 403 por vista y su aislamiento entre organizaciones;
- que la regla del modelo **llegue al usuario como un mensaje** y no como un 500;
- y que **el aviso salga con la información necesaria**, que es la mitad de lo que se pidió:
  no basta con que el estado cambie si a quien le mandan los planos no le llega nada.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Idoneidad, Revision, Transmittal
from apps.projects.models import Disciplina, Proyecto


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def coordinador(db, organizacion):
    usuario = get_user_model().objects.create_user(
        username="coordinadora", password="una-clave-larga-99", email="coord@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.fixture
def borrador(db, organizacion, proyecto, coordinador):
    return Transmittal.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        folio="T-001",
        asunto="Planta piso 5 para revisión",
        emisor=coordinador,
    )


@pytest.mark.django_db
def test_anonimo_va_al_login(client, borrador):
    for ruta in ("documents:transmittal", "documents:emitir-transmittal"):
        respuesta = client.get(reverse(ruta, args=[borrador.pk]))
        assert respuesta.status_code == 302
        assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
def test_la_caratula_pide_su_permiso_de_lectura(client, coordinador, borrador):
    ruta = reverse("documents:transmittal", args=[borrador.pk])
    client.force_login(coordinador)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(coordinador, "documents.view_transmittal"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_emitir_pide_el_permiso_de_escritura(client, coordinador, borrador):
    """**Leer no es emitir.** Con solo `view_transmittal`, emitir devuelve 403."""
    ruta = reverse("documents:emitir-transmittal", args=[borrador.pk])
    client.force_login(dar(coordinador, "documents.view_transmittal"))
    assert client.post(ruta).status_code == 403

    borrador.refresh_from_db()
    assert borrador.status == Transmittal.BORRADOR


@pytest.mark.django_db
def test_armar_el_borrador_pide_el_permiso_de_alta(client, coordinador):
    ruta = reverse("documents:nuevo-transmittal")
    client.force_login(dar(coordinador, "documents.view_transmittal"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(coordinador, "documents.add_transmittal"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_un_transmittal_de_otra_organizacion_no_se_emite_ni_pidiendolo_a_mano(
    client, coordinador, organizacion
):
    """**El permiso dice qué se puede hacer, no sobre qué.**

    Sin acotar la consulta, `POST /transmittals/<id-de-otra>/emitir/` emitiría el transmittal
    de otro cliente — y emitir tiene consecuencias contractuales, así que este hueco no es una
    fuga de lectura: es firmar en nombre de otro.
    """
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    de_otra = Transmittal.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        folio="AJENO-001",
        asunto="No es tuyo",
        emisor=coordinador,
    )

    client.force_login(
        dar(coordinador, "documents.view_transmittal", "documents.change_transmittal")
    )

    assert client.get(reverse("documents:transmittal", args=[de_otra.pk])).status_code == 404
    assert (
        client.post(reverse("documents:emitir-transmittal", args=[de_otra.pk])).status_code == 404
    )
    de_otra.refresh_from_db()
    assert de_otra.status == Transmittal.BORRADOR


@pytest.mark.django_db
def test_las_revisiones_del_desplegable_se_acotan_a_la_organizacion(
    client, coordinador, revision, organizacion
):
    """El desplegable con las revisiones **de todos** no es solo incómodo: es una fuga.

    Se comprueba sobre el queryset del formulario y no sobre el HTML, porque lo que se está
    probando es qué se puede elegir, no cómo se dibuja.
    """
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    disciplina_ajena = Disciplina.objects.create(
        proyecto=proyecto_ajeno, codigo="ES", nombre="Estructura"
    )
    from apps.documents.models import Entregable

    entregable_ajeno = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        disciplina=disciplina_ajena,
        codigo="OTRO-001",
        titulo="No es tuyo",
        responsable=coordinador,
    )
    revision_ajena = Revision.objects.create(
        entregable=entregable_ajeno,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=coordinador,
    )

    client.force_login(dar(coordinador, "documents.add_transmittal", "documents.change_revision"))
    elegibles = (
        client.get(reverse("documents:nuevo-transmittal"))
        .context["form"]
        .fields["revisiones"]
        .queryset
    )

    assert revision in elegibles
    assert revision_ajena not in elegibles


@pytest.mark.django_db
def test_armar_el_borrador_deduce_el_proyecto_de_las_revisiones(
    client, coordinador, revision, revisor
):
    """El proyecto **no se pide**: lo dicen las revisiones.

    Es lo que evita un transmittal cuyo proyecto no es el de los documentos que lleva, y por eso
    se comprueba sobre el objeto guardado y no sobre el formulario.
    """
    client.force_login(dar(coordinador, "documents.add_transmittal", "documents.change_revision"))
    respuesta = client.post(
        reverse("documents:nuevo-transmittal"),
        {
            "folio": "T-010",
            "asunto": "Planta piso 5 para revisión",
            "revisiones": [revision.pk],
            "destinatarios": [revisor.pk],
        },
    )

    assert respuesta.status_code == 302
    creado = Transmittal.objects.get(folio="T-010")
    assert creado.proyecto == revision.entregable.proyecto
    assert creado.organizacion == revision.entregable.organizacion
    assert creado.emisor == coordinador
    # **Nace borrador aunque esté completo**: emitir es un acto aparte, para que alguien pueda
    # leer la carátula antes de que salga.
    assert creado.status == Transmittal.BORRADOR
    assert creado.emitido_en is None
    assert list(creado.revisiones.all()) == [revision]
    assert list(creado.destinatarios.all()) == [revisor]
    # Y todavía no se avisó a nadie: el aviso va con la emisión, no con el alta.
    assert mail.outbox == []


@pytest.mark.django_db
def test_no_se_arma_un_transmittal_con_revisiones_de_dos_proyectos(
    client, coordinador, revision, organizacion, disciplina
):
    """El proyecto se deduce de las revisiones, así que mezclarlos dejaría un registro cuyo
    proyecto no es el de los documentos que lleva."""
    from apps.documents.models import Entregable

    otro_proyecto = Proyecto.objects.create(
        organizacion=organizacion, codigo="OTRO-PROY", nombre="Otro proyecto"
    )
    otra_disciplina = Disciplina.objects.create(
        proyecto=otro_proyecto, codigo="ES", nombre="Estructura"
    )
    otro_entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=otro_proyecto,
        disciplina=otra_disciplina,
        codigo="OTRO-001",
        titulo="De otro proyecto",
        responsable=coordinador,
    )
    de_otro_proyecto = Revision.objects.create(
        entregable=otro_entregable,
        correlativo="P01",
        idoneidad=Idoneidad.S3,
        subida_por=coordinador,
    )

    client.force_login(dar(coordinador, "documents.add_transmittal", "documents.change_revision"))
    respuesta = client.post(
        reverse("documents:nuevo-transmittal"),
        {
            "folio": "T-002",
            "asunto": "Mezclado",
            "revisiones": [revision.pk, de_otro_proyecto.pk],
            "destinatarios": [coordinador.pk],
        },
    )

    assert respuesta.status_code == 400
    assert respuesta.context["form"].errors["revisiones"]
    assert Transmittal.objects.filter(folio="T-002").count() == 0


@pytest.mark.django_db
def test_la_caratula_nombra_lo_que_falta_y_no_ofrece_el_boton(client, coordinador, borrador):
    """**Lo que falta va nombrado**, y el botón no se ofrece: uno que termina en error enseña
    a probar puertas.

    Se comprueba en el contexto y por la URL del formulario, que no dependen del idioma.
    """
    client.force_login(
        dar(coordinador, "documents.view_transmittal", "documents.change_transmittal")
    )
    respuesta = client.get(reverse("documents:transmittal", args=[borrador.pk]))

    # Un borrador vacío: le falta la revisión y le falta el destinatario.
    assert len(respuesta.context["falta_para_emitir"]) == 2
    assert respuesta.context["puede_emitir"] is False
    assert (
        reverse("documents:emitir-transmittal", args=[borrador.pk])
        not in respuesta.content.decode()
    )


@pytest.mark.django_db
def test_emitir_un_borrador_incompleto_devuelve_un_mensaje_y_no_un_500(
    client, coordinador, borrador, revision
):
    """La regla del modelo tiene que **llegar al usuario**. Sin capturar la `ValidationError`,
    forzar la URL a mano rompe la página con un 500."""
    client.force_login(dar(coordinador, "documents.change_transmittal"))
    ruta = reverse("documents:emitir-transmittal", args=[borrador.pk])

    # Sin nada: no se emite.
    assert client.post(ruta).status_code == 302
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.BORRADOR

    # Con revisión pero **sin destinatario**: tampoco. Es el caso que el modelo ya cubría y
    # que la pantalla tiene que respetar.
    borrador.revisiones.add(revision)
    assert client.post(ruta).status_code == 302
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.BORRADOR
    assert borrador.emitido_en is None


@pytest.mark.django_db
def test_el_ciclo_completo_del_transmittal(client, coordinador, borrador, revision, revisor):
    """**El oráculo de `F8.7`**: armar, emitir con aviso, y acusar recibo."""
    borrador.revisiones.add(revision)
    borrador.destinatarios.add(revisor)

    client.force_login(
        dar(coordinador, "documents.view_transmittal", "documents.change_transmittal")
    )

    # 1. Ya no falta nada, y ahora sí se ofrece el botón.
    caratula = client.get(reverse("documents:transmittal", args=[borrador.pk]))
    assert caratula.context["falta_para_emitir"] == []
    assert caratula.context["puede_emitir"] is True
    assert caratula.context["puede_acusar"] is False

    # 2. Emitir.
    mail.outbox.clear()
    assert (
        client.post(reverse("documents:emitir-transmittal", args=[borrador.pk])).status_code == 302
    )
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.EMITIDO
    assert borrador.emitido_en is not None

    # 3. **Y el aviso salió con lo necesario**: a quién, qué documentos, y el enlace.
    assert len(mail.outbox) == 1
    aviso = mail.outbox[0]
    assert aviso.to == ["revisor@ejemplo.cl"]
    assert borrador.folio in aviso.subject
    # El código del entregable y su revisión: quien lo lee en obra sabe qué le mandaron sin
    # tener que entrar.
    assert revision.entregable.codigo in aviso.body
    assert f"rev. {revision.correlativo}" in aviso.body
    assert str(borrador.pk) in aviso.body

    # 4. Emitido dos veces no se emite dos veces.
    emitido_en = borrador.emitido_en
    client.post(reverse("documents:emitir-transmittal", args=[borrador.pk]))
    borrador.refresh_from_db()
    assert borrador.emitido_en == emitido_en

    # 5. Acusar recibo cierra el ciclo.
    assert (
        client.post(reverse("documents:acusar-transmittal", args=[borrador.pk])).status_code == 302
    )
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.ACUSADO
    assert borrador.acusado_en is not None


@pytest.mark.django_db
def test_no_se_acusa_un_borrador(client, coordinador, borrador):
    """Un acuse sobre un borrador diría que alguien recibió algo que nunca salió."""
    client.force_login(dar(coordinador, "documents.change_transmittal"))

    assert (
        client.post(reverse("documents:acusar-transmittal", args=[borrador.pk])).status_code == 302
    )
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.BORRADOR
    assert borrador.acusado_en is None


@pytest.mark.django_db
def test_un_destinatario_sin_correo_se_dice_en_vez_de_callarse(
    client, coordinador, borrador, revision, organizacion
):
    """**Emitir sin avisar a la mitad es peor que no emitir.**

    Es la misma lección que `apps/core/mail.py`: el sistema decía «enviado a N» cuando el
    correo solo se imprimía. Aquí el riesgo es el gemelo — decir «emitido» cuando dos de los
    tres destinatarios no tienen dirección.
    """
    muda = get_user_model().objects.create_user(username="sin-correo", password="clave-larga-99")
    Membresia.objects.create(organizacion=organizacion, usuario=muda)
    borrador.revisiones.add(revision)
    borrador.destinatarios.add(coordinador, muda)

    # Los dos permisos, porque la prueba **sigue la redirección** hasta la carátula para leer
    # los avisos: con solo el de escritura, el destino contesta 403 y no hay avisos que leer.
    client.force_login(
        dar(coordinador, "documents.view_transmittal", "documents.change_transmittal")
    )
    mail.outbox.clear()
    respuesta = client.post(
        reverse("documents:emitir-transmittal", args=[borrador.pk]), follow=True
    )

    # Se emitió y salió el correo que podía salir...
    borrador.refresh_from_db()
    assert borrador.status == Transmittal.EMITIDO
    assert [correo.to for correo in mail.outbox] == [["coord@ejemplo.cl"]]
    # ...y **se dice** que uno quedó sin avisar. Se comprueba por el nombre del usuario, que no
    # depende del idioma, y no por el texto del aviso.
    avisos = [str(mensaje) for mensaje in respuesta.context["messages"]]
    assert any("sin-correo" in aviso for aviso in avisos)
