"""Revisar las interferencias de la obra entera, desde su pantalla: `F5.1` a `F5.5`.

**Es el hueco que separaba «la coordinacion funciona» de «se esta usando».** La deteccion existia,
estaba probada contra su oraculo, y se alcanzaba escribiendo dos UUID en una terminal.

Lo que se prueba: que el boton **compare todos los modelos vigentes de la obra** —que es como se
pregunta «¿choca algo?»—, que lo que encuentre caiga entre las observaciones abiertas de la misma
pantalla, que el contrato de permisos se cumpla, y que no se le pueda pedir a la obra de otro.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse

from apps.core.models import Organizacion
from apps.documents.models import Entregable, Idoneidad, Observacion, Revision
from apps.documents.revisar import SELECTOR_POR_DEFECTO, modelos_vigentes, revisar_proyecto
from apps.projects.models import Proyecto

FIXTURE = (
    Path(settings.REPO_DIR)
    / "apps"
    / "web"
    / "public"
    / "samples"
    / "interferencias-a-proposito.ifc"
)

MURO = "0MURO00000000000000000"
CHOCA = "0PILARCHOCA00000000000"


def dar(user, *etiquetas):
    for etiqueta in etiquetas:
        app_label, codename = etiqueta.split(".")
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    return get_user_model().objects.get(pk=user.pk)


def con_modelo(entregable, subida_por, sha: str, correlativo: str = "A1") -> Revision:
    """Una revision vigente cuyo archivo **es el fixture del oraculo**."""
    from apps.documents import storage

    clave = storage.clave_para(
        proyecto_codigo=entregable.proyecto.codigo,
        entregable_codigo=entregable.codigo,
        sha256=sha,
        extension="ifc",
    )
    storage.guardar(clave, FIXTURE.read_bytes())
    return Revision.objects.create(
        entregable=entregable,
        correlativo=correlativo,
        idoneidad=Idoneidad.A,
        subida_por=subida_por,
        clave_archivo=clave,
        nombre_original="interferencias-a-proposito.ifc",
        sha256=sha,
        es_vigente=True,
    )


@pytest.fixture
def dos_modelos(db, entregable, proyectista, settings, tmp_path):
    """Dos entregables de la misma obra, cada uno con su modelo. Es el caso minimo que compara."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"

    otro = Entregable.objects.create(
        organizacion=entregable.organizacion,
        proyecto=entregable.proyecto,
        disciplina=entregable.disciplina,
        codigo=f"{entregable.codigo}-B",
        titulo="El otro modelo",
        responsable=entregable.responsable,
        peso=3,
    )
    return [
        con_modelo(entregable, proyectista, "a" * 64),
        con_modelo(otro, proyectista, "b" * 64),
    ]


def ruta_de(proyecto):
    return reverse("documents:revisar-interferencias", args=[proyecto.pk])


# --- Que se compara -------------------------------------------------------------------


@pytest.mark.django_db
def test_solo_entran_los_modelos_vigentes(dos_modelos, entregable, proyectista):
    """**Revisar contra una revision superada seria abrir conflictos de un modelo que ya nadie
    usa.** Y un PDF no es un modelo, aunque sea la revision vigente de su entregable."""
    from apps.documents import storage

    superada = con_modelo(entregable, proyectista, "c" * 64, correlativo="A0")
    superada.es_vigente = False
    superada.save(update_fields=["es_vigente"])

    Revision.objects.create(
        entregable=entregable,
        correlativo="B1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo=storage.clave_para(
            proyecto_codigo=entregable.proyecto.codigo,
            entregable_codigo=entregable.codigo,
            sha256="d" * 64,
            extension="pdf",
        ),
        nombre_original="memoria.pdf",
        sha256="d" * 64,
        es_vigente=True,
    )

    vigentes = modelos_vigentes(entregable.proyecto)

    # **Queda uno solo, y es lo correcto**: subir el PDF dejó de ser vigente la revisión con el
    # modelo, así que ese entregable ya no aporta nada que comparar. Es el caso real de un
    # entregable cuyo último documento es una memoria y no la geometría.
    assert len(vigentes) == 1
    assert all(r.nombre_original.endswith(".ifc") for r in vigentes)
    assert all(r.es_vigente for r in vigentes)


@pytest.mark.django_db
def test_el_selector_por_defecto_deja_fuera_lo_que_choca_por_construccion():
    """Cada exclusion evita un tipo concreto de falso positivo, y la que mas importa es el hueco:
    **un `IfcOpeningElement` choca con todo por definicion**, porque es el volumen que se resta del
    muro."""
    assert "! IfcOpeningElement" in SELECTOR_POR_DEFECTO
    assert "! IfcFurnishingElement" in SELECTOR_POR_DEFECTO
    assert "! IfcAnnotation" in SELECTOR_POR_DEFECTO


