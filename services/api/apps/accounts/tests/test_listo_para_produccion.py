"""**Un comando que dice «listo» sin mirar es peor que no tenerlo.**

El checklist de `docs/PILOTO.md` son nueve casillas que alguien marca a mano, y
`listo_para_produccion` existe para que las conteste la base. Eso solo sirve si **de verdad detecta
cada cosa** — un
comando de comprobación que pasa siempre da exactamente la confianza que no corresponde, y encima
la da por escrito.

Así que cada prueba de aquí **rompe una cosa y comprueba que la ve**. No hay ninguna que solo mire
que el comando corre.
"""

from datetime import timedelta
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from apps.accounts import roles
from apps.accounts.models import ClaveProvisional
from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Idoneidad, Revision
from apps.projects.models import Disciplina, Proyecto

U = get_user_model()


def correr() -> str:
    """Corre el comando y devuelve su salida. `SystemExit` es el resultado, no un fallo."""
    salida = StringIO()
    try:
        call_command("listo_para_produccion", stdout=salida, stderr=salida)
    except SystemExit:
        pass
    return salida.getvalue()


@pytest.fixture
def una_instalacion_sana(db, tmp_path, settings):
    """Todo lo que el comando pide, puesto. **Es la base contra la que se mide cada rotura.**

    Sin este punto de partida, una prueba que rompe una cosa no distinguiría su fallo de los otros
    ocho que ya estaban.
    """
    settings.DEBUG = False
    settings.SITE_BASE_URL = "https://p340.ejemplo.ts.net"
    settings.EMAIL_HOST = "smtp.ejemplo.cl"
    settings.EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

    from django.contrib.auth.models import Permission

    for nombre in (
        roles.ADMINISTRADOR,
        roles.COORDINADOR,
        roles.PROYECTISTA,
        roles.REVISOR,
        roles.MANDANTE,
    ):
        grupo, _ = Group.objects.get_or_create(name=nombre)
        grupo.permissions.set(Permission.objects.filter(codename="view_proyecto"))

    organizacion = Organizacion.objects.create(nombre="Constructora real", slug="real")
    persona = U.objects.create_user(
        username="persona", password="una-clave-larga-99", email="persona@ejemplo.cl"
    )
    persona.groups.add(Group.objects.get(name=roles.PROYECTISTA))
    Membresia.objects.create(organizacion=organizacion, usuario=persona)

    obra = Proyecto.objects.create(organizacion=organizacion, codigo="AAA-001", nombre="Obra real")
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=obra,
        disciplina=disciplina,
        codigo="AAA-001-ES-M-001",
        titulo="Modelo",
        responsable=persona,
        peso=5,
    )
    Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=persona,
        clave_archivo="x/y.ifc",
        nombre_original="modelo.ifc",
        sha256="0" * 64,
        es_vigente=True,
    )
    return {"organizacion": organizacion, "persona": persona, "proyecto": obra}


def test_una_instalacion_sana_no_bloquea(una_instalacion_sana):
    """**El control de la lista.** Sin esto, todas las de abajo podrían pasar por el motivo
    equivocado: cualquier cosa que siempre bloquee las haría verdes a todas."""
    salida = correr()

    assert "cosa(s) que bloquean" not in salida, salida


# --- Cada cosa que tiene que ver -------------------------------------------------------


def test_ve_una_cuenta_sin_organizacion(una_instalacion_sana):
    """**La trampa número uno del piloto**, y la que un checklist a mano marca mal.

    Sin `Membresia` la persona entra perfectamente y todas las listas salen vacías, sin un solo
    mensaje. Quien creó la cuenta marca «entró y vio la obra» porque entró.
    """
    U.objects.create_user(username="suelta", password="x" * 20, email="s@ejemplo.cl").groups.add(
        Group.objects.get(name=roles.REVISOR)
    )

    salida = correr()

    assert "sin organización" in salida
    assert "suelta" in salida


def test_ve_una_cuenta_sin_correo(una_instalacion_sana):
    """`notify.py` manda a `usuario.email`: sin correo, esa persona no se entera de nada — y
    **ninguna pantalla lo dice**."""
    persona = U.objects.create_user(username="muda", password="x" * 20, email="")
    persona.groups.add(Group.objects.get(name=roles.REVISOR))
    Membresia.objects.create(organizacion=una_instalacion_sana["organizacion"], usuario=persona)

    assert "sin correo" in correr()


def test_ve_una_cuenta_sin_rol(una_instalacion_sana):
    persona = U.objects.create_user(username="sinrol", password="x" * 20, email="r@ejemplo.cl")
    Membresia.objects.create(organizacion=una_instalacion_sana["organizacion"], usuario=persona)

    assert "sin rol" in correr()


