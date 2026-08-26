"""Validacion IDS: `F3.5`.

Lo que se prueba no es que `ifctester` funcione —es su trabajo, no el nuestro— sino **las tres
decisiones que hacen que el resultado no mienta**, y las tres salieron de mirar su informe crudo:

1. **"No aplica" no es "cumple".** Una especificacion cuyo conjunto de elementos no existe en el
   modelo sale de `ifctester` con `status: True` y `is_skipped: True`.
2. **Si no aplico ninguna, no se cumple nada**: un IDS de otra disciplina no dice nada del modelo.
3. **El informe crudo no se guarda**: son casi un mega para un modelo mediano.

Los fixtures son un IFC y un IDS **escritos a mano**, minimos, con un caso por cada estado.

> **El aviso de `PytestUnraisableExceptionWarning` que sale de aqui es de `ifcopenshell`**, no
> nuestro: su `file.__del__` levanta un `KeyError` que Python ya ignora y pytest eleva a aviso. No
> se filtra a proposito —ver el comentario en `pyproject.toml`—: el filtro de pytest separa sus
> campos por dos puntos y el mensaje lleva uno, asi que lo unico posible seria un patron ancho que
> **taparia tambien una excepcion no elevada de nuestro codigo**. Se queda a la vista y nombrado.
"""

import json

import pytest

from apps.documents.ids import CUMPLE, FALLA, NO_APLICA, TOPE_DE_FALLOS, validar


def guid(semilla: str) -> str:
    """Un GUID de IFC con el largo que de verdad tiene: **22 caracteres**.

    Se compone y no se teclea porque la primera version del fixture los escribio a mano con 21, y la
    comprobacion de forma del formulario —que exige 22, como el formato— los rechazaba. La prueba
    fallo por el fixture, no por el codigo, y eso es tiempo perdido dos veces: una en escribirlo y
    otra en creer que el codigo estaba mal.
    """
    return (semilla + "0" * 22)[:22]


PROYECTO = guid("proyecto")
VIGA_CON_NOMBRE = guid("viga1")
VIGA_SIN_NOMBRE = guid("viga2")
MURO = guid("muro1")

IFC = f"""\
ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('prueba','2026-08-26T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('{PROYECTO}',$,'Proyecto',$,$,$,$,(#20),#10);
#10=IFCUNITASSIGNMENT((#11));
#11=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
#40=IFCBEAM('{VIGA_CON_NOMBRE}',$,'Viga con nombre',$,$,$,$,$,$);
#41=IFCBEAM('{VIGA_SIN_NOMBRE}',$,$,$,$,$,$,$,$);
#50=IFCWALL('{MURO}',$,'Muro',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
"""


def escribir_ifc(tmp_path):
    ruta = tmp_path / "modelo.ifc"
    ruta.write_text(IFC, encoding="utf-8")
    return ruta


def ids_con(especificaciones) -> str:
    """Un IDS valido, armado con la propia API de `ifctester`.

    **Escrito con su API y no a mano**: el XSD de IDS tiene detalles que un archivo tecleado acierta
    por casualidad, y una prueba que falla porque el fixture esta mal no dice nada del codigo.
    """
    from ifctester import ids as idsmod

    documento = idsmod.Ids(title="Requisito de prueba", author="prueba@ejemplo.cl", version="1.0")
    for una in especificaciones:
        documento.specifications.append(una)
    return documento.to_string()


def escribir_ids(tmp_path, especificaciones, nombre="requisito.ids"):
    ruta = tmp_path / nombre
    ruta.write_text(ids_con(especificaciones), encoding="utf-8")
    return ruta


def spec_vigas_con_nombre():
    from ifctester import ids as idsmod

    una = idsmod.Specification(name="Las vigas llevan nombre", ifcVersion=["IFC4"])
    una.applicability.append(idsmod.Entity(name="IFCBEAM"))
    una.requirements.append(idsmod.Attribute(name="Name"))
    return una


def spec_muros_con_pset_inventado():
    from ifctester import ids as idsmod

    una = idsmod.Specification(name="Los muros llevan su fase", ifcVersion=["IFC4"])
    una.applicability.append(idsmod.Entity(name="IFCWALL"))
    una.requirements.append(
        idsmod.Property(
            propertySet="Pset_AeroBim_Control", baseName="FaseDeObra", dataType="IfcLabel"
        )
    )
    return una


def spec_que_no_aplica():
    from ifctester import ids as idsmod

    una = idsmod.Specification(name="Las cubiertas llevan nombre", ifcVersion=["IFC4"])
    una.applicability.append(idsmod.Entity(name="IFCROOF"))
    una.requirements.append(idsmod.Attribute(name="Name"))
    return una


