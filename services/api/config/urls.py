"""Las rutas de AeroBim, con el portal de ingreso al frente.

**No hay auto-registro, y es deliberado.** El primer usuario sale de
`createsuperuser` y el resto los crea un administrador: una aplicacion de control
documental donde cualquiera se da de alta no controla nada. AeroPlanner arrastro
exactamente el problema contrario —registro abierto con un secreto por defecto
publicado en el codigo— y aqui no se repite.
"""

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path
from rest_framework.authtoken import views as token_views
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.views import PortalView


class TokenConThrottle(token_views.ObtainAuthToken):
    """El endpoint del token, **con limite**.

    `ObtainAuthToken` de DRF trae `throttle_classes = ()`, asi que deja fuera del
    limite global justamente al unico endpoint que acepta pares usuario/contraseña
    sin autenticar. Sin esto es un oraculo de contraseñas fuera de linea.
    """

    throttle_classes = (AnonRateThrottle,)


urlpatterns = [
    path("", PortalView.as_view(), name="portal"),
    # El portal de ingreso. Plantilla propia, error genérico y ninguna pista de si el
    # usuario existe: enumerar usuarios es la mitad del trabajo de quien ataca.
    path(
        "accounts/login/",
        auth_views.LoginView.as_view(template_name="registration/login.html"),
        name="login",
    ),
    path(
        "accounts/logout/",
        auth_views.LogoutView.as_view(next_page="/accounts/login/"),
        name="logout",
    ),
    # **Cambiar la contraseña dentro de la aplicacion**, para que nadie tenga que
    # entrar al `/admin/` tecnico a rotar su propia credencial.
    path(
        "accounts/password_change/",
        auth_views.PasswordChangeView.as_view(
            template_name="registration/password_change_form.html"
        ),
        name="password_change",
    ),
    path(
        "accounts/password_change/done/",
        auth_views.PasswordChangeDoneView.as_view(
            template_name="registration/password_change_done.html"
        ),
        name="password_change_done",
    ),
    path("administracion/", include("apps.accounts.urls")),
    path("proyecto/", include("apps.core.urls")),
    path("documentos/", include("apps.documents.urls")),
    # El visor y la API que lo alimenta. Van juntos porque son las dos mitades de lo mismo:
    # el SPA detrás del login y las revisiones que puede abrir.
    path("visor/", include("apps.visor.urls")),
    path("api/", include("apps.documents.api_urls")),
    path("api-token/", TokenConThrottle.as_view(), name="api-token"),
    path("admin/", admin.site.urls),
]
