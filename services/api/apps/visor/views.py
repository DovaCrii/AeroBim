"""La puerta del visor: el SPA servido **detrás del login**, en el mismo origen.

**Por qué el mismo origen y no un dominio aparte.** Con la aplicación de React en otro origen
harían falta CORS, un token guardado en el navegador y una segunda configuración de CSP; en el
mismo origen la cookie de sesión ya sirve, `fetch("/api/…")` funciona sin más, y las dos
trampas del despliegue —COOP/COEP y el `'wasm-unsafe-eval'` de la CSP— se resuelven una vez
en `prod.py` en vez de dos.

**Y por qué esta vista existe en vez de servir el `index.html` como archivo estático.** Un
archivo estático no se puede poner detrás de `LoginRequiredMixin`: whitenoise lo entrega antes
de que Django mire quién pregunta. El HTML pasa por aquí; los assets con nombre con hash los
sirve whitenoise, y no hay nada sensible en ellos.
"""

from pathlib import Path

from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import HttpResponse, HttpResponseRedirect
from django.utils.translation import gettext as _
from django.views.generic import View


class VisorView(LoginRequiredMixin, View):
    """Sirve el SPA construido, o dice con claridad por qué no puede.

    Los tres casos, y ninguno es un 500:

    1. **Está construido** → se devuelve su `index.html`.
    2. **No está, pero hay un servidor de desarrollo configurado** → se redirige a él
       conservando la consulta, para que `?revision=<uuid>` siga llegando.
    3. **No está y no hay servidor** → una página que dice qué orden hay que correr. Es el
       caso normal en un equipo recién clonado, y un 500 ahí manda a leer un `traceback` para
       enterarse de que falta un `npm run build`.
    """

    def get(self, request, *args, **kwargs):
        indice = Path(settings.VISOR_DIST) / "index.html"
        if indice.is_file():
            return HttpResponse(indice.read_text(encoding="utf-8"))

        if settings.VISOR_DEV_URL:
            consulta = request.META.get("QUERY_STRING", "")
            destino = settings.VISOR_DEV_URL.rstrip("/") + "/"
            return HttpResponseRedirect(f"{destino}?{consulta}" if consulta else destino)

        return HttpResponse(
            "<!doctype html><meta charset='utf-8'>"
            f"<title>{_('Viewer not built')} · AeroBim</title>"
            '<body style="font:15px/1.6 system-ui;max-width:44em;margin:48px auto;padding:0 20px">'
            f"<h1>{_('The viewer is not built')}</h1>"
            f"<p>{_('Build it from the repository root:')}</p>"
            "<pre style='background:#f4f7fb;padding:12px;border-radius:10px'>npm run build</pre>"
            f"<p>{_('Or point VISOR_DEV_URL at the Vite dev server while you work on it.')}</p>"
            f"<p><a href='/'>{_('Back to the portal')}</a></p>"
            "</body>",
            status=503,
        )