# --- Las tres decisiones -------------------------------------------------------------


def test_una_especificacion_que_no_aplica_no_cuenta_como_cumplida(tmp_path):
    """**Es la decision numero uno.** `ifctester` la devuelve con `status: True`, y contarla como
    cumplida diria que el modelo satisface un requisito que **nunca se comprobo** — el numero que
    alguien mira antes de aprobar una etapa."""
    resultado = validar(escribir_ids(tmp_path, [spec_que_no_aplica()]), escribir_ifc(tmp_path))

    assert "error" not in resultado
    [detalle] = resultado["detalle"]
    assert detalle["estado"] == NO_APLICA
    assert resultado["noAplicaron"] == 1
    assert resultado["aplicaron"] == 0


def test_si_no_aplico_ninguna_no_se_cumple_nada(tmp_path):
    """**Decision numero dos.** Un IDS escrito para otra disciplina da cero comprobaciones y "todo
    bien"; lo que corresponde decir es que no se comprobo nada."""
    resultado = validar(escribir_ids(tmp_path, [spec_que_no_aplica()]), escribir_ifc(tmp_path))

    assert resultado["cumple"] is False
    assert resultado["seComprobo"] is False


def test_el_informe_crudo_no_se_guarda(tmp_path):
    """**Decision numero tres.** El informe de `ifctester` incluye la linea STEP completa de cada
    elemento que falla: casi un mega para un modelo de 24 MB. Lo que se guarda es el resumen, y de
    cada fallo **solo lo que sirve para actuar**."""
    resultado = validar(
        escribir_ids(tmp_path, [spec_muros_con_pset_inventado()]), escribir_ifc(tmp_path)
    )

    fallo = resultado["detalle"][0]["requisitos"][0]["fallos"][0]
    # El GUID esta —es la identidad estable y lo que ancla una observacion— y la linea STEP no.
    assert fallo["guid"] == MURO
    assert set(fallo) == {"guid", "clase", "nombre", "motivo"}
    # Y el resumen entero cabe en algo que se puede guardar sin pensarlo.
    assert len(json.dumps(resultado)) < 8000


# --- Los tres estados ----------------------------------------------------------------


def test_una_especificacion_que_falla_dice_que_falla_y_por_que(tmp_path):
    resultado = validar(
        escribir_ids(tmp_path, [spec_muros_con_pset_inventado()]), escribir_ifc(tmp_path)
    )

    assert resultado["cumple"] is False
    assert resultado["seComprobo"] is True
    [detalle] = resultado["detalle"]
    assert detalle["estado"] == FALLA
    assert (detalle["aplicables"], detalle["fallan"]) == (1, 1)
    requisito = detalle["requisitos"][0]
    assert requisito["cumple"] is False
    # El motivo es lo que dice que hay que arreglar, y viene de `ifctester` en sus palabras.
    assert requisito["fallos"][0]["motivo"]
    assert requisito["fallos"][0]["clase"] == "IfcWall"


def test_una_especificacion_que_se_cumple_a_medias_falla(tmp_path):
    """El modelo tiene **dos vigas y una sin nombre**. Una especificacion que se cumple en el 50 %
    no se cumple: el requisito es por elemento."""
    resultado = validar(escribir_ids(tmp_path, [spec_vigas_con_nombre()]), escribir_ifc(tmp_path))

    [detalle] = resultado["detalle"]
    assert detalle["estado"] == FALLA
    assert (detalle["aplicables"], detalle["pasan"], detalle["fallan"]) == (2, 1, 1)
    # Y se nombra **cual** falla, por su GUID.
    assert detalle["requisitos"][0]["fallos"][0]["guid"] == VIGA_SIN_NOMBRE


def test_mezclando_los_tres_estados_el_veredicto_es_que_no_cumple(tmp_path):
    """Una que falla, una que no aplica: **el veredicto lo decide la que falla**, y las tres se
    informan por separado para que se vea de que se compone."""
    resultado = validar(
        escribir_ids(
            tmp_path,
            [spec_vigas_con_nombre(), spec_muros_con_pset_inventado(), spec_que_no_aplica()],
        ),
        escribir_ifc(tmp_path),
    )

    assert resultado["cumple"] is False
    assert resultado["especificaciones"] == 3
    assert resultado["fallaron"] == 2
    assert resultado["noAplicaron"] == 1
    estados = [una["estado"] for una in resultado["detalle"]]
    assert estados.count(FALLA) == 2
    assert estados.count(NO_APLICA) == 1


