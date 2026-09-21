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

from datetime import date

from django.contrib import messages
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
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
from apps.documents.models import IDONEIDADES_PUBLICADAS, Actividad, Observacion, Revision
from apps.projects import tablero
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
        if self.sin_pruebas:
            consulta = consulta.exclude(naturaleza__in=(Proyecto.PRUEBA, Proyecto.DEMO))
        return consulta

    @property
    def sin_pruebas(self) -> bool:
        """Si se esconden las obras de ensayo, **recordado entre visitas**.

        Va en la sesión y no solo en la URL porque es una preferencia, no una búsqueda: quien
        trabaja con obras reales quiere que las de prueba no estén **siempre**, y volver a pulsarlo
        en cada pantalla es exactamente el trabajo que el filtro venía a ahorrar.

        Y por omisión están **visibles**: hoy casi todas las obras del piloto son de ensayo, así que
        esconderlas de entrada dejaría la lista vacía sin decir por qué — que es el defecto que este
        mismo bloque acaba de arreglar en la columna de avance.
        """
        pedido = self.request.GET.get("sin_pruebas")
        if pedido is not None:
            self.request.session["sin_pruebas"] = pedido == "1"
        return bool(self.request.session.get("sin_pruebas", False))

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["puede_crear"] = self.request.user.has_perm("projects.add_proyecto")

        # ══════════════════════════════════════════════════════════════════════════════════
        # **Las etapas, con cuántas obras hay en cada una.**
        #
        # Iban como cinco enlaces sueltos dentro del párrafo del subtítulo, mezclados con la
        # frase que explica la pantalla y con «Nuevo proyecto» —una acción entre filtros—.
        # El usuario lo dijo así: «no sé cuál es la idea de anteproyecto, proyecto y toda esa
        # línea; ahora no sirve y no lleva a nada».
        #
        # Y tenía razón en lo literal: **con la base vacía los cinco llevaban a una lista
        # vacía**. Un filtro que no dice cuánto filtra obliga a probarlos uno por uno para
        # descubrir que ninguno tiene nada.
        #
        # Con la cuenta al lado, el filtro contesta antes de pulsarlo. Y las etapas sin
        # ninguna obra **se siguen dibujando, apagadas**: son las fases por las que pasa un
        # encargo, así que ver las cinco es lo que enseña el recorrido — esconderlas dejaría
        # una fila que cambia de contenido según el día y no se aprendería nunca.
        # ══════════════════════════════════════════════════════════════════════════════════
        # Sobre **todas** las obras visibles, no sobre el queryset de la vista: ese ya viene
        # filtrado por etapa, así que contar ahí daría cero en las otras cuatro.
        todas = scope_queryset_to_organizacion(Proyecto.objects.all(), self.request.user).filter(
            is_active=True
        )
        cuantas = dict(
            todas.values_list("status").annotate(n=Count("id")).values_list("status", "n")
        )
        etapa_activa = self.request.GET.get("etapa") or ""
        contexto["etapas"] = [
            {
                "clave": clave,
                "etiqueta": etiqueta,
                "cuantas": cuantas.get(clave, 0),
                "activa": etapa_activa == clave,
            }
            for clave, etiqueta in Proyecto.STATUS_CHOICES
        ]
        contexto["etapa_activa"] = etapa_activa
        contexto["hay_obras"] = sum(cuantas.values())

        # El interruptor solo se ofrece si hay algo que esconder: un botón que no cambia nada es
        # una pregunta que el usuario tiene que responder para descubrir que daba igual.
        contexto["cuantas_pruebas"] = todas.filter(
            naturaleza__in=(Proyecto.PRUEBA, Proyecto.DEMO)
        ).count()
        contexto["sin_pruebas"] = self.sin_pruebas
        return contexto


