"""Las vistas compartidas de un proyecto, para el visor.

**Es lo que faltaba para que dos personas miren lo mismo.** Las vistas guardadas vivian en el
navegador y ahi se quedaban: sobrevivian a recargar la pagina y no salian del equipo. Coordinar es
exactamente mirar lo mismo, asi que la limitacion paso de aceptable a molesta en cuanto la
coordinacion se metio dentro del visor.

**Las vistas locales no desaparecen.** Siguen en el navegador, sin viaje al servidor y sin permisos
que pedir; compartir es un acto explicito. Es la diferencia entre una vista de trabajo —«dejame esto
como estaba mientras almuerzo»— y una que se le enseña a alguien.

Contrato de permisos, el de `AGENTS.md` y sin atajos: `view_vistadeproyecto` para leer,
`add_vistadeproyecto` para compartir, `delete_vistadeproyecto` para borrar, **y el queryset acotado
por organizacion** — que no es lo mismo que el permiso: `view_vistadeproyecto` dice «puede ver
vistas», no «puede ver **estas**».
"""

from django.http import Http404
from django.utils.translation import gettext as _
from rest_framework.views import APIView

from apps.core.audit import set_audit_context
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import ViewModelPermissions
from apps.projects.models import Proyecto, VistaDeProyecto

#: Tope de vistas por proyecto.
#:
#: **No es una restriccion tecnica**: es que una lista de doscientas vistas no la lee nadie y deja
#: de servir para lo que sirve, que es enseñarle algo concreto a alguien. Con el tope lleno, borrar
#: una es la forma de dejar sitio, y eso obliga a que la lista signifique algo.
MAXIMO_POR_PROYECTO = 100


def _proyecto_visible(request, pk):
    proyecto = (
        scope_queryset_to_organizacion(Proyecto.objects.all(), request.user).filter(pk=pk).first()
    )
    if proyecto is None:
        raise Http404
    return proyecto


def _como_json(vista, usuario) -> dict:
    return {
        "id": str(vista.pk),
        "nombre": vista.nombre,
        "autor": str(vista.autor),
        # **Se dice si es tuya**, que es lo que decide si se ofrece el boton de borrar. Calcularlo
        # aca y no en el visor evita que la interfaz adivine con el nombre mostrado, que no es
        # identidad.
        "esMia": vista.autor_id == usuario.pk,
        "creada": vista.created_at.isoformat(),
        "camara": vista.camara or None,
        "visibilidad": vista.visibilidad or None,
        "cortes": vista.cortes or [],
    }


class VistasDeProyectoAPI(APIView):
    """Listar las vistas compartidas de un proyecto y compartir una nueva."""

    permission_classes = [ViewModelPermissions]
    queryset = VistaDeProyecto.objects.none()

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response

        proyecto = _proyecto_visible(request, kwargs["pk"])
        vistas = VistaDeProyecto.objects.filter(proyecto=proyecto, is_active=True).select_related(
            "autor"
        )

        return Response(
            {
                "puedeCompartir": request.user.has_perm("projects.add_vistadeproyecto"),
                "vistas": [_como_json(vista, request.user) for vista in vistas],
            }
        )

    def post(self, request, *args, **kwargs):
        """Comparte la vista de ahora mismo con el resto del proyecto.

        **La camara es obligatoria y las otras dos no.** Sin camara no hay vista: es lo que define
        desde donde se mira, y lo demas son restricciones sobre eso. Una vista sin cortes y sin nada
        apagado es una vista perfectamente util —«mira el edificio desde aqui»—.
        """
        from rest_framework.response import Response

        from apps.documents.camara import leer as leer_camara
        from apps.documents.visibilidad import leer as leer_visibilidad
        from apps.projects.vistas import leer_cortes

        proyecto = _proyecto_visible(request, kwargs["pk"])

        nombre = str(request.data.get("nombre") or "").strip()[:120]
        if not nombre:
            return Response({"error": _("The view needs a name.")}, status=400)

        camara = leer_camara(request.data.get("camara"))
        if not camara:
            # **Se rechaza en vez de guardar media vista.** Una vista sin camara aparece en la lista
            # del otro, se pulsa, y no pasa nada: peor que no poder compartirla.
            return Response({"error": _("That view has no camera to share.")}, status=400)

        if (
            VistaDeProyecto.objects.filter(proyecto=proyecto, is_active=True).count()
            >= MAXIMO_POR_PROYECTO
        ):
            return Response(
                {"error": _("This project already has too many shared views.")}, status=400
            )

        # **Un nombre repetido reemplaza, no duplica.** Dos vistas iguales en la lista no se
        # distinguen, y quien vuelve a compartir con el mismo nombre esta corrigiendo la suya.
        existente = VistaDeProyecto.objects.filter(
            proyecto=proyecto, nombre=nombre, is_active=True
        ).first()
        if existente is not None and existente.autor_id != request.user.pk:
            return Response(
                {"error": _("Someone else already shared a view with that name.")}, status=400
            )

        campos = {
            "camara": camara,
            "visibilidad": leer_visibilidad(request.data.get("visibilidad")),
            "cortes": leer_cortes(request.data.get("cortes")),
        }

        if existente is not None:
            for campo, valor in campos.items():
                setattr(existente, campo, valor)
            existente.save(update_fields=[*campos, "updated_at"])
            vista = existente
            set_audit_context(request, vista, action="recompartir_vista")
        else:
            vista = VistaDeProyecto.objects.create(
                organizacion=proyecto.organizacion,
                proyecto=proyecto,
                nombre=nombre,
                autor=request.user,
                **campos,
            )
            set_audit_context(request, vista, action="compartir_vista")

        return Response(_como_json(vista, request.user), status=201)


class VistaDeProyectoAPI(APIView):
    """Borrar una vista compartida."""

    permission_classes = [ViewModelPermissions]
    queryset = VistaDeProyecto.objects.none()

    def delete(self, request, *args, **kwargs):
        """La borra **quien la compartio**, y nadie mas.

        `delete_vistadeproyecto` dice «puede borrar vistas», no «puede borrar **estas**». Sin la
        comprobacion del autor, cualquiera con el permiso quita del proyecto la vista que otro
        preparo para una reunion, y eso no se recupera.
        """
        from rest_framework.response import Response

        vista = (
            scope_queryset_to_organizacion(
                VistaDeProyecto.objects.filter(is_active=True), request.user
            )
            .filter(pk=kwargs["pk"])
            .first()
        )
        if vista is None:
            raise Http404
        if vista.autor_id != request.user.pk:
            return Response({"error": _("Only whoever shared it can remove it.")}, status=403)

        set_audit_context(request, vista, action="borrar_vista")
        vista.is_active = False
        vista.save(update_fields=["is_active", "updated_at"])
        return Response(status=204)