def test_ve_que_solo_hay_superusuario(db, settings):
    """**Probar con el superusuario no prueba nada**: `tenancy.py` le devuelve el queryset entero.

    Es el detalle que invalida la comprobación fácil, y por eso el comando lo dice en voz alta.
    """
    settings.DEBUG = False
    settings.SITE_BASE_URL = "https://p340.ejemplo.ts.net"
    for nombre in (
        roles.ADMINISTRADOR,
        roles.COORDINADOR,
        roles.PROYECTISTA,
        roles.REVISOR,
        roles.MANDANTE,
    ):
        Group.objects.get_or_create(name=nombre)
    U.objects.create_superuser(username="jefe", password="x" * 20, email="j@ejemplo.cl")

    assert "no sea superusuaria" in correr()


def test_ve_que_no_hay_ninguna_revision_publicada(una_instalacion_sana):
    """Sin una revisión en `A`, el mandante entra a un expediente vacío y cree que no hay nada."""
    Revision.objects.update(idoneidad=Idoneidad.S0)

    assert "idoneidad A o B" in correr()


def test_ve_las_obras_de_ejemplo(una_instalacion_sana):
    """**La base de desarrollo no puede ser la de producción.**

    `716-LCD` trae observaciones de una corrida de prueba, y en una base real se confunden con
    hallazgos de verdad — que es justo lo que un registro documental no puede permitirse.
    """
    Proyecto.objects.create(
        organizacion=una_instalacion_sana["organizacion"], codigo="716-LCD", nombre="Demo"
    )

    salida = correr()

    assert "obras de ejemplo" in salida
    assert "716-LCD" in salida


def test_ve_que_el_correo_no_sale_de_la_maquina(una_instalacion_sana, settings):
    """Con el backend de consola la aplicación dice «enviado» y el aviso no llega.

    Es la peor combinación posible: nadie lo nota hasta que alguien pregunta por qué no le avisaron
    de algo que sí se le asignó. Por eso bloquea y no avisa.
    """
    settings.EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
    settings.EMAIL_HOST = ""

    assert "no sale de la máquina" in correr()


@override_settings(SITE_BASE_URL="http://localhost:8000")
def test_ve_que_los_enlaces_apuntan_a_esta_maquina(una_instalacion_sana):
    """**Bloquea, y no avisa.**

    Un enlace a `localhost` en el correo de otra persona **no falla**: abre su propia máquina, así
    que enseña otra cosa o nada, y quien lo recibe concluye que el producto no funciona. Un error
    que se manifiesta como «esto está roto» en la máquina de otro es el más caro de diagnosticar.
    """
    assert "apunta a esta máquina" in correr()


@override_settings(DEBUG=True)
def test_ve_el_debug_encendido(una_instalacion_sana):
    assert "DEBUG está encendido" in correr()


def test_avisa_de_las_claves_del_alta_sin_estrenar(una_instalacion_sana):
    """No bloquea —se puede abrir con gente que aún no entró— pero se dice: mientras no la cambien,
    lo que esas cuentas firmen no prueba quién lo hizo."""
    ClaveProvisional.objects.create(usuario=una_instalacion_sana["persona"])

    salida = correr()

    assert "con la clave del alta" in salida
    assert "cosa(s) que bloquean" not in salida, "esto avisa, no bloquea"


def test_avisa_de_un_trabajo_que_dejo_de_correr(una_instalacion_sana):
    """**Un trabajo que deja de correr no levanta ningún error**: simplemente no pasa nada.

    Es el modo de fallo que `apps/core/jobs.py` existe para hacer visible, y el que se descubre
    cuando alguien pregunta por qué no le llegó el resumen de la semana.
    """
    from apps.core.models import JobRun

    JobRun.objects.create(
        command="enviar_resumen",
        started_at=timezone.now() - timedelta(days=9),
        finished_at=timezone.now() - timedelta(days=9),
        result=JobRun.RESULT_OK if hasattr(JobRun, "RESULT_OK") else "ok",
    )

    assert "no corre desde hace" in correr()


def test_ve_que_faltan_los_roles(db, settings):
    """`bootstrap_roles` se olvida: no está en el paso 4 ni en «Actualizar» de `DEPLOY.md`."""
    settings.DEBUG = False
    settings.SITE_BASE_URL = "https://p340.ejemplo.ts.net"

    salida = correr()

    assert "faltan roles" in salida
    assert "bootstrap_roles" in salida
