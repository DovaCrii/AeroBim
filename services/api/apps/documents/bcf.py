"""Exportar las observaciones a **BCF 2.1**: `F4.4`.

**Es lo que hace que una observacion valga fuera de AeroBim.** Un hallazgo anclado al GUID de una
viga es exactamente lo que el mandante necesita abrir en Solibri o en Navisworks; guardado solo aca,
obliga a que todos entren a nuestra pantalla, y eso no pasa.

BCF —BIM Collaboration Format— es el estandar de buildingSMART para eso: un ZIP con un XML por tema.
La version 2.1 es la que **todo el software del mercado lee**; la 3.0 existe y todavia no la lee
todo, asi que se emite 2.1 a proposito.

**Se escribe a mano y no con una libreria**, y es una decision con dos motivos:

1. **Es un ZIP con tres XML pequeños.** `zipfile` y `ElementTree` son de la biblioteca estandar, y
   una dependencia mas —con su licencia, su cadena de actualizaciones y su forma de fallar— no se
   paga por ahorrar cien lineas.
2. **Y asi el oraculo es independiente.** `bcf-client` esta instalado —lo trae `ifcopenshell`— y
   se usa **en las pruebas para leer de vuelta lo que escribimos**. Si escribieramos con su
   serializador y leyeramos con su parser, la prueba solo diria que la libreria es consistente
   consigo misma.

**Y no se inventa una camara.** BCF permite un viewpoint con solo los componentes seleccionados, sin
posicion de camara, y es lo que corresponde: nadie eligio un punto de vista para estas observaciones
—vienen de una validacion IDS o de un clic sobre un documento—. Un BCF que abre en Solibri mirando a
un sitio que nadie decidio es peor que uno que simplemente **selecciona el elemento**: el primero
afirma algo falso, el segundo dice lo que sabe.
"""

import uuid
import zipfile
from io import BytesIO

# `nosec B405`: bandit avisa de que `ElementTree` es vulnerable al parsear XML de terceros —billion
# laughs, entidades externas—, y tiene razon. **Aca solo se serializa**: no hay un solo `parse` ni
# `fromstring` en este modulo, el arbol se construye desde objetos nuestros y sale a bytes.
#
# Si algun dia se importa un BCF de vuelta, esta excepcion deja de valer: el `nosec` se quita y se
# parsea con `defusedxml`. Un archivo BCF llega por correo desde otra oficina, que es exactamente el
# XML no confiable del que habla el aviso.
from xml.etree import ElementTree as ET  # nosec B405

#: Version que se emite. Ver el docstring del modulo.
VERSION = "2.1"

#: El estado de una observacion, en el vocabulario de BCF.
#:
#: BCF no fija los valores —van en `extensions.xml`— pero estos cuatro son los que el software del
#: mercado reconoce sin configurar nada. `Closed` cubre cerrada y descartada porque para quien lo
#: abre son lo mismo: no hay nada que hacer. La diferencia entre las dos vive en nuestro registro,
#: que es donde importa.
ESTADOS = {
    "abierta": "Open",
    "respondida": "Open",
    "cerrada": "Closed",
    "descartada": "Closed",
}

#: La prioridad, igual: los tres valores habituales de BCF.
PRIORIDADES = {"alta": "High", "media": "Normal", "baja": "Low"}


def exportar(observaciones, proyecto_nombre: str) -> bytes:
    """El ZIP de BCF 2.1 con las observaciones que se le pasen.

    Devuelve los bytes: quien llama decide si los manda como descarga o los guarda.
    """
    memoria = BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as zip_bcf:
        zip_bcf.writestr("bcf.version", _version())
        zip_bcf.writestr("project.bcfp", _proyecto(proyecto_nombre))

        for observacion in observaciones:
            # **El GUID del tema es el de la observacion**, no uno nuevo. Asi reimportar el mismo
            # BCF actualiza el tema en vez de duplicarlo, que es lo que pasa cuando cada exportacion
            # inventa identificadores.
            tema = str(observacion.pk)
            zip_bcf.writestr(f"{tema}/markup.bcf", _markup(observacion, tema))
            if observacion.ifc_guid:
                zip_bcf.writestr(f"{tema}/viewpoint.bcfv", _viewpoint(observacion, tema))

    return memoria.getvalue()


def _texto(arbol: ET.Element) -> str:
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(arbol, encoding="unicode")


def _version() -> str:
    raiz = ET.Element("Version", {"VersionId": VERSION})
    ET.SubElement(raiz, "DetailedVersion").text = VERSION
    return _texto(raiz)


