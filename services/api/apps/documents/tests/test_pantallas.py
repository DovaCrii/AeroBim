"""El contrato de permisos sobre las pantallas del registro, y el ciclo completo.

De `AGENTS.md`: **cada vista nueva trae su prueba de 403** para un usuario autenticado
sin el permiso, y su prueba de aislamiento entre organizaciones. Va como tabla para que
añadir una vista sea añadir una fila.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.core.management import call_command
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Idoneidad, Observacion, Revision
from apps.projects.models import Disciplina, Proyecto

PDF = b"%PDF-1.7\n%%EOF\n"

# (nombre de la ruta, permiso que la abre, si necesita el id de un entregable)
LISTADOS = [
    ("documents:bandeja", "documents.view_observacion"),
    ("documents:entregables", "documents.view_entregable"),
    ("documents:observaciones", "documents.view_observacion"),
    ("documents:actividades", "documents.view_actividad"),
    ("documents:transmittals", "documents.view_transmittal"),
]


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def mirona(db, organizacion):
    usuario = get_user_model().objects.create_user(username="mirona", password="clave-larga-99")
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", LISTADOS)
def test_anonimo_va_al_login(client, ruta, permiso):
    respuesta = client.get(reverse(ruta))

    assert respuesta.status_code == 302
    assert reverse("login") in respuesta["Location"]


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", LISTADOS)
def test_autenticado_sin_permiso_recibe_403(client, mirona, ruta, permiso):
    client.force_login(mirona)

    assert client.get(reverse(ruta)).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("ruta,permiso", LISTADOS)
def test_con_su_permiso_abre(client, mirona, ruta, permiso):
    client.force_login(dar(mirona, permiso))

    assert client.get(reverse(ruta)).status_code == 200


@pytest.mark.django_db
def test_el_expediente_pide_su_permiso(client, mirona, entregable):
    ruta = reverse("documents:expediente", args=[entregable.pk])
    client.force_login(mirona)
    assert client.get(ruta).status_code == 403

    client.force_login(dar(mirona, "documents.view_entregable"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_subir_una_revision_pide_el_permiso_de_escritura(client, mirona, entregable):
    """Leer y escribir son dos permisos. Con solo el de lectura, subir devuelve 403."""
    ruta = reverse("documents:subir-revision", args=[entregable.pk])
    client.force_login(dar(mirona, "documents.view_entregable"))
    assert client.get(ruta).status_code == 403

    client.force_login(dar(mirona, "documents.add_revision"))
    assert client.get(ruta).status_code == 200


@pytest.mark.django_db
def test_un_entregable_de_otra_organizacion_no_se_ve_ni_pidiendolo_a_mano(
    client, mirona, entregable
):
    """**El permiso dice qué se puede hacer, no sobre qué.** Con `view_entregable` y sin
    acotar la consulta, pedir el id de otra organización responde con el objeto."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(organizacion=ajena, codigo="OTRO", nombre="Otro")
    disciplina_ajena = Disciplina.objects.create(
        proyecto=proyecto_ajeno, codigo="ES", nombre="Estructura"
    )
    from apps.documents.models import Entregable

    de_otra = Entregable.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        disciplina=disciplina_ajena,
        codigo="OTRO-001",
        titulo="No es tuyo",
        responsable=mirona,
    )

    client.force_login(dar(mirona, "documents.view_entregable"))

    # El propio se ve...
    assert client.get(reverse("documents:expediente", args=[entregable.pk])).status_code == 200
    # ...y el de la otra organización no existe para este usuario.
    assert client.get(reverse("documents:expediente", args=[de_otra.pk])).status_code == 404
    # Y tampoco aparece en el listado.
    listado = client.get(reverse("documents:entregables")).content.decode()
    assert "OTRO-001" not in listado


