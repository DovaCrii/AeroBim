"""Lo nuevo frente a lo ya visto en la lista de coordinación: la última pregunta de `F5.5`.

**Es lo único que ningún otro filtro contesta.** «Mías», «Choques» y «Notas» separan de quién es y
de dónde viene cada hallazgo; ninguno dice **qué apareció desde que miré**. Con treinta y cinco
filas abiertas y trece problemas nuevos de la corrida de hoy, sin esa respuesta hay que releer la
lista entera para encontrar lo que cambió.

Lo que se prueba: las dos mitades de la regla de la marca —que se cree sola la primera vez y que no
se mueva al leer—, que sea **por persona**, y el contrato de permisos: marcar como visto no es
cambiar una observación.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.core.models import Membresia, Organizacion
from apps.documents.models import MarcaDeCoordinacion, Observacion
from apps.projects.models import Proyecto

GUID = "2x9ibDgrvAu8y4Yd$Ug4Qu"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def anotar(proyecto, autor, responsable, titulo: str, *, hace: timedelta | None = None):
    """Una observación anclada al modelo, opcionalmente antedatada.

    `created_at` es `auto_now_add`, así que para tener una observación vieja hay que forzarla: es la
    misma técnica que usa la importación de BCF para conservar la fecha real de un comentario.
    """
    observacion = Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=autor,
        responsable=responsable,
        prioridad=Observacion.MEDIA,
        ifc_guid=GUID,
    )
    if hace is not None:
        Observacion.objects.filter(pk=observacion.pk).update(created_at=timezone.now() - hace)
        observacion.refresh_from_db()
    return observacion


def lista(client, proyecto):
    ruta = reverse("documents_api:proyecto-observaciones-modelo", args=[proyecto.pk])
    return client.get(ruta).json()


def marcar(client, proyecto):
    ruta = reverse("documents_api:proyecto-coordinacion-vista", args=[proyecto.pk])
    return client.post(ruta, {}, content_type="application/json")


# --- Las dos mitades de la regla ------------------------------------------------------


@pytest.mark.django_db
def test_la_primera_vez_nada_es_nuevo(client, proyecto, revisor, proyectista):
    """**Si la marca no se creara sola, la primera vez todo sería nuevo** —treinta y cinco de
    treinta y cinco—, que es exactamente el ruido del que se venía huyendo."""
    for i in range(3):
        anotar(proyecto, revisor, proyectista, f"Hallazgo {i}", hace=timedelta(days=i + 1))

    client.force_login(dar(proyectista, "documents.view_observacion"))
    datos = lista(client, proyecto)

    assert len(datos["observaciones"]) == 3
    assert not any(o["esNueva"] for o in datos["observaciones"])
    # Y se dice desde cuándo se cuenta, para que la marca no sea un misterio en la pantalla.
    assert datos["vistoEn"]


@pytest.mark.django_db
def test_lo_que_aparece_despues_es_nuevo(client, proyecto, revisor, proyectista):
    client.force_login(dar(proyectista, "documents.view_observacion"))
    anotar(proyecto, revisor, proyectista, "La que ya estaba", hace=timedelta(days=2))
    lista(client, proyecto)  # crea la marca

    anotar(proyecto, revisor, proyectista, "La de la corrida de hoy")

    porTitulo = {o["titulo"]: o for o in lista(client, proyecto)["observaciones"]}
    assert porTitulo["La de la corrida de hoy"]["esNueva"] is True
    assert porTitulo["La que ya estaba"]["esNueva"] is False


@pytest.mark.django_db
def test_leer_la_lista_no_mueve_la_marca(client, proyecto, revisor, proyectista):
    """**La otra mitad, y sin ella nada es nuevo nunca**: abrir el panel marcaría como visto justo
    lo que se acaba de descubrir, antes de poder hacer nada con ello."""
    client.force_login(dar(proyectista, "documents.view_observacion"))
    lista(client, proyecto)
    anotar(proyecto, revisor, proyectista, "Nueva")

    primera = lista(client, proyecto)
    segunda = lista(client, proyecto)
    tercera = lista(client, proyecto)

    assert primera["vistoEn"] == segunda["vistoEn"] == tercera["vistoEn"]
    assert all(datos["observaciones"][0]["esNueva"] for datos in (primera, segunda, tercera))


@pytest.mark.django_db
def test_marcar_como_visto_deja_de_contarlas(client, proyecto, revisor, proyectista):
    client.force_login(dar(proyectista, "documents.view_observacion"))
    lista(client, proyecto)
    anotar(proyecto, revisor, proyectista, "Nueva")
    assert lista(client, proyecto)["observaciones"][0]["esNueva"] is True

    respuesta = marcar(client, proyecto)

    assert respuesta.status_code == 200
    assert respuesta.json()["nuevas"] == 0
    assert lista(client, proyecto)["observaciones"][0]["esNueva"] is False


# --- Por persona, que es la única forma en que la pregunta tiene sentido --------------


@pytest.mark.django_db
def test_la_marca_es_de_cada_persona(client, proyecto, revisor, proyectista):
    """**Dos coordinadores no han mirado lo mismo.** Una marca compartida haría que el primero en
    abrir el panel se llevara por delante lo nuevo del segundo.

    Y de paso queda escrita la consecuencia de que la marca nazca en la primera lectura: **quien
    estrena el panel no tiene nada nuevo**, ni siquiera lo que sus compañeros ya marcaron. Es lo
    correcto —no se sabe qué ha visto— y hay que saberlo para no leer la primera visita como un
    fallo.
    """
    # Los dos abren el panel: cada uno estrena su marca, y para los dos no hay nada nuevo.
    con_permiso = (
        dar(proyectista, "documents.view_observacion"),
        dar(revisor, "documents.view_observacion"),
    )
    for quien in con_permiso:
        client.force_login(quien)
        lista(client, proyecto)

    anotar(proyecto, revisor, proyectista, "Nueva para los dos")

    # El proyectista la mira y dice que ya la vio.
    client.force_login(con_permiso[0])
    assert lista(client, proyecto)["observaciones"][0]["esNueva"] is True
    marcar(client, proyecto)
    assert lista(client, proyecto)["observaciones"][0]["esNueva"] is False

    # Y para el revisor sigue siendo nueva: no la ha visto él.
    client.force_login(con_permiso[1])
    assert lista(client, proyecto)["observaciones"][0]["esNueva"] is True

    assert MarcaDeCoordinacion.objects.filter(proyecto=proyecto).count() == 2


@pytest.mark.django_db
def test_una_marca_por_persona_y_obra(client, proyecto, revisor, proyectista):
    """Sin la restricción, dos lecturas dejan dos filas y la pregunta tiene dos respuestas."""
    client.force_login(dar(proyectista, "documents.view_observacion"))
    for _ in range(3):
        lista(client, proyecto)
        marcar(client, proyecto)

    assert MarcaDeCoordinacion.objects.filter(proyecto=proyecto, usuario=proyectista).count() == 1


# --- El contrato de permisos y el alcance --------------------------------------------


@pytest.mark.django_db
def test_marcar_pide_ver_y_no_cambiar(client, proyecto, proyectista):
    """**No cambia una observación, cambia mi marca.**

    Exigir `change_observacion` dejaría a un rol de solo lectura sin poder ordenar su propia lista,
    que es justamente quien más necesita saber qué cambió.
    """
    ruta = reverse("documents_api:proyecto-coordinacion-vista", args=[proyecto.pk])

    # Poder **abrir** hallazgos no alcanza: no es lo que este gesto necesita.
    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.post(ruta, {}, content_type="application/json").status_code == 403

    # Y poder verlos sí, aunque sea un `POST`. El mapa de fábrica de DRF pide `add_*` para
    # cualquier `POST`, y es la tercera vez en este repositorio que acierta el verbo y falla el
    # permiso: de ahí `PersonalStatePermissions`.
    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.post(ruta, {}, content_type="application/json").status_code == 200


@pytest.mark.django_db
def test_no_se_marca_la_obra_de_otra_organizacion(client, proyectista):
    """«Puede ver observaciones» no es «puede ver **estas**»."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    suyo = Proyecto.objects.create(organizacion=ajena, codigo="999-XXX", nombre="Obra de otro")

    client.force_login(dar(proyectista, "documents.view_observacion"))
    respuesta = marcar(client, suyo)

    assert respuesta.status_code == 404
    assert not MarcaDeCoordinacion.objects.filter(proyecto=suyo).exists()


@pytest.mark.django_db
def test_la_marca_nace_en_la_organizacion_de_la_obra(client, proyecto, proyectista):
    """Se guarda acotada como el resto: una fila sin organización no se puede acotar después."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    otro = get_user_model().objects.create_user(
        username="ajeno", password="una-clave-larga-99", email="ajeno@otra.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=otro)

    client.force_login(dar(proyectista, "documents.view_observacion"))
    lista(client, proyecto)

    marca = MarcaDeCoordinacion.objects.get(proyecto=proyecto, usuario=proyectista)
    assert marca.organizacion == proyecto.organizacion
