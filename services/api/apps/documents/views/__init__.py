"""Las pantallas del registro documental.

**El expediente es la idea que ordena esto.** Copiado del `dossier.py` de AeroControl:
una pantalla que contesta *«¿esto está completo y documentado?»* nombrando cada fila que
falta con el atajo que la cierra — y **omitiendo los botones que el usuario no puede
ejecutar**, porque ofrecer un botón que termina en 403 es peor que no ofrecerlo: enseña
a probar puertas.


## Cómo está dividido (`F14.3`)

Este paquete salió de un solo `views.py` de 2 523 líneas. **Se reexporta todo desde aquí**, así que
`urls.py`, `api.py` y quien importe `apps.documents.views.X` siguen igual. Un módulo por dominio, y
todos dependen solo de `_comun`, nunca entre sí:

- `_comun`: qué se ve (`solo_publicadas`, `revisiones_visibles`, `observacion_visible`) y avisar al
  guardar.
- `archivos`: el repositorio de archivos y la subida de revisiones.
- `entregables`: los entregables, su expediente y su idoneidad.
- `informes`: lo que sale del registro — BCF, informe de coordinación, resumen y lámina en PDF.
- `ids`: los requisitos de información (IDS): cobertura, generar, crear y validar.
- `observaciones`: lista, ficha, hilo, reparto, cierre y revisión de interferencias.
- `actividades`: lista, ficha, avance y alta.
- `transmittals`: lista, ficha, alta, emisión y acuse.
- `bandeja`: la bandeja de cada uno y el seguimiento del equipo.

**Una prueba que sustituya algo por ruta de texto apunta al módulo donde vive**, no a este paquete:
`monkeypatch.setattr("apps.documents.views.observaciones.avisar_comentario", …)`. Sustituirlo aquí
cambiaría el nombre del paquete y no el que la vista usa.
"""

from apps.documents.views._comun import (  # noqa: F401
    crear_con_aviso,
    observacion_visible,
    revisiones_visibles,
    solo_publicadas,
)
from apps.documents.views.actividades import (  # noqa: F401
    ActividadesView,
    ActividadView,
    AvanzarActividadView,
    NuevaActividadView,
    siguiente_estado,
)
from apps.documents.views.archivos import (  # noqa: F401
    ArchivosView,
    DescargarRevisionView,
    EmpezarASubirView,
    SubirRevisionView,
)
from apps.documents.views.bandeja import MiBandejaView, SeguimientoView  # noqa: F401
from apps.documents.views.entregables import (  # noqa: F401
    CambiarIdoneidadView,
    EntregablesView,
    ExpedienteView,
    NuevoEntregableView,
)
from apps.documents.views.ids import (  # noqa: F401
    CoberturaView,
    GenerarIdsView,
    NuevoRequisitoIdsView,
    RequisitosIdsView,
    ValidarIdsView,
)
from apps.documents.views.informes import (  # noqa: F401
    ExportarBcfView,
    ImportarBcfView,
    InformeCoordinacionView,
    LaminaPdfView,
    ResumenEjecutivoView,
)
from apps.documents.views.observaciones import (  # noqa: F401
    CerrarObservacionView,
    ComentarObservacionView,
    EtiquetarObservacionView,
    ImagenDeComentarioView,
    NuevaObservacionView,
    ObservacionesView,
    ObservacionView,
    RepartirObservacionView,
    RevisarInterferenciasView,
)
from apps.documents.views.transmittals import (  # noqa: F401
    AcusarTransmittalView,
    EmitirTransmittalView,
    NuevoTransmittalView,
    TransmittalsView,
    TransmittalView,
)