@pytest.mark.django_db
def test_cruza_los_dos_modelos_y_abre_lo_que_encuentra(dos_modelos, revisor):
    """El fixture trae un muro y cuatro pilares, y cruzarlo contra si mismo encuentra la pareja que
    se cruza de verdad."""
    resultado = revisar_proyecto(dos_modelos[0].entregable.proyecto, revisor)

    assert resultado.pares == 1
    # **La deteccion encuentra la pareja dos veces y es un solo problema**, y no es un descuido de
    # la prueba: los dos modelos comparten los GUID —es el mismo archivo dos veces, que es lo que
    # pasa comparando dos revisiones del mismo entregable— asi que sale muro×pilar y pilar×muro.
    assert resultado.encontradas == 2
    # **Lo colapsa la agrupacion de `F5.5`, y antes lo contaba como una repeticion.** Es mas cierto
    # asi: no habia una observacion previa que repetir, habia un conflicto informado dos veces. Y
    # hace falta la regla de la identidad y no la de la proximidad, porque `ifcclash` informa una
    # cara distinta desde cada lado: los dos centros caen a 1,95 m uno del otro.
    assert resultado.cumulos == 1
    assert resultado.abiertas == 1
    assert resultado.repetidas == 0
    assert Observacion.objects.count() == 1


