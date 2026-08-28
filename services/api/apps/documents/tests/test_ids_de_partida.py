"""El IDS de partida, generado desde lo que el modelo trae: `F3.10`.

**El oraculo es la libreria de otro.** El archivo se escribe a mano con `ElementTree` y se lee de
vuelta con `ifctester` —la implementacion de referencia, ya instalada— igual que el BCF se lee con
`bcf-client`. Generar y comprobar con la misma libreria solo diria que es consistente consigo misma.

Y hay una prueba que cierra el circulo: el IDS generado **valida contra el modelo del que salio**, y
da cobertura conocida —ni cero ni cien por cien—. Es el oraculo que el plan declaro para este
bloque.
"""

from pathlib import Path

import pytest

from apps.documents.cobertura import medir
from apps.documents.ids_de_partida import generar

# --- Un modelo minimo, escrito a mano ------------------------------------------------
#
# Cinco vigas: cuatro con su pset y una sin el. Es el escenario que interesa —cobertura alta pero
# incompleta— y son cinco porque `MINIMO_DE_ELEMENTOS` es cinco: con cuatro, «tres de cuatro» no es
# una tendencia sino una anecdota, y el modulo no propone nada.

CABECERA = """\
ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('prueba','2026-08-28T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaa0',$,'Prueba',$,$,$,$,(#20),#10);
#10=IFCUNITASSIGNMENT((#11));
#11=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
"""


def viga(indice: int, con_pset: bool) -> str:
    """Una viga, con o sin `Pset_BeamCommon`. Los identificadores se derivan del indice."""
    guid = f"0viga{indice:017d}"[:22]
    base = f"#{100 + indice}=IFCBEAM('{guid}',$,'Viga {indice}',$,$,$,$,$,$);\n"
    if not con_pset:
        return base
    return base + (
        f"#{200 + indice}=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('IPE200'),$);\n"
        f"#{300 + indice}=IFCPROPERTYSET('0pset{indice:017d}'[:22],$,'Pset_BeamCommon',$,"
        f"(#{200 + indice}));\n"
        f"#{400 + indice}=IFCRELDEFINESBYPROPERTIES('0rel{indice:018d}'[:22],$,$,$,"
        f"(#{100 + indice}),#{300 + indice});\n"
    )


def modelo(cuantas: int, con_pset: int) -> str:
    """`cuantas` vigas, de las cuales `con_pset` traen su pset."""
    cuerpo = "".join(viga(i, con_pset=i < con_pset) for i in range(cuantas))
    return CABECERA + cuerpo + "ENDSEC;\nEND-ISO-10303-21;\n"


def escribir(tmp_path: Path, texto: str) -> Path:
    ruta = tmp_path / "modelo.ifc"
    ruta.write_text(texto, encoding="utf-8")
    return ruta


# --- La medicion ---------------------------------------------------------------------


def test_se_mide_cuantos_elementos_traen_cada_pset(tmp_path):
    """**Es el paso que permite exigir algo con criterio.** Sin el numero, un requisito se escribe
    a ciegas: o el modelo ya lo cumple entero y no dice nada, o no lo cumple y se ignora."""
    datos = medir(escribir(tmp_path, modelo(cuantas=5, con_pset=4)))

    assert "error" not in datos
    [clase] = [c for c in datos["clases"] if c["clase"] == "IFCBEAM"]
    assert clase["cuantos"] == 5
    [pset] = [p for p in clase["psets"] if p["nombre"] == "Pset_BeamCommon"]
    assert pset["cuantos"] == 4
    assert pset["cobertura"] == 0.8


def test_una_cobertura_total_no_se_propone_como_requisito(tmp_path):
    """Ya se cumple: exigirlo no cambia nada y enseña a no mirar el informe."""
    datos = medir(escribir(tmp_path, modelo(cuantas=5, con_pset=5)))

    [clase] = [c for c in datos["clases"] if c["clase"] == "IFCBEAM"]
    [pset] = [p for p in clase["psets"] if p["nombre"] == "Pset_BeamCommon"]
    assert pset["cobertura"] == 1.0
    assert pset["candidato"] is False