class ArchivarProyectoView(ModelPermissionRequiredMixin, View):
    """Archivar una obra que ya no se trabaja, o volver a abrirla.

    ## Por qué hacía falta y por qué no se vio antes

    `Proyecto` hereda `is_active` de `BaseModel`, y **todos los listados ya filtran por él** desde
    el primer día: la lista de obras, la portada, los desplegables de disciplina. O sea que el
    archivado estaba construido entero y **nada podía ponerlo** — igual que la columna «Desactivado»
    de las cuentas, que se pintaba sin que existiera el botón.

    Lo destapó el usuario en el peor momento posible, que es el mejor: probando. «Necesito una forma
    de borrar o archivar proyectos, ya que aún estoy en modo pruebas y no tengo cómo quitarlos.»
    Una aplicación que solo sabe crear no se puede ensayar.

    ## Archivar y no borrar, casi siempre

    Una obra archivada desaparece de las listas y **se lleva con ella todo lo suyo**: sus
    entregables, sus revisiones y sus observaciones dejan de estorbar sin perderse. Eso es lo que se
    quiere de una obra terminada — el registro documental de una obra es, precisamente, lo que hay
    que conservar cuando la obra acaba.

    Se puede deshacer, que es lo que la separa de borrar.
    """

    model = Proyecto
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        proyecto = get_object_or_404(
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user), pk=kwargs["pk"]
        )
        proyecto.is_active = not proyecto.is_active
        proyecto.save(update_fields=["is_active"])
        set_audit_context(
            request,
            proyecto,
            action="reabrir_proyecto" if proyecto.is_active else "archivar_proyecto",
        )
        if proyecto.is_active:
            messages.success(
                request,
                _("«%(codigo)s» is open again.") % {"codigo": proyecto.codigo},
            )
            return redirect("projects:proyecto", pk=proyecto.pk)

        messages.success(
            request,
            _("«%(codigo)s» archived. Everything in it stays, out of the way.")
            % {"codigo": proyecto.codigo},
        )
        # **A la lista y no a la ficha.** Archivada, la ficha sigue abriéndose por su enlace, pero
        # dejar a alguien mirando lo que acaba de apartar invita a preguntarse si funcionó.
        return redirect("projects:proyectos")


