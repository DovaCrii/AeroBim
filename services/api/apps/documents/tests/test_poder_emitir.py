"""**Para emitir hace falta un entregable, y el camino hasta él tenía un agujero y un callejón.**

## El agujero: el desplegable de disciplina no se acotaba por nada

`NuevoEntregableView` construía `EntregableForm()` **sin `proyecto`**, y el formulario solo acotaba
cuando se lo pasaban. O sea que el desplegable salía con `Disciplina.objects.all()`: **todas las
disciplinas de todos los proyectos de todas las empresas**.

Y no era solo una fuga de lectura —que ya lo es: la lista dice qué obras hay y cómo las organiza
cada oficina—. La vista hace después:

    entregable.organizacion = disciplina.proyecto.organizacion

así que eligiendo una disciplina ajena **se escribe un entregable dentro de la empresa de otro**.
Es la misma familia de las siete fugas del PR #23 y por el mismo motivo: un acotado que depende de
que quien llame se acuerde de pasar un argumento.

## El callejón: sin disciplinas, la pantalla no llevaba a ninguna parte

En una instalación recién hecha no hay ninguna disciplina. El desplegable salía vacío, el
formulario no podía validar nunca, y la pantalla no decía **qué faltaba ni dónde se conseguía** —
el mismo callejón que tenía «Cuenta nueva» sin organizaciones, un piso más abajo.

## Y la mitad que de verdad protege

El acotado del `GET` decide **qué se ofrece**. Lo que impide la escritura ajena es repetirlo en el
`POST`: un `disciplina=<id ajeno>` enviado a mano se salta la pantalla entera.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable
from apps.projects.models import Disciplina, Proyecto


def _persona(username, organizacion, permisos):
    usuario = get_user_model().objects.create_user(username=username, password="x" * 14)
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=permisos, content_type__app_label__in=("documents", "projects")
        )
    )
    return usuario


def _obra_con_disciplina(organizacion, codigo):
    obra = Proyecto.objects.create(organizacion=organizacion, codigo=codigo, nombre=codigo)
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    return obra, disciplina


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ", slug="jej")


@pytest.fixture
def ajena(db):
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


@pytest.fixture
def quien_registra(db, jej):
    return _persona("coordinadora", jej, ("add_entregable", "view_entregable", "view_proyecto"))


# ── El agujero ──────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_no_se_ofrece_la_disciplina_de_otra_empresa(client, jej, ajena, quien_registra):
    """**La fuga de lectura.** El desplegable decía qué obras tienen las demás oficinas."""
    _obra_con_disciplina(jej, "MIA")
    _obra_con_disciplina(ajena, "AJENA")
    client.force_login(quien_registra)

    cuerpo = client.get(reverse("documents:nuevo-entregable")).content.decode()

    assert "MIA" in cuerpo
    assert "AJENA" not in cuerpo, "el desplegable enseña la disciplina de otra empresa"


@pytest.mark.django_db
def test_no_se_puede_crear_un_entregable_en_la_empresa_de_otro(client, jej, ajena, quien_registra):
    """**La mitad que protege de verdad**, y la que la pantalla sola no da.

    `entregable.organizacion = disciplina.proyecto.organizacion`: con una disciplina ajena enviada
    a mano, el entregable se escribe **dentro de la otra empresa**. No es una fuga de lectura, es
    una escritura.
    """
    _obra_con_disciplina(jej, "MIA")
    _, ajena_disciplina = _obra_con_disciplina(ajena, "AJENA")
    client.force_login(quien_registra)

    respuesta = client.post(
        reverse("documents:nuevo-entregable"),
        {
            "codigo": "INTRUSO",
            "titulo": "Colado",
            "tipo": "plano",
            "disciplina": str(ajena_disciplina.pk),
            "responsable": str(quien_registra.pk),
            "peso": "1",
        },
    )

    assert respuesta.status_code == 400
    assert not Entregable.objects.filter(organizacion=ajena).exists(), (
        "se creó un entregable dentro de la empresa de otro"
    )


@pytest.mark.django_db
def test_con_la_disciplina_propia_si_se_crea(client, jej, quien_registra):
    """La contraprueba. **Sin esto, la de arriba pasaría rechazándolo todo**, que es romper la
    pantalla en vez de protegerla."""
    _, mia = _obra_con_disciplina(jej, "MIA")
    client.force_login(quien_registra)

    respuesta = client.post(
        reverse("documents:nuevo-entregable"),
        {
            "codigo": "MIA-ES-001",
            "titulo": "Modelo de estructura",
            "tipo": "modelo",
            "disciplina": str(mia.pk),
            "responsable": str(quien_registra.pk),
            "peso": "1",
        },
    )

    assert respuesta.status_code == 302
    creado = Entregable.objects.get(codigo="MIA-ES-001")
    assert creado.organizacion == jej


# ── El callejón ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_sin_disciplinas_la_pantalla_dice_que_falta_y_a_donde_ir(client, jej, quien_registra):
    """Lo que se comprueba no es que salga un texto: es que **no se ofrezca el formulario**.

    Rellenarlo no lleva a ninguna parte, y con el formulario presente alguien escribe código,
    título y peso antes de descubrir que no puede terminar.
    """
    obra = Proyecto.objects.create(organizacion=jej, codigo="0001", nombre="test")
    client.force_login(quien_registra)

    cuerpo = client.get(reverse("documents:nuevo-entregable")).content.decode()

    assert 'name="codigo"' not in cuerpo, "ofrece un formulario que no se va a poder enviar"
    assert reverse("projects:proyecto", kwargs={"pk": obra.pk}) in cuerpo, (
        "no dice en qué obra se crea la disciplina que falta"
    )


@pytest.mark.django_db
def test_con_una_disciplina_vuelve_el_formulario(client, jej, quien_registra):
    """La contraprueba de la de arriba: **sin esto, escondería el formulario para siempre**."""
    _obra_con_disciplina(jej, "MIA")
    client.force_login(quien_registra)

    cuerpo = client.get(reverse("documents:nuevo-entregable")).content.decode()

    assert 'name="codigo"' in cuerpo
    assert 'name="disciplina"' in cuerpo


@pytest.mark.django_db
def test_sin_ninguna_obra_manda_a_crear_la_obra(client, jej, quien_registra):
    """**Dos pisos, no uno.** Sin obra no hay disciplina y sin disciplina no hay entregable;
    mandar a «abre la obra» cuando no hay ninguna es mandar a un sitio que no existe."""
    quien_registra.user_permissions.add(
        Permission.objects.get(codename="add_proyecto", content_type__app_label="projects")
    )
    client.force_login(quien_registra)

    cuerpo = client.get(reverse("documents:nuevo-entregable")).content.decode()

    assert reverse("projects:nuevo-proyecto") in cuerpo


@pytest.mark.django_db
def test_el_desplegable_dice_de_que_obra_es_cada_disciplina(client, jej, quien_registra):
    """Con varias obras, «Estructura» existe en todas: el nombre solo no identifica, y esta
    pantalla decide **a qué obra va el entregable**."""
    _obra_con_disciplina(jej, "OBRA-A")
    _obra_con_disciplina(jej, "OBRA-B")
    client.force_login(quien_registra)

    cuerpo = client.get(reverse("documents:nuevo-entregable")).content.decode()

    assert "OBRA-A · ES" in cuerpo
    assert "OBRA-B · ES" in cuerpo
