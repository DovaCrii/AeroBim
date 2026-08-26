"""Los guardianes de permisos, y el acotado por organizacion.

**Es la pieza mas valiosa de lo portado**, y no por su tamaño. El contrato que
esta escrito en `AGENTS.md` —toda superficie de lectura pide un `view_*` explicito,
`LoginRequiredMixin` solo no alcanza, y cada vista nueva trae su prueba de 403— es
lo que hizo robusto a AeroControl. Estas clases son como se cumple sin depender de
que alguien se acuerde.
"""

from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import ImproperlyConfigured
from rest_framework.permissions import DjangoModelPermissions

from apps.core.tenancy import scope_queryset_to_organizacion


class ModelPermissionRequiredMixin(LoginRequiredMixin, PermissionRequiredMixin):
    """Exige el permiso de modelo que la vista declara.

    Dos cosas que no son obvias y las dos importan:

    - **El permiso se deriva del modelo**, no se escribe a mano. Una cadena teclada
      —`"documents.change_entregable"`— sobrevive a que el modelo se renombre y
      entonces la vista queda sin guardia sin que nada falle.
    - **Anonimo se redirige, autenticado-sin-permiso recibe 403 duro.** Mandar al
      login a quien ya entro es un bucle: vuelve a entrar y vuelve a rebotar, sin
      que nadie le diga nunca que lo que le falta es un permiso.
    """

    permission_action: str | None = None
    raise_exception = True

    def handle_no_permission(self):
        if not self.request.user.is_authenticated:
            return redirect_to_login(
                self.request.get_full_path(),
                self.get_login_url(),
                self.get_redirect_field_name(),
            )
        return super().handle_no_permission()

    def get_permission_required(self):
        modelo = getattr(self, "model", None)
        if not self.permission_action or modelo is None:
            raise ImproperlyConfigured(
                "Una vista protegida necesita `model` y `permission_action`."
            )
        meta = modelo._meta
        return (f"{meta.app_label}.{self.permission_action}_{meta.model_name}",)


class ModelViewPermissionRequiredMixin(ModelPermissionRequiredMixin):
    """Para leer. Existe porque **leer tambien pide permiso**, y es la mitad olvidada."""

    permission_action = "view"


class OrganizacionScopedQuerysetMixin:
    """Acota la consulta a las organizaciones del usuario.

    **Comprobar el permiso de modelo no alcanza.** `view_entregable` dice "puede ver
    entregables", no "puede ver **estos** entregables": sin acotar la consulta, pedir
    a mano `/entregables/<id-de-otra-organizacion>/` responde con el objeto. El
    permiso y el alcance son dos preguntas distintas y hay que contestar las dos.
    """

    def get_queryset(self):
        return scope_queryset_to_organizacion(super().get_queryset(), self.request.user)


class FiltrosEnLaPaginacionMixin:
    """Deja en el contexto los filtros de la URL, sin la página.

    **Sin esto, pasar de página pierde el filtro** y devuelve la lista entera: parece que
    el filtro no funciona, y quien lo usa deja de confiar en él. Se calcula una vez aquí en
    vez de repetirlo en cada plantilla.
    """

    def get_context_data(self, **kwargs):
        contexto = super().get_context_data(**kwargs)
        parametros = self.request.GET.copy()
        parametros.pop("page", None)
        contexto["filtros"] = parametros.urlencode()
        return contexto


class ViewModelPermissions(DjangoModelPermissions):
    """`DjangoModelPermissions` **con la lectura guardada**.

    El de DRF deja `GET`, `HEAD` y `OPTIONS` sin exigir nada: su mapa arranca en
    `POST`. O sea que un endpoint protegido "con permisos de modelo" entrega su lista
    completa a cualquier usuario autenticado, incluido el rol de solo lectura mas
    acotado. Se le añade el `view_*` que faltaba.
    """

    perms_map = {
        **DjangoModelPermissions.perms_map,
        "GET": ["%(app_label)s.view_%(model_name)s"],
        "HEAD": ["%(app_label)s.view_%(model_name)s"],
    }