class BorrarProyectoView(ModelPermissionRequiredMixin, View):
    """Borrar de verdad una obra **que no tiene nada dentro**.

    ## Por qué existe además de archivar

    Porque son dos casos que se parecen desde la lista y no tienen nada que ver:

    - **La obra de prueba**, creada hace diez minutos para ver cómo va esto. No tiene entregables
      ni archivos: borrarla no borra nada de nadie, y archivarla dejaría basura para siempre en una
      pantalla que se va a mirar todos los días.
    - **La obra terminada**, con dos años de revisiones emitidas. Eso **es** el registro documental,
      y lo que se hace con ella es archivarla.

    Lo que hace que el segundo caso no pueda ocurrir por accidente es la misma comprobación que en
    las cuentas: se pregunta **antes** qué hay dentro, y si hay algo no se ofrece borrar.

    ## Y por qué una pantalla intermedia

    `GET` enseña qué se va a borrar y qué lo impide; `POST` lo hace. Un borrado a un clic desde una
    lista de obras es el borrado de la obra de al lado.
    """

    model = Proyecto
    permission_action = "delete"
    template_name = "projects/borrar_proyecto.html"

    def proyecto(self, request, pk):
        return get_object_or_404(
            scope_queryset_to_organizacion(Proyecto.objects.all(), request.user), pk=pk
        )

    @staticmethod
    def rastro(proyecto) -> list[str]:
        """Lo que hay dentro de la obra, contado. **Vacío quiere decir borrable.**

        Se cuenta lo que se ve en las pantallas —entregables, observaciones, actividades— y no las
        disciplinas ni los paquetes: esos son andamio de la propia obra, no trabajo de nadie, y
        contarlos haría que ninguna obra recién creada fuera borrable. Que es justo el caso.
        """
        from apps.documents.models import Actividad, Entregable, Observacion

        cuenta = (
            (Entregable.objects.filter(proyecto=proyecto), _("deliverables")),
            (Observacion.objects.filter(proyecto=proyecto), _("observations")),
            (Actividad.objects.filter(proyecto=proyecto), _("activities")),
        )
        return [
            f"{cuantos} {etiqueta}"
            for consulta, etiqueta in cuenta
            if (cuantos := consulta.count())
        ]

    def get(self, request, *args, **kwargs):
        proyecto = self.proyecto(request, kwargs["pk"])
        return render(
            request,
            self.template_name,
            {"proyecto": proyecto, "rastro": self.rastro(proyecto)},
        )

    def post(self, request, *args, **kwargs):
        proyecto = self.proyecto(request, kwargs["pk"])
        rastro = self.rastro(proyecto)
        if rastro:
            # **No se intenta y se falla: no se intenta.** Llegar aquí con rastro significa que
            # alguien trabajó entre el `GET` y el `POST`, o que se saltó la pantalla.
            messages.error(
                request,
                _("«%(codigo)s» has work in it. Archive it instead.") % {"codigo": proyecto.codigo},
            )
            return redirect("projects:borrar-proyecto", pk=proyecto.pk)

        codigo = proyecto.codigo
        # La auditoría se escribe **antes** de borrar: después no hay a qué apuntar.
        set_audit_context(request, proyecto, action="borrar_proyecto")
        proyecto.delete()
        messages.success(request, _("«%(codigo)s» deleted.") % {"codigo": codigo})
        return redirect("projects:proyectos")


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
        # **Por peso de prioridad y no por el campo**: los valores guardados son palabras, así que
        # `order_by("prioridad")` devuelve alta, **baja**, media. Ver `apps/documents/orden.py`.
        # **Y por `nulos_al_final`, que no es adorno.** SQLite pone los `NULL` primero en ascendente
        # y PostgreSQL los pone al final: un hallazgo sin fecha sale arriba en desarrollo y abajo en
        # produccion, sin que nada falle. Se desarrolla en SQLite y se despliega en PostgreSQL, asi
        # que la diferencia se ve en el sitio donde no se puede depurar.
        from apps.documents.orden import anotaciones, nulos_al_final

        abiertas = nulos_al_final(
            Observacion.objects.filter(proyecto=proyecto)
            .exclude(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
            .select_related("responsable", "autor", "revision__entregable")
            .prefetch_related("etiquetas")
            .annotate(**anotaciones()),
            ("orden_prioridad", "vence"),
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

        self._tablero(contexto, proyecto, list(entregables), abiertas)

        contexto["puede_crear_disciplina"] = usuario.has_perm("projects.add_disciplina")
        contexto["puede_crear_entregable"] = usuario.has_perm("documents.add_entregable")
        contexto["puede_exportar_bcf"] = (
            usuario.has_perm("documents.view_observacion") and abiertas.exists()
        )
        # **Importar no espera a que haya observaciones**, al contrario que exportar: un BCF del
        # mandante puede ser lo primero que entre en una obra recién abierta, y esconder el
        # formulario hasta que haya algo dentro deja sin camino justo el caso en que más sirve.
        contexto["puede_importar_bcf"] = usuario.has_perm("documents.add_observacion")
        # **El informe es leer**, así que se ofrece a quien puede leer. Y sin esperar a que haya
        # algo abierto: el informe de cierre de una etapa se saca cuando ya no queda nada abierto,
        # que es justo cuando el botón habría desaparecido.
        contexto["puede_ver_observaciones"] = usuario.has_perm("documents.view_observacion")
        # **El vocabulario de la obra, para poder pedir el informe por etiqueta** — `F10.1`. Va
        # aquí y no en la plantilla porque la plantilla no consulta la base: son las etiquetas de
        # este proyecto, y las de otro no pueden aparecer en este desplegable.
        contexto["etiquetas"] = list(self.object.etiquetas.filter(is_active=True))

        # **Revisar interferencias necesita dos modelos y el permiso de abrir observaciones**, que
        # es lo que la corrida crea. Con un solo modelo el botón no se dibuja: no hay nada contra
        # qué compararlo, y un botón que no puede hacer nada manda a buscar el error donde no está.
        from apps.documents.revisar import modelos_vigentes

        contexto["modelos_para_revisar"] = len(modelos_vigentes(proyecto))
        contexto["puede_revisar_interferencias"] = usuario.has_perm("documents.add_observacion")
        return contexto

    def _tablero(self, contexto, proyecto, entregables, abiertas) -> None:
        """Las cuatro piezas gráficas. El cálculo vive en `tablero.py`, y por eso se puede probar.

        **Un mes se puede pedir por la URL** —`?mes=2026-09`— y se valida: un valor con mala forma
        cae al mes de hoy en silencio, porque quien mira la pantalla no escribió ese parámetro.
        """
        hoy = timezone.localdate()

        # Tarjetas: lo que se mira en tres segundos antes de decidir dónde entrar.
        vencidas = [o for o in abiertas if o.vence is not None and o.vence < hoy]
        contexto["dato_avance"] = round(proyecto.avance_fisico * 100)
        contexto["dato_abiertas"] = len(abiertas)
        contexto["dato_vencidas"] = len(vencidas)
        contexto["dato_sin_revision"] = len(contexto["sin_revision"])
        contexto["dato_altas"] = len([o for o in abiertas if o.prioridad == Observacion.ALTA])

        # Línea de tiempo.
        ventana = tablero.ventana_de(
            proyecto.inicio, proyecto.termino, [e.fecha_planificada for e in entregables]
        )
        contexto["ventana"] = ventana
        if ventana is not None:
            contexto["tramos"] = tablero.tramos_de(
                entregables,
                ventana,
                hoy,
                url_de=lambda e: reverse("documents:expediente", args=[e.pk]),
            )
            # Dónde va la línea de «hoy». Fuera de la ventana no se dibuja en vez de pegarse a un
            # borde, donde afirmaría que hoy es el final del proyecto.
            contexto["hoy_pct"] = (
                round(ventana.porcentaje(hoy), 2) if ventana.inicio <= hoy <= ventana.fin else None
            )

        # Calendario: el mes pedido, o el de hoy.
        año, mes = self._mes_pedido(hoy)
        contexto["calendario_año"], contexto["calendario_mes"] = año, mes
        contexto["calendario_titulo"] = date(año, mes, 1)
        contexto["calendario"] = tablero.mes_de(
            año, mes, self._vencimientos(proyecto, año, mes), hoy
        )
        contexto["dias_semana"] = [
            _("Mon"),
            _("Tue"),
            _("Wed"),
            _("Thu"),
            _("Fri"),
            _("Sat"),
            _("Sun"),
        ]

        contexto["barras_disciplina"] = tablero.avance_por_disciplina(entregables)

    def _mes_pedido(self, hoy):
        """`?mes=2026-09`, validado. Con mala forma se cae al mes de hoy, sin decir nada."""
        crudo = (self.request.GET.get("mes") or "").strip()
        try:
            año, mes = crudo.split("-")
            año, mes = int(año), int(mes)
            # El rango de `date` es 1..9999, y un mes fuera de 1..12 revienta `monthdayscalendar`.
            if 1 <= mes <= 12 and 1900 <= año <= 2200:
                return año, mes
        except (ValueError, AttributeError):
            pass
        return hoy.year, hoy.month

    def _vencimientos(self, proyecto, año, mes):
        """`{día: (texto, ...)}` de lo que vence ese mes: observaciones y actividades.

        **Las dos juntas y no en dos calendarios**, porque para quien mira son lo mismo: algo que
        tiene fecha y responsable. Que una nazca de un hallazgo y la otra de la planificación
        importa al abrirla, no al ver qué semana viene cargada.
        """
        por_dia: dict[int, list] = {}

        observaciones = (
            Observacion.objects.filter(proyecto=proyecto, vence__year=año, vence__month=mes)
            .exclude(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
            .select_related("responsable")
        )
        for observacion in observaciones:
            por_dia.setdefault(observacion.vence.day, []).append(observacion.titulo)

        # **`Actividad` cuelga del proyecto directamente** —no por su entregable, que es opcional—
        # y su campo de estado se llama `status`, no `estado`: lo trae `StatusFlowMixin`. Los dos
        # detalles se comprobaron contra el modelo, no supuestos.
        actividades = Actividad.objects.filter(
            proyecto=proyecto, vence__year=año, vence__month=mes
        ).exclude(status__in=(Actividad.HECHA, Actividad.ANULADA))
        for actividad in actividades:
            por_dia.setdefault(actividad.vence.day, []).append(actividad.titulo)

        return por_dia

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
