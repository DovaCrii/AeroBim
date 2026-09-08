from django.urls import path

from apps.accounts import views

app_name = "core"

urlpatterns = [
    path("organizaciones/", views.OrganizacionesView.as_view(), name="organizaciones"),
]
