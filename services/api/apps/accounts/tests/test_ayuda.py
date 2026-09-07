"""El recorrido de cómo se usa AeroBim: `F11.7`.

**Lo que hay que probar de una ayuda no es que salga, es que no pueda mentir.** Una ayuda escrita a
mano se desfasa en silencio: el módulo se renombra, la pantalla se mueve, y el texto sigue diciendo
lo de antes con toda la seguridad del mundo. Es la peor clase de documentación, la que parece
correcta.

Así que se comprueban tres cosas que la sujetan al producto:

1. **Cada destino resuelve** con el enrutador de Django. Un paso que apunta a una ruta que ya no
   existe falla aquí en vez de dar un 500 al pulsarlo.
2. **Cada destino está además en el catálogo del portal.** Si un módulo se quita del portal, la
   ayuda deja de tener sentido y el gate lo dice — sin esto, la ayuda seguiría llevando a una
   pantalla que ya nadie ofrece.
3. **Cada permiso que la ayuda nombra existe de verdad.** Un permiso mal escrito hace que
   `has_perm` devuelva `False` siempre, así que el paso saldría marcado como ajeno **para todo el
   mundo** y nadie sabría por qué.

Y el contrato de la pantalla: **el flujo entero se enseña, marcando lo que no te toca**. No se
filtra, y eso es deliberado — una explicación a la que le faltan tres pasos no explica de dónde le
llegan a alguien las observaciones que tiene que contestar.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import NoReverseMatch, reverse

from apps.accounts.ayuda import PASOS, pasos_para
from apps.accounts.modulos import CATALOGO


def dar(user, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


# --- Que no pueda desfasarse ---------------------------------------------------------


def test_todos_los_destinos_resuelven():
    """Un paso que apunta a una ruta que ya no existe daría un 500 al pulsarlo."""
    for paso in PASOS:
        if paso.ruta is None:
            continue
        try:
            reverse(paso.ruta)
        except NoReverseMatch:  # pragma: no cover - es el fallo que se busca
            pytest.fail(f"el paso «{paso.titulo}» apunta a «{paso.ruta}», que no resuelve")


def test_cada_destino_esta_en_el_catalogo_del_portal():
    """**Es el guardián de verdad.** Si un módulo se quita del portal, la ayuda deja de tener
    sentido y esto lo dice: sin la prueba, seguiría llevando a una pantalla que ya nadie ofrece."""
    # El catálogo salió de `PortalView` a `modulos.py` el 2026-09-07, porque el rail lo necesita en
    # todas las páginas. La prueba sigue midiendo lo mismo desde su sitio nuevo.
    del_portal = {modulo.ruta for modulo in CATALOGO}

    for paso in PASOS:
        if paso.ruta is None:
            continue
        assert paso.ruta in del_portal, (
            f"el paso «{paso.titulo}» lleva a «{paso.ruta}», que no está en el portal"
        )


@pytest.mark.django_db
def test_cada_permiso_que_nombra_existe():
    """**Un permiso mal escrito no falla: calla.** `has_perm` devolvería `False` siempre, así que el
    paso saldría marcado como ajeno para todo el mundo y nadie sabría por qué."""
    for paso in PASOS:
        if paso.permiso is None:
            continue
        app_label, codename = paso.permiso.split(".")
        assert Permission.objects.filter(
            content_type__app_label=app_label, codename=codename
        ).exists(), f"el paso «{paso.titulo}» pide «{paso.permiso}», que no existe"


def test_el_recorrido_va_en_orden_y_numerado():
    """El orden es la mitad del valor: lo que no sabe quien abre esto es por dónde se empieza."""
    assert len(PASOS) >= 8
    for numero, paso in enumerate(PASOS, start=1):
        assert str(paso.titulo).startswith(f"{numero} ·"), paso.titulo


def test_cada_paso_dice_para_que_sirve_y_que_hacer():
    """**«Para qué sirve» es lo que casi nunca está escrito en una ayuda** y lo único que hace falta
    para decidir si un paso te interesa; «qué hacer» es lo que la separa de un folleto."""
    for paso in PASOS:
        assert len(str(paso.para_que)) > 60, paso.titulo
        assert len(str(paso.que_hacer)) > 40, paso.titulo
        assert str(paso.de_quien), paso.titulo


# --- El contrato de la pantalla ------------------------------------------------------


@pytest.mark.django_db
def test_se_ensena_el_flujo_entero_marcando_lo_ajeno(proyectista):
    """**No se filtra, se marca.** Una explicación a la que le faltan tres pasos no explica de dónde
    le llegan a alguien las observaciones que tiene que contestar."""
    resueltos = pasos_para(proyectista)

    assert len(resueltos) == len(PASOS)
    # Sin permisos, los pasos que piden uno salen marcados; los que no piden ninguno, no.
    assert any(not uno.puedes for uno in resueltos)
    assert any(uno.puedes for uno in resueltos)


@pytest.mark.django_db
def test_con_los_permisos_de_coordinar_no_queda_nada_ajeno(proyectista):
    resueltos = pasos_para(
        dar(
            proyectista,
            "projects.view_proyecto",
            "documents.view_observacion",
            "documents.add_observacion",
        )
    )

    assert all(uno.puedes for uno in resueltos)


@pytest.mark.django_db
def test_la_ayuda_solo_pide_sesion(client, proyectista):
    """**Explica el producto, no da acceso a nada.** Pedir aquí un permiso dejaría sin explicación a
    quien más la necesita —el rol más acotado— justo el día que entra por primera vez."""
    ruta = reverse("accounts:ayuda")

    assert client.get(ruta).status_code == 302  # sin sesión, al login

    client.force_login(proyectista)
    respuesta = client.get(ruta)

    assert respuesta.status_code == 200
    cuerpo = respuesta.content.decode()
    # Los nueve pasos están, incluidos los que este rol no puede hacer.
    for paso in PASOS:
        assert str(paso.titulo) in cuerpo, paso.titulo
    # Y se dice de quién es lo que no te toca, que es lo accionable.
    assert "lo hace" in cuerpo


@pytest.mark.django_db
def test_la_ayuda_esta_en_la_barra_de_todas_las_pantallas(client, proyectista):
    """Se busca desde la pantalla en la que uno se ha atascado, no volviendo a la puerta."""
    client.force_login(proyectista)

    portal = client.get(reverse("portal")).content.decode()

    assert reverse("accounts:ayuda") in portal
