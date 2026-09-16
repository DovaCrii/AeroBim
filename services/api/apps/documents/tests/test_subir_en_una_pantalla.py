"""**Ocho pantallas para poner un archivo en el servidor, y cinco eran andamio.**

## El problema, dicho por quien lo tiene

«No tengo aún para poder subir y dejar guardado nube o modelos para que lo vea el resto del equipo
en el servidor.»

Era cierto aunque todas las piezas existieran: crear la obra → abrirla → añadir una disciplina →
volver a Entregables → Nuevo entregable → siete campos → entrar al expediente → Subir revisión. Las
cinco primeras son cosas que el registro necesita y que quien tiene una nube en el escritorio no
sabe que hay que crear.

## Lo que estas pruebas sujetan

1. **Que no se salte el acotado.** Aquí se **escribe** dentro de la obra que se elija, así que un
   desplegable sin acotar no es una fuga de lectura: es crear cosas en la empresa de otro.
2. **Que la disciplina nueva se cree y la existente se reuse**, sin duplicar.
3. **Que termine en el formulario de subir** y no en una ficha vacía — es a lo que se venía.
4. **Que no guarde el archivo**: eso lo hace `SubirRevisionView`, que es donde está la clave por
   `sha256`, el guardado por tramos y la conversión. Duplicarlo serían sesenta líneas que se
   separan de su original en el primer arreglo.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Membresia, Organizacion
from apps.documents.models import Entregable
from apps.projects.models import Disciplina, Proyecto


def _persona(username, organizacion, permisos=("add_revision", "view_revision", "view_proyecto")):
    usuario = get_user_model().objects.create_user(
        username=username, password="x" * 14, first_name="Ana", last_name="López"
    )
    Membresia.objects.create(organizacion=organizacion, usuario=usuario)
    usuario.user_permissions.add(
        *Permission.objects.filter(
            codename__in=permisos, content_type__app_label__in=("documents", "projects")
        )
    )
    return usuario


@pytest.fixture
def jej(db):
    return Organizacion.objects.create(nombre="JEJ", slug="jej")


@pytest.fixture
def ajena(db):
    return Organizacion.objects.create(nombre="Ajena", slug="ajena")


@pytest.fixture
def obra(jej):
    return Proyecto.objects.create(organizacion=jej, codigo="0001", nombre="test")


@pytest.fixture
def quien_sube(db, jej):
    return _persona("ana", jej)


@pytest.mark.django_db
def test_con_una_disciplina_nueva_se_crea_todo_y_lleva_a_subir(client, jej, obra, quien_sube):
    """**El camino completo en una pantalla.** Lo que se comprueba al final es a dónde manda: si
    terminara en el expediente, quien vino a subir se queda mirando una ficha vacía con el archivo
    todavía en el escritorio."""
    client.force_login(quien_sube)

    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": "",
            "disciplina_nueva": "Estructura",
            "codigo": "0001-EST-MOD-01",
            "titulo": "Modelo de estructura",
            "tipo": "modelo",
        },
    )

    creado = Entregable.objects.get(codigo="0001-EST-MOD-01")
    assert creado.organizacion == jej
    assert creado.disciplina.nombre == "Estructura"
    assert creado.disciplina.codigo == "EST"
    assert creado.responsable == quien_sube
    assert respuesta.status_code == 302
    assert respuesta.url == reverse("documents:subir-revision", kwargs={"pk": creado.pk})


@pytest.mark.django_db
def test_una_disciplina_que_ya_existe_se_reusa(client, jej, obra, quien_sube):
    """**No se duplica.** Con dos «Estructura» en la misma obra, el color y el filtro del tablero
    dejan de decir nada, y nadie sabría cuál usar la próxima vez."""
    ya = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    client.force_login(quien_sube)

    client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": str(ya.pk),
            "disciplina_nueva": "",
            "codigo": "0001-ES-001",
            "titulo": "Plano",
            "tipo": "plano",
        },
    )

    assert Disciplina.objects.filter(proyecto=obra).count() == 1
    assert Entregable.objects.get(codigo="0001-ES-001").disciplina == ya


@pytest.mark.django_db
def test_no_se_puede_subir_a_la_obra_de_otra_empresa(client, jej, ajena, obra, quien_sube):
    """**Aquí se escribe, no se lee.** Un desplegable sin acotar no enseñaría de más: crearía un
    entregable —y después un archivo— dentro de la empresa de otro."""
    de_otros = Proyecto.objects.create(organizacion=ajena, codigo="AJENA", nombre="Ajena")
    client.force_login(quien_sube)

    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(de_otros.pk),
            "disciplina": "",
            "disciplina_nueva": "Estructura",
            "codigo": "INTRUSO",
            "titulo": "Colado",
            "tipo": "modelo",
        },
    )

    assert respuesta.status_code == 400
    assert not Entregable.objects.filter(organizacion=ajena).exists()
    assert not Disciplina.objects.filter(proyecto=de_otros).exists()


@pytest.mark.django_db
def test_una_disciplina_de_otra_obra_propia_tampoco_vale(client, jej, obra, quien_sube):
    """El desplegable está acotado a **las obras de quien mira**, y nada impide enviar a mano una
    disciplina de otra obra suya: el entregable acabaría colgando de una obra y de la disciplina de
    otra, que es un dato incoherente que nadie volvería a mirar."""
    otra = Proyecto.objects.create(organizacion=jej, codigo="0002", nombre="otra")
    de_la_otra = Disciplina.objects.create(proyecto=otra, codigo="AR", nombre="Arquitectura")
    client.force_login(quien_sube)

    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": str(de_la_otra.pk),
            "disciplina_nueva": "",
            "codigo": "CRUZADO",
            "titulo": "Cruzado",
            "tipo": "modelo",
        },
    )

    assert respuesta.status_code == 400
    assert not Entregable.objects.filter(codigo="CRUZADO").exists()


@pytest.mark.django_db
def test_elegir_una_y_escribir_otra_se_rechaza(client, jej, obra, quien_sube):
    """**No es una preferencia ambigua: es una pregunta sin respuesta.** Quedándose con la elegida
    se pierde lo escrito sin decirlo; al revés se crea una duplicada."""
    ya = Disciplina.objects.create(proyecto=obra, codigo="ES", nombre="Estructura")
    client.force_login(quien_sube)

    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": str(ya.pk),
            "disciplina_nueva": "Instalaciones",
            "codigo": "AMBIGUO",
            "titulo": "Ambiguo",
            "tipo": "modelo",
        },
    )

    assert respuesta.status_code == 400
    assert not Entregable.objects.filter(codigo="AMBIGUO").exists()


@pytest.mark.django_db
def test_sin_disciplina_ninguna_de_las_dos_se_rechaza(client, jej, obra, quien_sube):
    client.force_login(quien_sube)

    respuesta = client.post(
        reverse("documents:empezar-a-subir"),
        {
            "proyecto": str(obra.pk),
            "disciplina": "",
            "disciplina_nueva": "",
            "codigo": "SIN",
            "titulo": "Sin disciplina",
            "tipo": "modelo",
        },
    )

    assert respuesta.status_code == 400
    assert not Entregable.objects.filter(codigo="SIN").exists()


@pytest.mark.django_db
def test_con_una_sola_obra_viene_elegida(client, jej, obra, quien_sube):
    """Preguntar entre uno es preguntar por preguntar, y es el caso del piloto."""
    client.force_login(quien_sube)

    contexto = client.get(reverse("documents:empezar-a-subir")).context

    assert contexto["form"].initial.get("proyecto") == obra.pk


@pytest.mark.django_db
def test_sin_ninguna_obra_manda_a_crearla(client, jej, quien_sube):
    """**Es el único caso que esta pantalla no puede resolver de paso.** Una disciplina se inventa
    con un nombre; una obra es una decisión con código, cliente y etapa."""
    quien_sube.user_permissions.add(
        Permission.objects.get(codename="add_proyecto", content_type__app_label="projects")
    )
    client.force_login(quien_sube)

    cuerpo = client.get(reverse("documents:empezar-a-subir")).content.decode()

    assert reverse("projects:nuevo-proyecto") in cuerpo
    assert 'name="codigo"' not in cuerpo, "ofrece un formulario que no se va a poder enviar"


@pytest.mark.django_db
def test_pide_el_permiso_de_emitir(client, jej, obra):
    """`add_revision` y no `view_revision`: lo que se viene a hacer aquí es **subir**, y crear el
    entregable es el medio."""
    solo_mira = _persona("mandante", jej, permisos=("view_revision",))
    client.force_login(solo_mira)

    assert client.get(reverse("documents:empezar-a-subir")).status_code == 403
