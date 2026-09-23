"""El portal: los modulos que le tocan a cada uno, y el centro de administracion.

**La regla que ordena esta pantalla:** cada entrada se filtra por su propio
`view_*`, y si no lo tienes **la fila no existe**. No aparece en gris ni lleva a un
403: ofrecer un boton que termina en 403 es peor que no ofrecerlo, porque enseña a
probar puertas.
"""

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth import views as auth_views
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.translation import gettext_lazy as _
from django.views.generic import TemplateView, View

from apps.accounts import altas, roles
from apps.accounts.forms import EditarCuentaForm, NuevaCuentaForm, NuevaOrganizacionForm
from apps.accounts.modulos import modulos_para
from apps.core.audit import set_audit_context
from apps.core.exports import CsvExportMixin
from apps.core.jobs import trabajos_colgados, ultima_corrida
from apps.core.mail import mail_is_delivered, undelivered_reason
from apps.core.models import AuditEvent, JobRun, Organizacion
from apps.core.tenancy import scope_queryset_to_organizacion
from apps.core.views import ModelPermissionRequiredMixin, ModelViewPermissionRequiredMixin


class PortalView(LoginRequiredMixin, TemplateView):
    """La puerta: los modulos agrupados **por etapa de trabajo, no por modelo**.

    Agruparlos por modelo de datos deja una lista que solo entiende quien escribio la
    base de datos. Por etapa, la lista se lee como se trabaja: primero el proyecto,
    despues el modelo, despues los documentos, despues la coordinacion.
    """

    template_name = "accounts/portal.html"

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        # **El catálogo vive en `modulos.py` desde el 2026-09-07.** La barra lateral lo necesita en
        # todas las páginas, así que dejarlo aquí obligaba a duplicar la lista: dos verdades sobre
        # qué módulos existen, que se separan al primer cambio.
        contexto["modulos"] = modulos_para(self.request.user)
        self._continuar(contexto)
        return contexto

    def _continuar(self, contexto) -> None:
        """Lo que te espera, encima de las tarjetas de módulo.

        **Un menú dice a qué sitios puedes entrar; esto dice en qué ibas**, que es otra pregunta y
        es la que uno tiene al abrir la aplicación por la mañana.

        Se reusa `pendientes_por_tramo`, que ya existe y ya alimenta el resumen por correo: así la
        pantalla y el correo **no pueden discrepar** sobre qué está vencido. Escribir la consulta
        otra vez acá es como se llega a un correo que dice tres y una pantalla que dice cuatro.
        """
        from apps.documents.notify import pendientes_por_tramo
        from apps.documents.tareas import como_tareas
        from apps.projects.models import Proyecto

        usuario = self.request.user
        tramos = pendientes_por_tramo(usuario)
        # **Se traducen a `Tarea` aquí y no en la plantilla.** Un hallazgo y una actividad no
        # comparten nombres —`estado` frente a `status`, y la prioridad solo existe en el primero—,
        # y resolverlo en la plantilla obliga a que la portada y la bandeja lo resuelvan cada una
        # a su manera. Ver `apps/documents/tareas.py`.
        contexto["mis_tramos"] = [
            # Se pasa quién mira: las acciones de una fila dependen de sus permisos.
            (_("Overdue"), como_tareas(tramos["vencido"], usuario), True),
            (_("Next 7 days"), como_tareas(tramos["en_7"], usuario), False),
        ]
        # Cuánto queda en total, para poder decir «y N más» sin listar treinta filas en la puerta.
        contexto["mis_pendientes"] = sum(len(v) for v in tramos.values())
        # **Todo lo que no se pinta arriba, contado por resta y no enumerando tramos.** Iba
        # `en_15 + en_30`, y el día que apareció un quinto tramo esa suma dejó de cuadrar con el
        # total: la portada decía «y 3 más» teniendo cinco. Por resta no se puede desincronizar.
        contexto["mis_mas_alla"] = (
            contexto["mis_pendientes"] - len(tramos["vencido"]) - len(tramos["en_7"])
        )

        contexto["mis_vencidas"] = len(tramos["vencido"])
        contexto["mis_de_la_semana"] = len(tramos["en_7"])

        # **Lo que lleva más de un mes, contado aparte.** Dentro de «vencido» se pierde: treinta
        # filas rojas no dicen que tres de ellas llevan desde agosto. Se cuenta con el mismo corte
        # que usa el grado `grave` de la fila, para que la banda y el color no discrepen.
        contexto["mis_muy_vencidas"] = sum(
            1 for tarea in contexto["mis_tramos"][0][1] if tarea.gravedad == "grave"
        )
        # Y lo que abriste tú y nadie ha tocado, que es el escalado del correo hecho pantalla.
        from apps.documents.notify import atrasos_que_no_avanzan

        contexto["mis_abiertos_parados"] = len(atrasos_que_no_avanzan(usuario))

        # **Las obras con lo que cada una necesita.** Solo si el rol puede leerlas: si no, la
        # sección no existe en vez de aparecer vacía.
        contexto["mis_obras_cuantas"] = 0
        if usuario.has_perm("projects.view_proyecto"):
            visibles = (
                scope_queryset_to_organizacion(Proyecto.objects.all(), usuario)
                .filter(is_active=True)
                .exclude(status=Proyecto.ETAPA_CERRADO)
            )
            # **La cifra se cuenta antes de recortar a seis.** `len()` sobre la lista recortada
            # diría «6 obras» en una oficina con doce, que es peor que no decirlo: parecería que
            # faltan y en realidad es el tope de las tarjetas.
            contexto["mis_obras_cuantas"] = visibles.count()
            proyectos = list(
                visibles.select_related("organizacion")
                .prefetch_related("entregables__revisiones")
                .order_by("codigo")[:6]
            )
            self._cifras_de_obra(proyectos, usuario)
            contexto["mis_proyectos"] = proyectos
            # **Si las obras visibles son de más de una organización, el código deja de
            # identificar.** El usuario tenía dos tarjetas `PILOTO-AEROBIM` idénticas en su portada,
            # de dos organizaciones distintas, sin nada que las separase. Se cuenta sobre las que se
            # van a dibujar y no sobre `visibles`: lo que hay que distinguir es lo que se ve.
            contexto["varias_organizaciones"] = len({uno.organizacion_id for uno in proyectos}) > 1

        contexto["cifra_del_dia"] = self._cifra_del_dia(
            vencidas=contexto["mis_vencidas"],
            de_la_semana=contexto["mis_de_la_semana"],
            obras=contexto["mis_obras_cuantas"],
        )
        self._por_donde_seguir(contexto, usuario)

    @staticmethod
    def _cifra_del_dia(*, vencidas: int, de_la_semana: int, obras: int) -> list[str]:
        """Las piezas del subtítulo de la portada. `F12.7`.

        **Antes decía «Solo se lista lo que tu rol puede abrir»**: la regla de la pantalla —cierta,
        y en la que nadie piensa por la mañana— en el sitio más visible. Ahora dice lo que decide
        si hay que entrar corriendo a algo: lo vencido, lo de esta semana y cuántas obras.

        Se arma aquí y no en la plantilla **porque el separador es el problema**. Con `{% if %}`
        anidados hay que preguntar en cada pieza si alguna de las anteriores salió, y la primera
        versión de esto imprimió «2 works Nothing overdue and nothing due this week» — dos frases
        pegadas sin punto. Una lista que se une con «·» no tiene ese caso.

        Y devuelve las piezas en vez de la cadena unida para que la plantilla pueda pintar la
        primera en rojo: lo vencido no es un dato más de la línea.
        """
        from django.utils.translation import ngettext

        piezas: list[str] = []
        if vencidas:
            piezas.append(ngettext("%(n)s overdue", "%(n)s overdue", vencidas) % {"n": vencidas})
        if de_la_semana:
            piezas.append(
                ngettext("%(n)s this week", "%(n)s this week", de_la_semana) % {"n": de_la_semana}
            )
        # **La frase tranquilizadora solo cuando no hay nada de lo anterior.** Puesta siempre,
        # decía «3 vencidas · nada vencido», que es la clase de contradicción que hace desconfiar
        # de la pantalla entera.
        if not piezas:
            piezas.append(str(_("Nothing overdue and nothing due this week")))
        if obras:
            piezas.append(ngettext("%(n)s work", "%(n)s works", obras) % {"n": obras})
        return piezas

    def _por_donde_seguir(self, contexto, usuario) -> None:
        """Los tres primeros pasos del recorrido que **esta persona puede hacer**, con su estado.

        Sustituye a las doce tarjetas de módulo, que con la barra lateral al lado eran decir dos
        veces lo mismo. Un paso dice qué se consigue y a dónde ir; una tarjeta decía el nombre de la
        pantalla.

        **Se filtran los que no le tocan, y aquí sí.** La pantalla de ayuda los enseña todos —los
        ajenos incluidos— porque explica el producto entero, y eso es correcto ahí. En la puerta no:
        para el mandante, «sube una revisión» no es un camino, es una puerta cerrada.

        El estado —hecho, siguiente, pendiente— y por qué solo tres de los nueve pasos se pueden
        marcar como hechos están en `apps/accounts/arranque.py`.
        """
        from apps.accounts.arranque import arranque_para

        # `cuantas_obras` ya está contado para las tarjetas de obra: pasárselo evita repetir la
        # consulta solo para saber si esta persona está empezando.
        contexto["arranque"] = arranque_para(usuario, cuantas_obras=contexto["mis_obras_cuantas"])

    def _cifras_de_obra(self, proyectos: list, usuario) -> None:
        """Le cuelga a cada obra **lo que hace que su tarjeta sirva**: avance y lo que arde.

        **La tarjeta decía «Edificio corporativo · Anteproyecto · avance 1» y eso no es un dato**:
        es la etapa y un número sin unidad. Lo que se quiere saber al mirar la puerta por la mañana
        es cuánto lleva la obra y si hay algo vencido, que es lo que decide dónde entrar.

        **Una consulta para todas las obras y no una por obra.** Con seis tarjetas la diferencia no
        se nota; el día que la lista sea de treinta, sí — y entonces el defecto está escrito en un
        bucle que nadie mira.
        """
        from django.db.models import Count, Q
        from django.utils import timezone

        from apps.documents.models import Observacion

        # `avance_pct` ya no se pone aquí: es propiedad de `Proyecto`, junto a `avance_fisico`.
        # Mientras se calculaba a mano, esta vista era **la única** que lo hacía, y la lista de
        # obras —que pide lo mismo— salía con la barra vacía en todas las filas.

        if not usuario.has_perm("documents.view_observacion"):
            # Sin permiso de lectura no se cuentan hallazgos: la tarjeta enseña el avance y nada
            # más, que es exactamente lo que ese rol puede saber.
            return

        hoy = timezone.localdate()
        abiertas = ~Q(estado__in=(Observacion.CERRADA, Observacion.DESCARTADA))
        cuentas = {
            fila["proyecto"]: fila
            for fila in Observacion.objects.filter(proyecto__in=proyectos)
            .values("proyecto")
            .annotate(
                abiertas=Count("pk", filter=abiertas),
                vencidas=Count("pk", filter=abiertas & Q(vence__lt=hoy)),
                altas=Count("pk", filter=abiertas & Q(prioridad=Observacion.ALTA)),
            )
        }
        for proyecto in proyectos:
            fila = cuentas.get(proyecto.pk, {})
            proyecto.abiertas = fila.get("abiertas", 0)
            proyecto.vencidas = fila.get("vencidas", 0)
            proyecto.altas = fila.get("altas", 0)


