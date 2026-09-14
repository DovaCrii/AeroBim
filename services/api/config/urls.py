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

from apps.accounts import views as accounts_views
from apps.accounts.views import PortalView
from apps.core.health import SaludView
from apps.documents import publico


class TokenConThrottle(token_views.ObtainAuthToken):
    """El endpoint del token, **con limite**.

    `ObtainAuthToken` de DRF trae `throttle_classes = ()`, asi que deja fuera del
    limite global justamente al unico endpoint que acepta pares usuario/contraseña
    sin autenticar. Sin esto es un oraculo de contraseñas fuera de linea.
    """

    throttle_classes = (AnonRateThrottle,)


urlpatterns = [
    path("", PortalView.as_view(), name="portal"),
    # **La unica ruta sin login, y a proposito.** La pregunta que contesta —¿este
    # proceso puede atender?— tiene que poder hacerla quien todavia no puede
    # autenticarse: systemd al arrancar la unidad y el proxy antes de la primera
    # peticion. No entrega ningun dato; el motivo largo esta en `apps/core/health.py`.
    path("health/", SaludView.as_view(), name="salud"),
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
        # **La nuestra y no la de Django**, porque además de cambiar la clave tiene que apagar la
        # marca de «clave provisional». Con la de Django, quien la cambiara seguiría rebotando aquí
        # para siempre: el guardián no se enteraría. Ver `apps/accounts/views.py`.
        accounts_views.CambiarClaveView.as_view(),
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
    # Los proyectos. **Es de donde cuelga todo lo demás**, y hasta hoy solo se podían crear
    # entrando al `/admin/` técnico: con una obra real, el trabajo empezaba fuera de la aplicación.
    path("proyectos/", include("apps.projects.urls")),
    path("documentos/", include("apps.documents.urls")),
    # El visor y la API que lo alimenta. Van juntos porque son las dos mitades de lo mismo:
    # el SPA detrás del login y las revisiones que puede abrir.
    path("visor/", include("apps.visor.urls")),
    path("api/", include("apps.documents.api_urls")),
    # Las del proyecto —hoy, las vistas compartidas— van bajo el mismo prefijo: para el visor es
    # una sola API, y separarlas por aplicacion es cosa nuestra, no suya.
    path("api/", include("apps.projects.api_urls")),
    path("api-token/", TokenConThrottle.as_view(), name="api-token"),
    # ══════════════════════════════════════════════════════════════════════════════════════
    #   **LA ÚNICA PUERTA DE AEROBIM QUE CONTESTA SIN SESIÓN.**
    #
    #   Todo lo de arriba pide cuenta. Estas tres no, porque el sentido de un enlace compartido
    #   es que quien lo recibe no tenga una. Lo que las acota es el testigo de la URL y nada más:
    #   256 bits de azar que abren **una** revisión, caducan y se revocan.
    #
    #   Va con su propio prefijo y en su propio archivo (`apps/documents/publico.py`) para que
    #   esa diferencia esté declarada en un sitio y no dependa de acordarse de heredar el mixin.
    #   Si algún día hay que añadir algo aquí, lee primero el docstring de ese archivo.
    #
    #   `/compartido/` y no `/c/`: la URL la lee una persona que no conoce el producto, y quiere
    #   saber qué está abriendo antes de pulsar.
    # ══════════════════════════════════════════════════════════════════════════════════════
    path("compartido/<str:testigo>/", publico.PaginaCompartidaView.as_view(), name="compartido"),
    path(
        "compartido/<str:testigo>/ficha/",
        publico.FichaCompartidaAPI.as_view(),
        name="compartido-ficha",
    ),
    path(
        "compartido/<str:testigo>/contenido/",
        publico.ContenidoCompartidoAPI.as_view(),
        name="compartido-contenido",
    ),
    path("admin/", admin.site.urls),
]
