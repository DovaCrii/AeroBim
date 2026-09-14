from django.urls import path

from apps.documents import views, vistas_compartir

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
    # Compartir hacia fuera. Las de aquí piden sesión; la puerta pública que abren vive en
    # `config/urls.py` bajo `/compartido/`, fuera de este prefijo, porque no es del registro.
    path(
        "revisiones/<uuid:pk>/enlaces/",
        vistas_compartir.EnlacesDeRevisionView.as_view(),
        name="enlaces",
    ),
    path(
        "enlaces/<uuid:pk>/revocar/",
        vistas_compartir.RevocarEnlaceView.as_view(),
        name="revocar-enlace",
    ),
    # **Revisar interferencias cuelga de la obra y no de una revisión**: se cruzan todos los
    # modelos vigentes del proyecto, que es como se pregunta «¿choca algo?». Vive bajo
    # `documentos/` porque lo que crea son observaciones.
    path(
        "proyectos/<uuid:pk>/revisar-interferencias/",
        views.RevisarInterferenciasView.as_view(),
        name="revisar-interferencias",
    ),
    path("requisitos/", views.RequisitosIdsView.as_view(), name="requisitos-ids"),
    path("requisitos/nuevo/", views.NuevoRequisitoIdsView.as_view(), name="nuevo-requisito-ids"),
    path(
        "revisiones/<uuid:pk>/validar/",
        views.ValidarIdsView.as_view(),
        name="validar-ids",
    ),
    # Qué trae el modelo, **antes** de exigirle algo, y el IDS de partida que sale de ahí (`F3.10`).
    path("revisiones/<uuid:pk>/cobertura/", views.CoberturaView.as_view(), name="cobertura"),
    path(
        "revisiones/<uuid:pk>/generar-ids/",
        views.GenerarIdsView.as_view(),
        name="generar-ids",
    ),
    path("observaciones/", views.ObservacionesView.as_view(), name="observaciones"),
    path(
        "proyectos/<uuid:pk>/observaciones.bcf",
        views.ExportarBcfView.as_view(),
        name="exportar-bcf",
    ),
    # **La vuelta del ciclo.** Sin ella la coordinación es un altavoz: el mandante contesta con
    # otro BCF y esa respuesta se teclea a mano, o —lo que pasa de verdad— no se teclea.
    path(
        "proyectos/<uuid:pk>/importar-bcf/",
        views.ImportarBcfView.as_view(),
        name="importar-bcf",
    ),
    # **La primera salida en papel del producto.** `F10.3`: el BCF sirve para otro software, no para
    # una reunión de obra. El formato y qué se imprime van por la URL.
    path(
        "proyectos/<uuid:pk>/informe/",
        views.InformeCoordinacionView.as_view(),
        name="informe-coordinacion",
    ),
    path(
        "proyectos/<uuid:pk>/lamina/",
        views.LaminaPdfView.as_view(),
        name="lamina-pdf",
    ),
    path("observaciones/<uuid:pk>/", views.ObservacionView.as_view(), name="observacion"),
    path(
        "observaciones/<uuid:pk>/comentar/",
        views.ComentarObservacionView.as_view(),
        name="comentar-observacion",
    ),
    # La imagen adjunta a un comentario (`F12.11`). Va por el id **del comentario** y no por la
    # clave de almacenamiento: una clave en una URL invita a probar otras, y el permiso se comprueba
    # sobre la observación de la que cuelga.
    path(
        "comentarios/<uuid:pk>/imagen/",
        views.ImagenDeComentarioView.as_view(),
        name="imagen-de-comentario",
    ),
    path(
        "observaciones/<uuid:pk>/repartir/",
        views.RepartirObservacionView.as_view(),
        name="repartir-observacion",
    ),
    path(
        "observaciones/<uuid:pk>/cerrar/",
        views.CerrarObservacionView.as_view(),
        name="cerrar-observacion",
    ),
    path(
        "observaciones/<uuid:pk>/etiquetas/",
        views.EtiquetarObservacionView.as_view(),
        name="etiquetar-observacion",
    ),
    path("actividades/", views.ActividadesView.as_view(), name="actividades"),
    path("actividades/nueva/", views.NuevaActividadView.as_view(), name="nueva-actividad"),
    path("actividades/<uuid:pk>/", views.ActividadView.as_view(), name="actividad"),
    path(
        "actividades/<uuid:pk>/avanzar/",
        views.AvanzarActividadView.as_view(),
        name="avanzar-actividad",
    ),
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
