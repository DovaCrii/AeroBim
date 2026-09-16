"""**El repositorio: todo lo guardado, por categoría — y sin ver lo que no toca.**

## Qué resuelve

Todo lo que esta pantalla enseña **ya estaba guardado en el servidor**. Lo que no había era un
sitio donde verlo: para llegar a un archivo había que saber de qué entregable colgaba, y eso es
justo lo que no sabe quien lo busca.

## Lo que estas pruebas sujetan, en orden de gravedad

1. **Que no se salte el acotado.** Es una pantalla de lectura nueva sobre `Revision`, y `Revision`
   **no lleva el campo `organizacion`** —cuelga de su entregable— así que
   `scope_queryset_to_organizacion` la devolvería intacta. Ese hueco ya estuvo abierto en siete
   vistas a la vez; una lista que enseña «todo lo guardado» es el peor sitio para repetirlo.
2. **Que un mandante no vea lo que está en curso.** `solo_publicadas` es contractual, no un
   permiso: una `S0` no obliga a nadie y no se enseña fuera.
3. **Que la categoría salga del archivo y no de `Entregable.tipo`**, que lo elige una persona al
   planificar y se equivoca.
4. **Que enseñe la vigente y no las seis revisiones de un entregable**, que son historia.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.categorias import MODELO, NUBE, PLANO, categoria_de
from apps.documents.models import Entregable, Revision
from apps.projects.models import Proyecto


def _persona(username, organizacion, permisos=("view_revision",)):
    usuario = get_user_model().objects.create_user(username=username, password="x" * 14)
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=permisos, content_type__app_label__in=("documents", "projects")
        )
    )
    return usuario


def _con_archivo(organizacion, nombre, *, codigo, autor, correlativo="A", idoneidad="A"):
    from apps.projects.models import Disciplina

    obra = Proyecto.objects.filter(organizacion=organizacion).first() or Proyecto.objects.create(
        organizacion=organizacion, codigo=f"OBRA-{organizacion.slug}", nombre="Obra"
    )
    # `Disciplina` cuelga del proyecto, no de la organización: la acotación llega por ahí.
    disciplina, _ = Disciplina.objects.get_or_create(
        proyecto=obra, codigo="ES", defaults={"nombre": "Estructura"}
    )
    entregable = Entregable.objects.create(
        organizacion=organizacion,
        proyecto=obra,
        disciplina=disciplina,
        codigo=codigo,
        titulo=codigo,
        responsable=autor,
    )
    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=idoneidad,
        nombre_original=nombre,
        subida_por=autor,
    )


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ", slug="jej")


@pytest.fixture
def ajena(db):
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


# ── La categoría sale del archivo ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("nombre", "espera"),
    [
        ("estructura.ifc", MODELO),
        ("planta-baja.dxf", PLANO),
        ("plano-original.dwg", PLANO),
        ("levantamiento.copc.laz", NUBE),
        # **Un LAZ suelto sigue siendo una nube.** Lo que cambia es si el visor sabe abrirlo —esa
        # es otra pregunta y la contesta `abribles.py`—. Esconderlo en «otros» sería clasificarlo
        # por lo que la aplicación puede hacer con él, no por lo que es.
        ("crudo-del-topografo.laz", NUBE),
        ("memoria.pdf", "documento"),
        ("lo-que-sea.zip", "otro"),
    ],
)
@pytest.mark.django_db
def test_la_categoria_la_decide_el_nombre_del_archivo(nombre, espera):
    """**Y no `Entregable.tipo`**, que lo elige una persona al planificar —antes de que el archivo
    exista— así que un entregable marcado «Plano» puede acabar con un IFC dentro."""
    assert categoria_de(Revision(nombre_original=nombre)) == espera


@pytest.mark.django_db
def test_una_nube_no_se_confunde_por_la_extension():
    """`Path("x.copc.laz").suffix` es `.laz`, igual que un LAZ suelto: mirar solo la extensión
    parece que funciona y es lo que hace que los dos casos se traten igual sin querer."""
    assert categoria_de(Revision(nombre_original="a.copc.laz")) == NUBE
    assert categoria_de(Revision(nombre_original="a.laz")) == NUBE


# ── Lo que de verdad importa: el acotado ────────────────────────────────────────────


@pytest.mark.django_db
def test_no_se_ven_los_archivos_de_otra_empresa(client, jej, ajena):
    """**La invariante que ya estuvo rota en siete vistas.**

    `Revision` no lleva el campo `organizacion`, así que el ayudante de acotado la devolvería
    intacta. Una lista que se llama «todo lo guardado» es el peor sitio donde repetir ese hueco.
    """
    mio = _persona("del-equipo", jej)
    otro = _persona("de-fuera", ajena)
    _con_archivo(jej, "mio.ifc", codigo="MIO", autor=mio)
    _con_archivo(ajena, "secreto.ifc", codigo="AJENO", autor=otro)
    client.force_login(mio)

    cuerpo = client.get(reverse("documents:archivos")).content.decode()

    assert "mio.ifc" in cuerpo
    assert "secreto.ifc" not in cuerpo, "esta enseñando el archivo de otra empresa"


@pytest.mark.django_db
def test_quien_solo_lee_no_ve_lo_que_esta_en_curso(client, jej):
    """`solo_publicadas`: una `S0` está en curso, no obliga a nadie y no se enseña fuera. **No lo
    puede decir un permiso** —`view_revision` dice «puede ver revisiones», no distingue el código
    de idoneidad— así que lo pone la vista."""
    autor = _persona("autor", jej, permisos=("view_revision", "add_revision"))
    mandante = _persona("mandante", jej)
    _con_archivo(jej, "en-curso.ifc", codigo="WIP", autor=autor, idoneidad="S0")
    _con_archivo(jej, "publicado.ifc", codigo="PUB", autor=autor, idoneidad="A")

    client.force_login(mandante)
    cuerpo = client.get(reverse("documents:archivos")).content.decode()
    assert "publicado.ifc" in cuerpo
    assert "en-curso.ifc" not in cuerpo

    # Y la contraprueba: quien sí puede emitir ve las dos. Sin esto, la de arriba pasaría
    # escondiendo todo para todo el mundo.
    client.force_login(autor)
    cuerpo = client.get(reverse("documents:archivos")).content.decode()
    assert "en-curso.ifc" in cuerpo


@pytest.mark.django_db
def test_se_enseña_la_vigente_y_no_toda_la_historia(client, jej):
    """Un entregable con seis revisiones tiene seis archivos guardados, y las cinco viejas son
    **historia, no repositorio**: quien busca «el modelo de estructura» quiere el vigente. Las
    anteriores siguen en el expediente, que es donde se consulta la historia."""
    autor = _persona("autor", jej, permisos=("view_revision", "add_revision"))
    vieja = _con_archivo(jej, "estructura-A.ifc", codigo="EST", autor=autor, correlativo="A")
    Revision.objects.create(
        entregable=vieja.entregable,
        correlativo="B",
        idoneidad="A",
        nombre_original="estructura-B.ifc",
        subida_por=autor,
    )
    client.force_login(autor)

    cuerpo = client.get(reverse("documents:archivos")).content.decode()

    assert "estructura-B.ifc" in cuerpo
    assert "estructura-A.ifc" not in cuerpo


@pytest.mark.django_db
def test_el_filtro_por_categoria_acota(client, jej):
    autor = _persona("autor", jej, permisos=("view_revision", "add_revision"))
    _con_archivo(jej, "modelo.ifc", codigo="M", autor=autor)
    _con_archivo(jej, "nube.copc.laz", codigo="N", autor=autor)
    client.force_login(autor)

    cuerpo = client.get(reverse("documents:archivos"), {"categoria": NUBE}).content.decode()

    assert "nube.copc.laz" in cuerpo
    assert "modelo.ifc" not in cuerpo


@pytest.mark.django_db
def test_el_boton_de_compartir_pide_el_mismo_permiso_que_la_puerta(client, jej):
    """**Ofrecer una puerta que no abre enseña a probar puertas**, y aquí se hizo mal una vez.

    La primera versión comprobaba `change_revision` —que es **la regla**: compartir hacia fuera no
    es leer— mientras `EnlacesDeRevisionView` la **implementa** con `add_enlacecompartido`. Las dos
    pueden separarse, y a quien tuviera una y no la otra la fila le ofrecía un enlace que terminaba
    en 403.

    Lo destapó la prueba de punta a punta, no leer el código. Esta lo fija: la pantalla ofrece
    exactamente lo que la vista de destino deja hacer, comprobado **contra la vista** y no contra
    una cadena repetida aquí.
    """
    from apps.documents.vistas_compartir import EnlacesDeRevisionView

    autor = _persona("autor", jej, permisos=("view_revision", "add_revision"))
    _con_archivo(jej, "modelo.ifc", codigo="M", autor=autor)

    # Sin el permiso de la puerta, la fila no ofrece «Compartir».
    client.force_login(autor)
    assert "Compartir" not in client.get(reverse("documents:archivos")).content.decode()

    # Y con él, sí. El permiso se pide **a la vista**, para que cambiarlo allí rompa esto en rojo
    # en vez de dejar un botón que lleva a un 403.
    codename = EnlacesDeRevisionView().get_permission_required()[0].split(".")[1]
    autor.user_permissions.add(
        Permission.objects.get(codename=codename, content_type__app_label="documents")
    )
    client.force_login(get_user_model().objects.get(pk=autor.pk))

    assert "Compartir" in client.get(reverse("documents:archivos")).content.decode()


@pytest.mark.django_db
def test_sin_permiso_de_leer_revisiones_no_se_entra(client, jej):
    """La regla de la casa: toda superficie de lectura pide su `view_*` explícito."""
    sin_permiso = get_user_model().objects.create_user(username="nadie", password="x" * 14)
    client.force_login(sin_permiso)

    assert client.get(reverse("documents:archivos")).status_code == 403
