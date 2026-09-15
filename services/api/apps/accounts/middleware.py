"""**La clave inicial dura hasta la primera entrada, y esto es lo que lo hace cumplir.**

Una cuenta recién creada arrastra una clave que conocen dos personas: su dueño y quien la creó.
Pedirle por favor que la cambie no funciona —nadie lo hace— y mientras no la cambie, lo que esa
cuenta firme no prueba quién lo hizo. En un registro documental de obra eso vacía de valor la
trazabilidad, que es la mitad de lo que el producto vende.

Así que no se pide: **se exige**, en la puerta, antes de dejar hacer nada.
"""

from django.contrib import messages
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.translation import gettext as _

#: Lo que se puede alcanzar **sin** haber cambiado la clave todavía.
#:
#: La lista es corta a propósito, y cada entrada tiene su motivo:
#:
#: - `password_change` y su `done`, porque es a donde se manda — mandar a alguien a una página que
#:   el propio guardián bloquea es un bucle de redirección, y es el error clásico de este patrón.
#: - `logout`, porque encerrar a alguien en una pantalla sin salida es peor que el riesgo que se
#:   está cerrando. También cubre el caso de quien entró en el equipo equivocado.
#: - `login`, porque si no, cerrar sesión y volver a entrar rebota raro.
#:
#: **`/health/` no hace falta**: lo pide el operador sin sesión, y sin sesión este guardián no mira
#: nada. Ponerlo aquí daría a entender que la comprobación de salud pasa por el login, y no es así.
NOMBRES_PERMITIDOS = frozenset({"password_change", "password_change_done", "logout", "login"})

#: Los prefijos que tampoco se tocan. Los estáticos los sirve whitenoise **antes** de llegar aquí,
#: pero en desarrollo no, y sin esto la página de cambiar la clave se pintaría sin su CSS.
PREFIJOS_PERMITIDOS = ("/static/", "/health/")


class ExigirCambioDeClave:
    """Mientras exista la `ClaveProvisional`, esta cuenta solo puede ir a cambiarla.

    ## Por qué en un middleware y no en el login

    Hacerlo al entrar —redirigir una vez desde `LoginView`— parece más simple y deja el agujero
    abierto: basta con teclear cualquier otra URL para seguir usando la aplicación con la clave
    compartida. El middleware mira **cada petición**, que es lo que convierte la exigencia en una
    puerta y no en una sugerencia.

    ## Y por qué no bloquea también la API

    Sí la bloquea, y es lo que se quiere: una cuenta con la clave del alta no debe poder pedir un
    token ni tocar `/api/`. Lo que **no** hace es contestar con una redirección a quien pide JSON:
    un `302` a una página HTML desde `fetch()` produce un error de análisis y el visor enseñaría
    «no se pudo cargar» en vez de decir lo que pasa. A esas se les contesta `403` con el motivo.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        usuario = getattr(request, "user", None)
        if usuario is None or not usuario.is_authenticated:
            return self.get_response(request)

        if request.path.startswith(PREFIJOS_PERMITIDOS):
            return self.get_response(request)

        coincidencia = getattr(request, "resolver_match", None)
        if coincidencia is not None and coincidencia.url_name in NOMBRES_PERMITIDOS:
            return self.get_response(request)
        # `resolver_match` todavía no está puesto en un middleware que corre antes de la vista, así
        # que se compara también por ruta. Es cinturón y tirantes a propósito: de las dos formas,
        # la que falle deja pasar algo que no debería.
        if any(request.path == reverse(n) for n in ("password_change", "logout", "login")):
            return self.get_response(request)
        if request.path.startswith(reverse("password_change")):
            return self.get_response(request)

        from apps.accounts.models import ClaveProvisional

        if not ClaveProvisional.objects.filter(usuario=usuario).exists():
            return self.get_response(request)

        if request.path.startswith("/api/") or request.headers.get("Accept", "").startswith(
            "application/json"
        ):
            from django.http import JsonResponse

            return JsonResponse(
                {
                    "detail": _(
                        "This account still uses the password it was created with. "
                        "Sign in and change it before using the API."
                    )
                },
                status=403,
            )

        messages.warning(
            request,
            _(
                "This account still uses the password it was given. "
                "Choose your own before carrying on — somebody else knows this one."
            ),
        )
        return redirect("password_change")
