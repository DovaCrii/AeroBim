"""La bandeja: **«Todo lo pendiente»**, en lista o en tablero.

## El oráculo del paso

**Que las dos vistas no puedan discrepar.** Es lo único que puede salir mal aquí sin dar error: una
tarea que aparece en la lista y no en el tablero se lee como que ya está hecha, y nadie va a
sospechar de la pantalla — va a sospechar de su memoria.

La prueba compara **el conjunto de URLs** de las dos vistas, que es la identidad de cada tarea. Si
algún día el tablero se armara con su propio `filter`, un estado nuevo caería en una vista y no en
la otra, y esto lo diría.

## Lo que no se prueba porque no existe

**Arrastrar tarjetas entre columnas.** Pediría JavaScript y una vista que reciba el POST, y esa
vista no existe: el estado de una observación se cambia por sus propias puertas, que piden motivo.
Una tarjeta que se arrastra y vuelve a su sitio al recargar es peor que una que no se arrastra.
"""

import datetime as dt
import re

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.documents.models import Actividad, Observacion

RUTA = "documents:bandeja"


@pytest.fixture
def quien(client, db, organizacion):
    from apps.core.models import Membresia

    usuario = get_user_model().objects.create_user("dueno", password="x")
    for codename in ("view_observacion", "view_actividad", "view_entregable"):
        usuario.user_permissions.add(Permission.objects.get(codename=codename))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario = get_user_model().objects.get(pk=usuario.pk)
    client.force_login(usuario)
    return usuario


def observacion(proyecto, quien, *, dias, estado=Observacion.ABIERTA, titulo="Hallazgo"):
    return Observacion.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        autor=quien,
        responsable=quien,
        estado=estado,
        vence=timezone.localdate() + dt.timedelta(days=dias),
    )


def actividad(proyecto, quien, *, dias, status=Actividad.PENDIENTE, titulo="Actividad"):
    return Actividad.objects.create(
        organizacion=proyecto.organizacion,
        proyecto=proyecto,
        titulo=titulo,
        responsable=quien,
        status=status,
        vence=timezone.localdate() + dt.timedelta(days=dias),
    )


def urls_de_tarea(html: str) -> set[str]:
    return set(re.findall(r'<a class="tarea-titulo" href="([^"]+)"', html))


@pytest.fixture
def con_de_todo(proyecto, quien):
    """Una de cada: vencida, de esta semana, de este mes, y en cada punto del trabajo."""
    return [
        observacion(proyecto, quien, dias=-3, titulo="Vencida"),
        observacion(proyecto, quien, dias=3, estado=Observacion.RESPONDIDA, titulo="Respondida"),
        observacion(proyecto, quien, dias=12, titulo="En quince"),
        actividad(proyecto, quien, dias=20, status=Actividad.EN_CURSO, titulo="En curso"),
        actividad(proyecto, quien, dias=25, status=Actividad.EN_REVISION, titulo="En revisión"),
    ]


# --- 1. El oráculo: las dos vistas dicen lo mismo -------------------------------------


@pytest.mark.django_db
def test_lista_y_tablero_traen_exactamente_las_mismas_tareas(client, quien, con_de_todo):
    """**La prueba del paso.**

    Una tarea que sale en una vista y no en la otra se lee como que ya está hecha, y quien lo note
    va a sospechar de su memoria antes que de la pantalla.
    """
    lista = client.get(reverse(RUTA)).content.decode("utf-8")
    tablero = client.get(reverse(RUTA), {"vista": "tablero"}).content.decode("utf-8")

    assert urls_de_tarea(lista) == urls_de_tarea(tablero)
    assert len(urls_de_tarea(lista)) == len(con_de_todo)


@pytest.mark.django_db
def test_ninguna_tarea_sale_dos_veces_en_el_tablero(client, quien, con_de_todo):
    """Cada tarea está en **una** columna.

    Con el reparto escrito como una cadena de `if`, un estado que cumpla dos condiciones sale
    duplicado — y en un tablero eso se lee como dos tareas.
    """
    html = client.get(reverse(RUTA), {"vista": "tablero"}).content.decode("utf-8")

    todas = re.findall(r'<a class="tarea-titulo" href="([^"]+)"', html)

    assert len(todas) == len(set(todas))


