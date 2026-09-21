from django.urls import path

from apps.accounts import views, vistas_organizacion
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
    # **La ficha que no existía.** La lista era una tabla de tres columnas sin un solo enlace: se
    # veía cuántos miembros hay y no quiénes, y no había forma de mover a nadie ni de borrarla.
    path(
        "organizaciones/<uuid:pk>/",
        vistas_organizacion.OrganizacionView.as_view(),
        name="organizacion",
    ),
    path(
        "organizaciones/<uuid:pk>/miembros/",
        vistas_organizacion.MiembrosDeOrganizacionView.as_view(),
        name="miembros-de-organizacion",
    ),
    path(
        "organizaciones/<uuid:pk>/borrar/",
        vistas_organizacion.BorrarOrganizacionView.as_view(),
        name="borrar-organizacion",
    ),
]
