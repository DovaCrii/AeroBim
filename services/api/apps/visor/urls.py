from django.urls import path

from apps.visor.views import DocumentoView, VisorView

app_name = "visor"

urlpatterns = [
    path("", VisorView.as_view(), name="visor"),
    path("documento/", DocumentoView.as_view(), name="documento"),
]
