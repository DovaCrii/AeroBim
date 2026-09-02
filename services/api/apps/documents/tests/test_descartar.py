"""Descartar una observacion sin salir del visor: la mitad viva de `F5.5`.

**`DESCARTADA` existia como estado y nada la ponia.** El silenciado estaba implementado en el modelo
—la pareja de GUID impide que la corrida siguiente reabra un conflicto descartado— y no habia camino
en la interfaz para llegar a ese estado. O sea que la mitad que decide si la herramienta se usa una
segunda vez estaba escrita y no se podia usar.

Lo que se prueba: que **se exija el motivo** —la decision es permanente—, que el estado quede donde
tiene que quedar, y el contrato de permisos: descartar es cambiar una observacion, no abrirla.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Observacion
from apps.projects.models import Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"
OTRO = "1KJm3fT2n9wPz$Lq7BvXcD"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def conflicto(db, organizacion, proyecto, revisor, proyectista):
    """Una observacion nacida de una interferencia, que es el caso que motiva todo esto."""
    return Observacion.objects.create(
        organizacion=organizacion,
        proyecto=proyecto,
        titulo="Muro de referencia × Pilar que choca",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.MEDIA,
        ifc_guid=GUID,
        interferencia_con=OTRO,
    )


def ruta_de(observacion):
    return reverse("documents_api:descartar-observacion", args=[observacion.pk])


# --- La regla del modelo -------------------------------------------------------------


@pytest.mark.django_db
def test_no_se_descarta_sin_decir_por_que(conflicto, revisor):
    """**Mismo argumento que la resolucion al cerrar, y aca pesa mas.** La pareja de GUID hace que
    descartar sea permanente: la corrida siguiente no vuelve a abrir el conflicto, asi que el motivo
    es lo unico que le queda a quien pregunte dentro de seis meses."""
    for vacio in ("", "   ", None):
        with pytest.raises(ValidationError):
            conflicto.descartar(revisor, vacio)

    conflicto.refresh_from_db()
    assert conflicto.estado == Observacion.ABIERTA


@pytest.mark.django_db
def test_descartar_deja_el_motivo_y_quien_fue(conflicto, revisor):
    conflicto.descartar(revisor, "  El pilar apoya contra el muro, es la solucion prevista.  ")

    conflicto.refresh_from_db()
    assert conflicto.estado == Observacion.DESCARTADA
    # Se guarda limpio: el espacio de sobra no es parte del motivo.
    assert conflicto.resolucion == "El pilar apoya contra el muro, es la solucion prevista."
    assert conflicto.cerrada_por == revisor
    assert conflicto.cerrada_en is not None


@pytest.mark.django_db
def test_descartada_y_cerrada_son_dos_salidas_distintas(conflicto, revisor):
    """Cerrada es «se corrigio»; descartada es «esto no era un problema». Colapsarlas perderia la
    unica cifra que dice si la deteccion sirve: cuantos de sus hallazgos eran ruido."""
    conflicto.descartar(revisor, "No era un problema.")

    conflicto.refresh_from_db()
    assert conflicto.estado != Observacion.CERRADA
    assert conflicto.estado == Observacion.DESCARTADA


# --- Desde el visor ------------------------------------------------------------------


@pytest.mark.django_db
def test_descartar_pide_change_observacion(client, proyectista, conflicto):
    """Descartar es **cambiar** una observacion, no abrirla: un rol que solo puede abrir hallazgos
    no decide que uno ajeno no era un problema."""
    ruta = ruta_de(conflicto)
    cuerpo = {"motivo": "No es un problema."}

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.post(ruta, cuerpo, content_type="application/json").status_code == 403

    client.force_login(dar(proyectista, "documents.change_observacion"))
    assert client.post(ruta, cuerpo, content_type="application/json").status_code == 200


@pytest.mark.django_db
def test_sin_motivo_contesta_400_y_no_cambia_nada(client, proyectista, conflicto):
    client.force_login(dar(proyectista, "documents.change_observacion"))

    respuesta = client.post(ruta_de(conflicto), {"motivo": "  "}, content_type="application/json")

    assert respuesta.status_code == 400
    conflicto.refresh_from_db()
    assert conflicto.estado == Observacion.ABIERTA


@pytest.mark.django_db
def test_descartarla_dos_veces_no_es_un_error(client, proyectista, conflicto):
    """**Alguien la descarto desde otra pestaña.** Se contesta el estado real en vez de un 400, para
    que la lista se ponga al dia sola en vez de enseñar un fallo que no lo es."""
    client.force_login(dar(proyectista, "documents.change_observacion"))
    ruta = ruta_de(conflicto)

    primera = client.post(ruta, {"motivo": "No es un problema."}, content_type="application/json")
    segunda = client.post(ruta, {"motivo": "Otra vez."}, content_type="application/json")

    assert primera.json()["yaEstaba"] is False
    assert segunda.status_code == 200
    assert segunda.json()["yaEstaba"] is True
    # Y el motivo es el primero: la segunda llamada no lo reescribe.
    conflicto.refresh_from_db()
    assert conflicto.resolucion == "No es un problema."


@pytest.mark.django_db
def test_no_se_descarta_la_observacion_de_otra_organizacion(client, proyectista, revisor):
    """El permiso dice «puede cambiar observaciones», no «puede cambiar **estas**»."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )
    suya = Observacion.objects.create(
        organizacion=ajena,
        proyecto=proyecto_ajeno,
        titulo="Hallazgo de otro cliente",
        autor=revisor,
        responsable=revisor,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )

    client.force_login(dar(proyectista, "documents.change_observacion"))

    respuesta = client.post(ruta_de(suya), {"motivo": "x"}, content_type="application/json")

    assert respuesta.status_code == 404