@pytest.mark.django_db
def test_el_expediente_nombra_lo_que_falta(client, mirona, entregable):
    """No un porcentaje: la fila concreta.

    Se comprueba en la vista y no en el HTML: el rótulo cambia con la traducción y lo que se
    está probando es **cuántas cosas faltan y cuáles**, no cómo se escriben.
    """
    client.force_login(dar(mirona, "documents.view_entregable"))
    respuesta = client.get(reverse("documents:expediente", args=[entregable.pk]))

    faltantes = respuesta.context["faltantes"]
    # Sin revisión y sin fecha planificada: dos filas, y las dos nombradas.
    assert len(faltantes) == 2
    assert all(f["que"] for f in faltantes)


@pytest.mark.django_db
def test_el_atajo_solo_aparece_si_se_puede_ejecutar(client, mirona, entregable):
    """**Ofrecer un botón que termina en 403 es peor que no ofrecerlo**: enseña a probar
    puertas.

    El atajo se comprueba por su URL, que no depende del idioma.
    """
    subir = reverse("documents:subir-revision", args=[entregable.pk])

    client.force_login(dar(mirona, "documents.view_entregable"))
    sin_permiso = client.get(reverse("documents:expediente", args=[entregable.pk]))
    assert subir not in sin_permiso.content.decode()
    # Y la fila sigue estando: lo que desaparece es el atajo, no el aviso de lo que falta.
    assert [f["url"] for f in sin_permiso.context["faltantes"]] == [None, None]

    client.force_login(dar(mirona, "documents.add_revision"))
    con_permiso = client.get(reverse("documents:expediente", args=[entregable.pk]))
    assert subir in con_permiso.content.decode()


@pytest.mark.django_db
def test_el_ciclo_completo_de_un_entregable(client, entregable, proyectista, revisor, tmp_path):
    """**El oráculo del frente documental**, y es el que el plan pedía: subir una revisión,
    abrir una observación asignada a otro, comprobar que le llega el correo con el enlace,
    responderla, cerrarla, y publicar."""
    from django.test import override_settings

    with override_settings(DOCUMENTS_DIR=tmp_path):
        subidor = dar(
            proyectista,
            "documents.view_entregable",
            "documents.add_revision",
            "documents.view_revision",
        )
        client.force_login(subidor)

        # 1. Subir una revisión en S3.
        from django.core.files.uploadedfile import SimpleUploadedFile

        respuesta = client.post(
            reverse("documents:subir-revision", args=[entregable.pk]),
            {
                "correlativo": "P01",
                "idoneidad": Idoneidad.S3,
                "archivo": SimpleUploadedFile(
                    "Planta piso 5.pdf", PDF, content_type="application/pdf"
                ),
            },
        )
        assert respuesta.status_code == 302
        revision = Revision.objects.get(entregable=entregable, correlativo="P01")
        assert revision.sha256 == Revision.sha256_de(PDF)
        # El nombre del cliente **no** llega al disco.
        assert "Planta" not in revision.clave_archivo
        assert revision.nombre_original == "Planta piso 5.pdf"

        # Y se puede descargar, con el nombre que la persona reconoce.
        descarga = client.get(reverse("documents:descargar-revision", args=[revision.pk]))
        assert descarga.status_code == 200
        assert b"".join(descarga.streaming_content) == PDF

        # 2. El revisor abre una observación asignada al proyectista.
        abridor = dar(
            revisor,
            "documents.view_entregable",
            "documents.view_observacion",
            "documents.add_observacion",
            "documents.change_observacion",
        )
        client.force_login(abridor)
        mail.outbox.clear()
        respuesta = client.post(
            reverse("documents:nueva-observacion", args=[entregable.pk]),
            {
                "titulo": "El muro del eje C no coincide",
                "descripcion": "Revisar contra el modelo.",
                "prioridad": Observacion.ALTA,
                "responsable": proyectista.pk,
                "revision": revision.pk,
                "vence": "",
            },
        )
        assert respuesta.status_code == 302
        observacion = Observacion.objects.get(titulo="El muro del eje C no coincide")

        # 3. **Le llegó el correo, con el enlace.** Es la mitad de lo que se vino a hacer.
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["proyectista@ejemplo.cl"]
        assert str(observacion.pk) in mail.outbox[0].body

        # 4. El proyectista responde: queda «respondida», no cerrada.
        client.force_login(
            dar(proyectista, "documents.view_observacion", "documents.add_comentario")
        )
        client.post(
            reverse("documents:comentar-observacion", args=[observacion.pk]),
            {"texto": "Corregido en la P02."},
        )
        observacion.refresh_from_db()
        assert observacion.estado == Observacion.RESPONDIDA
        # **No la puede cerrar él**: quien la abre la cierra.
        assert (
            client.post(
                reverse("documents:cerrar-observacion", args=[observacion.pk]),
                {"resolucion": "Yo mismo digo que está bien."},
            ).status_code
            == 403
        )

        # 5. El revisor la cierra, diciendo cómo.
        client.force_login(abridor)
        sin_decir = client.post(
            reverse("documents:cerrar-observacion", args=[observacion.pk]), {"resolucion": "   "}
        )
        assert sin_decir.status_code == 302  # vuelve con el mensaje de error
        observacion.refresh_from_db()
        assert observacion.estado != Observacion.CERRADA

        client.post(
            reverse("documents:cerrar-observacion", args=[observacion.pk]),
            {"resolucion": "Verificado contra el modelo en la P02."},
        )
        observacion.refresh_from_db()
        assert observacion.estado == Observacion.CERRADA
        assert observacion.cerrada_por == revisor

        # 6. El revisor publica: la revisión pasa a `A` y el avance llega a 1.
        client.force_login(dar(revisor, "documents.change_revision"))
        client.post(
            reverse("documents:cambiar-idoneidad", args=[revision.pk]), {"idoneidad": Idoneidad.A}
        )
        entregable.refresh_from_db()
        assert entregable.esta_publicado is True
        assert entregable.avance == 1.0
        assert entregable.proyecto.avance_fisico == 1.0


