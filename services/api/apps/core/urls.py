from django.urls import path

from apps.accounts import views
from apps.core import vistas_avisos

app_name = "core"

urlpatterns = [
    # **La otra mitad de la campana.** Un contador sin sitio a donde ir es un número que molesta.
    path("avisos/", vistas_avisos.AvisosView.as_view(), name="avisos"),
    path("avisos/<uuid:pk>/", vistas_avisos.AbrirAvisoView.as_view(), name="abrir-aviso"),
    path(
        "avisos/leidos/",
        vistas_avisos.MarcarAvisosLeidosView.as_view(),
        name="marcar-avisos-leidos",
    ),
    path("organizaciones/", views.OrganizacionesView.as_view(), name="organizaciones"),
    # **El primer paso del producto, y hasta hoy solo existía en el `/admin/` técnico.** Ver
    # `NuevaOrganizacionView`: sin una organización no se puede crear ninguna cuenta.
    path("organizaciones/nueva/", views.NuevaOrganizacionView.as_view(), name="nueva-organizacion"),
]
