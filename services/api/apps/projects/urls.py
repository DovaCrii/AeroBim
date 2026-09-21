from django.urls import path

from apps.projects import views

app_name = "projects"

urlpatterns = [
    path("", views.ProyectosView.as_view(), name="proyectos"),
    path("nuevo/", views.NuevoProyectoView.as_view(), name="nuevo-proyecto"),
    path("<uuid:pk>/", views.ProyectoView.as_view(), name="proyecto"),
    # **Archivar y borrar, que es lo que faltaba para poder ensayar.** `is_active` estaba en el
    # modelo y todos los listados ya filtraban por él: lo único que no existía era ponerlo.
    path("<uuid:pk>/archivar/", views.ArchivarProyectoView.as_view(), name="archivar-proyecto"),
    path("<uuid:pk>/borrar/", views.BorrarProyectoView.as_view(), name="borrar-proyecto"),
    path(
        "<uuid:pk>/disciplinas/nueva/",
        views.NuevaDisciplinaView.as_view(),
        name="nueva-disciplina",
    ),
    # **Cuánto correo manda esta obra**, que lo decide quien coordina. La campana no pasa por aquí.
    path("<uuid:pk>/avisos/", views.AvisosDeObraView.as_view(), name="avisos-de-obra"),
]
