"""Las pantallas del proyecto: **de que cuelga todo lo demas, y hasta hoy no se podia ver.**

Los modelos de esta aplicacion existen desde `F8.1` y no tenian ni una vista: un proyecto solo se
podia crear entrando al `/admin/` tecnico de Django, y sus disciplinas igual. Con un proyecto real
eso no es una incomodidad, es que el trabajo empieza fuera de la aplicacion.

**La pantalla de detalle contesta «¿donde sigo?»**, que es una pregunta distinta de «que hay».
Un listado dice que existen doscientos entregables; esta dice cuales estan atrasados, que
observaciones estan abiertas y cual es el modelo que hay que abrir — y lleva a cada sitio con un
clic. Es la misma idea del expediente de un entregable (`dossier.py` de AeroControl) subida un
nivel: la del proyecto entero.
"""

from django.contrib import messages
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.translation import gettext as _
from django.views.generic import DetailView, ListView, View

from apps.core.audit import set_audit_context
from apps.core.models import Organizacion
from apps.core.tenancy import organizaciones_visibles, scope_queryset_to_organizacion
from apps.core.views import (
    FiltrosEnLaPaginacionMixin,
    ModelPermissionRequiredMixin,
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
)
from apps.documents.abribles import RUTA_POR_VISOR, visor_de
from apps.documents.models import IDONEIDADES_PUBLICADAS, Observacion, Revision
from apps.projects.forms import DisciplinaForm, ProyectoForm
from apps.projects.models import Disciplina, Proyecto


def organizaciones_para(user):
    """Las organizaciones en las que este usuario puede crear. Acota el desplegable del alta."""
    return Organizacion.objects.filter(pk__in=organizaciones_visibles(user)).order_by("nombre")


class ProyectosView(
    ModelViewPermissionRequiredMixin,
    OrganizacionScopedQuerysetMixin,
    FiltrosEnLaPaginacionMixin,
    ListView,
):
    """Los proyectos, con lo que se mira desde fuera: en que etapa van y cuanto llevan."""

    model = Proyecto
    template_name = "projects/proyectos.html"
    context_object_name = "proyectos"
    paginate_by = 50

    def get_queryset(self):
        consulta = super().get_queryset().filter(is_active=True).select_related("organizacion")
        # **El avance se calcula por proyecto y precarga sus entregables**: `avance_fisico` mira
        # la revision vigente de cada uno, y sin esto una lista de veinte proyectos son cientos
        # de consultas. La precarga ya esta escrita como parte del calculo en el modelo.
        consulta = consulta.prefetch_related("entregables__revisiones")
        etapa = self.request.GET.get("etapa")
        if etapa:
            consulta = consulta.filter(status=etapa)
        return consulta

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["etapas"] = Proyecto.STATUS_CHOICES
        contexto["puede_crear"] = self.request.user.has_perm("projects.add_proyecto")
        return contexto