@pytest.mark.django_db
def test_con_un_solo_modelo_no_es_un_fallo(db, entregable, proyectista, settings, tmp_path):
    """Una obra con un solo modelo no tiene nada contra lo que compararlo, y eso se dice en vez de
    fallar."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"
    con_modelo(entregable, proyectista, "a" * 64)

    resultado = revisar_proyecto(entregable.proyecto, proyectista)

    assert resultado.pares == 0
    assert resultado.abiertas == 0


@pytest.mark.django_db
def test_un_modelo_sin_archivo_se_deja_fuera_y_se_dice(dos_modelos, revisor, settings, tmp_path):
    """**Una corrida que compara menos modelos de los que hay y no lo dice deja creer que la obra
    esta limpia.** El archivo vive fuera del repositorio: un montaje mal puesto pasa."""
    settings.DOCUMENTS_DIR = tmp_path / "otro-sitio"

    resultado = revisar_proyecto(dos_modelos[0].entregable.proyecto, revisor)

    assert resultado.pares == 0
    assert len(resultado.sin_archivo) == 2


@pytest.mark.django_db
def test_volver_a_revisar_no_duplica(dos_modelos, revisor):
    """`F5.5`: la identidad de un conflicto es la pareja de GUID sin orden."""
    proyecto = dos_modelos[0].entregable.proyecto
    primera = revisar_proyecto(proyecto, revisor)
    segunda = revisar_proyecto(proyecto, revisor)

    assert segunda.abiertas == 0
    # Todos los problemas que encuentra ya estaban: ninguno nuevo, y el registro no crece. Se
    # comparan **cumulos** y no interferencias, porque una observacion es un cumulo desde `F5.5`.
    assert segunda.repetidas == segunda.cumulos
    assert Observacion.objects.count() == primera.abiertas


@pytest.mark.django_db
def test_en_seco_cuenta_y_no_escribe(dos_modelos, revisor):
    resultado = revisar_proyecto(dos_modelos[0].entregable.proyecto, revisor, seco=True)

    assert resultado.abiertas >= 1
    assert Observacion.objects.count() == 0


# --- Que un cúmulo llega a la lista como una fila. `F5.5`. ----------------------------


@pytest.mark.django_db
def test_veinte_tornillos_contra_la_misma_viga_abren_una_observacion(
    dos_modelos, revisor, monkeypatch
):
    """**Es el punto entero de agrupar**: repartir veinte observaciones de la misma unión
    atornillada entre cuatro personas es peor que no repartir nada.

    La detección se interpone en vez de buscar un IFC con veinte tornillos: lo que se prueba aquí es
    qué hace la corrida con lo que encuentra, y lo que encuentra ya tiene su oráculo aparte.
    """
    from apps.documents import revisar as modulo
    from apps.documents.interferencias import Interferencia

    viga = "2x9ibDgrvAu8y4Yd$Ug4Qu"

    def veinte(*_args, **_kwargs):
        return [
            Interferencia(
                guid_a=viga,
                guid_b=f"0000000000000000000{i:03d}"[:22],
                clase_a="IfcBeam",
                clase_b="IfcMechanicalFastener",
                nombre_a="V-12",
                nombre_b=f"T-{i}",
                # A cinco centímetros uno del otro: la misma unión.
                punto_a=[i * 0.05, 0.0, 0.0],
                punto_b=[i * 0.05, 0.0, 0.02],
                distancia=0.004,
            )
            for i in range(20)
        ]

    monkeypatch.setattr(modulo, "detectar", veinte)
    resultado = revisar_proyecto(dos_modelos[0].entregable.proyecto, revisor)

    assert resultado.encontradas == 20
    assert resultado.cumulos == 1
    assert resultado.abiertas == 1
    assert Observacion.objects.count() == 1

    observacion = Observacion.objects.get()
    # El título dice por dónde empezar: el elemento que hay que ir a mirar y contra cuántos choca.
    assert observacion.titulo == "V-12 × 20 elementos"
    # **Se aísla el problema entero**, no la pareja representante: la viga y los veinte tornillos.
    assert len(observacion.visibilidad["excepciones"]) == 21
    assert viga in observacion.visibilidad["excepciones"]
    # Y un segmento por contacto: dibujar uno solo afirmaría que el problema está en un punto.
    assert len(observacion.marcado) == 20


@pytest.mark.django_db
def test_un_tornillo_mas_no_abre_un_problema_nuevo(dos_modelos, revisor, monkeypatch):
    """**Basta con que una de sus parejas ya se conozca.** El cúmulo es el mismo problema aunque
    haya ganado un miembro: exigir que coincidan todas abriría una observación nueva cada vez que
    alguien mueve un tornillo."""
    from apps.documents import revisar as modulo
    from apps.documents.interferencias import Interferencia

    viga = "2x9ibDgrvAu8y4Yd$Ug4Qu"

    def cuantos(n: int):
        def detectar(*_args, **_kwargs):
            return [
                Interferencia(
                    guid_a=viga,
                    guid_b=f"0000000000000000000{i:03d}"[:22],
                    clase_a="IfcBeam",
                    clase_b="IfcMechanicalFastener",
                    nombre_a="V-12",
                    nombre_b=f"T-{i}",
                    punto_a=[i * 0.05, 0.0, 0.0],
                    punto_b=[i * 0.05, 0.0, 0.02],
                    distancia=0.004,
                )
                for i in range(n)
            ]

        return detectar

    proyecto = dos_modelos[0].entregable.proyecto

    monkeypatch.setattr(modulo, "detectar", cuantos(5))
    revisar_proyecto(proyecto, revisor)

    monkeypatch.setattr(modulo, "detectar", cuantos(6))
    segunda = revisar_proyecto(proyecto, revisor)

    assert segunda.abiertas == 0
    assert segunda.repetidas == 1
    assert Observacion.objects.count() == 1


# --- La pantalla, y su contrato de permisos -------------------------------------------


@pytest.mark.django_db
def test_revisar_pide_add_observacion(client, dos_modelos, proyectista):
    """Es exactamente lo que hace: abrir observaciones. No un permiso nuevo — un rol que puede
    abrir un hallazgo a mano puede mandar buscarlos."""
    ruta = ruta_de(dos_modelos[0].entregable.proyecto)

    client.force_login(dar(proyectista, "documents.view_observacion"))
    assert client.post(ruta).status_code == 403

    client.force_login(dar(proyectista, "documents.add_observacion"))
    assert client.post(ruta).status_code == 302


@pytest.mark.django_db
def test_no_se_revisa_la_obra_de_otra_organizacion(client, proyectista):
    """El permiso dice «puede abrir observaciones», no «puede abrirlas **en esta obra**». Sin acotar
    el queryset, pedir a mano el id de otro cliente le llenaria su registro de hallazgos."""
    ajena = Organizacion.objects.create(nombre="Ajena", slug="ajena")
    proyecto_ajeno = Proyecto.objects.create(
        organizacion=ajena, codigo="999-XXX", nombre="Obra de otro"
    )

    client.force_login(dar(proyectista, "documents.add_observacion"))

    assert client.post(ruta_de(proyecto_ajeno)).status_code == 404


@pytest.mark.django_db
def test_la_pantalla_deja_las_observaciones_donde_ya_vive_la_coordinacion(
    client, dos_modelos, proyectista
):
    """**No hay pantalla de resultados a proposito**: lo que encuentra sale entre las observaciones
    abiertas de la propia pantalla del proyecto, y desde ahi el visor ya sabe abrirlas."""
    proyecto = dos_modelos[0].entregable.proyecto
    # Se siguen las redirecciones hasta la pantalla del proyecto, asi que hace falta poder leerla:
    # el 403 al llegar seria correcto y no diria nada de la corrida.
    client.force_login(
        dar(
            proyectista,
            "documents.add_observacion",
            "documents.view_observacion",
            "projects.view_proyecto",
            "documents.view_entregable",
            "documents.view_revision",
        )
    )

    respuesta = client.post(ruta_de(proyecto), follow=True)

    assert respuesta.status_code == 200
    abiertas = Observacion.objects.filter(proyecto=proyecto)
    assert abiertas.exists()
    # Con su viewpoint ya apuntado: los dos elementos aislados y el segmento dibujado.
    una = abiertas.first()
    assert set(una.visibilidad["excepciones"]) == {MURO, CHOCA}
    assert len(una.marcado) == 1


@pytest.mark.django_db
def test_la_corrida_deja_su_fila_en_el_historial(dos_modelos, revisor):
    """Un trabajo que deja de correr **no da error**: la fila es la unica forma de notarlo."""
    from apps.core.models import JobRun

    revisar_proyecto(dos_modelos[0].entregable.proyecto, revisor)

    corrida = JobRun.objects.filter(command="revisar_interferencias").latest("started_at")
    assert corrida.result == JobRun.RESULT_OK
    # **Concuerda en singular**, y antes decía «1 pares»: el resumen es lo que se lee en la
    # pantalla y en el historial, así que lleva `ngettext` y no un `f-string`.
    assert "1 par ·" in corrida.summary
    assert "2 interferencias en 1 problema" in corrida.summary
