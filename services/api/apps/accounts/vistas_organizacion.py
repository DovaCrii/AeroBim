"""La ficha de una organizacion: quien esta dentro, que cuelga, y como se saca de en medio.

## El callejon que cierra

La pantalla de organizaciones era **una tabla de tres columnas sin un solo enlace**: nombre,
identificador y cuantos miembros. No habia detalle, ni borrado, ni forma de ver **quien**
esta dentro — solo el numero. El usuario lo pidio entero: *«como puedo mover a mi equipo o ligarlo a
las organizaciones, ademas poder borrar organizacion, lo mismo para proyecto, tener ese manejo»*.

## El patron es el de borrar una obra, y no es casualidad

`BorrarProyectoView` ya resolvio esto mismo un piso mas abajo: una pantalla intermedia que **cuenta
lo que hay dentro** y que ofrece archivar cuando no se puede borrar. Se repite aqui con las mismas
piezas —`rastro()`, `zona-delicada`— porque una segunda forma de decir «esto tiene contenido» es una
que se queda atras.

## Lo que la base ya protege, y lo que no

Nueve de las once claves ajenas a `Organizacion` son `PROTECT`, asi que una organizacion con
cualquier obra, entregable u observacion **no se puede borrar**: la base lanza `ProtectedError`.

**Pero `Membresia` es `CASCADE`**, y ese es el dano que nadie ve: borrar una organizacion vacia deja
a sus personas **sin ninguna membresia**, o sea entrando perfectamente y viendo todas las listas
vacias sin un solo mensaje. Es la trampa numero uno de `docs/PILOTO.md`. Por eso el rastro cuenta
**tambien las personas**, aunque la base no se queje de ellas.
"""

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.translation import gettext as _
from django.views.generic import View

from apps.core.audit import set_audit_context
from apps.core.models import Membresia, Organizacion
from apps.core.tenancy import organizaciones_de
from apps.core.views import ModelPermissionRequiredMixin, ModelViewPermissionRequiredMixin


def _suya(request, pk) -> Organizacion:
    """La organizacion, si quien mira la alcanza.

    **`organizaciones_de` y no el acotador general**: ese devuelve la lista entera para este modelo
    —`Organizacion` no tiene un campo `organizacion`, es ella misma— y esa trampa ya costo una vez.
    """
    return get_object_or_404(organizaciones_de(request.user), pk=pk)


def con_cuantos(consulta):
    """Las organizaciones con su cuenta de miembros y de obras, **en una sola consulta**.

    La pantalla pintaba `organizacion.miembros.count` en la plantilla, que es una consulta por fila.
    Con una tabla de tres es invisible; con treinta es lo que hace que una lista tarde.
    """
    return consulta.annotate(
        cuantos_miembros=Count("membresia", distinct=True),
        cuantas_obras=Count("proyectos", distinct=True),
    ).order_by("nombre")


class OrganizacionView(ModelViewPermissionRequiredMixin, View):
    """Quien esta dentro y que cuelga. Es la pantalla que no existia."""

    model = Organizacion
    template_name = "accounts/organizacion.html"

    def get(self, request, *args, **kwargs):
        from apps.accounts.views import usuarios_visibles

        organizacion = _suya(request, kwargs["pk"])
        dentro = get_user_model().objects.filter(membresia__organizacion=organizacion)
        puede_cambiar = request.user.has_perm("core.change_organizacion")

        return render(
            request,
            self.template_name,
            {
                "organizacion": organizacion,
                "miembros": dentro.order_by("first_name", "username"),
                "obras": organizacion.proyectos.filter(is_active=True).order_by("codigo"),
                "puede_cambiar": puede_cambiar,
                "puede_borrar": request.user.has_perm("core.delete_organizacion"),
                # Quien se puede meter: solo gente que quien administra ya alcanza. Sin ese
                # acotado, el desplegable seria un directorio de todas las cuentas del sistema.
                "fuera": (
                    usuarios_visibles(request.user)
                    .exclude(pk__in=dentro.values("pk"))
                    .order_by("first_name", "username")
                    if puede_cambiar
                    else []
                ),
            },
        )


