"""El comando que convierte interferencias en observaciones: `F5.3` a `F5.5`.

**Lo que se prueba aca no es la deteccion** —eso lo hace `test_interferencias.py` contra el oraculo—
sino **que el conflicto llegue a la coordinacion navegable**: con su ancla, con los dos elementos
aislados y con el segmento dibujado, y sin duplicarse al volver a correr.

Y esa es la apuesta de la fase: **el resultado no es una lista aparte, son observaciones**, asi que
el visor ya sabe abrirlas desde `F4.8` sin una sola pantalla nueva.
"""

from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.documents.models import Idoneidad, Observacion, Revision

FIXTURE = (
    Path(settings.REPO_DIR)
    / "apps"
    / "web"
    / "public"
    / "samples"
    / ("interferencias-a-proposito.ifc")
)

MURO = "0MURO00000000000000000"
CHOCA = "0PILARCHOCA00000000000"


@pytest.fixture
def revision(db, entregable, proyectista, settings, tmp_path):
    """Una revision cuyo archivo **es el fixture del oraculo**, copiado al almacen de la prueba."""
    settings.DOCUMENTS_DIR = tmp_path / "documentos"

    from apps.documents import storage

    contenido = FIXTURE.read_bytes()
    clave = storage.clave_para(
        proyecto_codigo=entregable.proyecto.codigo,
        entregable_codigo=entregable.codigo,
        sha256="f" * 64,
        extension="ifc",
    )
    storage.guardar(clave, contenido)

    return Revision.objects.create(
        entregable=entregable,
        correlativo="A1",
        idoneidad=Idoneidad.A,
        subida_por=proyectista,
        clave_archivo=clave,
        nombre_original="interferencias-a-proposito.ifc",
        sha256="f" * 64,
        es_vigente=True,
    )


def correr(revision, autor, **extra):
    call_command(
        "detectar_interferencias",
        str(revision.pk),
        str(revision.pk),
        "--clase-a",
        "IfcWallStandardCase",
        "--clase-b",
        "IfcColumn",
        "--autor",
        autor.username,
        **extra,
    )


# --- El conflicto llega navegable ----------------------------------------------------


@pytest.mark.django_db
def test_la_interferencia_se_abre_como_observacion_con_su_viewpoint(revision, revisor):
    """**Es el cierre de la fase**: el resultado no es una lista aparte, es un tema del registro con
    su punto de vista ya apuntado, y el visor ya sabe abrirlo."""
    correr(revision, revisor)

    [una] = Observacion.objects.filter(proyecto=revision.entregable.proyecto)

    # El ancla, que es lo que selecciona el elemento al abrirla.
    assert una.ifc_guid in (MURO, CHOCA)
    assert una.interferencia_con in (MURO, CHOCA)
    assert una.ifc_guid != una.interferencia_con

    # **Los dos elementos aislados**: abrirla deja en pantalla el conflicto y nada mas.
    assert una.visibilidad["porDefecto"] is False
    assert set(una.visibilidad["excepciones"]) == {MURO, CHOCA}

    # **El segmento entre los dos puntos de contacto**, que es el marcado del viewpoint.
    assert len(una.marcado) == 1
    assert len(una.marcado[0]["inicio"]) == 3
    assert len(una.marcado[0]["fin"]) == 3


@pytest.mark.django_db
def test_no_se_inventa_una_camara(revision, revisor):
    """**Nadie eligio un punto de vista.** Con la camara vacia el visor encuadra el elemento, que es
    lo que se puede afirmar; una camara inventada abriria mirando a un sitio que nadie decidio."""
    correr(revision, revisor)

    [una] = Observacion.objects.all()
    assert una.punto_de_vista == {}


@pytest.mark.django_db
def test_el_titulo_dice_que_choca_con_que(revision, revisor):
    """Treinta conflictos llamados todos «Interferencia detectada» no se pueden repartir."""
    correr(revision, revisor)

    [una] = Observacion.objects.all()
    assert "Muro de referencia" in una.titulo
    assert "Pilar que choca" in una.titulo
    assert "×" in una.titulo


