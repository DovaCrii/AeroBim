"""**«Hecho» tiene que salir de una fila, no de una suposición.**

La tarjeta de arranque de la portada dice por dónde seguir, cuál es el siguiente paso y cuáles ya
están hechos. Lo último es lo que puede mentir, y mentir aquí es caro: una pantalla que da por hecho
algo que no se hizo enseña a desconfiar de todo lo demás que dice.

## Lo que este archivo sujeta, y por qué cada cosa

1. **Que `hecho` se mide.** Escribir una observación marca su paso; no escribirla no lo marca. Las
   dos mitades, porque una marca que siempre sale es tan inútil como una que nunca sale.
2. **Que los pasos sin rastro no se marcan nunca.** Seis de los nueve no dejan nada en la base
   —mirar, medir, descargar, importar—, así que **no se afirman**. El plan pedía una barra de
   «llevas 3 de 9» y sobre ese denominador le habría dicho «1 de 9» a quien lleva siete.
3. **Que el sitio es el del recorrido entero.** Para quien coordina, el primero que puede hacer es
   el `1`; para quien solo revisa puede ser el `4`. Renumerar desde uno haría que dos personas no
   pudieran hablar del mismo paso.
4. **Que la consulta es una.** Con tres señales no se nota; con diez se notaría, y para entonces el
   defecto vive en un bucle que nadie mira.
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.arranque import HECHO, PENDIENTE, SIGUIENTE, arranque_para
from apps.accounts.ayuda import PASOS
from apps.documents.models import Observacion

pytestmark = pytest.mark.django_db


def dar(user, *permisos):
    for permiso in permisos:
        app_label, codename = permiso.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


@pytest.fixture
def coordinador(revisor):
    return dar(
        revisor,
        "projects.view_proyecto",
        "documents.add_observacion",
        "documents.view_observacion",
    )


@pytest.fixture
def otro_usuario(proyectista):
    return proyectista


@pytest.fixture
def una_observacion(organizacion, proyecto, proyectista):
    """Escribe una observación. `responsable` cae en otra persona salvo que se diga otra cosa.

    El valor por omisión importa: `responsable` es obligatorio, y si cayera en el propio autor toda
    nota escrita en una prueba contaría además como un reparto.
    """

    def escribir(*, autor, responsable=None, interferencia_con=""):
        return Observacion.objects.create(
            organizacion=organizacion,
            proyecto=proyecto,
            titulo="La viga choca con el ducto",
            autor=autor,
            responsable=responsable or proyectista,
            interferencia_con=interferencia_con,
        )

    return escribir


# --- Que «hecho» se mida -------------------------------------------------------------


def test_sin_haber_escrito_nada_se_empieza_por_el_principio(coordinador):
    arranque = arranque_para(coordinador, cuantas_obras=2)

    assert [uno.numero for uno in arranque.pasos] == [1, 2, 3]
    assert [uno.estado for uno in arranque.pasos] == [SIGUIENTE, PENDIENTE, PENDIENTE]


def test_la_tarjeta_avanza_con_lo_que_la_persona_hizo(coordinador, una_observacion):
    """**El defecto que esta prueba encontró, y que es el motivo del bloque.**

    Enseñando «los tres primeros que puede hacer», para todo el mundo son el 1, el 2 y el 3 —porque
    esos tres no piden permiso—, así que quien lleva medio año coordinando abría su portada y leía
    «1 · Entra en la obra». La tarjeta no avanzaba **nunca**: ocupaba sitio sin decir nada nuevo,
    que es exactamente la pantalla plana de la queja.
    """
    # Asignada a sí mismo **a propósito**: así lo único que marca es el paso de anotar, el 4.
    una_observacion(autor=coordinador, responsable=coordinador)

    arranque = arranque_para(coordinador, cuantas_obras=2)

    # El alcanzado arriba, marcado, y lo que le queda por delante detrás.
    assert [(uno.numero, uno.estado) for uno in arranque.pasos] == [
        (4, HECHO),
        (5, SIGUIENTE),
        (6, PENDIENTE),
    ]


def test_la_nota_de_otro_no_te_adelanta(coordinador, otro_usuario, una_observacion):
    """`autor` y no «existe una observación»: el recorrido es el de esta persona."""
    una_observacion(autor=otro_usuario)

    arranque = arranque_para(coordinador, cuantas_obras=2)

    assert [uno.numero for uno in arranque.pasos] == [1, 2, 3]


def test_asignarse_a_uno_mismo_no_es_repartir(coordinador, una_observacion):
    """**Una nota que uno se asigna a sí mismo es un recordatorio, no un reparto.**

    Contarla adelantaría a esta persona hasta el paso 6 diciendo que ya coordinó a alguien, cuando
    lo único que hizo fue apuntarse algo.
    """
    una_observacion(autor=coordinador, responsable=coordinador)

    arranque = arranque_para(coordinador, cuantas_obras=2)

    assert max(uno.numero for uno in arranque.pasos) < 7


def test_repartirla_a_otro_si_lo_es(coordinador, otro_usuario, una_observacion):
    una_observacion(autor=coordinador, responsable=otro_usuario)

    arranque = arranque_para(coordinador, cuantas_obras=2)

    # Repartido es el 6: arriba el 6 hecho, y por delante el 7 y el 8.
    assert [(uno.numero, uno.estado) for uno in arranque.pasos] == [
        (6, HECHO),
        (7, SIGUIENTE),
        (8, PENDIENTE),
    ]


def test_una_nota_nueva_no_devuelve_a_nadie_al_paso_4(coordinador, otro_usuario, una_observacion):
    """El más avanzado, no el último escrito."""
    una_observacion(autor=coordinador, responsable=otro_usuario)
    una_observacion(autor=coordinador, responsable=coordinador)

    arranque = arranque_para(coordinador, cuantas_obras=2)

    assert arranque.pasos[0].numero == 6


# --- Lo que no se puede medir, no se afirma ------------------------------------------


def test_los_pasos_sin_rastro_no_se_marcan_nunca():
    """**El guardián del plan corregido.**

    Seis de los nueve pasos ocurren enteros en el navegador o son `GET`. Si alguien les pone una
    `senal` sin haber añadido antes de dónde sale, esta prueba lo dice: marcar «hecho» lo que no se
    puede comprobar es la barra falsa que este bloque decidió no construir.
    """
    con_senal = {numero for numero, paso in enumerate(PASOS, start=1) if paso.senal is not None}

    assert con_senal == {4, 5, 6}, (
        "cambió qué pasos se dan por comprobables. Si es un paso nuevo, tiene que haber una fila "
        "en la base que lo demuestre y su columna en `_lo_que_ha_hecho`; si no, va sin `senal`."
    )


def test_el_sitio_es_el_del_recorrido_entero(django_user_model):
    """Para quien solo mira, el primero que puede hacer **no** es el paso 1 de todos."""
    solo_mira = dar(
        django_user_model.objects.create_user(username="mandante", password="x" * 14),
        "projects.view_proyecto",
        "documents.view_observacion",
    )

    arranque = arranque_para(solo_mira, cuantas_obras=1)
    numeros = [uno.numero for uno in arranque.pasos]

    assert numeros == sorted(numeros), "los pasos salen desordenados"
    assert arranque.total == len(PASOS) == 9
    # Los tres primeros que puede hacer son el 1, el 2 y el 3, y **se llaman así**. Renumerarlos
    # desde uno haría que su «paso 3» y el de quien coordina fueran cosas distintas.
    assert numeros == [1, 2, 3]


# --- Dónde va la tarjeta -------------------------------------------------------------


def test_quien_no_tiene_obras_la_ve_arriba(coordinador):
    assert arranque_para(coordinador, cuantas_obras=0).destacado is True


def test_quien_ya_anoto_la_ve_abajo(coordinador, una_observacion):
    """Con obra y con su primera nota escrita, ya no está empezando.

    Ponerla arriba para todos empujaría «Tus obras» hacia abajo cada día, que es la superficie de
    trabajo de verdad, para ayudar una vez a quien entra.
    """
    una_observacion(autor=coordinador)

    assert arranque_para(coordinador, cuantas_obras=3).destacado is False


# --- Que no se dispare en consultas --------------------------------------------------


def test_todas_las_senales_en_una_sola_consulta(coordinador, una_observacion, otro_usuario):
    una_observacion(autor=coordinador, responsable=otro_usuario)

    with CaptureQueriesContext(connection) as consultas:
        arranque_para(coordinador, cuantas_obras=2)

    # Las de permisos las cachea Django tras la primera; lo que se mide es que las tres señales no
    # sean tres `exists()`.
    sobre_observaciones = [
        una["sql"] for una in consultas.captured_queries if "observacion" in una["sql"].lower()
    ]
    assert len(sobre_observaciones) == 1, sobre_observaciones


def test_a_quien_no_le_toca_ninguna_senal_no_se_le_consulta(django_user_model):
    """Un mandante no ve ninguno de los tres pasos marcables: no hay nada que medir."""
    solo_obras = dar(
        django_user_model.objects.create_user(username="visita", password="x" * 14),
        "projects.view_proyecto",
    )

    with CaptureQueriesContext(connection) as consultas:
        arranque_para(solo_obras, cuantas_obras=1)

    assert not [una for una in consultas.captured_queries if "observacion" in una["sql"].lower()], (
        "se consultó la tabla de observaciones para alguien que no puede tener ninguna"
    )
