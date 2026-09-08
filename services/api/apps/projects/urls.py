from django.urls import path

from apps.projects import views

app_name = "projects"

urlpatterns = [
    path("", views.ProyectosView.as_view(), name="proyectos"),
    path("nuevo/", views.NuevoProyectoView.as_view(), name="nuevo-proyecto"),
    path("<uuid:pk>/", views.ProyectoView.as_view(), name="proyecto"),
    path(
        "<uuid:pk>/disciplinas/nueva/",
        views.NuevaDisciplinaView.as_view(),
        name="nueva-disciplina",
    ),
]
