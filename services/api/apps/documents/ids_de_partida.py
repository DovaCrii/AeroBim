"""Un IDS de partida escrito desde lo que el modelo trae de verdad: `F3.10`.

**No hay archivo `.ids` y eso era lo que faltaba.** Subirlo y validar contra el ya funciona desde
`F3.5`; lo que nadie tiene es el archivo, y escribirlo a ciegas produce una de dos cosas: un
requisito que el modelo ya cumple entero —que no dice nada— o uno que no cumple en absoluto, que se
ignora desde el primer dia. Los dos enseñan a no mirar el informe de validacion.

Asi que se genera **desde la medicion**: `cobertura.py` dice que pset trae cada clase y en cuantos
elementos, y aca se proponen como requisito **solo los que estan en la franja alta pero
incompleta**. Eso es una brecha real: el proyecto ya lo hace casi siempre, y exigirlo lo cierra.

**Es un punto de partida y va dicho en el propio archivo.** El IDS lleva su proposito escrito en el
`purpose`, y cada especificacion su descripcion con los numeros de los que salio: quien lo reciba ve
que se propuso «802 de 805» y puede quitar lo que no quiera exigir. Un requisito que llega sin
explicacion se firma sin leer o se rechaza entero.

**Se escribe a mano con `ElementTree`**, por los mismos dos motivos que el BCF: es un XML pequeño
con un esquema fijo, y asi el oraculo es independiente — `ifctester` esta instalado y **valida en
las pruebas el archivo que escribimos**. Generar y comprobar con la misma libreria solo diria que
es consistente consigo misma.
"""

from xml.etree import ElementTree as ET  # nosec B405 - solo se serializa; ver `bcf.py`

#: El espacio de nombres del estandar y su esquema. Los fija buildingSMART.
NS_IDS = "http://standards.buildingsmart.org/IDS"
NS_XSI = "http://www.w3.org/2001/XMLSchema-instance"
ESQUEMA = "http://standards.buildingsmart.org/IDS/1.0/ids.xsd"

#: Version de IFC que declara cada especificacion.
#:
#: **Se declara la del propio modelo**, no una fija: un IDS que dice `IFC4` no aplica a un archivo
#: IFC2X3 —`ifctester` lo marca como no aplicable— y el informe saldria vacio diciendo que cumple.
#: Es exactamente el fallo que `F3.5` ya documento: «si no aplico ninguna, no se cumple nada».
ESQUEMAS_IDS = {"IFC2X3": "IFC2X3", "IFC4": "IFC4", "IFC4X3": "IFC4X3_ADD2"}


def generar(medicion: dict, titulo: str, autor: str) -> bytes:
    """El IDS de partida, en bytes listos para guardar o descargar.

    `medicion` es lo que devuelve {@link apps.documents.cobertura.medir}. Si no trae ni un candidato
    se levanta: **un IDS sin especificaciones es invalido** segun el propio XSD, y devolver un
    archivo que ninguna herramienta acepta seria peor que decir que no hay nada que proponer.
    """
    candidatas = list(_candidatas(medicion))
    if not candidatas:
        raise ValueError(
            "El modelo no ofrece ningun requisito que proponer: o ya trae todos sus psets "
            "completos, o no trae ninguno. Un IDS sin especificaciones es invalido."
        )

    esquema_ifc = ESQUEMAS_IDS.get((medicion.get("esquema") or "").upper(), "IFC4")

    raiz = ET.Element(
        "ids",
        {
            "xmlns": NS_IDS,
            "xmlns:xs": "http://www.w3.org/2001/XMLSchema",
            "xmlns:xsi": NS_XSI,
            "xsi:schemaLocation": f"{NS_IDS}/ids.xsd {ESQUEMA}",
        },
    )

    info = ET.SubElement(raiz, "info")
    ET.SubElement(info, "title").text = titulo
    ET.SubElement(info, "author").text = autor
    # **El proposito va escrito en el archivo.** Un requisito que llega sin explicacion se firma sin
    # leer o se rechaza entero; con esto, quien lo recibe sabe que es una propuesta medida.
    ET.SubElement(info, "purpose").text = (
        "Punto de partida generado desde lo que el modelo ya trae. Cada especificacion propone un "
        "pset que aparece en la mayoria de los elementos de su clase pero no en todos: es una "
        "brecha real, no una exigencia inventada. Revisar y quitar lo que no se quiera exigir "
        "antes de acordarlo con el mandante."
    )

    especificaciones = ET.SubElement(raiz, "specifications")
    for clase, pset, veces, cuantos in candidatas:
        _especificacion(especificaciones, clase, pset, veces, cuantos, esquema_ifc)

    cabecera = b'<?xml version="1.0" encoding="UTF-8"?>\n'
    return cabecera + ET.tostring(raiz, encoding="utf-8")


def _candidatas(medicion: dict):
    """`(clase, pset, veces, cuantos)` de cada pset que merece ser requisito, el mejor primero."""
    for clase in medicion.get("clases", []):
        for pset in clase.get("psets", []):
            if pset.get("candidato"):
                yield clase["clase"], pset["nombre"], pset["cuantos"], clase["cuantos"]


def _especificacion(padre, clase: str, pset: str, veces: int, cuantos: int, esquema: str) -> None:
    """Una especificacion: **a que se aplica** y **que se le exige**.

    El orden de los hijos lo fija el XSD —`applicability` antes de `requirements`— igual que en el
    BCF: un lector estricto rechaza el archivo entero si llegan al reves.
    """
    # **`description` es un atributo y no un hijo**, y `specification` no acepta `minOccurs`. Lo
    # dijo el propio XSD al validar: su grupo de atributos es `name`, `ifcVersion`, `identifier`,
    # `description` e `instructions`, y sus hijos solo `applicability` y `requirements`.
    spec = ET.SubElement(
        padre,
        "specification",
        {
            "name": f"{clase} trae {pset}",
            "ifcVersion": esquema,
            "description": (
                f"Propuesto porque {veces} de {cuantos} elementos de {clase} ya lo traen "
                f"({veces / cuantos:.0%}). Los que faltan son la brecha."
            ),
        },
    )

    # `minOccurs=1` sobre la aplicabilidad significa «esto tiene que aplicar a algo»: si el modelo
    # no trae ni un elemento de esa clase, el informe lo dice en vez de callar.
    aplicabilidad = ET.SubElement(
        spec, "applicability", {"minOccurs": "1", "maxOccurs": "unbounded"}
    )
    entidad = ET.SubElement(aplicabilidad, "entity")
    _valor_simple(ET.SubElement(entidad, "name"), clase)

    requisitos = ET.SubElement(spec, "requirements")
    # **Se exige que el pset exista, no un valor concreto.** Exigir el valor seria decidir por el
    # proyectista cual debe ser, y eso no lo sabe el modelo ni lo sabe esta funcion: lo acuerda el
    # mandante. Lo que si es objetivo es que el dato **este**.
    propiedad = ET.SubElement(requisitos, "property", {"dataType": "IFCLABEL"})
    _valor_simple(ET.SubElement(propiedad, "propertySet"), pset)
    _valor_simple(ET.SubElement(propiedad, "baseName"), "Reference")


def _valor_simple(padre, texto: str) -> None:
    """`<simpleValue>` con su texto: la forma en que IDS escribe «exactamente este valor»."""
    ET.SubElement(padre, "simpleValue").text = texto
