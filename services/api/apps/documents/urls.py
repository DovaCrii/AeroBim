from django.urls import path

from apps.documents import views

app_name = "documents"

urlpatterns = [
    path("", views.MiBandejaView.as_view(), name="bandeja"),
    path("entregables/", views.EntregablesView.as_view(), name="entregables"),
    path("entregables/nuevo/", views.NuevoEntregableView.as_view(), name="nuevo-entregable"),
    path("entregables/<uuid:pk>/", views.ExpedienteView.as_view(), name="expediente"),
    path(
        "entregables/<uuid:pk>/subir/",
        views.SubirRevisionView.as_view(),
        name="subir-revision",
    ),
    path(
        "entregables/<uuid:pk>/observar/",
        views.NuevaObservacionView.as_view(),
        name="nueva-observacion",
    ),
    path(
        "revisiones/<uuid:pk>/descargar/",
        views.DescargarRevisionView.as_view(),
        name="descargar-revision",
    ),
    path(
        "revisiones/<uuid:pk>/idoneidad/",
        views.CambiarIdoneidadView.as_view(),
        name="cambiar-idoneidad",
    ),
    path("observaciones/", views.ObservacionesView.as_view(), name="observaciones"),
    path("observaciones/<uuid:pk>/", views.ObservacionView.as_view(), name="observacion"),
    path(
        "observaciones/<uuid:pk>/comentar/",
        views.ComentarObservacionView.as_view(),
        name="comentar-observacion",
    ),
    path(
        "observaciones/<uuid:pk>/cerrar/",
        views.CerrarObservacionView.as_view(),
        name="cerrar-observacion",
    ),
    path("actividades/", views.ActividadesView.as_view(), name="actividades"),
    path("actividades/nueva/", views.NuevaActividadView.as_view(), name="nueva-actividad"),
    path("transmittals/", views.TransmittalsView.as_view(), name="transmittals"),
]