class MiembrosDeOrganizacionView(ModelPermissionRequiredMixin, View):
    """Meter y sacar personas. **Es lo que se pidio como «mover a mi equipo».**"""

    model = Organizacion
    permission_action = "change"

    def post(self, request, *args, **kwargs):
        from apps.accounts.views import usuarios_visibles

        organizacion = _suya(request, kwargs["pk"])
        quien = usuarios_visibles(request.user).filter(pk=request.POST.get("usuario")).first()
        if quien is None:
            raise Http404

        if request.POST.get("accion") == "quitar":
            # **No se saca a nadie de su ultima organizacion.** Sin ninguna, la persona entra y ve
            # todas las listas vacias sin un mensaje: la trampa numero uno de `PILOTO.md`. Se
            # desactiva la cuenta o se mueve a otra, pero no se deja invisible.
            if Membresia.objects.filter(usuario=quien).count() <= 1:
                messages.error(
                    request,
                    _(
                        "%(quien)s would be left without any organisation, and would see every "
                        "list empty with no explanation. Move them to another one, or deactivate "
                        "the account."
                    )
                    % {"quien": quien.get_full_name() or quien.get_username()},
                )
                return redirect("core:organizacion", pk=organizacion.pk)

            Membresia.objects.filter(organizacion=organizacion, usuario=quien).delete()
            set_audit_context(request, organizacion, action="quitar_de_organizacion")
            messages.success(request, _("Removed from this organisation."))
            return redirect("core:organizacion", pk=organizacion.pk)

        Membresia.objects.get_or_create(organizacion=organizacion, usuario=quien)
        set_audit_context(request, organizacion, action="anadir_a_organizacion")
        messages.success(request, _("Added to this organisation."))
        return redirect("core:organizacion", pk=organizacion.pk)


class BorrarOrganizacionView(ModelPermissionRequiredMixin, View):
    """Borrar una organizacion, **solo si no se lleva nada por delante**.

    Mismo patron que `BorrarProyectoView`: una pantalla intermedia que cuenta lo que hay dentro, y
    que ofrece la salida reversible cuando no se puede borrar.
    """

    model = Organizacion
    permission_action = "delete"
    template_name = "accounts/borrar_organizacion.html"

    def rastro(self, organizacion) -> list[str]:
        """Que se llevaria por delante. **Vacio = se puede borrar.**

        Cuenta las obras —que la base ya protege con `PROTECT`— **y ademas las personas**, que es lo
        que la base no protege: `Membresia` es `CASCADE`, asi que borrar una organizacion vacia deja
        a sus miembros sin ninguna membresia, entrando y viendo todo vacio sin un mensaje.
        """
        obras = organizacion.proyectos.count()
        gente = Membresia.objects.filter(organizacion=organizacion).count()

        partes = []
        if obras:
            partes.append(_("one work") if obras == 1 else _("%(n)s works") % {"n": obras})
        if gente:
            partes.append(_("one person") if gente == 1 else _("%(n)s people") % {"n": gente})
        return partes

    def get(self, request, *args, **kwargs):
        organizacion = _suya(request, kwargs["pk"])
        return render(
            request,
            self.template_name,
            {"organizacion": organizacion, "rastro": self.rastro(organizacion)},
        )

    def post(self, request, *args, **kwargs):
        organizacion = _suya(request, kwargs["pk"])
        # **Se vuelve a contar antes de borrar.** Entre que se abrio la pantalla y se pulso el
        # boton puede haber entrado una obra: intentarlo y que reviente la base daria un 500 donde
        # tiene que haber un mensaje.
        if self.rastro(organizacion):
            messages.error(request, _("It is not empty any more: nothing was deleted."))
            return redirect("core:organizacion", pk=organizacion.pk)

        # La auditoria **antes** del borrado: despues no hay a que apuntar.
        set_audit_context(request, organizacion, action="borrar_organizacion")
        nombre = organizacion.nombre
        organizacion.delete()
        messages.success(request, _("«%(nombre)s» deleted.") % {"nombre": nombre})
        return redirect("core:organizaciones")
