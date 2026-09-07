"""El catálogo: que sacarlo de la vista **no cambió nada**, y que el rail sepa dónde está.

## Por qué la primera prueba es una lista escrita a mano

Porque este cambio es una mudanza, no una mejora: los doce módulos, sus grupos, sus permisos y sus
líneas de ayuda tienen que salir idénticos. Comparar contra `CATALOGO` no probaría nada —sería
comparar el código consigo mismo—, así que la lista esperada **se escribe aquí, a mano**, con los
valores que estaban en `PortalView._definicion()` antes de moverlos.

Es la única prueba de este archivo que se puede borrar algún día: cuando el catálogo cambie a
propósito, se actualiza; cuando cambie sin querer, avisa.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import translation

from apps.accounts.modulos import CATALOGO, Modulo, activo, modulos_para, por_grupo


@pytest.fixture(autouse=True)
def sin_traducir():
    """Comparar los nombres **en su idioma de origen**, que es el inglés del código.

    Los títulos son `gettext_lazy`, así que `str()` los resuelve al idioma activo — y con el español
    activo esta prueba comparaba «Las obras» contra «The works» y fallaba por el motivo equivocado.
    Desactivar la traducción devuelve el `msgid`, que es el dato que esta prueba quiere fijar: si
    algún día se cambia el texto en el `.po`, esto no tiene que caerse.
    """
    with translation.override(None):
        yield


#: `(grupo, titulo, ruta, permiso)` tal como estaban en la vista, en su orden.
#:
#: Las descripciones no entran: son cinco líneas largas cada una y compararlas aquí haría una
#: prueba ilegible por lo que ya cubre `test_ayuda.py`. Lo que se fija es **la estructura**: qué
#: módulos hay, en qué grupo, a dónde van y qué permiso piden.
ESPERADO = [
    ("The works", "Projects", "projects:proyectos", "projects.view_proyecto"),
    ("The works", "Organisations", "core:organizaciones", "core.view_organizacion"),
    ("The model", "BIM viewer", "visor:visor", None),
    ("The document register", "Deliverables", "documents:entregables", "documents.view_entregable"),
    (
        "The document register",
        "Transmittals",
        "documents:transmittals",
        "documents.view_transmittal",
    ),
    (
        "The document register",
        "Information requirements",
        "documents:requisitos-ids",
        "documents.view_requisitoids",
    ),
    ("Coordination", "My plate", "documents:bandeja", "documents.view_observacion"),
    ("Coordination", "Observations", "documents:observaciones", "documents.view_observacion"),
    ("Coordination", "Activities", "documents:actividades", "documents.view_actividad"),
    ("Administration", "Users and roles", "accounts:usuarios-roles", "auth.view_user"),
    ("Administration", "Audit trail", "accounts:auditoria", "core.view_auditevent"),
    ("Administration", "Scheduled jobs", "accounts:trabajos", "core.view_jobrun"),
]


# --- 1. La mudanza no cambió nada ------------------------------------------------------


def test_el_catalogo_es_el_mismo_que_estaba_en_la_vista():
    """**Es la prueba del paso**: sacarlo de `PortalView` es mover, no rediseñar."""
    real = [(str(m.grupo), str(m.titulo), m.ruta, m.permiso) for m in CATALOGO]

    assert real == ESPERADO


def test_cada_modulo_apunta_a_una_ruta_que_existe():
    """`reverse` es el oráculo: una ruta mal escrita aquí sería un 500 en **todas** las páginas.

    Antes solo rompía la portada; con el rail en `base.html` rompería el portal entero, así que
    conviene que caiga aquí.
    """
    for modulo in CATALOGO:
        for nombre in (modulo.ruta, *modulo.rutas_extra):
            assert reverse(nombre).startswith("/"), nombre


def test_cada_modulo_tiene_icono():
    """En el rail plegado **el icono es el módulo**: uno sin icono sería una fila en blanco.

    Cuando la lista solo alimentaba tarjetas, un icono vacío se dibujaba igual —era un adorno con
    función—. Plegado a 64 px deja de ser un adorno.
    """
    sin_icono = [str(m.titulo) for m in CATALOGO if not m.icono]

    assert sin_icono == []


def test_los_permisos_existen_de_verdad(db):
    """Un permiso mal escrito **no da error: filtra siempre.**

    `has_perm("documents.view_entregabl")` devuelve `False` sin quejarse, así que el módulo
    desaparecería del portal para todo el mundo y se leería como un problema de roles.
    """
    faltan = []
    for modulo in CATALOGO:
        if modulo.permiso is None:
            continue
        app_label, codename = modulo.permiso.split(".")
        if not Permission.objects.filter(
            content_type__app_label=app_label, codename=codename
        ).exists():
            faltan.append(modulo.permiso)

    assert faltan == []


# --- 2. Filtrar por permiso ------------------------------------------------------------


@pytest.fixture
def nadie(db):
    return get_user_model().objects.create_user("nadie", password="x")


def test_sin_permisos_solo_queda_el_visor(nadie):
    """**Y el visor se queda a propósito**: mirar un modelo es a lo que se entra.

    Lo que está guardado es *qué revisiones* puede abrir, y eso lo decide `view_revision` en la API.
    """
    titulos = [str(m.titulo) for m in modulos_para(nadie)]

    assert titulos == ["BIM viewer"]


def test_se_filtra_en_vez_de_deshabilitar(nadie):
    """La regla del sistema: **un enlace que termina en 403 enseña a probar puertas.**

    La ayuda sí enseña los pasos ajenos, y ahí es correcto porque explica el producto en vez de dar
    acceso — son dos cosas distintas y por eso no comparten esta función.
    """
    assert all(m.permiso is None for m in modulos_para(nadie))


def test_con_un_permiso_aparece_su_modulo_y_solo_el_suyo(nadie):
    nadie.user_permissions.add(
        Permission.objects.get(content_type__app_label="documents", codename="view_transmittal")
    )
    con_permiso = get_user_model().objects.get(pk=nadie.pk)

    titulos = [str(m.titulo) for m in modulos_para(con_permiso)]

    assert titulos == ["BIM viewer", "Transmittals"]


# --- 3. El agrupamiento conserva el orden del trabajo ---------------------------------


def test_los_grupos_salen_en_el_orden_del_catalogo():
    """**El orden es el del trabajo, no el alfabético.**

    Con orden alfabético saldría «Administration» primero, o sea que lo primero que vería alguien
    al entrar es dónde se mira cómo va la máquina.
    """
    grupos = [str(nombre) for nombre, _ in por_grupo(list(CATALOGO))]

    assert grupos == [
        "The works",
        "The model",
        "The document register",
        "Coordination",
        "Administration",
    ]


def test_agrupar_no_pierde_ni_repite_ningun_modulo():
    dentro = [m for _grupo, lista in por_grupo(list(CATALOGO)) for m in lista]

    assert dentro == list(CATALOGO)


def test_un_grupo_que_se_queda_vacio_no_aparece(nadie):
    """Sin permisos solo queda el visor, así que **cuatro de los cinco grupos desaparecen**.

    Un rótulo de grupo sin nada debajo es peor que no tenerlo: parece que algo no cargó.
    """
    grupos = por_grupo(modulos_para(nadie))

    assert [str(nombre) for nombre, _ in grupos] == ["The model"]


# --- 4. Dónde estoy: el módulo activo -------------------------------------------------


class _Peticion:
    """Lo mínimo que `activo` necesita: un camino y un usuario."""

    def __init__(self, path, user):
        self.path = path
        self.user = user


@pytest.fixture
def todopoderoso(db):
    usuario = get_user_model().objects.create_user("jefa", password="x", is_superuser=True)
    return get_user_model().objects.get(pk=usuario.pk)


def test_la_pantalla_de_un_modulo_lo_marca(todopoderoso):
    marcado = activo(_Peticion(reverse("documents:transmittals"), todopoderoso))

    assert str(marcado.titulo) == "Transmittals"


def test_una_pantalla_de_detalle_marca_su_modulo(todopoderoso):
    """**Es el motivo de que se compare por prefijo y no por nombre de ruta.**

    Estando en la ficha de un entregable, comparar nombres de ruta no marcaría nada — y el rail
    dejaría de contestar «¿dónde estoy?» justo en las pantallas donde se trabaja.
    """
    detalle = reverse("documents:entregables") + "71847778-d943-490b-9988-5ea1ef8accc4/"

    marcado = activo(_Peticion(detalle, todopoderoso))

    assert str(marcado.titulo) == "Deliverables"


def test_gana_el_prefijo_mas_largo(todopoderoso):
    """Los prefijos se solapan: `/documentos/observaciones/` empieza por `/documentos/`.

    Con «el primero que coincida», estando en observaciones el rail marcaría otro módulo del mismo
    grupo. Se resuelve midiendo el prefijo, no ordenando la lista a mano.
    """
    marcado = activo(_Peticion(reverse("documents:observaciones"), todopoderoso))

    assert str(marcado.titulo) == "Observations"


def test_el_visor_de_documento_sigue_marcando_el_modelo(todopoderoso):
    """`F8.6`: el PDF con las observaciones encima es la otra mitad del visor."""
    marcado = activo(_Peticion(reverse("visor:documento"), todopoderoso))

    assert str(marcado.titulo) == "BIM viewer"


@pytest.mark.parametrize("camino", ["/", "/administracion/ayuda/", "/cuentas/clave/"])
def test_las_pantallas_que_no_son_modulo_no_marcan_nada(camino, todopoderoso):
    """`None` es una respuesta legítima y frecuente, no un fallo.

    La portada, la ayuda y el cambio de contraseña no son módulos: la plantilla no pinta ningún
    `aria-current` y ya está.
    """
    assert activo(_Peticion(camino, todopoderoso)) is None


def test_no_marca_un_modulo_que_esta_persona_no_puede_ver(nadie):
    """Entrar por URL a algo sin permiso da 403 en su propia vista; **el rail no lo enciende.**

    Marcarlo sería enseñar en la barra un sitio al que no se puede ir.
    """
    assert activo(_Peticion(reverse("accounts:auditoria"), nadie)) is None


def test_el_modulo_activo_es_uno_del_catalogo(todopoderoso):
    """Devuelve el objeto y no una copia: la plantilla compara por identidad."""
    marcado = activo(_Peticion(reverse("projects:proyectos"), todopoderoso))

    assert isinstance(marcado, Modulo)
    assert marcado in CATALOGO