@pytest.mark.django_db
def test_las_cifras_de_las_columnas_suman_el_total(client, quien, con_de_todo):
    respuesta = client.get(reverse(RUTA), {"vista": "tablero"})

    columnas = respuesta.context["columnas"]

    assert sum(len(tareas) for _c, _e, tareas in columnas) == len(con_de_todo)


# --- 2. El reparto por columnas -------------------------------------------------------


@pytest.mark.django_db
def test_cada_cosa_cae_en_su_columna(client, quien, con_de_todo):
    """Y **una observación no pasa por «en marcha»**: eso es el modelo, no un olvido.

    `abierta` y `respondida` son las dos posiciones que tiene antes de cerrarse; contestarla *es*
    pasarla a revisión.
    """
    respuesta = client.get(reverse(RUTA), {"vista": "tablero"})
    por_clave = {
        clave: [t.titulo for t in tareas] for clave, _e, tareas in respuesta.context["columnas"]
    }

    assert set(por_clave["por_hacer"]) == {"Vencida", "En quince"}
    assert por_clave["en_marcha"] == ["En curso"]
    assert set(por_clave["en_revision"]) == {"Respondida", "En revisión"}


@pytest.mark.django_db
def test_una_columna_vacia_lo_dice(client, quien, proyecto):
    """Una columna en blanco parece que no cargó; «Nada aquí» es una respuesta."""
    observacion(proyecto, quien, dias=2)

    html = client.get(reverse(RUTA), {"vista": "tablero"}).content.decode("utf-8")

    assert "columna-vacia" in html


# --- 3. El conmutador -----------------------------------------------------------------


@pytest.mark.django_db
def test_sin_parametro_se_ve_la_lista(client, quien):
    respuesta = client.get(reverse(RUTA))

    assert respuesta.context["vista"] == "lista"


@pytest.mark.django_db
def test_una_vista_inventada_cae_a_la_lista_en_silencio(client, quien):
    """**La misma regla que `orden.criterio`.**

    Una URL compartida por correo con un parámetro viejo tiene que seguir abriendo la pantalla. Un
    400 ahí convierte un enlace caducado en un error, y quien lo recibe cree que la aplicación está
    rota.
    """
    respuesta = client.get(reverse(RUTA), {"vista": "diagrama-de-gantt"})

    assert respuesta.status_code == 200
    assert respuesta.context["vista"] == "lista"


@pytest.mark.django_db
def test_el_conmutador_marca_la_vista_en_la_que_se_esta(client, quien):
    html = client.get(reverse(RUTA), {"vista": "tablero"}).content.decode("utf-8")

    marcadas = re.findall(r'class="vista vista-activa"[^>]*aria-current="page"', html)

    assert len(marcadas) == 1


@pytest.mark.django_db
def test_el_tablero_no_ofrece_arrastrar(client, quien, con_de_todo):
    """**Decidido, no pendiente.**

    Mover una tarjeta pediría JavaScript y una vista que reciba el POST, y esa vista no existe. Una
    tarjeta que se arrastra y vuelve a su sitio al recargar es peor que una que no se arrastra.
    """
    html = client.get(reverse(RUTA), {"vista": "tablero"}).content.decode("utf-8")

    assert "draggable" not in html


# --- 4. Lo que no cambia --------------------------------------------------------------


@pytest.mark.django_db
def test_los_entregables_siguen_siendo_una_tabla(client, quien, entregable):
    """**Y a propósito.** No son tareas con dueño y fecha: son cuatro columnas que todas las filas
    tienen —código, título, revisión vigente, avance—, y una tabla es la forma correcta de eso."""
    entregable.responsable = quien
    entregable.save(update_fields=["responsable"])

    html = client.get(reverse(RUTA)).content.decode("utf-8")

    assert entregable.codigo in html
    assert "<table>" in html


@pytest.mark.django_db
def test_la_lista_sigue_partida_en_los_cuatro_tramos_del_resumen(client, quien):
    """Es la misma división que usa el correo, y hay una prueba en `notify` que lo exige.

    Cuatro tramos y no dos: lo vencido y lo que vence en un mes piden reacciones distintas.
    """
    respuesta = client.get(reverse(RUTA))

    assert len(respuesta.context["tramos_etiquetados"]) == 4