class ProyectoView(ModelViewPermissionRequiredMixin, OrganizacionScopedQuerysetMixin, DetailView):
    """El proyecto: **donde sigue el trabajo**, no solo que contiene.

    Lo que se muestra y por que, que es lo unico que distingue esta pantalla de cuatro listados
    puestos uno debajo del otro:

    - **los entregables atrasados primero**, porque son los que exigen una decision hoy;
    - **las observaciones abiertas por prioridad**, que es como se reparte el trabajo de
      coordinacion;
    - **los modelos que se pueden abrir, con su enlace al visor**, que es el salto que hasta hoy
      obligaba a pasar por el listado de entregables y buscar a mano;
    - y los requisitos IDS, que dicen contra que se valida lo que llegue.

    Cada bloque respeta lo que el usuario puede leer: las revisiones pasan por
    `IDONEIDADES_PUBLICADAS` igual que en el expediente, y los permisos deciden si el enlace se
    dibuja. **Un enlace que termina en 403 es peor que no ofrecerlo.**
    """

    model = Proyecto
    template_name = "projects/proyecto.html"
    context_object_name = "proyecto"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        proyecto = self.object
        usuario = self.request.user

        entregables = (
            proyecto.entregables.filter(is_active=True)
            .select_related("disciplina", "responsable")
            .prefetch_related("revisiones")
            # **La cuenta va en la consulta y no por la propiedad `observaciones_abiertas`.**
            # La propiedad devuelve el queryset de uno, que es lo correcto para una ficha y son
            # doscientas consultas para pintar una columna. El nombre es distinto a propósito:
            # anotar sobre el de una propiedad hace que Django falle al asignarla.
            .annotate(
                cuantas_abiertas=Count(
                    "revisiones__observaciones",
                    filter=~Q(
                        revisiones__observaciones__estado__in=[
                            Observacion.CERRADA,
                            Observacion.DESCARTADA,
                        ]
                    ),
                    distinct=True,
                )
            )
        )
        contexto["entregables"] = entregables
        contexto["sin_revision"] = [e for e in entregables if e.revision_vigente is None]

        # **Las observaciones abiertas, y las del modelo aparte.** Son dos trabajos distintos: una
        # anclada al GUID de una viga se resuelve en el visor, y una sobre un PDF en el documento.
        abiertas = (
            Observacion.objects.filter(proyecto=proyecto)
            .exclude(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
            .select_related("responsable", "autor", "revision__entregable")
            .order_by("prioridad", "vence")
        )
        contexto["observaciones"] = abiertas
        contexto["observaciones_del_modelo"] = [o for o in abiertas if o.ifc_guid]

        # **Los modelos que se pueden abrir en el visor.** Se decide por la extension, con la
        # misma funcion que usa el expediente, y se cuelga la ruta ya resuelta: la plantilla no
        # tiene que saber de formatos.
        abribles = []
        for revision in self._revisiones_publicadas(proyecto, usuario):
            visor = visor_de(revision)
            if visor is None:
                continue
            revision.visor_ruta = RUTA_POR_VISOR[visor]
            abribles.append(revision)
        contexto["abribles"] = abribles

        contexto["requisitos_ids"] = proyecto.requisitos_ids.filter(is_active=True)
        contexto["disciplinas"] = proyecto.disciplinas.filter(is_active=True)

        contexto["puede_crear_disciplina"] = usuario.has_perm("projects.add_disciplina")
        contexto["puede_crear_entregable"] = usuario.has_perm("documents.add_entregable")
        contexto["puede_exportar_bcf"] = (
            usuario.has_perm("documents.view_observacion") and abiertas.exists()
        )
        return contexto

    def _revisiones_publicadas(self, proyecto, usuario):
        """Las revisiones vigentes del proyecto que este usuario puede leer.

        **Se filtra por idoneidad y no solo por permiso.** `view_revision` dice «puede ver
        revisiones»; no sabe distinguir una `S0` en curso de una `A1` autorizada, y lo que esta en
        curso no obliga a nadie. Es la misma regla que `solo_publicadas` aplica en el expediente.
        """
        if not usuario.has_perm("documents.view_revision"):
            return []
        consulta = Revision.objects.filter(
            entregable__proyecto=proyecto, es_vigente=True
        ).select_related("entregable__disciplina")
        if not (
            usuario.has_perm("documents.change_revision")
            or usuario.has_perm("documents.add_revision")
        ):
            consulta = consulta.filter(idoneidad__in=IDONEIDADES_PUBLICADAS)
        return list(consulta)


class NuevoProyectoView(ModelPermissionRequiredMixin, View):
    """Crear la obra. **Es el primer paso de todo**, y hasta hoy vivia en el `/admin/`."""

    model = Proyecto
    permission_action = "add"
    template_name = "projects/nuevo_proyecto.html"

    def get(self, request, *args, **kwargs):
        return render(
            request,
            self.template_name,
            {"form": ProyectoForm(organizaciones=organizaciones_para(request.user))},
        )

    def post(self, request, *args, **kwargs):
        organizaciones = organizaciones_para(request.user)
        form = ProyectoForm(request.POST, organizaciones=organizaciones)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form}, status=400)

        proyecto = form.save(commit=False)
        # **Cinturón sobre la restricción del formulario.** El `queryset` acotado ya rechaza una
        # organización ajena, pero esto lo comprueba contra la lista de verdad: si alguien añade
        # otro camino a este `save` mañana, el aislamiento sigue puesto.
        if not organizaciones.filter(pk=proyecto.organizacion_id).exists():
            messages.error(request, _("You cannot create a project for that organisation."))
            return render(request, self.template_name, {"form": form}, status=400)
        proyecto.save()

        set_audit_context(request, proyecto, action="crear_proyecto")
        messages.success(request, _("Project %(codigo)s created.") % {"codigo": proyecto.codigo})
        return redirect("projects:proyecto", pk=proyecto.pk)


class NuevaDisciplinaView(ModelPermissionRequiredMixin, View):
    """Una disciplina del proyecto, con su color.

    **Cuelga del proyecto y por eso el acotado va por él**: `add_disciplina` dice que puede crear
    disciplinas, no que pueda crearlas en la obra de otro cliente.
    """

    model = Disciplina
    permission_action = "add"
    template_name = "projects/nueva_disciplina.html"

    def proyecto(self, request, pk):
        return get_object_or_404(
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user), pk=pk
        )

    def get(self, request, *args, **kwargs):
        proyecto = self.proyecto(request, kwargs["pk"])
        return render(request, self.template_name, {"proyecto": proyecto, "form": DisciplinaForm()})

    def post(self, request, *args, **kwargs):
        proyecto = self.proyecto(request, kwargs["pk"])
        form = DisciplinaForm(request.POST)
        if not form.is_valid():
            return render(
                request,
                self.template_name,
                {"proyecto": proyecto, "form": form},
                status=400,
            )

        disciplina = form.save(commit=False)
        disciplina.proyecto = proyecto
        # El código es único por proyecto en la base. Se comprueba acá para poder decirlo en el
        # formulario en vez de devolver un error de integridad.
        if proyecto.disciplinas.filter(codigo=disciplina.codigo, is_active=True).exists():
            form.add_error("codigo", _("That code is already used in this project."))
            return render(
                request,
                self.template_name,
                {"proyecto": proyecto, "form": form},
                status=400,
            )
        disciplina.save()

        set_audit_context(request, disciplina, action="crear_disciplina")
        messages.success(
            request, _("Discipline %(codigo)s created.") % {"codigo": disciplina.codigo}
        )
        return redirect("projects:proyecto", pk=proyecto.pk)
