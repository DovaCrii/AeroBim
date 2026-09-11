from django.urls import path

from apps.accounts import views

app_name = "accounts"

urlpatterns = [
    # La ayuda va primero porque es la que se busca sin saber dónde está.
    path("ayuda/", views.AyudaView.as_view(), name="ayuda"),
    # El vocabulario va colgando de la ayuda y no de un módulo: es material de lectura, no una
    # pantalla de trabajo, y quien lo busca lo busca desde «cómo se usa».
    path("ayuda/vocabulario/", views.GlosarioView.as_view(), name="glosario"),
    path("usuarios-y-roles/", views.UsuariosRolesView.as_view(), name="usuarios-roles"),
    path("auditoria/", views.AuditoriaView.as_view(), name="auditoria"),
    path("trabajos/", views.TrabajosView.as_view(), name="trabajos"),
]