class AyudaView(LoginRequiredMixin, TemplateView):
    """El recorrido de cómo se usa AeroBim. `F11.7`.

    **Sin permiso de modelo y solo con sesión**, y eso es deliberado: la ayuda explica el producto,
    no da acceso a nada. Cada paso lleva a su pantalla y esa pantalla comprueba lo suyo; pedir aquí
    un permiso dejaría sin explicación a quien más la necesita —el rol más acotado— justo el día que
    entra por primera vez.

    El recorrido y el porqué de que sea generado están en `apps/accounts/ayuda.py`.
    """

    template_name = "accounts/ayuda.html"

    def get_context_data(self, **kwargs):
        from apps.accounts.ayuda import por_fases

        contexto = super().get_context_data(**kwargs)
        # **Partido en sus tres tramos**, que es lo que convierte nueve `<li>` seguidos en algo por
        # donde se puede entrar a la mitad. Sigue sin filtrarse nada: lo ajeno va marcado.
        contexto["tramos"] = por_fases(self.request.user)
        # Cuántos no le tocan, para poder decirlo arriba en vez de que se descubra bajando.
        contexto["ajenos"] = sum(tramo.cuantos_ajenos for tramo in contexto["tramos"])
        return contexto


class PrivacidadView(LoginRequiredMixin, TemplateView):
    """Qué cookies hay y qué se guarda. **Cuelga de la ayuda, que es donde se busca.**

    El contenido vive en `apps/accounts/privacidad.py` y no en la plantilla porque es **la misma
    lista que una prueba comprueba**: `test_las_cookies.py` mide qué cookies pone el producto de
    verdad y falla si aparece una que nadie declaró. Con el texto en la plantilla, la prueba y la
    página se separarían el día que alguien añadiera una — y la pantalla seguiría diciendo que hay
    dos.

    **Pide sesión, como todo lo demás.** Podría ser pública —es información, no datos— y no lo es
    por una razón: sin cuenta no hay nada que preguntar, porque AeroBim no guarda nada de quien no
    ha entrado. La única superficie sin sesión es el enlace compartido, y esa **no pone cookies**.
    """

    template_name = "accounts/privacidad.html"

    def get_context_data(self, **kwargs):
        from apps.accounts import privacidad

        contexto = super().get_context_data(**kwargs)
        contexto["cookies"] = privacidad.COOKIES
        contexto["que_se_guarda"] = privacidad.QUE_SE_GUARDA
        contexto["lo_que_no"] = privacidad.LO_QUE_NO
        contexto["sobre_los_enlaces"] = privacidad.SOBRE_LOS_ENLACES
        return contexto