@pytest.mark.django_db
def test_un_mandante_no_ve_lo_que_esta_en_curso(client, entregable, revision, organizacion):
    """`view_revision` dice «puede ver revisiones»; no sabe distinguir una `S0` en curso de
    una `A1` autorizada. Lo que está en curso no obliga a nadie y no se enseña."""
    call_command("bootstrap_roles")
    from django.contrib.auth.models import Group

    mandante = get_user_model().objects.create_user(username="mandante", password="clave-larga-99")
    mandante.groups.add(Group.objects.get(name="Mandante"))
    Membresia.objects.create(organizacion=organizacion, usuario=mandante)
    client.force_login(mandante)

    # La revisión del fixture está en S3: en curso.
    cuerpo = client.get(reverse("documents:expediente", args=[entregable.pk])).content.decode()
    assert "P01" not in cuerpo
    # Y descargarla tampoco.
    assert (
        client.get(reverse("documents:descargar-revision", args=[revision.pk])).status_code == 404
    )

    # Publicada, sí la ve.
    revision.idoneidad = Idoneidad.A
    revision.save()
    cuerpo = client.get(reverse("documents:expediente", args=[entregable.pk])).content.decode()
    assert "P01" in cuerpo


@pytest.mark.django_db
def test_subir_un_ejecutable_disfrazado_de_pdf_se_rechaza_en_la_pantalla(
    client, entregable, proyectista, tmp_path
):
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import override_settings

    with override_settings(DOCUMENTS_DIR=tmp_path):
        client.force_login(dar(proyectista, "documents.add_revision"))
        respuesta = client.post(
            reverse("documents:subir-revision", args=[entregable.pk]),
            {
                "correlativo": "P01",
                "idoneidad": Idoneidad.S0,
                "archivo": SimpleUploadedFile("plano.pdf", b"MZ\x90\x00" + b"\x00" * 40),
            },
        )

        assert respuesta.status_code == 400
        # El formulario devuelve el error, y lo que importa no es su texto —que va traducido—
        # sino que **no se creó nada y nada llegó al disco**.
        assert respuesta.context["form"].errors["archivo"]
        assert Revision.objects.count() == 0
        assert list(tmp_path.rglob("*")) == []