# --- Lo que el visor necesita para separar la lista ----------------------------------


@pytest.mark.django_db
def test_la_lista_dice_que_es_un_choque_y_que_es_mio(client, proyectista, conflicto, revisor):
    """**Una corrida abre decenas y las mezcla con las pocas que escribio una persona.** Sin
    separarlas, la nota que un revisor redacto a mano se pierde entre el resultado de una
    maquina."""
    nota = Observacion.objects.create(
        organizacion=conflicto.organizacion,
        proyecto=conflicto.proyecto,
        titulo="Esto lo escribi yo",
        autor=revisor,
        responsable=proyectista,
        prioridad=Observacion.ALTA,
        ifc_guid=GUID,
    )

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = client.get(
        reverse("documents_api:proyecto-observaciones-modelo", args=[conflicto.proyecto.pk])
    ).json()

    porTitulo = {o["titulo"]: o for o in datos["observaciones"]}
    assert porTitulo[conflicto.titulo]["esInterferencia"] is True
    assert porTitulo[conflicto.titulo]["contra"] == OTRO
    assert porTitulo[nota.titulo]["esInterferencia"] is False
    assert porTitulo[nota.titulo]["contra"] is None
    # Las dos estan a nombre del proyectista, que es quien mira.
    assert all(o["esMia"] for o in datos["observaciones"])


@pytest.mark.django_db
def test_la_lista_dice_si_se_puede_descartar(client, proyectista, conflicto):
    """El botón no se dibuja sin el permiso: uno que termina en 403 enseña a probar puertas."""
    client.force_login(dar(proyectista, "documents.view_observacion"))
    ruta = reverse("documents_api:proyecto-observaciones-modelo", args=[conflicto.proyecto.pk])

    assert client.get(ruta).json()["puedeDescartar"] is False

    client.force_login(dar(proyectista, "documents.change_observacion"))
    assert client.get(ruta).json()["puedeDescartar"] is True


@pytest.mark.django_db
def test_una_descartada_desaparece_de_la_lista_del_visor(client, proyectista, conflicto, revisor):
    """Es el punto entero: lo descartado no vuelve a estorbar, ni en esta corrida ni en la
    siguiente."""
    client.force_login(dar(proyectista, "documents.view_observacion"))
    ruta = reverse("documents_api:proyecto-observaciones-modelo", args=[conflicto.proyecto.pk])

    assert len(client.get(ruta).json()["observaciones"]) == 1

    conflicto.descartar(revisor, "No es un problema.")

    assert client.get(ruta).json()["observaciones"] == []
