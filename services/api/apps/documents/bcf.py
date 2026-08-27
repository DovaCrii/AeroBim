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

#: Campo visual vertical que se escribe cuando la camara no trae el suyo, en grados.
#:
#: **Es el unico numero de este modulo que no sale de un dato nuestro**, y esta porque el XSD lo
#: exige: `FieldOfView` es obligatorio dentro de `PerspectiveCamera`. Sesenta grados es el valor por
#: defecto de todo visor de BIM, asi que es el que menos sorprende; la posicion y la direccion —lo
#: que de verdad dice a donde se miraba— siguen saliendo del dato.
FOV_POR_DEFECTO = 60.0


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


def _camara(raiz: ET.Element, camara: dict) -> None:
    """La camara del viewpoint, si la observacion trae una. `F4.1`.

    **Solo se escribe lo que alguien decidio.** El visor guarda la camara desde la que se vio el
    problema, ya convertida al sistema del IFC; una observacion que no viene del visor —de una
    validacion IDS, de un clic sobre un PDF— no tiene camara y **no se le inventa una**: un BCF que
    abre mirando a un sitio que nadie eligio afirma algo falso.

    **El orden de los hijos importa** aca tambien: el XSD de BCF 2.1 los declara en secuencia.
    """
    tipo = camara.get("tipo")
    if tipo not in ("perspectiva", "ortogonal"):
        return

    # **Se comprueba todo antes de escribir nada**, y no es estilo: escribiendo sobre la marcha, una
    # camara a medias —guardada por una version anterior o por un script— dejaba un
    # `PerspectiveCamera` sin sus hijos obligatorios, y con eso `bcf-client` **se niega a leer el
    # archivo entero**. Un BCF sin camara es utilizable; uno que no abre, no. Lo encontro la prueba.
    vectores = []
    for etiqueta, clave in (
        ("CameraViewPoint", "punto"),
        ("CameraDirection", "direccion"),
        ("CameraUpVector", "arriba"),
    ):
        valor = camara.get(clave)
        if not isinstance(valor, (list, tuple)) or len(valor) != 3:
            return
        try:
            vectores.append((etiqueta, [float(componente) for componente in valor]))
        except (TypeError, ValueError):
            return

    if tipo == "ortogonal":
        try:
            escala = float(camara["escala"])
        except (KeyError, TypeError, ValueError):
            # `ViewToWorldScale` es obligatorio en el XSD, y sin el la ortogonal no se reproduce.
            return

    nodo = ET.SubElement(raiz, "PerspectiveCamera" if tipo == "perspectiva" else "OrthogonalCamera")
    for etiqueta, valor in vectores:
        punto = ET.SubElement(nodo, etiqueta)
        for eje, componente in zip("XYZ", valor, strict=True):
            ET.SubElement(punto, eje).text = repr(componente)

    if tipo == "perspectiva":
        # El campo visual es opcional en nuestro dato y **obligatorio en el XSD**, asi que cuando no
        # se sabe se pone el que usa por defecto todo visor de BIM. Es el unico valor de todo este
        # modulo que no sale de un dato nuestro, y va dicho.
        ET.SubElement(nodo, "FieldOfView").text = repr(
            float(camara.get("campoVisual") or FOV_POR_DEFECTO)
        )
    else:
        ET.SubElement(nodo, "ViewToWorldScale").text = repr(escala)


def _viewpoint(observacion, tema: str) -> str:
    """El punto de vista: el elemento seleccionado, y **la camara solo si alguien la eligio**.

    Ver el docstring del modulo: la camara la trae la observacion cuando se abrio desde el visor
    (`F4.1`), y cuando no la trae no se inventa.
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

    # **Despues de `Components`, no antes**: el XSD de BCF 2.1 declara la secuencia
    # `Components`, `OrthogonalCamera`, `PerspectiveCamera`, y un lector estricto rechaza el
    # viewpoint entero si llegan al reves.
    _camara(raiz, observacion.punto_de_vista or {})
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
