"""Las rutas que consume el visor. Separadas de las de las pantallas a propósito.

Una pantalla devuelve HTML y redirige a quien no ha entrado; una API devuelve JSON y
responde 403. Mezclarlas en el mismo archivo termina en una vista que hace las dos cosas a
medias.
"""

from django.urls import path

from apps.documents import api

app_name = "documents_api"

urlpatterns = [
    path("revisiones/abribles/", api.RevisionesAbriblesAPI.as_view(), name="abribles"),
    path("revisiones/<uuid:pk>/", api.RevisionAPI.as_view(), name="revision"),
    path(
        "revisiones/<uuid:pk>/contenido/",
        api.RevisionContenidoAPI.as_view(),
        name="revision-contenido",
    ),
]