class GlosarioView(LoginRequiredMixin, TemplateView):
    """Un vocabulario del oficio, y qué hace AeroBim con cada palabra. `F11.11`, `F11.12`.

    **Sin permiso y solo con sesión**, por lo mismo que `AyudaView`: explica el oficio, no da acceso
    a nada, y el rol más acotado es justo el que más lo necesita.

    Una clave desconocida da **404 y no una caída al primero**: la URL la escribe alguien o la pega
    de un enlace, y devolver silenciosamente otro vocabulario es la clase de amabilidad que hace que
    nadie se entere de que su enlace está roto. (La regla contraria vale para un parámetro de
    *presentación* como `?vista=`, que sí cae al valor por defecto: ahí no hay nada que romper.)

    El contenido y las dos reglas de escritura están en `apps/accounts/glosario.py`.
    """

    template_name = "accounts/glosario.html"

    def get_context_data(self, **kwargs):
        from django.http import Http404

        from apps.accounts.glosario import cuantos_no_estan, terminos_por_grupo, vocabularios

        elegido = vocabularios().get(kwargs["cual"])
        if elegido is None:
            raise Http404(f"no hay un vocabulario «{kwargs['cual']}»")

        contexto = super().get_context_data(**kwargs)
        contexto["vocabulario"] = elegido
        contexto["grupos"] = terminos_por_grupo(elegido)
        # Cuántos no están, para decirlo arriba en vez de que se descubra bajando — igual que la
        # ayuda hace con los pasos ajenos.
        contexto["no_estan"] = cuantos_no_estan(elegido)
        contexto["cuantos"] = len(elegido.terminos)
        # Los otros vocabularios, para poder saltar de uno a otro sin volver a la ayuda.
        contexto["otros"] = [uno for uno in vocabularios().values() if uno.clave != elegido.clave]
        return contexto