def test_un_requisito_que_se_cumple_del_todo_cumple(tmp_path):
    """El caso bueno, con un modelo cuyas dos vigas llevan nombre."""
    ifc_bueno = IFC.replace(
        f"#41=IFCBEAM('{VIGA_SIN_NOMBRE}',$,$,$,$,$,$,$,$);",
        f"#41=IFCBEAM('{VIGA_SIN_NOMBRE}',$,'Viga dos',$,$,$,$,$,$);",
    )
    ruta_ifc = tmp_path / "bueno.ifc"
    ruta_ifc.write_text(ifc_bueno, encoding="utf-8")

    resultado = validar(escribir_ids(tmp_path, [spec_vigas_con_nombre()]), ruta_ifc)

    assert resultado["cumple"] is True
    assert resultado["seComprobo"] is True
    assert resultado["detalle"][0]["estado"] == CUMPLE
    assert resultado["detalle"][0]["requisitos"][0]["fallos"] == []


# --- Los bordes ----------------------------------------------------------------------


def test_la_lista_de_fallos_se_recorta_y_el_conteo_no(tmp_path):
    """Con cientos de elementos fallando, la lista completa son cientos de kilobytes y nadie la lee.
    **Lo que no se recorta es el numero**, que es lo que dice el tamaño real del problema."""
    cuerpo = "\n".join(
        f"#{100 + i}=IFCWALL('{guid(f'm{i}')}',$,'Muro {i}',$,$,$,$,$,$);"
        for i in range(TOPE_DE_FALLOS + 15)
    )
    ifc_muchos = IFC.replace(f"#50=IFCWALL('{MURO}',$,'Muro',$,$,$,$,$,$);", cuerpo)
    ruta_ifc = tmp_path / "muchos.ifc"
    ruta_ifc.write_text(ifc_muchos, encoding="utf-8")

    resultado = validar(escribir_ids(tmp_path, [spec_muros_con_pset_inventado()]), ruta_ifc)

    requisito = resultado["detalle"][0]["requisitos"][0]
    assert requisito["totalFallan"] == TOPE_DE_FALLOS + 15
    assert len(requisito["fallos"]) == TOPE_DE_FALLOS
    assert requisito["fallosRecortados"] == 15


def test_un_ids_que_no_se_puede_leer_no_levanta(tmp_path):
    ruta = tmp_path / "roto.ids"
    ruta.write_text("esto no es un IDS\n", encoding="utf-8")

    resultado = validar(ruta, escribir_ifc(tmp_path))
    assert "error" in resultado
    assert "detalle" not in resultado


def test_un_ifc_que_no_se_puede_abrir_no_levanta(tmp_path):
    ruta_ifc = tmp_path / "roto.ifc"
    ruta_ifc.write_text("tampoco es un IFC\n", encoding="utf-8")

    resultado = validar(escribir_ids(tmp_path, [spec_vigas_con_nombre()]), ruta_ifc)
    assert "error" in resultado


def test_un_ids_sin_especificaciones_se_rechaza_como_ids_invalido(tmp_path):
    """**No es un IDS.** El XSD de buildingSMART exige al menos una especificacion, asi que un
    archivo vacio no llega ni a validarse.

    La prueba se escribio al reves —esperando "no comprobo nada"— y `ifctester` la corrigio: la
    forma correcta de contestar a un requisito vacio es decir que el archivo esta mal, no que el
    modelo no cumple. Se conserva porque distingue las dos cosas.
    """
    ruta = tmp_path / "vacio.ids"
    ruta.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<ids xmlns="http://standards.buildingsmart.org/IDS">'
        "<info><title>Sin nada</title></info><specifications/></ids>\n",
        encoding="utf-8",
    )

    resultado = validar(ruta, escribir_ifc(tmp_path))
    assert "error" in resultado
    assert "detalle" not in resultado


@pytest.mark.django_db
def test_un_ids_se_acepta_como_carga(tmp_path):
    """El requisito entra por el mismo camino que cualquier archivo: extension y contenido de texto.

    Se comprueba aqui y no en el modulo de carga porque **la extension `ids` se añadio para esto**:
    sin ella, subir el requisito del proyecto se rechazaba como formato no aceptado.
    """
    from apps.documents.storage import validar as validar_carga

    extension, sha = validar_carga("requisito.ids", ids_con([spec_vigas_con_nombre()]).encode())
    assert extension == "ids"
    assert len(sha) == 64
