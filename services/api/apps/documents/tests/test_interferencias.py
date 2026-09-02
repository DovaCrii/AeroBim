"""Detectar interferencias: `F5.2`, contra el oraculo del plan.

**El plan pide «un conjunto de prueba con interferencias conocidas y colocadas a proposito; se
cuentan las encontradas y las perdidas».** Ese conjunto es
`apps/web/public/samples/interferencias-a-proposito.ifc`, y trae los cuatro casos con sus
coordenadas escritas dentro del propio archivo:

| Elemento     | Debe salir                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| PILAR-CHOCA  | **Si** — cruza el muro de verdad                                            |
| PILAR-LEJOS  | No — tres metros al este                                                    |
| PILAR-ARRIBA | No — **misma huella, otro nivel**: delata comparar plantas y no volumenes    |
| PILAR-ROZA   | Solo si se admite el roce — apoya contra la cara sin penetrar               |

Lo que importa de estas pruebas no es que la libreria funcione: es que **cuenta lo que encuentra y
lo que descarta**, que es la unica forma de saber si la deteccion sirve.
"""

from pathlib import Path

import pytest
from django.conf import settings

from apps.documents.interferencias import (
    COLISION,
    INTERSECCION,
    Grupo,
    GrupoVacio,
    detectar,
    identidad,
)

# **La raiz del repositorio la sabe `settings`**, y se usa la suya: `REPO_DIR` existe justamente
# porque el SPA vive fuera del arbol de Django, y contar niveles a mano es como se rompe al mover
# un archivo.
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
LEJOS = "0PILARLEJOS00000000000"
ARRIBA = "0PILARARRIBA000000000A"


def muros() -> Grupo:
    return Grupo(ruta=FIXTURE, selector="IfcWallStandardCase")


def pilares() -> Grupo:
    return Grupo(ruta=FIXTURE, selector="IfcColumn")


def test_el_fixture_esta_donde_las_pruebas_lo_buscan():
    """Si alguien lo mueve, esto lo dice antes de que las demas fallen por otro motivo."""
    assert FIXTURE.is_file(), f"no esta {FIXTURE}"


# --- El oraculo -----------------------------------------------------------------------


def test_encuentra_el_que_cruza_y_solo_ese():
    """**Es el oraculo entero en una prueba.** Un detector que encuentra la interferencia buena y
    ademas tres falsas es peor que ninguno."""
    encontradas = detectar(muros(), pilares(), modo=COLISION, admitir_roce=False)

    parejas = {frozenset((i.guid_a, i.guid_b)) for i in encontradas}
    assert parejas == {frozenset((MURO, CHOCA))}


def test_el_pilar_de_otro_nivel_no_sale_aunque_comparta_la_huella():
    """**Es el caso que delata a un detector que compara plantas.** PILAR-ARRIBA se solapa con el
    muro exactamente igual que PILAR-CHOCA visto desde arriba, y en el espacio estan a un metro."""
    encontradas = detectar(muros(), pilares(), modo=COLISION, admitir_roce=False)

    guids = {i.guid_a for i in encontradas} | {i.guid_b for i in encontradas}
    assert ARRIBA not in guids
    assert LEJOS not in guids


def test_el_roce_solo_sale_si_se_admite():
    """**Es lo que le da sentido al parametro.** Un pilar apoyado contra un muro no es un problema
    de obra, y un detector que lo reporta llena la lista de ruido."""
    sin_roce = detectar(muros(), pilares(), modo=COLISION, admitir_roce=False)
    con_roce = detectar(muros(), pilares(), modo=COLISION, admitir_roce=True)

    assert len(sin_roce) == 1
    assert len(con_roce) == 2


def test_el_modo_interseccion_da_lo_mismo_con_su_tolerancia():
    """Y **no lanza el `AssertionError` sin mensaje** de la libreria, porque el envoltorio pasa
    siempre la clave `check_all` que ella exige sin decirlo."""
    encontradas = detectar(muros(), pilares(), modo=INTERSECCION, tolerancia_m=0.002)

    assert {frozenset((i.guid_a, i.guid_b)) for i in encontradas} == {frozenset((MURO, CHOCA))}


# --- Lo que viaja al viewpoint --------------------------------------------------------


def test_cada_interferencia_trae_sus_dos_puntos_y_su_nombre():
    """Los dos puntos **son el marcado del viewpoint** (`F4.5`): el segmento entre ellos es lo que
    se dibuja en el BCF, y llega ya en coordenadas del modelo."""
    [una] = detectar(muros(), pilares(), modo=COLISION, admitir_roce=False)

    assert len(una.punto_a) == 3
    assert len(una.punto_b) == 3
    assert all(isinstance(c, float) for c in una.punto_a)
    assert {una.nombre_a, una.nombre_b} == {"Muro de referencia", "Pilar que choca"}
    assert {una.clase_a, una.clase_b} == {"IfcWallStandardCase", "IfcColumn"}


# --- La trampa que no da un error legible ---------------------------------------------


def test_un_grupo_vacio_se_dice_en_vez_de_reventar():
    """**Pasa facil y el error de la libreria no ayuda.** `Piso 5.ifc` no tiene un solo `IfcWall`
    —son 470 `IfcBuildingElementProxy`— y con un selector que no encuentra nada `ifcclash` lanza un
    `TypeError` sobre secuencias de cadenas que no menciona ni los grupos ni los selectores."""
    vacio = Grupo(ruta=FIXTURE, selector="IfcDuctSegment")

    with pytest.raises(GrupoVacio) as fallo:
        detectar(muros(), vacio)
    # Y dice **cual** de los dos lados, que es lo que hace falta para arreglarlo.
    assert "grupo B" in str(fallo.value)
    assert "IfcDuctSegment" in str(fallo.value)

    with pytest.raises(GrupoVacio) as al_reves:
        detectar(vacio, pilares())
    assert "grupo A" in str(al_reves.value)


# --- La identidad, que es lo que permite volver a correr ------------------------------


def test_la_identidad_no_depende_del_orden_de_la_pareja():
    """Comparar A contra B y B contra A da el mismo conflicto con los elementos al reves: si el
    orden contara, la misma interferencia se abriria dos veces."""
    from apps.documents.interferencias import Interferencia

    def con(a, b):
        return Interferencia(
            guid_a=a,
            guid_b=b,
            clase_a="",
            clase_b="",
            nombre_a="",
            nombre_b="",
            punto_a=[0, 0, 0],
            punto_b=[0, 0, 0],
            distancia=0.0,
        )

    assert identidad(con(MURO, CHOCA)) == identidad(con(CHOCA, MURO))
    assert identidad(con(MURO, MURO)) == ""
    assert identidad(con("", CHOCA)) == ""


def test_la_identidad_es_la_misma_que_la_del_visor():
    """**Esta escrita dos veces a proposito** —el visor la necesita para agrupar y el servidor para
    no reabrir lo descartado— asi que las dos tienen que dar la misma cadena. Si alguien cambia una,
    esto lo dice."""
    [una] = detectar(muros(), pilares(), modo=COLISION, admitir_roce=False)

    # La regla: los dos GUID ordenados alfabeticamente y unidos por «·».
    esperada = "·".join(sorted((una.guid_a, una.guid_b)))
    assert identidad(una) == esperada