def usuarios_visibles(quien):
    """Las cuentas que esta persona puede ver: **las de sus propias organizaciones**.

    ## Esto era una fuga, y estaba medida

    La pantalla listaba `get_user_model().objects.all()`. `ModelViewPermissionRequiredMixin`
    comprueba el **permiso** —`auth.view_user`— y nada más, así que cualquiera que pudiera abrirla
    veía **todas las cuentas del sistema, con su correo**: las de las otras empresas del piloto
    incluidas. Y con el botón de CSV al lado, o sea la lista de correos de la competencia en un
    clic.

    `User` no lleva el campo `organizacion` —es el modelo de Django— así que
    `scope_queryset_to_organizacion` lo habría devuelto **intacto**, que es la trampa que ya costó
    siete vistas en `apps/documents/views.py`. Se acota por `Membresia`, que es quien lleva la
    relación de verdad.

    El superusuario las ve todas, igual que en `tenancy.py`: es quien administra el sistema, no
    quien trabaja en una obra.
    """
    from django.contrib.auth import get_user_model

    from apps.core.models import Membresia
    from apps.core.tenancy import organizaciones_visibles

    # **`organizaciones` va en la precarga, y no es un adorno.** La pantalla ahora enseña a qué
    # empresa pertenece cada persona —es el dato que hace falta antes de mover a nadie— y sin esto
    # sería una consulta por fila, que es como una lista de cuarenta cuentas empieza a tardar.
    consulta = (
        get_user_model().objects.prefetch_related("groups", "organizaciones").order_by("username")
    )
    if quien.is_superuser:
        return consulta
    ids = organizaciones_visibles(quien)
    if not ids:
        return consulta.none()
    de_mis_organizaciones = Membresia.objects.filter(organizacion_id__in=ids).values_list(
        "usuario_id", flat=True
    )
    return consulta.filter(pk__in=de_mis_organizaciones).distinct()


class UsuariosRolesView(ModelViewPermissionRequiredMixin, CsvExportMixin, TemplateView):
    """Quién tiene qué rol, en **mis** organizaciones, y desde dónde se da de alta a alguien.

    **Con lista blanca al exportar.** La exportación enumera sus campos uno por uno para que el
    hash de la contraseña no pueda salir nunca. Con un `"__all__"` basta que Django añada un campo
    al modelo de usuario para filtrarlo.
    """

    template_name = "accounts/usuarios_roles.html"
    csv_filename = "usuarios-y-roles.csv"
    csv_fields = ("username", "first_name", "last_name", "email", "is_active", "roles")
    csv_headers = ("Usuario", "Nombre", "Apellido", "Correo", "Activo", "Roles")

    @property
    def model(self):
        from django.contrib.auth import get_user_model

        return get_user_model()

    def get(self, request, *args, **kwargs):
        if request.GET.get("formato") == "csv":
            return self.csv_response(self._filas())
        return super().get(request, *args, **kwargs)

    def _filas(self):
        from apps.accounts.models import ClaveProvisional

        pendientes = set(ClaveProvisional.objects.values_list("usuario_id", flat=True))
        for usuario in usuarios_visibles(self.request.user):
            usuario.roles = ", ".join(g.name for g in usuario.groups.all()) or "—"
            # **Que se vea quién no ha entrado todavía.** Es la fila sobre la que hay que actuar:
            # o se le recuerda la clave, o se le genera otra. Sin esto, «creé la cuenta y no sé si
            # la usó» se contesta preguntando.
            usuario.sin_estrenar = usuario.pk in pendientes
            yield usuario

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["usuarios"] = list(self._filas())
        contexto["puede_crear"] = self.request.user.has_perm("auth.add_user")
        contexto["puede_editar"] = self.request.user.has_perm("auth.change_user")
        # **Los mismos cuatro que ofrece el alta y en el mismo orden**, sacados de la misma
        # constante: una lista escrita a mano en la plantilla se separa de `ASIGNABLES` en cuanto
        # alguien añada un rol, y entonces la pantalla explica cuatro y el desplegable ofrece cinco.
        from apps.accounts.forms import ASIGNABLES

        contexto["roles_explicados"] = [(n, roles.DESCRIPCIONES[n]) for n in ASIGNABLES]
        return contexto


