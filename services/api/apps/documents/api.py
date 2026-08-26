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
from apps.documents.abribles import VISOR_MODELO, abre_en, visor_de
from apps.documents.models import Observacion, Revision
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
        # Con qué visor se abre, decidido en un solo sitio. Así la página del documento puede
        # decir "esto no es un PDF" en vez de pasarle un IFC a PDFium y mostrar un error suyo.
        "visor": visor_de(revision),
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
    """Las revisiones que **el visor de modelos** puede abrir: su propio selector.

    Existe para que el visor no dependa de que alguien llegue con un enlace. Es la lista
    que contesta «qué hay en este proyecto que yo pueda mirar».

    **Filtra por el visor concreto y no por «es abrible».** Desde `F8.6` un PDF también se abre
    —en otra pantalla—, y con el predicado general los PDFs entraban en esta lista: el visor 3D
    los habría intentado cargar como geometría y habría quedado en blanco.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Revision.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        abribles = [
            como_json(r)
            for r in revisiones_visibles(request.user).filter(es_vigente=True)[:200]
            if abre_en(r, VISOR_MODELO)
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


class ObservacionesDeRevisionAPI(APIView):
    """Las observaciones ancladas en un documento: **página y coordenada**, para dibujarlas.

    Es la mitad que faltaba de `F8.6`. El modelo guardaba `pagina`, `ancla_x` y `ancla_y` desde
    el primer día y **no había quien las dibujara**: una observación sobre la página 7 se leía
    como texto en una lista, y quien la recibía tenía que buscar a mano de qué hablaba.

    **Pide `view_observacion`, no `view_revision`.** Son dos permisos porque son dos cosas: un
    rol puede ver los planos publicados y no tener nada que ver con los hallazgos internos. Y
    la revisión se busca por `revisiones_visibles`, así que sobre un documento que el usuario
    no puede ver no hay observaciones que listar, ni siquiera para decir cuántas hay.
    """

    permission_classes = [ViewModelPermissions]
    queryset = Observacion.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        revision = revisiones_visibles(request.user).filter(pk=kwargs["pk"]).first()
        if revision is None:
            raise Http404

        observaciones = (
            Observacion.objects.filter(revision=revision)
            .exclude(pagina=None)
            .select_related("responsable", "autor")
            .order_by("pagina", "created_at")
        )
        return Response(
            {
                # **Si puede abrir una, y por eso viene en la respuesta.** El visor decide con
                # esto si el clic sobre la página hace algo: ofrecer un cursor que promete abrir
                # una observación y termina en 403 es la misma trampa que ofrecer un botón que
                # termina en 403, y peor, porque en una página entera no se ve dónde estaba.
                "puedeObservar": request.user.has_perm("documents.add_observacion"),
                "observaciones": [
                    {
                        "id": str(o.pk),
                        "titulo": o.titulo,
                        "estado": o.estado,
                        "estadoTexto": o.get_estado_display(),
                        "prioridad": o.prioridad,
                        "responsable": str(o.responsable),
                        "pagina": o.pagina,
                        # Fracciones de la página, no píxeles: el PDF se dibuja a la escala que
                        # quepa y a la densidad de la pantalla, así que un píxel guardado hoy
                        # apunta a otro sitio mañana.
                        "x": o.ancla_x,
                        "y": o.ancla_y,
                        "url": f"/documentos/observaciones/{o.pk}/",
                    }
                    for o in observaciones
                    if o.ancla_x is not None and o.ancla_y is not None
                ],
            }
        )


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
