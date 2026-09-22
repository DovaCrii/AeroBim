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


#: Lo que se abre **por su DXF convertido** y no por sí mismo: DWG y DGN.
#:
#: El visor lee un solo formato 2D, y lo que entra al expediente se normaliza al entrar
#: (`docs/FORMATOS.md`). Así que un DWG es abrible **si se pudo convertir**, y no lo es si no —lo
#: cual no es un fallo de la subida: el original sigue guardado y descargable—.
POR_SU_DXF = frozenset({"dwg", "dgn"})


#: Cómo se reconoce una nube que el visor **sí** puede abrir: `F12.13`.
#:
#: El visor lee **COPC** y no un LAZ cualquiera (`docs/NUBES_DE_PUNTOS.md`): un LAZ normal no lleva
#: el octree dentro, así que no se puede pedir por partes — habría que descargarlo entero para ver
#: el primer punto.
#:
#: **Y no se distinguen por la extensión**, que es la trampa: `Path("x.copc.laz").suffix` es
#: `.laz`, igual que un LAZ suelto. Se distinguen por el nombre compuesto, que es la convención del
#: formato y lo que escribe el conversor (`apps/web/scripts/a-copc.py`).
#:
#: Un `.las` o un `.laz` suelto **se archiva igual** —es el original que entregó el topógrafo— y no
#: se ofrece abrir: un enlace que lleva a un visor que no sabe leerlo es peor que no ofrecerlo.
SUFIJO_DE_NUBE_ABRIBLE = ".copc.laz"


def visor_de(revision) -> str | None:
    """Con qué visor se abre esta revisión, o `None` si no se sabe abrir."""
    nombre = revision.nombre_original or ""
    extension = Path(nombre).suffix.lower().lstrip(".")

    # La nube va antes que el resto: su extensión es `.laz`, y hay que mirar el nombre entero.
    if extension in {"laz", "las"}:
        return VISOR_MODELO if nombre.lower().endswith(SUFIJO_DE_NUBE_ABRIBLE) else None

    # **Un DWG sin DXF no es abrible, y con DXF sí.** Mirar solo la extensión diría que sí en los
    # dos casos y llevaría a una pantalla en blanco al que no se pudo convertir.
    if extension in POR_SU_DXF:
        return VISOR_MODELO if getattr(revision, "clave_dxf", "") else None

    return VISOR_POR_EXTENSION.get(extension)


def clave_para_el_visor(revision) -> str:
    """Qué archivo hay que servirle al visor: el DXF convertido si lo hay, o el original.

    **El original se descarga igual desde el expediente.** Esto es solo lo que el visor abre, y son
    dos cosas distintas: el entregable es el DWG que mandó el proyectista, y el DXF es la copia con
    la que se puede mirar.
    """
    return getattr(revision, "clave_dxf", "") or revision.clave_archivo


def nombre_para_el_visor(revision) -> str:
    """El nombre del archivo **que se sirve**, que no siempre es el que subió el proyectista.

    Un DWG se abre por su DXF convertido: `contenido` devuelve bytes de DXF, y hasta ahora los
    devolvía llamándose `planta.dwg`. **El visor elige el lector por la extensión**, así que ese
    nombre le mandaba un DXF al lector de IFC — que espera texto STEP, no lo encuentra, y el
    WebAssembly se cae con `memory access out of bounds` sin decir de qué archivo habla.

    Es el mismo defecto que tenía el arrastre, entrando por la otra puerta: allí era un DWG de
    verdad, aquí un DXF con nombre de DWG. Los dos acababan en `web-ifc`.

    **El nombre original no se pierde**: sigue en `nombre`, que es lo que se enseña y lo que se
    descarga del expediente. Esto es solo con qué abrirlo.
    """
    nombre = revision.nombre_original or ""
    suyo = Path(nombre)
    if suyo.suffix.lower().lstrip(".") in POR_SU_DXF and getattr(revision, "clave_dxf", ""):
        return f"{suyo.stem}.dxf"
    return nombre


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
