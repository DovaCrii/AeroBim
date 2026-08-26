"""Lo que el visor necesita del registro: qué revisiones puede abrir, y sus bytes.

**Es la costura entre las dos mitades del producto.** Hasta ahora el visor abría archivos
del disco de quien lo usaba y no sabía nada de proyectos, y el registro guardaba revisiones
—DXF e IFC incluidos— y no podía mostrarlas. O sea que «subir y visualizar todo junto» no
estaba: se podían las dos cosas, pero no con el mismo archivo.

**Dos peticiones y no una, a propósito.** Primero los metadatos y después los bytes: así el
visor puede decir *qué* está abriendo —el código del entregable, su revisión, su código de
idoneidad— antes de descargar veinte megas, y no hay que inventar cabeceras para meter el
nombre del archivo dentro de la respuesta binaria.

Las tres reglas de acceso son las mismas que en las pantallas, y se escriben una vez:

- **`view_revision` explícito**, vía `ViewModelPermissions`, que es el `DjangoModelPermissions`
  de DRF con la lectura guardada — el de DRF deja `GET` sin exigir nada.
- **Acotado por organización**, y aquí hay que hacerlo a mano: una `Revision` no lleva el
  campo `organizacion`, cuelga de su entregable. `scope_queryset_to_organizacion` devuelve
  intacto un modelo sin el campo, así que confiar en él dejaría el hueco abierto.
- **Solo lo publicado para quien no escribe**: un mandante no ve una `S0` en curso, y eso no
  lo puede decir un permiso.
"""

from django.http import FileResponse, Http404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.views import APIView

from apps.core.views import ViewModelPermissions
from apps.documents import storage
from apps.documents.abribles import es_abrible
from apps.documents.models import Revision
from apps.documents.views import revisiones_visibles


def como_json(revision: Revision) -> dict:
    entregable = revision.entregable
    return {
        "id": str(revision.pk),
        "correlativo": revision.correlativo,
        "idoneidad": revision.idoneidad,
        "idoneidadTexto": revision.get_idoneidad_display(),
        "nombre": revision.nombre_original,
        "extension": storage.extension_de(revision.nombre_original),
        "tamanoBytes": revision.tamano_bytes,
        "sha256": revision.sha256,
        "emitidaEn": revision.emitida_en.isoformat(),
        "esVigente": revision.es_vigente,
        "entregable": {
            "id": str(entregable.pk),
            "codigo": entregable.codigo,
            "titulo": entregable.titulo,
            "disciplina": entregable.disciplina.codigo,
        },
        "proyecto": {
            "codigo": entregable.proyecto.codigo,
            "nombre": entregable.proyecto.nombre,
        },
        "contenido": f"/api/revisiones/{revision.pk}/contenido/",
    }


class RevisionesAbriblesAPI(ListAPIView):
    """Las revisiones que el visor puede abrir: su propio selector.

    Existe para que el visor no dependa de que alguien llegue con un enlace. Es la lista
    que contesta «qué hay en este proyecto que yo pueda mirar».
    """

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        abribles = [
            como_json(r)
            for r in revisiones_visibles(request.user).filter(es_vigente=True)[:200]
            if es_abrible(r)
        ]
        return Response({"revisiones": abribles})


class RevisionAPI(RetrieveAPIView):
    """Los metadatos de una revisión: qué es, antes de descargarla."""

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404
        return Response(como_json(revision))


class RevisionContenidoAPI(APIView):
    """Los bytes, **en línea y no como descarga**.

    `DescargarRevisionView` los manda como adjunto, que es lo correcto para una persona que
    hace clic. El visor necesita lo contrario: leerlos con `fetch` y pasárselos al lector sin
    que el navegador ofrezca guardarlos.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None or not revision.clave_archivo:
            raise Http404
        try:
            contenido = storage.leer(revision.clave_archivo)
        except (OSError, storage.CargaRechazada) as error:
            # El registro dice que hay archivo y el disco dice que no. Es un 404 honesto: lo
            # que no está no está, y el motivo va al log, no a la respuesta.
            raise Http404 from error

        respuesta = FileResponse(iter([contenido]), content_type="application/octet-stream")
        respuesta["Content-Length"] = str(len(contenido))
        # Que el sha viaje permite al visor comprobar que abrió lo que el registro dice.
        respuesta["X-Aerobim-Sha256"] = revision.sha256
        return respuesta
