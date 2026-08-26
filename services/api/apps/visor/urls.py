from django.urls import path

from apps.visor.views import VisorView

app_name = "visor"

urlpatterns = [path("", VisorView.as_view(), name="visor")]
