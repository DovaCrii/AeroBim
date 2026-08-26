"""Qué revisiones puede abrir el visor.

Vive en su propio módulo —tres líneas— porque lo necesitan **las dos orillas de la costura**:
la pantalla del expediente, para ofrecer el enlace, y la API, para listar lo abrible. Puesto
en cualquiera de las dos, la otra tendría que importarla y `api.py` ya importa de `views.py`:
sería un ciclo.
"""

from pathlib import Path

# **La extensión decide**, que es la misma regla que ya usa la aplicación al soltar un
# archivo: un DXF entra como plano de referencia y un IFC como modelo, y son dos formatos que
# no se parecen en nada. Un PDF no está aquí porque su visor es otro (`F8.6`).
EXTENSIONES_ABRIBLES = ("dxf", "ifc")


def es_abrible(revision) -> bool:
    """`True` si el visor sabe abrir el archivo de esta revisión."""
    nombre = revision.nombre_original or ""
    return Path(nombre).suffix.lower().lstrip(".") in EXTENSIONES_ABRIBLES
