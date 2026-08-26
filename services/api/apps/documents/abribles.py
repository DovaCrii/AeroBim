"""Qué revisiones se pueden abrir, y **con qué visor**.

Vive en su propio módulo —son unas pocas líneas— porque lo necesitan **las dos orillas de la
costura**: la pantalla del expediente, para ofrecer el enlace, y la API, para listar lo abrible.
Puesto en cualquiera de las dos, la otra tendría que importarla y `api.py` ya importa de
`views.py`: sería un ciclo.
"""

from pathlib import Path

#: El visor de tres dimensiones: modelos IFC y planos DXF en la misma escena.
VISOR_MODELO = "modelo"
#: El visor de documentos: el PDF con las observaciones dibujadas encima (`F8.6`).
VISOR_DOCUMENTO = "documento"

# **La extensión decide**, que es la misma regla que ya usa la aplicación al soltar un archivo:
# un DXF entra como plano de referencia, un IFC como modelo, y un PDF va a otra pantalla
# entera. No son variantes de lo mismo: el visor 3D carga Three.js y el WASM de `web-ifc`, y
# pagar eso para leer un plano en PDF no tiene sentido — pero además **no sabría abrirlo**.
VISOR_POR_EXTENSION = {
    "ifc": VISOR_MODELO,
    "dxf": VISOR_MODELO,
    "pdf": VISOR_DOCUMENTO,
}

# Los nombres de ruta de cada visor, para que la plantilla no tenga que saber cuál es cuál.
RUTA_POR_VISOR = {
    VISOR_MODELO: "visor:visor",
    VISOR_DOCUMENTO: "visor:documento",
}


def visor_de(revision) -> str | None:
    """Con qué visor se abre esta revisión, o `None` si no se sabe abrir."""
    nombre = revision.nombre_original or ""
    return VISOR_POR_EXTENSION.get(Path(nombre).suffix.lower().lstrip("."))


def es_abrible(revision) -> bool:
    """`True` si **algún** visor sabe abrir el archivo de esta revisión.

    Sirve para decidir si ofrecer un enlace. **No sirve para llenar el selector de un visor
    concreto**: ver {@link abre_en}. Confundir las dos cosas metía PDFs en la lista del visor 3D,
    que los habría llevado a una pantalla en blanco.
    """
    return visor_de(revision) is not None


def abre_en(revision, visor: str) -> bool:
    """`True` si **este** visor sabe abrir esta revisión."""
    return visor_de(revision) == visor
