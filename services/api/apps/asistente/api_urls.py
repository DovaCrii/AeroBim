"""Las rutas del asistente de IA que consume el visor."""

from django.urls import path

from apps.asistente import api

app_name = "asistente_api"

urlpatterns = [
    path("asistente/estado/", api.EstadoAPI.as_view(), name="estado"),
    path("asistente/chat/", api.ChatAPI.as_view(), name="chat"),
]