class AuditoriaView(ModelViewPermissionRequiredMixin, TemplateView):
    template_name = "accounts/auditoria.html"
    model = AuditEvent

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["eventos"] = AuditEvent.objects.select_related("actor")[:200]
        return contexto


class TrabajosView(ModelViewPermissionRequiredMixin, TemplateView):
    """Salud de los trabajos programados, y si el correo sale de la maquina.

    Las dos cosas juntas por una razon: un trabajo que corrio bien y un correo que no
    se envio se ven **igual** desde el historial, y es el caso que mas engaña.
    """

    template_name = "accounts/trabajos.html"
    model = JobRun

    # Los trabajos que **corren solos** en esta maquina, y por eso hay que vigilar si corrieron.
    #
    # **Aqui habia dos comandos que no existen** —`avisar_vencimientos` y `verificar_respaldo`—,
    # escritos cuando esto se pensaba como una lista de intenciones: «se listan aunque no existan
    # todavia». El efecto era el contrario del que buscaba esta pantalla: dos filas eternas en
    # «nunca corrio» que no se pueden arreglar, y que enseñan a no mirar la lista. Un aviso que
    # nunca se apaga no es un aviso.
    #
    # Asi que aqui va **solo lo programado que existe**, y una prueba comprueba que cada nombre es
    # un comando de verdad (`test_trabajos.py`). `detectar_interferencias` no entra: pide dos UUID
    # de revision, se lanza a mano, y «nunca corrio» no seria un problema.
    ESPERADOS = ("enviar_resumen",)

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        contexto["corridas"] = JobRun.objects.all()[:50]
        contexto["colgados"] = trabajos_colgados()
        contexto["esperados"] = [
            {"comando": nombre, "ultima": ultima_corrida(nombre)} for nombre in self.ESPERADOS
        ]
        contexto["correo_entrega"] = mail_is_delivered()
        contexto["correo_motivo"] = undelivered_reason()
        return contexto


class OrganizacionesView(ModelViewPermissionRequiredMixin, TemplateView):
    """Las organizaciones **de quien mira**, con sus miembros.

    Iba con `Organizacion.objects.all()`, o sea que enseñaba **todas las empresas del sistema y
    quién trabaja en cada una**.

    **Y el primer arreglo tampoco servía.** Se escribió `scope_queryset_to_organizacion(...)`, que
    para este modelo **devuelve la lista entera**: `Organizacion` no tiene un campo llamado
    `organizacion` —es ella misma— así que cae en la rama pensada para los catálogos y no acota
    nada. La prueba lo enseñó; leyéndolo parecía correcto. Ver `organizaciones_de` en
    `apps/core/tenancy.py`, que existe por esto.
    """

    template_name = "accounts/organizaciones.html"
    model = Organizacion

    def get_context_data(self, **kwargs):
        from apps.accounts.vistas_organizacion import con_cuantos
        from apps.core.tenancy import organizaciones_de

        contexto = super().get_context_data(**kwargs)
        # **Las cifras se anotan, no se cuentan en la plantilla.** `organizacion.miembros.count`
        # es una consulta por fila; con tres es invisible y con treinta es lo que hace que la
        # lista tarde. Y ahora son dos cifras, no una: cuánta gente y cuántas obras.
        contexto["organizaciones"] = con_cuantos(organizaciones_de(self.request.user))
        # El botón de crear solo para quien puede: enseñarlo a quien recibiría un 403 al pulsarlo
        # es peor que no enseñarlo — promete algo y luego lo niega sin decir por qué.
        contexto["puede_crear"] = self.request.user.has_perm("core.add_organizacion")
        return contexto


class NuevaOrganizacionView(ModelPermissionRequiredMixin, View):
    """Crear la empresa a la que pertenecen las obras.

    **Es el primer paso del producto y no tenía pantalla.** Medido en `p340` con la instalación
    recién hecha: «Cuenta nueva» pide una organización, el desplegable sale vacío, y no hay ningún
    sitio donde crear una — la pantalla de Organizaciones era una tabla de solo leer. El camino que
    quedaba era el `/admin/` técnico, que dejó de publicarse el mismo día por estar AeroBim en
    internet. O sea que **el producto recién instalado no se podía empezar a usar**.

    El motivo de que no se viera antes: en desarrollo la base viene sembrada con `preparar_piloto`,
    así que el desplegable **siempre tenía algo dentro**. El agujero solo existe en una base limpia,
    que es exactamente la única base que va a ver quien instala.

    Va detrás de `add_organizacion`, que hoy tienen el superusuario y `Administrador` y ningún rol
    más: crear la empresa a la que pertenece todo no es una tarea del día a día del coordinador.
    """

    model = Organizacion
    permission_action = "add"
    template_name = "accounts/nueva_organizacion.html"

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name, {"form": NuevaOrganizacionForm()})

    def post(self, request, *args, **kwargs):
        form = NuevaOrganizacionForm(request.POST)
        if not form.is_valid():
            return render(request, self.template_name, {"form": form})

        organizacion = form.crear(autor=request.user)
        set_audit_context(request, organizacion, action="crear_organizacion")
        messages.success(
            request,
            _("«%(nombre)s» created. Now you can create the accounts of the people in it.")
            % {"nombre": organizacion.nombre},
        )
        # **Al listado y no de vuelta al formulario.** Crear organizaciones no es algo que se haga
        # en serie —lo normal es una, la empresa— así que devolver el formulario vacío sugeriría
        # que falta otra.
        return redirect("core:organizaciones")


