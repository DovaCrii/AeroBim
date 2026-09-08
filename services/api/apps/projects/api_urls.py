"""Las rutas de proyectos que consume el visor.

Separadas de las pantallas por el mismo motivo que las de `documents`: una pantalla devuelve HTML y
redirige a quien no ha entrado; una API devuelve JSON y responde 403.
"""

from django.urls import path

from apps.projects import api

app_name = "projects_api"

urlpatterns = [
    # Las vistas compartidas van **por proyecto y no por revision**, igual que las observaciones del
    # modelo: una vista util para coordinar cruza disciplinas, y atarla a un archivo la haria
    # inservible en cuanto ese archivo tenga una version nueva.
    path("proyectos/<uuid:pk>/vistas/", api.VistasDeProyectoAPI.as_view(), name="proyecto-vistas"),
    path("vistas/<uuid:pk>/", api.VistaDeProyectoAPI.as_view(), name="vista"),
]
