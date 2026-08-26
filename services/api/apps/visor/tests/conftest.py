"""Los mismos fixtures que usa el registro documental: un proyecto con su gente.

Se re-exportan aquí en vez de moverlos a un `conftest.py` de la raíz por una razón concreta:
un fixture global lo carga toda la suite, y estos traen un proyecto entero. Duplicar el
`import` cuesta tres líneas y deja claro de qué depende cada app.
"""

from apps.documents.tests.conftest import (  # noqa: F401
    disciplina,
    entregable,
    organizacion,
    proyectista,
    proyecto,
    revision,
    revisor,
)