class NuevaCuentaView(ModelPermissionRequiredMixin, View):
    """Dar de alta a una persona del equipo: nombre, correo, obra y rol, **en un solo paso**.

    ## Por qué existe esta pantalla

    Hasta hoy las cuentas se creaban por consola, una a una, con `createsuperuser` o entrando al
    `/admin/` técnico — y las tres cosas que hacen falta —usuario, rol y membresía— eran tres
    pantallas distintas del admin de Django, así que olvidar la tercera era lo normal. Una cuenta
    sin membresía **entra bien y ve todas las listas vacías, sin un solo mensaje**: es la trampa
    número uno de `docs/PILOTO.md`, y la que hace que el primer día del piloto se vaya en eso.

    ## La clave se enseña una vez y no se guarda

    No hay SMTP todavía, así que no se puede mandar un enlace: la clave inicial se genera aquí, se
    enseña **en esta pantalla y solo aquí**, y se la pasas tú a su dueño. Guardarla para poder
    recordarla convertiría la base en la lista de credenciales del equipo y el respaldo diario en
    una copia de esa lista; si se pierde, se genera otra, que es un botón.

    Y dura hasta la primera entrada: mientras no la cambie, `ExigirCambioDeClave` no la deja hacer
    nada más. Ver `apps/accounts/middleware.py`.
    """

    model = get_user_model()
    permission_action = "add"
    template_name = "accounts/nueva_cuenta.html"

    def contexto(self, request, **extra):
        """El formulario **y si hay dónde poner a la persona**.

        **Sin esto la pantalla es un callejón sin salida, y lo fue de verdad.** Con la base recién
        instalada el desplegable de organización sale vacío, el formulario no valida nunca, y la
        pantalla no dice **qué falta ni dónde se consigue**: quien la abre escribe el nombre, el
        correo, llega al desplegable y se queda ahí. Medido en `p340` el 2026-09-15 — el usuario
        lo dijo con estas palabras: «me pide organización y no aparece cómo generar».

        Es la misma forma de fallo que el producto ya arregló una vez en otro sitio: una pantalla
        que exige algo correcto **sin decir de dónde sale**.
        """
        form = extra.pop("form", None) or NuevaCuentaForm(autor=request.user)
        return {
            "form": form,
            "hay_organizaciones": form.fields["organizacion"].queryset.exists(),
            "puede_crear_organizacion": request.user.has_perm("core.add_organizacion"),
            **extra,
        }

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name, self.contexto(request))

    def post(self, request, *args, **kwargs):
        form = NuevaCuentaForm(request.POST, autor=request.user)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, form=form))

        usuario, clave = form.crear(autor=request.user)
        set_audit_context(request, usuario, action="crear_cuenta")
        # **Formulario nuevo y no el rellenado**: quien crea una cuenta suele crear varias
        # seguidas, y volver con los datos de la anterior invita a mandar dos veces.
        return render(
            request,
            self.template_name,
            self.contexto(request, creada=usuario, clave=clave),
        )


class ReiniciarClaveView(ModelPermissionRequiredMixin, View):
    """Generar otra clave inicial para alguien que perdió la suya.

    **Sin esto, la pantalla anterior es una trampa**: la clave se enseña una vez, y quien la pierda
    antes de entrar se queda fuera sin más camino que la consola — que es justo de lo que se venía.

    Vuelve a poner la marca de clave provisional aunque la cuenta ya la hubiera cambiado: si ha
    hecho falta reiniciarla, hay otra vez un secreto que conocen dos personas.
    """

    model = get_user_model()
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        from apps.accounts.models import ClaveProvisional

        # **Por el listado acotado y no por `pk`**, que es lo que impide reiniciarle la clave a
        # alguien de otra empresa —y con ella, entrar en su cuenta—.
        usuario = get_object_or_404(usuarios_visibles(request.user), pk=kwargs["pk"])
        if usuario.is_superuser and not request.user.is_superuser:
            raise Http404

        clave = altas.generar_clave()
        usuario.set_password(clave)
        usuario.save(update_fields=["password"])
        ClaveProvisional.objects.update_or_create(
            usuario=usuario, defaults={"creada_por": request.user}
        )
        set_audit_context(request, usuario, action="reiniciar_clave")
        # **El contexto entero y no tres claves sueltas**, que es el defecto que esto arregla.
        #
        # Esta vista pinta la plantilla del alta para enseñar la clave nueva, y desde que esa
        # plantilla decide si hay organizaciones, faltarle la clave `hay_organizaciones` la hacía
        # **falsa**: reiniciar una clave enseñaba el aviso «Primero, la organización» —con su botón
        # de crear— en una instalación que tiene organizaciones de sobra. O sea que la pantalla
        # contradecía a la propia lista desde la que se había pulsado.
        #
        # Es el riesgo de dos vistas que pintan la misma plantilla: la que la conoce menos se
        # queda atrás sin que nada falle. Se comparte el constructor del contexto.
        return render(
            request,
            "accounts/nueva_cuenta.html",
            NuevaCuentaView().contexto(request, creada=usuario, clave=clave),
        )


