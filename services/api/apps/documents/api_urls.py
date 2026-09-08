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
    path(
        "revisiones/<uuid:pk>/observaciones/",
        api.ObservacionesDeRevisionAPI.as_view(),
        name="revision-observaciones",
    ),
    # Las ancladas al modelo, para el panel de coordinación del visor. Van **por proyecto y no por
    # revisión**: un hallazgo sobre una viga de la estructura importa mirando arquitectura, que es
    # de lo que trata coordinar.
    path(
        "proyectos/<uuid:pk>/observaciones-modelo/",
        api.ObservacionesDelModeloAPI.as_view(),
        name="proyecto-observaciones-modelo",
    ),
    # **«Ya miré esto».** Es lo único que separa lo nuevo de lo ya visto, y sin ello una corrida de
    # trece problemas nuevos se pierde entre treinta y cinco filas abiertas.
    path(
        "proyectos/<uuid:pk>/coordinacion-vista/",
        api.MarcarCoordinacionVistaAPI.as_view(),
        name="proyecto-coordinacion-vista",
    ),
    # **Descartar sin salir del visor.** Es lo que hace que una corrida de interferencias sirva dos
    # veces: triar decenas de conflictos abriendo la ficha de cada uno en otra pestaña no lo hace
    # nadie, y a la corrida siguiente vuelven todos.
    path(
        "observaciones/<uuid:pk>/descartar/",
        api.DescartarObservacionAPI.as_view(),
        name="descartar-observacion",
    ),
]
