"""**Dar de alta a una persona del equipo, que es lo que abre el piloto.**

Hasta hoy las cuentas se creaban por consola y en tres pasos separados del `/admin/` técnico
—usuario, rol, membresía— así que olvidar el tercero era lo normal. Y una cuenta sin membresía
**entra perfectamente y ve todas las listas vacías, sin un solo mensaje**: es la trampa número uno
de `docs/PILOTO.md` y la que se lleva el primer día por delante.

Lo que estas pruebas fijan es que ese estado **no se pueda alcanzar sin querer**, y que la clave
inicial —que es un secreto que conocen dos personas— dure exactamente hasta la primera entrada.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.urls import reverse

from apps.accounts import altas, roles
from apps.accounts.models import ClaveProvisional
from apps.core.models import Membresia, Organizacion

U = get_user_model()


def entrar(client, usuario, clave):
    """Entra **por el formulario**, no con `client.login()`.

    `axes` envuelve el backend de autenticación y exige la petición: `client.login()` no se la pasa
    y levanta `AxesBackendRequestParameterRequired`. Pasar por el formulario además es lo que de
    verdad hace una persona, así que la prueba mide el camino real.
    """
    return client.post(reverse("login"), {"username": usuario, "password": clave}, follow=False)


def dar(usuario, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        usuario.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return U.objects.get(pk=usuario.pk)


@pytest.fixture
def grupos(db):
    """Los roles asignables, como los deja `bootstrap_roles`."""
    for nombre in (roles.COORDINADOR, roles.PROYECTISTA, roles.REVISOR, roles.MANDANTE):
        Group.objects.get_or_create(name=nombre)


@pytest.fixture
def alta(db, client, organizacion, proyectista, grupos):
    """Una sesión que puede crear cuentas, en una organización."""
    client.force_login(dar(proyectista, "auth.add_user", "auth.change_user", "auth.view_user"))
    return client


# --- La clave inicial -----------------------------------------------------------------


def test_la_clave_no_lleva_caracteres_que_se_confundan_al_dictarla():
    """Esta clave se pasa de viva voz o en un papel, así que `l`/`1`/`I` no es teórico."""
    juntas = "".join(altas.generar_clave() for _ in range(200))

    for confuso in "lI1O0S5B8Z2":
        assert confuso not in juntas, f"la clave puede salir con «{confuso}», que se dicta mal"


def test_la_clave_no_se_repite():
    """`secrets` y no `random`: lo segundo es predecible desde su semilla.

    Doscientas claves distintas no *demuestran* que el generador sea criptográfico, pero sí cazan
    la sustitución que de verdad pasa: alguien cambia `secrets` por `random` «porque da igual» y
    deja una semilla fija, y entonces todas las cuentas de un despliegue salen con la misma.
    """
    assert len({altas.generar_clave() for _ in range(200)}) == 200


def test_el_nombre_de_usuario_no_choca_con_los_que_ya_hay():
    """Dos personas con el mismo nombre existen en cualquier obra."""
    assert altas.nombre_de_usuario("Juan", "Pérez", set()) == "juan.perez"
    assert altas.nombre_de_usuario("Juan", "Pérez", {"juan.perez"}) == "juan.perez2"
    assert altas.nombre_de_usuario("Ñuño", "Áñez", set()) == "nuno.anez"


# --- El alta, de punta a punta --------------------------------------------------------


@pytest.mark.django_db
def test_crear_una_cuenta_la_deja_con_rol_y_con_membresia(alta, organizacion):
    """**Las tres cosas o ninguna**, que es la razón de que esto sea un solo formulario."""
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Ana",
            "apellido": "Torres",
            "correo": "ana@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.REVISOR,
        },
    )

    assert respuesta.status_code == 200
    nueva = U.objects.get(username="ana.torres")
    assert [g.name for g in nueva.groups.all()] == [roles.REVISOR]
    assert Membresia.objects.filter(usuario=nueva, organizacion=organizacion).exists(), (
        "cuenta sin membresía: entra y ve todas las listas vacías sin un solo mensaje"
    )
    assert nueva.email == "ana@ejemplo.cl"


@pytest.mark.django_db
def test_la_clave_se_enseña_una_vez_y_sirve_para_entrar(alta, organizacion, client):
    """La clave que sale en pantalla tiene que ser **la que de verdad abre la cuenta**.

    Parece obvio y es justo lo que se rompe al refactorizar: basta con que el formulario genere una
    para enseñarla y otra para guardarla, y nadie lo nota hasta que alguien no puede entrar.
    """
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Luis",
            "apellido": "Gómez",
            "correo": "luis@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.PROYECTISTA,
        },
    )
    clave = respuesta.context["clave"]

    assert U.objects.get(username="luis.gomez").check_password(clave)


@pytest.mark.django_db
def test_la_clave_no_se_guarda_en_ningun_sitio(alta, organizacion):
    """Guardarla haría de la base la lista de credenciales del equipo, y del respaldo su copia."""
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Sofía",
            "apellido": "Ruiz",
            "correo": "sofia@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.MANDANTE,
        },
    )
    clave = respuesta.context["clave"]
    marca = ClaveProvisional.objects.get(usuario__username="sofia.ruiz")

    # Ni en la fila que marca la cuenta, ni —por supuesto— en el usuario.
    assert clave not in str(marca.__dict__)
    assert clave not in U.objects.get(username="sofia.ruiz").password


@pytest.mark.django_db
def test_no_se_repite_el_correo(alta, organizacion, proyectista):
    """Dos cuentas con el mismo correo rompen los avisos **sin dar ningún error**.

    `notify.py` manda a `usuario.email`, y el campo de Django **no es único**: sin esta
    comprobación, la misma persona recibe los avisos de dos cuentas y no sabe cuál es la suya.
    """
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Otro",
            "apellido": "Nombre",
            "correo": proyectista.email,
            "organizacion": str(organizacion.pk),
            "rol": roles.REVISOR,
        },
    )

    assert respuesta.status_code == 200
    assert not U.objects.filter(username="otro.nombre").exists()


@pytest.mark.django_db
def test_no_se_ofrece_el_rol_de_administrador(alta):
    """Ese rol se lleva **todos** los permisos, incluido el de crear cuentas.

    Ofrecerlo aquí pondría una escalada de privilegios a un clic: quien puede dar de alta podría
    fabricarse un administrador. Se da desde el `/admin/` técnico, que es donde vive lo que hay que
    pensarse.
    """
    form = alta.get(reverse("accounts:nueva-cuenta")).context["form"]
    ofrecidos = dict(form.fields["rol"].choices)

    assert roles.ADMINISTRADOR not in ofrecidos
    assert roles.DIRECCION not in ofrecidos
    assert roles.REVISOR in ofrecidos


# --- El acotado, que aquí también es un control de acceso ------------------------------


@pytest.mark.django_db
def test_no_se_puede_meter_a_alguien_en_la_obra_de_otra_empresa(alta):
    """**El desplegable de organizaciones es un control de acceso, no una comodidad.**

    Sin acotarlo, quien puede crear cuentas mete a quien quiera en la empresa que quiera — y la
    lista, de paso, le enseña qué otras empresas hay en el sistema.
    """
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")

    ofrecidas = alta.get(reverse("accounts:nueva-cuenta")).context["form"].fields["organizacion"]
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Topo",
            "apellido": "Infiltrado",
            "correo": "topo@ejemplo.cl",
            "organizacion": str(ajena.pk),
            "rol": roles.MANDANTE,
        },
    )

    assert ajena not in ofrecidas.queryset
    assert respuesta.status_code == 200
    assert not U.objects.filter(username="topo.infiltrado").exists()


@pytest.mark.django_db
def test_la_lista_de_usuarios_no_enseña_los_de_otra_organizacion(alta):
    """**Esto era una fuga medida**, y con un botón de CSV al lado.

    La pantalla listaba `User.objects.all()`: cualquiera con `auth.view_user` veía **todas las
    cuentas del sistema con su correo**, las de las otras empresas del piloto incluidas.
    """
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")
    suyo = U.objects.create_user(
        username="de-la-competencia", password="una-clave-larga-99", email="secreto@competencia.cl"
    )
    Membresia.objects.create(organizacion=ajena, usuario=suyo)

    pantalla = alta.get(reverse("accounts:usuarios-roles"))
    csv = alta.get(reverse("accounts:usuarios-roles") + "?formato=csv")

    assert suyo not in pantalla.context["usuarios"]
    assert b"secreto@competencia.cl" not in csv.content, "el CSV se lleva los correos ajenos"


@pytest.mark.django_db
def test_no_se_le_reinicia_la_clave_a_alguien_de_otra_organizacion(alta):
    """Reiniciarle la clave a alguien **es poder entrar en su cuenta**: se le enseña a quien pulsa.

    O sea que este 404 no protege un listado: protege la cuenta entera de una persona de otra
    empresa.
    """
    ajena = Organizacion.objects.create(nombre="La competencia", slug="competencia")
    suyo = U.objects.create_user(username="ajeno", password="una-clave-larga-99", email="a@b.cl")
    Membresia.objects.create(organizacion=ajena, usuario=suyo)

    respuesta = alta.post(reverse("accounts:reiniciar-clave", args=[suyo.pk]))

    assert respuesta.status_code == 404
    assert U.objects.get(pk=suyo.pk).check_password("una-clave-larga-99"), "le cambiaron la clave"


@pytest.mark.django_db
def test_la_lista_de_organizaciones_no_enseña_las_demas(client, proyectista, organizacion):
    """Enseñaba **todas las empresas del sistema y quién trabaja en cada una**."""
    Organizacion.objects.create(nombre="La competencia", slug="competencia")
    client.force_login(dar(proyectista, "core.view_organizacion"))

    respuesta = client.get(reverse("core:organizaciones"))

    nombres = [o.nombre for o in respuesta.context["organizaciones"]]
    assert nombres == [organizacion.nombre]


# --- Y que la clave dure hasta la primera entrada --------------------------------------


@pytest.mark.django_db
def test_con_la_clave_del_alta_no_se_puede_hacer_nada_mas_que_cambiarla(alta, organizacion, client):
    """**Es la mitad que convierte la exigencia en una puerta y no en una sugerencia.**

    Mientras la clave siga siendo la del alta, hay dos personas que pueden entrar con ella — y lo
    que esa cuenta firme no prueba quién lo hizo. En un registro documental de obra eso vacía la
    trazabilidad, que es la mitad de lo que el producto vende.
    """
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Nueva",
            "apellido": "Persona",
            "correo": "nueva@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.PROYECTISTA,
        },
    )
    clave = respuesta.context["clave"]

    otro = client.__class__()
    assert entrar(otro, "nueva.persona", clave).status_code == 302, "no pudo entrar con su clave"

    # El portal la manda a cambiarla, y cualquier otra página también.
    assert otro.get("/").status_code == 302
    assert "password_change" in otro.get("/").headers["Location"]
    assert otro.get(reverse("accounts:ayuda")).status_code == 302

    # Y la pantalla de cambiarla sí se alcanza: si no, sería un bucle de redirección.
    assert otro.get(reverse("password_change")).status_code == 200
    # Y la salida también, o quedaría encerrada.
    assert otro.post(reverse("logout")).status_code == 302


@pytest.mark.django_db
def test_al_cambiarla_se_apaga_el_guardian(alta, organizacion, client):
    """**Sin esto, la medida de seguridad es un producto roto.**

    Quien cambia la clave seguiría rebotando a la misma pantalla para siempre, habiéndola cambiado
    ya, porque nadie apagó la marca. Es el fallo que no vería ninguna prueba que solo mire el
    formulario de cambio.
    """
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Pedro",
            "apellido": "Soto",
            "correo": "pedro@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.PROYECTISTA,
        },
    )
    otro = client.__class__()
    entrar(otro, "pedro.soto", respuesta.context["clave"])

    cambio = otro.post(
        reverse("password_change"),
        {
            "old_password": respuesta.context["clave"],
            "new_password1": "la-mia-de-verdad-2026",
            "new_password2": "la-mia-de-verdad-2026",
        },
    )

    assert cambio.status_code == 302
    assert not ClaveProvisional.objects.filter(usuario__username="pedro.soto").exists()
    assert otro.get("/").status_code == 200, "sigue rebotando después de cambiarla"


@pytest.mark.django_db
def test_con_la_clave_del_alta_tampoco_se_usa_la_api(alta, organizacion, client):
    """A quien pide JSON se le contesta 403 y no una redirección.

    Un `302` a una página HTML desde `fetch()` se rompe al analizar la respuesta, y el visor diría
    «no se pudo cargar» en vez de decir lo que pasa. Es la diferencia entre una puerta cerrada y
    una avería.
    """
    respuesta = alta.post(
        reverse("accounts:nueva-cuenta"),
        {
            "nombre": "Api",
            "apellido": "Persona",
            "correo": "api@ejemplo.cl",
            "organizacion": str(organizacion.pk),
            "rol": roles.PROYECTISTA,
        },
    )
    otro = client.__class__()
    entrar(otro, "api.persona", respuesta.context["clave"])

    peticion = otro.get("/api/revisiones/abribles/")

    assert peticion.status_code == 403
    assert peticion["Content-Type"].startswith("application/json")


@pytest.mark.django_db
def test_quien_ya_tiene_su_clave_no_ve_el_guardian(client, proyectista):
    """El caso normal: nadie más debe notar que esto existe."""
    client.force_login(proyectista)

    assert client.get("/").status_code == 200