class CuentaDelEquipoMixin(ModelPermissionRequiredMixin):
    """Las tres guardas que toda vista que **toca** una cuenta ajena necesita, escritas una vez.

    Se repetían a mano en cada vista nueva, que es como se acaba olvidando una. Y las tres protegen
    cosas distintas:

    1. **Por el listado acotado y no por `pk`.** Sin esto, `/usuarios-y-roles/57/editar/` deja
       cambiarle el correo a alguien de otra empresa — y con el correo cambiado, reiniciarle la
       clave y entrar en su cuenta. Es la invariante que ya estuvo rota en siete vistas.
    2. **Un superusuario no lo toca quien no lo es.** Si no, quien puede editar cuentas se pone el
       correo de la cuenta del administrador y se reinicia la clave: escalada en dos clics.
    3. **Nadie se toca a sí mismo.** Desactivarse o borrarse es quedarse fuera en el acto, y si
       era la única cuenta que administra, dejar el sistema sin quién lo administre.
    """

    permission_action = "change"

    @property
    def model(self):
        return get_user_model()

    def cuenta(self, request, pk):
        usuario = get_object_or_404(usuarios_visibles(request.user), pk=pk)
        if usuario.is_superuser and not request.user.is_superuser:
            raise Http404
        return usuario

    @staticmethod
    def no_uno_mismo(request, usuario) -> bool:
        return usuario.pk != request.user.pk


class EditarCuentaView(CuentaDelEquipoMixin, View):
    """Corregir una cuenta: nombre, apellido, correo, rol y organización.

    **No se podía, por ninguna vía.** La lista dejaba crear y generar otra clave, y nada más; el
    `/admin/` técnico, que era el camino, dejó de publicarse el mismo día que AeroBim salió a
    internet. Una letra de menos en un apellido se quedaba para siempre.

    Y el correo era el caso caro: mal escrito **no falla**. La aplicación dice «enviado», el aviso
    se va a una dirección que no existe, y nadie se entera hasta que alguien pregunta por qué no le
    llegó nada.
    """

    template_name = "accounts/editar_cuenta.html"

    def contexto(self, request, cuenta, form=None):
        return {
            "cuenta": cuenta,
            "form": form or EditarCuentaForm(cuenta=cuenta, autor=request.user),
            "es_uno_mismo": not self.no_uno_mismo(request, cuenta),
            # El enlace a borrar solo si el permiso existe: ofrecerlo y que termine en 403 enseña a
            # probar puertas, que es la regla que ya ordena el portal entero.
            "puede_borrar": request.user.has_perm("auth.delete_user"),
        }

    def get(self, request, *args, **kwargs):
        cuenta = self.cuenta(request, kwargs["pk"])
        return render(request, self.template_name, self.contexto(request, cuenta))

    def post(self, request, *args, **kwargs):
        cuenta = self.cuenta(request, kwargs["pk"])
        form = EditarCuentaForm(request.POST, cuenta=cuenta, autor=request.user)
        if not form.is_valid():
            return render(request, self.template_name, self.contexto(request, cuenta, form))

        cambios = form.guardar()
        set_audit_context(request, cuenta, action="editar_cuenta")
        if cambios:
            messages.success(
                request,
                _("%(nombre)s updated: %(cambios)s.")
                % {
                    "nombre": cuenta.get_full_name() or cuenta.username,
                    "cambios": ", ".join(cambios),
                },
            )
        else:
            # **Se dice, no se calla.** Un «guardado» sobre cero cambios hace dudar de si se guardó.
            messages.info(request, _("Nothing changed: it was already like that."))
        return redirect("accounts:usuarios-roles")


class ActivarCuentaView(CuentaDelEquipoMixin, View):
    """Desactivar a alguien que se va, o volver a activarlo.

    **Es lo que hay que hacer casi siempre, y no borrar.** Quien subió una revisión o cerró un
    hallazgo forma parte del registro documental: en ISO 19650 *quién emitió* es tanto dato como
    *qué se emitió*. Una cuenta desactivada no entra y sigue estando al lado de lo que hizo.

    La columna «Estado» ya pintaba «Desactivado» desde el primer día —y nada podía ponerlo—.
    """

    def post(self, request, *args, **kwargs):
        cuenta = self.cuenta(request, kwargs["pk"])
        if not self.no_uno_mismo(request, cuenta):
            # 403 y no un mensaje: no es un aviso, es que la operación no existe para este caso.
            raise Http404

        cuenta.is_active = not cuenta.is_active
        cuenta.save(update_fields=["is_active"])
        set_audit_context(
            request, cuenta, action="activar_cuenta" if cuenta.is_active else "desactivar_cuenta"
        )
        quien = cuenta.get_full_name() or cuenta.username
        if cuenta.is_active:
            messages.success(request, _("%(nombre)s can sign in again.") % {"nombre": quien})
        else:
            messages.success(
                request,
                _("%(nombre)s can no longer sign in. Everything they did stays in the record.")
                % {"nombre": quien},
            )
        return redirect("accounts:usuarios-roles")