@pytest.mark.django_db
def test_solo_se_abre_la_interferencia_de_verdad(revision, revisor):
    """El oraculo tiene cuatro pilares y solo uno cruza: si se abrieran cuatro observaciones, la
    herramienta llenaria la coordinacion de ruido en su primera corrida."""
    correr(revision, revisor)

    assert Observacion.objects.count() == 1


# --- Volver a correr, que es lo que decide si se usa dos veces ------------------------


@pytest.mark.django_db
def test_volver_a_correr_no_duplica(revision, revisor):
    """**Es `F5.5`.** La identidad de un conflicto es la pareja de GUID sin orden, y la corrida
    siguiente la reconoce."""
    correr(revision, revisor)
    correr(revision, revisor)

    assert Observacion.objects.count() == 1


@pytest.mark.django_db
def test_un_falso_positivo_descartado_no_vuelve(revision, revisor):
    """**Es lo que decide si la herramienta se abre una segunda vez.** Si cada corrida devolviera
    los mismos falsos positivos ya descartados, nadie la usaria dos veces."""
    correr(revision, revisor)
    una = Observacion.objects.get()
    una.estado = Observacion.DESCARTADA
    una.save(update_fields=["estado"])

    correr(revision, revisor)

    assert Observacion.objects.count() == 1
    assert Observacion.objects.get().estado == Observacion.DESCARTADA


@pytest.mark.django_db
def test_la_pareja_al_reves_es_la_misma(revision, revisor):
    """Comparar A contra B y B contra A da el mismo conflicto con los elementos al reves."""
    correr(revision, revisor)

    call_command(
        "detectar_interferencias",
        str(revision.pk),
        str(revision.pk),
        # Los grupos cambiados de lado.
        "--clase-a",
        "IfcColumn",
        "--clase-b",
        "IfcWallStandardCase",
        "--autor",
        revisor.username,
    )

    assert Observacion.objects.count() == 1


# --- Lo que no se hace en silencio ---------------------------------------------------


@pytest.mark.django_db
def test_en_seco_no_escribe_nada_y_lo_dice(revision, revisor):
    correr(revision, revisor, dry_run=True)

    assert Observacion.objects.count() == 0


@pytest.mark.django_db
def test_un_grupo_vacio_se_dice_con_su_selector(revision, revisor):
    """La libreria lo convierte en un `TypeError` sobre secuencias de cadenas que no menciona ni los
    grupos ni los selectores. Aca es un error de uso, con el selector dentro."""
    with pytest.raises(CommandError) as fallo:
        call_command(
            "detectar_interferencias",
            str(revision.pk),
            str(revision.pk),
            "--clase-a",
            "IfcWallStandardCase",
            "--clase-b",
            "IfcDuctSegment",
            "--autor",
            revisor.username,
        )

    assert "IfcDuctSegment" in str(fallo.value)


@pytest.mark.django_db
def test_un_autor_que_no_existe_se_dice_antes_de_medir_nada(revision):
    """Veinte segundos de deteccion para descubrir despues que el usuario no existe seria el peor
    orden posible."""
    with pytest.raises(CommandError) as fallo:
        correr(revision, type("X", (), {"username": "no-existe"})())

    assert "no-existe" in str(fallo.value)


@pytest.mark.django_db
def test_un_archivo_que_no_esta_en_el_disco_se_dice_sin_buscar_en_la_geometria(
    revision, revisor, settings, tmp_path
):
    """El archivo vive fuera del repositorio: un montaje mal puesto deja la clave apuntando a nada,
    y decirlo aca ahorra buscar el fallo en la libreria de geometria."""
    settings.DOCUMENTS_DIR = tmp_path / "otro-sitio"

    with pytest.raises(CommandError) as fallo:
        correr(revision, revisor)

    assert str(revision.pk) in str(fallo.value)


@pytest.mark.django_db
def test_la_corrida_deja_su_fila_en_el_historial(revision, revisor):
    """Un trabajo que deja de correr **no da error**: simplemente no pasa nada. La fila es la unica
    forma de notarlo — es la leccion que ya esta escrita en `apps/core/jobs.py`."""
    from apps.core.models import JobRun

    correr(revision, revisor)

    corrida = JobRun.objects.filter(command="detectar_interferencias").latest("started_at")
    assert corrida.result == JobRun.RESULT_OK
    assert "1 nuevas" in corrida.summary
