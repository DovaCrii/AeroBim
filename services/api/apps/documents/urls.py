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
    path("requisitos/", views.RequisitosIdsView.as_view(), name="requisitos-ids"),
    path("requisitos/nuevo/", views.NuevoRequisitoIdsView.as_view(), name="nuevo-requisito-ids"),
    path(
        "revisiones/<uuid:pk>/validar/",
        views.ValidarIdsView.as_view(),
        name="validar-ids",
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
    path("transmittals/nuevo/", views.NuevoTransmittalView.as_view(), name="nuevo-transmittal"),
    path("transmittals/<uuid:pk>/", views.TransmittalView.as_view(), name="transmittal"),
    path(
        "transmittals/<uuid:pk>/emitir/",
        views.EmitirTransmittalView.as_view(),
        name="emitir-transmittal",
    ),
    path(
        "transmittals/<uuid:pk>/acusar/",
        views.AcusarTransmittalView.as_view(),
        name="acusar-transmittal",
    ),
]
