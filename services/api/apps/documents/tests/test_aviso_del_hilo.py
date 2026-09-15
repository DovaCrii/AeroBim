"""**Responder un hallazgo tiene que avisar al otro.** Era el aviso que faltaba de los tres.

Un hallazgo se abre y se avisa. Se reparte y se avisa. **Se contestaba sin avisar a nadie**: alguien
escribía «esto ya está corregido en la revisión B» y quien lo había abierto no se enteraba hasta
volver a entrar y mirar — o sea, hasta la siguiente reunión de coordinación, que es exactamente lo
que el hilo existe para evitar.

Y es el que más falta hace de los tres, porque es el único que corresponde a **algo que espera
respuesta**. Los otros dos avisan de trabajo asignado, que además sale en el resumen diario; una
respuesta no sale en ningún sitio.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core import mail
from django.urls import reverse

from apps.core.models import Membresia
from apps.documents.models import Comentario, Observacion

U = get_user_model()


def dar(usuario, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return U.objects.get(pk=usuario.pk)


@pytest.fixture
def hallazgo(db, organizacion, proyecto, proyectista, revisor):
    """Un hallazgo **entre dos personas**: la que lo abrió y la que tiene que resolverlo."""
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="El ducto choca con la viga del eje C",
        descripcion="Revisar el paso a cota +3,20.",
        autor=revisor,
        responsable=proyectista,
    )


def comentar(client, hallazgo, texto="Corregido en la revisión B."):
    return client.post(
        reverse("documents:comentar-observacion", args=[hallazgo.pk]), {"texto": texto}
    )


# --- Que el aviso salga, y a quien toca ------------------------------------------------


@pytest.mark.django_db
def test_responder_avisa_a_quien_lo_abrio(client, hallazgo, proyectista, revisor):
    """El caso normal: contesta quien tiene que resolverlo, y se entera quien lo encontró."""
    client.force_login(dar(proyectista, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo)

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [revisor.email]


@pytest.mark.django_db
def test_responder_avisa_a_quien_tiene_que_resolverlo(client, hallazgo, proyectista, revisor):
    """Y al revés: si contesta quien lo abrió —pidiendo algo, o cerrando— se entera el otro."""
    client.force_login(dar(revisor, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo, "¿Lo puedes mirar antes del viernes?")

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [proyectista.email]


@pytest.mark.django_db
def test_nadie_se_avisa_a_si_mismo(client, hallazgo, proyectista, organizacion):
    """**El correo que más rápido enseña a filtrar el remitente.**

    Un aviso diciéndote que has escrito lo que acabas de escribir hace que la gente mande la carpeta
    entera a una regla de correo — y entonces tampoco lee el aviso que sí importaba. Es la misma
    lección que ya está escrita en `mail.py`.
    """
    hallazgo.autor = proyectista
    hallazgo.responsable = proyectista
    hallazgo.save(update_fields=["autor", "responsable"])
    client.force_login(dar(proyectista, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo)

    assert mail.outbox == []


@pytest.mark.django_db
def test_el_correo_trae_el_texto_y_el_enlace(client, hallazgo, proyectista, settings):
    """**Un aviso que solo dice «hay una respuesta» obliga a entrar para saber si hacía falta.**

    Y la mitad de las veces no hacía falta. Va el texto —recortado, para que el correo no se
    convierta en el sitio donde se lee el hilo— y el enlace absoluto, porque en un correo no hay
    petición de la que deducir el dominio.
    """
    settings.SITE_BASE_URL = "https://p340.ejemplo.ts.net"
    client.force_login(dar(proyectista, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo, "Corregido en la revisión B, paso bajado a +3,05.")

    cuerpo = mail.outbox[0].body
    assert "paso bajado a +3,05" in cuerpo
    assert f"https://p340.ejemplo.ts.net/documentos/observaciones/{hallazgo.pk}/" in cuerpo
    assert hallazgo.titulo in mail.outbox[0].subject


@pytest.mark.django_db
def test_un_comentario_larguisimo_no_se_manda_entero(client, hallazgo, proyectista):
    """El correo avisa; no es el lector del hilo. Si lo fuera, nadie volvería a la aplicación."""
    client.force_login(dar(proyectista, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo, "a" * 3000)

    assert len(mail.outbox[0].body) < 1200
    assert "…" in mail.outbox[0].body


# --- Y lo que no puede romper ----------------------------------------------------------


@pytest.mark.django_db
def test_si_el_correo_falla_el_comentario_se_guarda_igual(
    client, hallazgo, proyectista, monkeypatch
):
    """**Lo que se pierde es el aviso, no el comentario.**

    Con el SMTP caído, un `send_mail` sin guarda deja un 500 con el comentario ya escrito: la
    persona lo reintenta y lo duplica. Es el defecto `P7` del plan de despliegue, y aquí se cierra
    en el camino nuevo antes de que llegue a producción.
    """

    def revienta(*args, **kwargs):
        raise OSError("el servidor de correo no contesta")

    monkeypatch.setattr("apps.documents.views.avisar_comentario", revienta)
    client.force_login(dar(proyectista, "documents.add_comentario"))

    respuesta = comentar(client, hallazgo)

    assert respuesta.status_code == 302
    assert Comentario.objects.filter(observacion=hallazgo).count() == 1, (
        "el comentario se perdió porque el correo falló"
    )


@pytest.mark.django_db
def test_se_dice_en_la_pantalla_cuando_no_se_avisa_a_nadie(
    client, hallazgo, proyectista, organizacion
):
    """**Callarlo sería dejar a quien escribe creyendo que el otro se enteró.**

    Pasa con una cuenta sin correo, que es un estado que existe —`listo_para_produccion` lo
    bloquea al desplegar, pero alguien puede crearla después desde el `/admin/` técnico—.
    """
    mudo = U.objects.create_user(username="sin.correo", password="una-clave-larga-99", email="")
    Membresia.objects.create(organizacion=organizacion, usuario=mudo)
    hallazgo.autor = mudo
    hallazgo.save(update_fields=["autor"])
    client.force_login(dar(proyectista, "documents.add_comentario"))
    mail.outbox.clear()

    respuesta = comentar(client, hallazgo)

    assert mail.outbox == []
    mensajes = [str(m) for m in respuesta.wsgi_request._messages]
    assert any("Nobody was notified" in m or "avisó" in m or "avisado" in m for m in mensajes), (
        f"la pantalla no dijo que el aviso no salió: {mensajes}"
    )


@pytest.mark.django_db
def test_el_aviso_no_sale_dos_veces_a_la_misma_direccion(
    client, hallazgo, proyectista, revisor, organizacion
):
    """Dos cuentas pueden compartir correo —el campo no es único en Django— y **dos copias del
    mismo aviso se leen como un error del sistema**, no como dos avisos."""
    revisor.email = proyectista.email
    revisor.save(update_fields=["email"])
    tercero = U.objects.create_user(
        username="tercero", password="una-clave-larga-99", email="tercero@ejemplo.cl"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=tercero)
    client.force_login(dar(tercero, "documents.add_comentario"))
    mail.outbox.clear()

    comentar(client, hallazgo)

    assert len(mail.outbox) == 1
    assert len(mail.outbox[0].to) == len(set(mail.outbox[0].to)), mail.outbox[0].to
