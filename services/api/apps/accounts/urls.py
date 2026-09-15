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
    # Cuelga de la ayuda por lo mismo que los vocabularios: es material de lectura, y quien lo busca
    # lo busca desde «cómo se usa esto» — no desde una pantalla de trabajo.
    path("ayuda/cookies-y-datos/", views.PrivacidadView.as_view(), name="privacidad"),
    path("usuarios-y-roles/", views.UsuariosRolesView.as_view(), name="usuarios-roles"),
    # El alta cuelga de la lista porque es donde se mira antes de crear a alguien: la mitad de las
    # veces la persona ya tiene cuenta y lo que falta es el rol.
    path("usuarios-y-roles/nueva/", views.NuevaCuentaView.as_view(), name="nueva-cuenta"),
    path(
        "usuarios-y-roles/<int:pk>/reiniciar-clave/",
        views.ReiniciarClaveView.as_view(),
        name="reiniciar-clave",
    ),
    path("auditoria/", views.AuditoriaView.as_view(), name="auditoria"),
    path("trabajos/", views.TrabajosView.as_view(), name="trabajos"),
]