def _proyecto(nombre: str) -> str:
    raiz = ET.Element("ProjectExtension")
    proyecto = ET.SubElement(raiz, "Project", {"ProjectId": str(uuid.uuid4())})
    ET.SubElement(proyecto, "Name").text = nombre
    return _texto(raiz)


def _markup(observacion, tema: str) -> str:
    """El tema: que se encontro, quien lo abrio, a quien le toca y para cuando.

    **El orden de los hijos no es libre**: el XSD de BCF 2.1 los declara en secuencia, y un
    `Description` antes de `CreationDate` hace que un lector estricto rechace el archivo entero.
    """
    raiz = ET.Element("Markup")

    topic = ET.SubElement(
        raiz,
        "Topic",
        {
            "Guid": tema,
            "TopicType": "Issue",
            "TopicStatus": ESTADOS.get(observacion.estado, "Open"),
        },
    )
    ET.SubElement(topic, "Title").text = observacion.titulo
    ET.SubElement(topic, "Priority").text = PRIORIDADES.get(observacion.prioridad, "Normal")
    ET.SubElement(topic, "CreationDate").text = observacion.created_at.isoformat()
    ET.SubElement(topic, "CreationAuthor").text = _quien(observacion.autor)
    ET.SubElement(topic, "ModifiedDate").text = observacion.updated_at.isoformat()
    ET.SubElement(topic, "ModifiedAuthor").text = _quien(observacion.autor)
    if observacion.vence is not None:
        ET.SubElement(topic, "DueDate").text = f"{observacion.vence.isoformat()}T00:00:00Z"
    ET.SubElement(topic, "AssignedTo").text = _quien(observacion.responsable)
    if observacion.descripcion:
        ET.SubElement(topic, "Description").text = observacion.descripcion

    # **Los comentarios van con su historial.** Es la mitad del valor de una observacion: la
    # respuesta del proyectista y el cierre del revisor son lo que explica por que esta cerrada.
    for comentario in observacion.comentarios.all():
        nodo = ET.SubElement(raiz, "Comment", {"Guid": str(comentario.pk)})
        ET.SubElement(nodo, "Date").text = comentario.created_at.isoformat()
        ET.SubElement(nodo, "Author").text = _quien(comentario.autor)
        ET.SubElement(nodo, "Comment").text = comentario.texto

    # Y la resolucion, si esta cerrada: es un comentario mas, y el que contesta "como se cerro".
    if observacion.resolucion:
        nodo = ET.SubElement(raiz, "Comment", {"Guid": str(uuid.uuid4())})
        fecha = observacion.cerrada_en or observacion.updated_at
        ET.SubElement(nodo, "Date").text = fecha.isoformat()
        ET.SubElement(nodo, "Author").text = _quien(observacion.cerrada_por or observacion.autor)
        ET.SubElement(nodo, "Comment").text = observacion.resolucion

    if observacion.ifc_guid:
        vista = ET.SubElement(raiz, "Viewpoints", {"Guid": tema})
        ET.SubElement(vista, "Viewpoint").text = "viewpoint.bcfv"

    return _texto(raiz)


def _viewpoint(observacion, tema: str) -> str:
    """El punto de vista: **el elemento seleccionado, y nada mas**.

    Sin camara, a proposito — ver el docstring del modulo. Cuando el visor sepa guardar la camara de
    una observacion (`F4.1`), aqui se añade `PerspectiveCamera`; hasta entonces, seleccionar el
    elemento es todo lo que se puede afirmar.
    """
    raiz = ET.Element("VisualizationInfo", {"Guid": tema})
    componentes = ET.SubElement(raiz, "Components")
    seleccion = ET.SubElement(componentes, "Selection")
    ET.SubElement(seleccion, "Component", {"IfcGuid": observacion.ifc_guid})
    # `Visibility` con `DefaultVisibility` en verdadero: se ve el modelo entero y **el elemento va
    # seleccionado, no aislado**. Aislar decidiria por quien revisa que lo demas no importa, y a
    # veces el problema es justamente el vecino.
    visibilidad = ET.SubElement(componentes, "Visibility", {"DefaultVisibility": "true"})
    ET.SubElement(visibilidad, "Exceptions")
    return _texto(raiz)


def _quien(usuario) -> str:
    """Quien, en el formato que BCF espera: **un correo si lo hay**.

    BCF identifica a las personas por correo, que es lo que permite que el software del otro lado
    sepa a quien esta asignado un tema. Sin correo se pone el nombre de usuario, que al menos es
    legible; inventar una direccion seria peor.
    """
    if usuario is None:
        return ""
    return (usuario.email or "").strip() or usuario.get_username()
