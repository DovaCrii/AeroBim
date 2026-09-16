"""**Ningún rol puede dejar a nadie fuera del visor.** Es la regla, y hasta hoy no estaba escrita.

## De dónde sale

El usuario lo pidió con estas palabras: «el tema roles poder ponerlos claro, pero que la gente sea
capaz de usar el visor, todo lo importante siempre».

Y es la regla correcta para este producto. AeroBim tiene dos mitades —el registro documental y el
visor— y **la segunda es la razón por la que alguien lo abre**. Un mandante que entra a revisar, un
proyectista que sube planos y un revisor que anota: los tres necesitan mirar el modelo. Lo que el
rol decide es qué se puede **cambiar**, nunca qué se puede **mirar**.

## Por qué hace falta una prueba y no basta con que hoy funcione

Porque la matriz de permisos es una tabla de ciento y pico entradas que se toca cada vez que se
añade un modelo, y **quitar de más no falla**: el rol sigue existiendo, la persona sigue entrando,
y lo único que pasa es que una pantalla le contesta 403 — o peor, le sale vacía. Con
`_LECTURA_DEL_PROYECTO` compartida entre los cuatro roles, un solo renglón de menos ahí deja a
todos fuera a la vez y nada lo grita.

Medido hoy, antes de escribir esto: los cuatro pueden. Esta prueba es lo que hace que siga siendo
verdad mañana.

## Lo que mide, que son dos cosas

1. **Que la página del visor abre.** Solo pide sesión (`PaginaConstruida` es `LoginRequiredMixin`),
   así que esto fija que no se le añada un `permission_required` sin pensarlo.
2. **Que la API que lo alimenta contesta.** Un visor que abre y no puede pedir ninguna revisión es
   un lienzo negro: el 403 llegaría por `fetch`, en silencio, sin nada en pantalla que lo explique.
   Es el modo de fallo peor de los dos y el que ninguna prueba de la página vería.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.urls import reverse

from apps.accounts import roles
from apps.accounts.forms import ASIGNABLES
from apps.core.models import Membresia, Organizacion


@pytest.fixture
def obra(db):
    return Organizacion.objects.create(nombre="JEJ prueba", slug="jej-visor")


@pytest.fixture(autouse=True)
def grupos_con_sus_permisos(db):
    """Los roles **con la matriz de verdad aplicada**, no grupos vacíos.

    Un `Group.objects.create(name=...)` sin permisos haría pasar la primera prueba —la página solo
    pide sesión— y fallar la segunda por el motivo equivocado. Lo que hay que medir es la matriz,
    así que se corre el mismo comando que corre el despliegue.
    """
    from django.core.management import call_command

    call_command("bootstrap_roles", verbosity=0)


def _con_rol(rol, organizacion):
    U = get_user_model()
    usuario = U.objects.create_user(
        username=f"quien-{rol}".lower().replace(" ", "-"), password="x" * 14
    )
    usuario.groups.add(Group.objects.get(name=rol))
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    return usuario


@pytest.mark.django_db
@pytest.mark.parametrize("rol", ASIGNABLES)
def test_los_cuatro_roles_abren_el_visor(client, obra, rol):
    """**La página.** No 403 y no un rebote al login: el visor abre para cualquiera con cuenta.

    Se afirma «no es 403 ni 302» en vez de «es 200» a propósito: en un árbol sin construir la vista
    contesta 503 —el `dist/` no está— y eso es una condición de la máquina, no del rol. Atar la
    prueba al 200 la haría fallar en cualquier sitio donde no se haya corrido `npm run build`, que
    es justo lo que ya pasó una vez en la CI.
    """
    client.force_login(_con_rol(rol, obra))

    respuesta = client.get(reverse("visor:visor"))

    assert respuesta.status_code not in (302, 403), (
        f"«{rol}» no puede abrir el visor: {respuesta.status_code}"
    )


@pytest.mark.django_db
@pytest.mark.parametrize("rol", ASIGNABLES)
def test_los_cuatro_roles_pueden_pedirle_revisiones_a_la_api(client, obra, rol):
    """**Y la API, que es la mitad que no se ve.**

    Un visor que abre y recibe 403 al pedir la lista es un lienzo negro: el error llega por `fetch`,
    sin nada en pantalla. `documents.view_revision` es lo que lo separa de eso, y vive en
    `_LECTURA_DEL_PROYECTO`, compartida por los cuatro roles — o sea que un renglón de menos ahí los
    deja fuera a todos a la vez.
    """
    usuario = _con_rol(rol, obra)

    assert usuario.has_perm("documents.view_revision"), (
        f"«{rol}» no puede leer revisiones: el visor le abriría vacío y sin decir por qué"
    )
    assert usuario.has_perm("projects.view_proyecto"), (
        f"«{rol}» no puede leer proyectos: el visor no sabría qué obra está mirando"
    )


@pytest.mark.django_db
def test_la_lista_de_roles_asignables_no_se_queda_atras():
    """**Una prueba parametrizada sobre una lista vacía pasa siempre.**

    Y el acoplamiento que importa es el otro: si mañana se añade un rol a `ASIGNABLES` sin darle la
    lectura del proyecto, las de arriba lo cazan — pero solo si de verdad recorren lo que ofrece el
    desplegable del alta, que es esta lista y no una copia.
    """
    assert set(ASIGNABLES) == {
        roles.COORDINADOR,
        roles.PROYECTISTA,
        roles.REVISOR,
        roles.MANDANTE,
    }
