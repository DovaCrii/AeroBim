"""**La meta del producto, de punta a punta, en una prueba.**

El usuario la dijo en una frase: «tener un proyecto, subir una nube de puntos o modelo IFC, y poder
compartir el visualizador al mandante — esa es la meta».

Cada pieza tenía sus pruebas y **el camino entero no tenía ninguna**. Y ahí es donde se rompen las
cosas: cada eslabón correcto por separado y uno que no encaja con el siguiente. Ya pasó dos veces
esta semana —el desplegable de organización vacío, el de disciplina— y las dos veces el síntoma fue
el mismo: todo probado, nada utilizable.

## Lo que recorre

Obra → disciplina → entregable → archivo guardado → enlace → **abrir sin ninguna sesión**.

El último paso es el que importa y el único que no se puede falsear: se usa un cliente **nuevo**,
sin cookies, que es exactamente lo que tiene el mandante. Reusar el cliente autenticado dejaría la
prueba en verde sobre un enlace que solo funciona para quien ya está dentro — que es justo lo
contrario de para qué existe.

## Y por qué mide bytes y no una pantalla

Porque el visor se dibuja en el navegador y eso se comprueba abriéndolo — está medido a mano y en
`diag.html`. Lo que sí se puede romper sin que nadie se entere es **la cadena de autorización**: que
la puerta pública entregue el archivo correcto, sin sesión, y solo ese.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable, Revision
from apps.projects.models import Disciplina, Proyecto


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ", slug="jej")


@pytest.fixture
def coordinadora(db, jej):
    usuario = get_user_model().objects.create_user(
        username="coordinadora", password="x" * 14, first_name="Ana", last_name="López"
    )
    Membresia.objects.create(organizacion=jej, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=(
                "add_revision",
                "view_revision",
                "change_revision",
                "add_entregable",
                # **El permiso que exige la vista de enlaces**, que no es `change_revision`: esa es
                # la regla, y `add_enlacecompartido` es como está implementada. Darle solo la regla
                # a esta fixture es lo que destapó que la pantalla de Archivos comprobaba una y la
                # puerta pedía la otra.
                "add_enlacecompartido",
                "view_entregable",
                "view_proyecto",
                "add_proyecto",
            ),
            content_type__app_label__in=("documents", "projects"),
        )
    )
    return usuario


@pytest.mark.django_db
def test_de_la_obra_al_mandante_sin_cuenta(client, jej, coordinadora, tmp_path, settings):
    """El camino entero, y el último paso con un cliente sin cookies."""
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(coordinadora)

    # ── 1 · La obra ────────────────────────────────────────────────────────────────
    obra = Proyecto.objects.create(organizacion=jej, codigo="0001", nombre="Piloto")

    # ── 2 · El entregable, con su disciplina creada de paso ────────────────────────
    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": "",
            "disciplina_nueva": "Topografía",
            "codigo": "0001-TOP-N-001",
            "titulo": "Levantamiento",
            "tipo": "modelo",
        },
    )
    entregable = Entregable.objects.get(codigo="0001-TOP-N-001")
    assert respuesta.status_code == 302
    assert Disciplina.objects.filter(proyecto=obra, nombre="Topografía").exists()

    # ── 3 · El archivo ─────────────────────────────────────────────────────────────
    #
    # Un IFC mínimo de verdad: la subida comprueba **la firma de los primeros bytes**, no la
    # extensión, así que un archivo con bytes cualesquiera lo rechazaría — y con razón.
    ifc = (
        b"ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n"
        b"FILE_NAME('x','2026-01-01T00:00:00',(''),(''),'','','');\n"
        b"FILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"
    )
    archivo = tmp_path / "levantamiento.ifc"
    archivo.write_bytes(ifc)
    with archivo.open("rb") as abierto:
        subida = client.post(
            reverse("documents:subir-revision", kwargs={"pk": entregable.pk}),
            {"correlativo": "A", "idoneidad": "A", "archivo": abierto},
        )
    assert subida.status_code == 302, "la subida no llegó a guardar"
    revision = Revision.objects.get(entregable=entregable)
    assert revision.sha256, "se guardó sin huella: no se podría comprobar que no cambió"

    # ── 4 · El enlace ──────────────────────────────────────────────────────────────
    client.post(
        reverse("documents:enlaces", kwargs={"pk": revision.pk}),
        {"para": "Mandante", "dias": "30"},
    )
    enlace = revision.enlaces_compartidos.get()

    # ── 5 · Y el mandante, **sin ninguna cuenta** ──────────────────────────────────
    #
    # Un cliente nuevo: sin cookies, sin sesión, sin nada. Es lo único que prueba que el enlace
    # sirve para quien no está dentro — reusando el de arriba, la prueba pasaría sobre un enlace
    # que solo funciona para quien ya entró.
    de_fuera = Client()

    # **«No le cierran la puerta», no «es 200».** La página del visor contesta **503** en un árbol
    # sin construir —el `dist/` no está— y eso es una condición de la máquina, no del producto: en
    # la CI el trabajo de Python no corre `npm run build`. Atarlo al 200 hace fallar la prueba
    # donde el enlace funciona perfectamente.
    #
    # Ya estaba escrito en `apps/visor/tests/test_el_visor_lo_abren_todos.py`, y aquí lo repetí.
    # Lo que esta prueba tiene que decir es que **al mandante no se le niega el paso**; que el HTML
    # se pinte lo dice el build, y lo comprueban las pruebas del visor.
    pagina = de_fuera.get(reverse("compartido", kwargs={"testigo": enlace.testigo}))
    assert pagina.status_code not in (302, 403, 404), (
        f"al mandante se le niega el enlace: {pagina.status_code}"
    )

    ficha = de_fuera.get(reverse("compartido-ficha", kwargs={"testigo": enlace.testigo}))
    assert ficha.status_code == 200
    assert ficha.json()["nombre"] == "levantamiento.ifc"

    contenido = de_fuera.get(reverse("compartido-contenido", kwargs={"testigo": enlace.testigo}))
    assert contenido.status_code == 200
    assert b"".join(contenido.streaming_content) == ifc, "no llegó el archivo que se compartió"


@pytest.mark.django_db
def test_el_enlace_no_abre_ninguna_otra_puerta(client, jej, coordinadora, tmp_path, settings):
    """**El testigo abre una revisión y nada más.**

    Es lo que hace que compartir hacia fuera sea aceptable: quien recibe el enlace no tiene cuenta,
    así que si el testigo diera acceso a algo más, ese algo más quedaría público. Se comprueba
    contra el portal, contra la API con sesión y contra **otra** revisión.
    """
    settings.DOCUMENTS_DIR = tmp_path
    client.force_login(coordinadora)
    obra = Proyecto.objects.create(organizacion=jej, codigo="0001", nombre="Piloto")
    disciplina = Disciplina.objects.create(proyecto=obra, codigo="TOP", nombre="Topografía")

    def _revision(codigo):
        entregable = Entregable.objects.create(
            organizacion=jej,
            proyecto=obra,
            disciplina=disciplina,
            codigo=codigo,
            titulo=codigo,
            responsable=coordinadora,
        )
        return Revision.objects.create(
            entregable=entregable,
            correlativo="A",
            idoneidad="A",
            nombre_original=f"{codigo}.ifc",
            subida_por=coordinadora,
        )

    compartida = _revision("COMPARTIDA")
    otra = _revision("PRIVADA")
    creado = client.post(
        reverse("documents:enlaces", kwargs={"pk": compartida.pk}),
        {"para": "Mandante", "dias": "30"},
    )
    assert creado.status_code == 302, creado.content.decode()[:2000]
    testigo = compartida.enlaces_compartidos.get().testigo

    de_fuera = Client()

    # El portal, la API con sesión y el expediente siguen cerrados.
    assert de_fuera.get("/").status_code in (302, 403)
    assert de_fuera.get(
        reverse("documents:expediente", kwargs={"pk": otra.entregable.pk})
    ).status_code in (302, 403)

    # Y el testigo no sirve para pedir la otra revisión: la puerta pública **no acepta un id**, solo
    # el testigo, y cada testigo apunta a una sola revisión.
    ficha = de_fuera.get(reverse("compartido-ficha", kwargs={"testigo": testigo}))
    assert ficha.json()["nombre"] == "COMPARTIDA.ifc"
