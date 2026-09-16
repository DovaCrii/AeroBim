"""**De qué clase es un archivo del registro**, para poder buscarlo por ahí.

## Por qué existe

El registro guarda todo lo que se sube y lo ordena por **a qué entregable pertenece**, que es lo
correcto para la trazabilidad: quién emitió qué, en qué revisión y con qué código de idoneidad. Y
es exactamente lo que **no** sirve para encontrar algo, porque quien busca «el levantamiento de la
obra» no sabe de qué entregable cuelga — si lo supiera ya sabría dónde está.

El usuario lo dijo así: «dividirlo en categorías, así es más fácil buscarlo».

## La regla: la categoría sale del archivo, no de un campo que alguien rellena

`Entregable.tipo` ya existe —Plano, Modelo, Informe…— y **no sirve para esto**: lo elige una
persona al planificar, antes de que exista el archivo, y se equivoca. Un entregable marcado como
«Plano» puede acabar con un IFC dentro.

Aquí la categoría se deriva del **nombre real del archivo subido**, que es lo único que no miente.
Es la misma regla que ya decide con qué visor se abre (`abribles.py`), y a propósito: dos formas de
clasificar el mismo archivo acabarían diciendo cosas distintas del mismo objeto.

## Y por qué no es lo mismo que `visor_de()`

Porque contestan preguntas distintas. `visor_de()` dice **con qué se abre** —un DXF y un IFC se
abren con el mismo visor— y esto dice **qué es**, que para quien busca son dos cosas muy distintas:
nadie busca «algo que abra el visor 3D», busca «el modelo» o busca «el plano».
"""

from pathlib import Path

from django.utils.translation import gettext_lazy as _

#: Las cuatro categorías, en el orden en que se enseñan.
#:
#: **El orden no es alfabético: es el de la obra.** Primero el modelo, que es de lo que cuelga todo
#: lo demás; después los planos, que es lo que se emite; después el levantamiento, que es lo que se
#: compara contra el modelo; y al final los documentos, que acompañan.
MODELO = "modelo"
PLANO = "plano"
NUBE = "nube"
DOCUMENTO = "documento"
OTRO = "otro"

NOMBRES = {
    MODELO: _("Models"),
    PLANO: _("2D drawings"),
    NUBE: _("Point clouds"),
    DOCUMENTO: _("Documents"),
    OTRO: _("Other files"),
}

#: Qué dibujo lleva cada una. Son los mismos del visor, que es donde se abren.
ICONOS = {
    MODELO: "i-modelo",
    PLANO: "i-entregable",
    NUBE: "i-nube",
    DOCUMENTO: "i-entregable",
    OTRO: "i-archivos",
}

ORDEN = (MODELO, PLANO, NUBE, DOCUMENTO, OTRO)

#: La extensión decide, igual que en `abribles.py`.
#:
#: `dwg` y `dgn` cuentan como plano aunque el visor solo abra su DXF convertido: **lo que son no
#: cambia porque se pueda abrir o no**. Un DWG que no se pudo convertir sigue siendo un plano, y
#: quien lo busca lo busca entre los planos — esconderlo en «otros» sería castigar al archivo por
#: un fallo del conversor.
_POR_EXTENSION = {
    "ifc": MODELO,
    "ifczip": MODELO,
    "dxf": PLANO,
    "dwg": PLANO,
    "dgn": PLANO,
    "pdf": DOCUMENTO,
    "docx": DOCUMENTO,
    "xlsx": DOCUMENTO,
    "csv": DOCUMENTO,
    "txt": DOCUMENTO,
    "bcf": DOCUMENTO,
    "ids": DOCUMENTO,
    "xml": DOCUMENTO,
}


def categoria_de(revision) -> str:
    """De qué clase es el archivo de esta revisión.

    **Las nubes van primero y se miran por el nombre entero**, que es la trampa del formato:
    `Path("x.copc.laz").suffix` es `.laz`, igual que un LAZ suelto. Los dos son nubes de puntos
    —lo que cambia es si el visor sabe abrirlos, que es otra pregunta y la contesta `abribles.py`—.
    """
    nombre = (revision.nombre_original or "").lower()
    extension = Path(nombre).suffix.lstrip(".")

    if extension in {"laz", "las", "e57", "ply"}:
        return NUBE
    return _POR_EXTENSION.get(extension, OTRO)