def test_una_cobertura_baja_tampoco(tmp_path):
    """Seria inventarle al proyecto una exigencia que hoy no cumple y que habria que negociar."""
    datos = medir(escribir(tmp_path, modelo(cuantas=10, con_pset=2)))

    [clase] = [c for c in datos["clases"] if c["clase"] == "IFCBEAM"]
    [pset] = [p for p in clase["psets"] if p["nombre"] == "Pset_BeamCommon"]
    assert pset["cobertura"] == 0.2
    assert pset["candidato"] is False


def test_con_pocos_elementos_no_se_propone_nada(tmp_path):
    """Con cuatro vigas, «tres de cuatro» no es una tendencia: es una anecdota."""
    datos = medir(escribir(tmp_path, modelo(cuantas=4, con_pset=3)))

    [clase] = [c for c in datos["clases"] if c["clase"] == "IFCBEAM"]
    [pset] = [p for p in clase["psets"] if p["nombre"] == "Pset_BeamCommon"]
    assert pset["candidato"] is False


def test_un_archivo_que_no_se_puede_leer_no_tumba_la_pantalla(tmp_path):
    ruta = tmp_path / "roto.ifc"
    ruta.write_text("esto no es un IFC", encoding="utf-8")

    assert "error" in medir(ruta)


# --- El IDS generado -----------------------------------------------------------------


@pytest.fixture
def generado(tmp_path):
    medicion = medir(escribir(tmp_path, modelo(cuantas=5, con_pset=4)))
    return generar(medicion, titulo="Requisito de partida", autor="cmunoz@ejemplo.cl")


def test_ifctester_lo_lee_y_encuentra_su_especificacion(generado, tmp_path):
    """**El oraculo independiente.** Si el orden de los hijos o un nombre de elemento estuviera mal,
    esto es lo que lo dice — no nuestro propio codigo."""
    from ifctester import ids

    ruta = tmp_path / "requisito.ids"
    ruta.write_bytes(generado)

    documento = ids.open(str(ruta))

    assert documento.info["title"] == "Requisito de partida"
    assert len(documento.specifications) == 1
    assert "Pset_BeamCommon" in documento.specifications[0].name


def test_el_archivo_dice_de_donde_salio_cada_requisito(generado):
    """**Un requisito que llega sin explicacion se firma sin leer o se rechaza entero.** Con «4 de
    5» escrito en su descripcion, quien lo recibe puede quitar lo que no quiera exigir."""
    texto = generado.decode("utf-8")

    assert "4 de 5" in texto
    assert "punto de partida" in texto.lower()


def test_declara_el_esquema_del_propio_modelo(generado):
    """**No uno fijo.** Un IDS que dice `IFC4` sobre un archivo IFC2X3 no aplica, y `ifctester` lo
    marca como no aplicable: el informe saldria vacio diciendo que cumple. Es el fallo que `F3.5` ya
    documento — «si no aplico ninguna, no se cumple nada»."""
    assert 'ifcVersion="IFC4"' in generado.decode("utf-8")


def test_un_modelo_sin_brechas_no_produce_un_ids_vacio(tmp_path):
    """**Un IDS sin especificaciones es invalido segun el XSD**, y devolver un archivo que ninguna
    herramienta acepta seria peor que decir que no hay nada que proponer. Lo aprendio `F3.5`."""
    medicion = medir(escribir(tmp_path, modelo(cuantas=5, con_pset=5)))

    with pytest.raises(ValueError, match="invalido"):
        generar(medicion, titulo="Vacio", autor="nadie")


def test_el_ids_generado_valida_contra_el_modelo_del_que_salio(generado, tmp_path):
    """**El oraculo que el plan declaro para este bloque**, y el que de verdad importa: el requisito
    no solo es legible, sino que **se comprueba** contra el modelo y da una cobertura conocida — ni
    cero ni cien por cien. Cero significaria que la especificacion no aplica a nada; cien, que no
    habia brecha que exigir.
    """
    from ifctester import ids

    ruta_ids = tmp_path / "requisito.ids"
    ruta_ids.write_bytes(generado)
    ruta_ifc = escribir(tmp_path, modelo(cuantas=5, con_pset=4))

    import ifcopenshell

    documento = ids.open(str(ruta_ids))
    documento.validate(ifcopenshell.open(str(ruta_ifc)))

    [especificacion] = documento.specifications
    # Cuatro vigas lo traen y una no: la que falta es exactamente la brecha que se quería exigir.
    assert len(especificacion.applicable_entities) == 5
    assert len(especificacion.failed_entities) == 1
