"""**Entrar con el correo, y las dos cosas que eso no puede romper.**

El nombre de usuario lo genera AeroBim —`carolina.herrera`— y es lo que nadie recuerda tres semanas
después. El correo sí: es el que esa persona escribe diez veces al día, y además es **el único dato
de la cuenta que ya tiene que ser correcto obligatoriamente**, porque sin él no llegan los avisos.

Lo que estas pruebas cuidan es que añadir esa comodidad no abra nada:

1. **Que no diga si un correo existe.** La pantalla de entrar contesta un error genérico a propósito
   —«enumerar usuarios es la mitad del trabajo de quien ataca»— y un backend que fallara distinto
   según el correo lo desharía sin tocar esa pantalla.
2. **Que un correo repetido no deje entrar a nadie.** El campo `email` de Django **no es único**,
   así que dos cuentas con el mismo correo harían que entrar por él fuera ambiguo: entraría a una
   de las dos, y no necesariamente a la misma cada vez.
"""

import pytest
from django.contrib.auth import authenticate, get_user_model
from django.test import RequestFactory
from django.urls import reverse

U = get_user_model()
CLAVE = "una-clave-larga-99"


def autenticar(**credenciales):
    """`authenticate` **con una petición**, porque `axes` la exige.

    `AxesStandaloneBackend` va primero en la lista y levanta `AxesBackendRequestParameterRequired`
    si no la recibe: sin ella, esta prueba no mediría el backend del correo sino la ausencia de un
    argumento. Es el mismo motivo por el que el resto de las pruebas entran por el formulario.
    """
    return authenticate(request=RequestFactory().post("/accounts/login/"), **credenciales)


@pytest.fixture
def persona(db):
    return U.objects.create_user(
        username="carolina.herrera", password=CLAVE, email="carolina@ejemplo.cl"
    )


def entrar(client, quien, clave=CLAVE):
    """Por el formulario, que es el camino real y el único que pasa por `axes`."""
    return client.post(reverse("login"), {"username": quien, "password": clave})


# --- Que las dos formas funcionen ------------------------------------------------------


@pytest.mark.django_db
def test_se_entra_con_el_nombre_de_usuario(client, persona):
    """**El control.** Sin esto, las de abajo podrían pasar con el login entero roto."""
    assert entrar(client, "carolina.herrera").status_code == 302


@pytest.mark.django_db
def test_se_entra_con_el_correo(client, persona):
    assert entrar(client, "carolina@ejemplo.cl").status_code == 302


@pytest.mark.django_db
def test_da_igual_como_este_escrito(client, persona):
    """Quien escribe su correo a mano lo escribe como le sale, a veces con mayúscula al empezar."""
    assert entrar(client, "Carolina@Ejemplo.CL").status_code == 302


@pytest.mark.django_db
def test_la_clave_sigue_teniendo_que_ser_la_suya(client, persona):
    """Parece obvio y es justo lo que se rompe al escribir un backend a mano: devolver el usuario
    encontrado sin comprobar nada."""
    assert entrar(client, "carolina@ejemplo.cl", "otra-cosa").status_code == 200


# --- Y lo que no puede abrir -----------------------------------------------------------


@pytest.mark.django_db
def test_un_correo_repetido_no_deja_entrar_a_ninguna(client, persona):
    """**El campo `email` de Django no es único**, así que esto puede existir.

    `NuevaCuentaForm` lo impide al crear la cuenta, pero eso no cubre las que ya estaban ni las
    creadas desde el `/admin/` técnico. Con dos, el correo **deja de identificar** — y lo que
    corresponde no es elegir una, es no dejar entrar por ahí.
    """
    U.objects.create_user(username="otra.persona", password=CLAVE, email="carolina@ejemplo.cl")

    assert entrar(client, "carolina@ejemplo.cl").status_code == 200, (
        "entró con un correo que apunta a dos cuentas: no se sabe a cuál"
    )
    # Y el nombre de usuario sigue funcionando, que es lo que evita dejar a esas dos personas fuera.
    assert entrar(client, "carolina.herrera").status_code == 302


@pytest.mark.django_db
def test_una_cuenta_desactivada_no_entra_por_el_correo(client, persona):
    """`user_can_authenticate` es lo que comprueba `is_active`, y se hereda de `ModelBackend`.

    Escribir el backend a mano y olvidarlo dejaría entrar a alguien a quien se dio de baja — el
    modo de fallo exacto de reimplementar algo que ya estaba resuelto.
    """
    persona.is_active = False
    persona.save(update_fields=["is_active"])

    assert entrar(client, "carolina@ejemplo.cl").status_code == 200


@pytest.mark.django_db
def test_no_se_distingue_un_correo_que_existe_de_uno_que_no(client, persona):
    """**La respuesta tiene que ser la misma**, letra por letra.

    Si un correo desconocido diera un mensaje distinto —o una página distinta— quien prueba
    direcciones aprendería cuáles pertenecen a alguien de la empresa. Es la misma razón por la que
    la pantalla dice «usuario o contraseña incorrectos» y no cuál de los dos.
    """
    conocido = entrar(client, "carolina@ejemplo.cl", "clave-equivocada-123")
    desconocido = entrar(client, "nadie@ejemplo.cl", "clave-equivocada-123")

    assert conocido.status_code == desconocido.status_code == 200
    # Se comparan sin el testigo de CSRF, que cambia en cada respuesta por diseño.
    import re

    sin_testigo = lambda html: re.sub(rb'value="[^"]{32,}"', b"", html)  # noqa: E731
    assert sin_testigo(conocido.content) == sin_testigo(desconocido.content)


# --- Y que el resto del sistema no se entere -------------------------------------------


@pytest.mark.django_db
def test_el_backend_sigue_siendo_el_de_django_para_todo_lo_demas(persona):
    """Hereda de `ModelBackend` **y solo cambia cómo encuentra a la persona**.

    Los permisos, los grupos y `has_perm` son los de Django. Reescribir eso es la forma habitual de
    que un backend propio acabe con un agujero, y aquí se fija que no se haya reescrito.
    """
    from django.contrib.auth.models import Permission

    persona.user_permissions.add(Permission.objects.get(codename="view_proyecto"))
    recargada = U.objects.get(pk=persona.pk)

    assert recargada.has_perm("projects.view_proyecto")
    assert autenticar(username="carolina@ejemplo.cl", password=CLAVE) == persona


@pytest.mark.django_db
def test_sin_arroba_no_se_busca_por_correo(persona):
    """Un nombre de usuario sin arroba toma el camino de siempre, que es una consulta menos.

    No es solo eficiencia: es que el caso normal no cambia de comportamiento por esta funcionalidad.
    """
    assert autenticar(username="carolina.herrera", password=CLAVE) == persona
    assert autenticar(username="no.existe", password=CLAVE) is None