class BorrarCuentaView(CuentaDelEquipoMixin, View):
    """Borrar de verdad una cuenta **que no ha dejado rastro**.

    ## Por qué esto no es un botón en la fila

    Porque casi nunca es lo correcto, y cuando lo es, es inofensivo. Son dos casos muy distintos y
    se parecen mucho desde la lista:

    - **La cuenta recién creada con un dato mal**: no ha entrado, no ha subido nada, no ha escrito
      nada. Borrarla no borra nada de nadie. Es lo que pide quien acaba de equivocarse tecleando.
    - **La persona que lleva meses trabajando**: sus revisiones, sus transmittals y sus comentarios
      **son el registro documental**. Borrarla sería borrar quién emitió qué.

    Lo que hace que esto se pueda ofrecer sin miedo es que el segundo caso **no puede ocurrir por
    accidente**: los enlaces que llevan al registro son `PROTECT`, así que la base se niega. Esta
    pantalla se limita a preguntárselo antes, para que la respuesta sea una explicación y no un
    error 500.

    ## Y por eso hay una pantalla intermedia

    `GET` enseña qué se va a borrar y qué lo impide; `POST` lo hace. Un borrado a un clic desde una
    lista de doce filas es un borrado de la fila de al lado.
    """

    permission_action = "delete"
    template_name = "accounts/borrar_cuenta.html"

    def rastro(self, cuenta) -> list[str]:
        """Lo que esta persona ha dejado en el registro, contado. **Vacío quiere decir borrable.**

        Se pregunta con `exists()` por cada tipo en vez de intentar borrar y atrapar el
        `ProtectedError`, porque el error dice *que* algo protege y no *qué*: «no se puede borrar»
        sin nombrar el motivo obliga a adivinar.
        """
        from apps.documents.models import Comentario, Entregable, Observacion, Revision, Transmittal

        huellas = (
            (Revision.objects.filter(subida_por=cuenta), _("revisions uploaded")),
            (Entregable.objects.filter(responsable=cuenta), _("deliverables they own")),
            (Transmittal.objects.filter(emisor=cuenta), _("transmittals issued")),
            (Observacion.objects.filter(autor=cuenta), _("observations opened")),
            (Observacion.objects.filter(responsable=cuenta), _("observations they own")),
            (Comentario.objects.filter(autor=cuenta), _("messages in threads")),
        )
        return [
            f"{cuantos} {etiqueta}"
            for consulta, etiqueta in huellas
            if (cuantos := consulta.count())
        ]

    def get(self, request, *args, **kwargs):
        cuenta = self.cuenta(request, kwargs["pk"])
        return render(
            request,
            self.template_name,
            {
                "cuenta": cuenta,
                "rastro": self.rastro(cuenta),
                "es_uno_mismo": not self.no_uno_mismo(request, cuenta),
            },
        )

    def post(self, request, *args, **kwargs):
        cuenta = self.cuenta(request, kwargs["pk"])
        if not self.no_uno_mismo(request, cuenta):
            raise Http404

        rastro = self.rastro(cuenta)
        if rastro:
            # **No se intenta y se falla: no se intenta.** Llegar aquí con rastro significa que la
            # pantalla de confirmación se saltó o que alguien trabajó entre el `GET` y el `POST`.
            messages.error(
                request,
                _("%(nombre)s cannot be deleted: their work is part of the record. Disable them.")
                % {"nombre": cuenta.get_full_name() or cuenta.username},
            )
            return redirect("accounts:borrar-cuenta", pk=cuenta.pk)

        quien = cuenta.get_full_name() or cuenta.username
        # **La auditoría se escribe antes de borrar.** `AuditEvent.actor` es `SET_NULL` y el objeto
        # tiene que existir para poder nombrarlo: después del `delete()` ya no hay a qué apuntar.
        set_audit_context(request, cuenta, action="borrar_cuenta")
        cuenta.delete()
        messages.success(request, _("%(nombre)s deleted.") % {"nombre": quien})
        return redirect("accounts:usuarios-roles")


class CambiarClaveView(auth_views.PasswordChangeView):
    """La de Django, **más borrar la marca de clave provisional**.

    Sin esto el guardián no se apaga nunca y la persona queda dando vueltas entre la pantalla de
    cambiar la clave y ella misma, habiéndola cambiado ya. Es el fallo que convierte una medida de
    seguridad en un producto roto, y no lo vería ninguna prueba que solo mire el formulario.
    """

    template_name = "registration/password_change_form.html"

    def form_valid(self, form):
        from apps.accounts.models import ClaveProvisional

        respuesta = super().form_valid(form)
        ClaveProvisional.objects.filter(usuario=self.request.user).delete()
        return respuesta
