from django.urls import path

from apps.accounts import views

app_name = "core"

urlpatterns = [
    path("organizaciones/", views.OrganizacionesView.as_view(), name="organizaciones"),
    # **El primer paso del producto, y hasta hoy solo existía en el `/admin/` técnico.** Ver
    # `NuevaOrganizacionView`: sin una organización no se puede crear ninguna cuenta.
    path("organizaciones/nueva/", views.NuevaOrganizacionView.as_view(), name="nueva-organizacion"),
]
