from django.urls import path

from apps.accounts import views

app_name = "accounts"

urlpatterns = [
    # La ayuda va primero porque es la que se busca sin saber dónde está.
    path("ayuda/", views.AyudaView.as_view(), name="ayuda"),
    # Los vocabularios van colgando de la ayuda y no de un módulo: son material de lectura, no
    # pantallas de trabajo, y quien los busca los busca desde «cómo se usa». La clave va en la URL
    # —`bim`, `levantamiento`— para que añadir un tercero sea añadir un archivo y nada más.
    path("ayuda/vocabulario/<slug:cual>/", views.GlosarioView.as_view(), name="glosario"),
    path("usuarios-y-roles/", views.UsuariosRolesView.as_view(), name="usuarios-roles"),
    path("auditoria/", views.AuditoriaView.as_view(), name="auditoria"),
    path("trabajos/", views.TrabajosView.as_view(), name="trabajos"),
]
